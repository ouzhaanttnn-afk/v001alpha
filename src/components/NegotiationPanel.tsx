import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  COUNTER_OFFER_MAX_ROUNDS,
  GENEROUS_OFFER_REPUTATION_BONUS,
  LOW_OFFER_REPUTATION_PENALTY,
  OFFER_PRESET_COMERT_RATIO,
  OFFER_PRESET_MAKUL_RATIO,
  OFFER_PRESET_OLUCU_RATIO,
  OFFER_RANGE_MAX_RATIO,
  OFFER_RANGE_MIN_RATIO,
  OLUCU_REPUTATION_PENALTY_PER_LEVEL,
  SALE_OFFER_MAX_RATIO,
  SALE_OFFER_MIN_RATIO,
  SIKI_PAZARLIKCI_THRESHOLD_REDUCTION_PER_LEVEL,
  XP_BONUS_DEAL_COMPLETED,
  XP_BONUS_GOOD_BARGAIN,
  XP_BONUS_RARE_ITEM,
} from '../config/economyConfig';
import type { NegotiationCustomer, NegotiationProduct } from '../types/negotiation';
import type { IncomingCustomer, NegotiationLine } from '../types/incomingCustomer';
import { CollapsibleOfferCard } from './CollapsibleOfferCard';
import { GlassCard } from './GlassCard';
import { LineItemNegotiation } from './LineItemNegotiation';
import { LineItemPicker } from './LineItemPicker';
import { equivalentGrams, MINUTES_PER_DAY, useGameStore } from '../store/useGameStore';
import { colors, fonts, fontSizes, radius } from '../theme';
import { glass } from '../theme/glass';
import { formatTl } from '../utils/format';
import { calculateOpportunityScore } from '../utils/opportunityScore';
import {
  evaluateNegotiationTurn,
  initialNegotiationPatience,
  type NegotiationPhase,
  type NegotiationReactionTone,
} from '../engine/negotiation';
import { Badge } from './Badge';
import { CounterOfferCard } from './CounterOfferCard';
import { CustomerNoteCard } from './CustomerNoteCard';
import { CustomerReaction } from './CustomerReaction';
import { KarAnaliziCard } from './KarAnaliziCard';
import { NegotiationActions } from './NegotiationActions';
import { NegotiationProductCard } from './NegotiationProductCard';
import { OfferPresets } from './OfferPresets';
import { PriceBlock } from './PriceBlock';
import { SaleActions } from './SaleActions';
import { ScalePanel } from './ScalePanel';
import { XpToast } from './XpToast';

type Result = 'accepted' | 'rejected' | 'creditDenied' | 'timedOut' | null;

const MEASURE_DURATION_MS = 900;
// [DÜZELTME] Teklif tabanı %80'e çekildiği için bu eşik de o tabanın
// altında kalmayacak şekilde güncellendi (aksi halde hiç tetiklenemezdi).
const OLUCU_AGGRESSIVE_OFFER_RATIO = 0.85;
const SIKI_PAZARLIKCI_REPUTATION_PENALTY = 1;

function bonusXpForDeal(roundsUsed: number, product: NegotiationProduct): { amount: number; reason: string } {
  if (product.category === 'iscilikli' || (product.quantity ?? 1) > 1) {
    return { amount: XP_BONUS_RARE_ITEM, reason: 'Nadir/büyük işlem' };
  }
  if (roundsUsed > 0) {
    return { amount: XP_BONUS_GOOD_BARGAIN, reason: 'İyi pazarlık' };
  }
  return { amount: XP_BONUS_DEAL_COMPLETED, reason: 'Müşteri işlemi tamamlandı' };
}

// v2 iterasyonu: pazarlık artık gerçek bir karar döngüsü — teklif ANINDA
// değerlendirilir (Bölüm 4.6'nın 30 dk'lık bekleme mekaniği kaldırıldı),
// müşteri pazarlık tarzına ve Karizma'ya göre kabul edebilir, karşı teklif
// verebilir ya da doğrudan reddedebilir (bkz. utils/negotiationEngine).
export function NegotiationPanel({
  incomingCustomer,
  onClose,
}: {
  incomingCustomer: IncomingCustomer;
  onClose: () => void;
}) {
  const isSale = incomingCustomer.direction === 'satis';
  const customer = incomingCustomer.customer;
  const product = incomingCustomer.product;
  const reading = incomingCustomer.scaleReading ?? { grams: product.grams, karat: product.karat, cleanliness: 'Temiz' };

  const day = useGameStore((s) => s.day);
  const minuteOfDay = useGameStore((s) => s.minuteOfDay);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const goldPrice = useGameStore((s) => s.goldPrice);
  const wholesalerSellMarginTlPerGram = useGameStore((s) => s.wholesalerSellMarginTlPerGram);
  const cashTl = useGameStore((s) => s.capital.cashTl);
  const reputationScore = useGameStore((s) => s.reputation.score);
  const settleDeal = useGameStore((s) => s.settleDeal);
  const logCompletedOffer = useGameStore((s) => s.logCompletedOffer);
  const grantBonusXp = useGameStore((s) => s.grantBonusXp);
  const resolveIncomingCustomer = useGameStore((s) => s.resolveIncomingCustomer);
  const adjustReputation = useGameStore((s) => s.adjustReputation);
  const skillLevels = useGameStore((s) => s.skillLevels);
  const brokerDeal = useGameStore((s) => s.brokerDeal);
  const resolveBrokerDeal = useGameStore((s) => s.resolveBrokerDeal);
  const hasCompletedTutorial = useGameStore((s) => s.hasCompletedTutorial);
  const firstSessionHintsDismissed = useGameStore((s) => s.firstSessionHintsDismissed);
  const dismissFirstSessionHint = useGameStore((s) => s.dismissFirstSessionHint);

  const sikiPazarlikciLevel = skillLevels['siki-pazarlikci'] ?? 0;
  const oluluLevel = skillLevels['olucu'] ?? 0;
  const uzmanGorusuLevel = skillLevels['uzman-gorusu'] ?? 0;
  const piyasaSezgisiLevel = skillLevels['piyasa-sezgisi'] ?? 0;

  const [tested, setTested] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  // [YENİ] Referans tasarımı — teklif paneli artık collapse/expand olabiliyor;
  // test tamamlanır tamamlanmaz açık başlıyor, oyuncu istediğinde küçültebilir.
  const [offerExpanded, setOfferExpanded] = useState(true);
  const [profitAnalysisExpanded, setProfitAnalysisExpanded] = useState(false);

  // Oyun, müşteri belirdiği anda tick() içinde zaten duraklatılmış olur
  // (bkz. useGameStore — React render döngüsünü beklemeden, preNegotiationSpeed
  // dönülecek hızı tutar). Burada sadece garanti altına alınır (defense in
  // depth) ve panel kapanınca (Devam Et) önceki hıza dönülür.
  useEffect(() => {
    setSpeed(0);
    return () => {
      if (actionUnlockTimeoutRef.current) clearTimeout(actionUnlockTimeoutRef.current);
      const restoreSpeed = useGameStore.getState().preNegotiationSpeed ?? 1;
      setSpeed(restoreSpeed);
      useGameStore.setState({ preNegotiationSpeed: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bölüm 6: müşterinin sabrı artık oyun saatine bağlı — her kişiliğin kendi
  // patienceMinutes'i (bkz. incomingCustomerPool) + Soğukkanlı/Güler Yüz.
  const currentTotalMinutes = day * MINUTES_PER_DAY + minuteOfDay;
  const [totalPatienceMinutes] = useState(() =>
    Math.max(1, incomingCustomer.expiresAtTotalMinutes - currentTotalMinutes),
  );
  const minutesLeft = Math.max(0, incomingCustomer.expiresAtTotalMinutes - currentTotalMinutes);
  const patienceRatio = minutesLeft / totalPatienceMinutes;

  // Satış modunda (dükkândan müşteriye) nakit sınırı yok — istediğin fiyatı
  // isteyebilirsin, tavan/taban sadece piyasa değerine göre makul bir aralık.
  // Alım/bozdurma modunda ise Bölüm 7'nin %15-100 aralığı geçerli.
  const baseMin = isSale
    ? Math.round(product.marketValueTl * SALE_OFFER_MIN_RATIO)
    : Math.round(product.marketValueTl * OFFER_RANGE_MIN_RATIO);
  const baseMax = isSale
    ? Math.round(product.marketValueTl * SALE_OFFER_MAX_RATIO)
    : Math.round(product.marketValueTl * OFFER_RANGE_MAX_RATIO);
  const sliderMax = isSale ? baseMax : Math.max(1, Math.min(baseMax, Math.round(cashTl)));
  const sliderMin = Math.min(baseMin, sliderMax);
  const cashLimited = !isSale && sliderMax < baseMax;
  const clampOffer = (amount: number) => Math.max(sliderMin, Math.min(sliderMax, amount));

  const [offer, setOffer] = useState(() =>
    isSale
      ? Math.round(product.marketValueTl)
      : clampOffer(Math.round(product.marketValueTl * OFFER_PRESET_OLUCU_RATIO)),
  );

  const [result, setResult] = useState<Result>(null);
  const [borrowedTl, setBorrowedTl] = useState(0);
  const [xpToast, setXpToast] = useState<{ amount: number; reason: string } | null>(null);
  const [pendingCounter, setPendingCounter] = useState<{
    counterAmountTl: number;
    isFinal: boolean;
    reaction: string;
  } | null>(null);
  const [roundsUsed, setRoundsUsed] = useState(0);
  const [patience, setPatience] = useState(() => initialNegotiationPatience(customer.bargainingStyle));
  const [offerHistory, setOfferHistory] = useState<number[]>([]);
  const [reaction, setReaction] = useState<{ text: string; tone: NegotiationReactionTone } | null>(null);
  const [negotiationPhase, setNegotiationPhase] = useState<NegotiationPhase>('OPEN');
  const terminalActionStartedRef = useRef(false);
  const customerDismissStartedRef = useRef(false);
  const negotiationActionPendingRef = useRef(false);
  const actionUnlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [negotiationActionPending, setNegotiationActionPending] = useState(false);

  useEffect(() => {
    if (result !== null || pendingCounter !== null || minutesLeft > 0) return;
    setResult('timedOut');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutesLeft, result, pendingCounter]);

  // Accepted/rejected/timedOut artık tam ekran bir onay beklemiyor — kısa bir
  // özet gösterip kendiliğinden ana oyuna dönüyor (Bölüm section 3: "oyuncuyu
  // ana oyuna hızlı döndür"). Sadece creditDenied (oyuncunun bir şey yapması
  // gerekebilecek bir durum) manuel kapatma istiyor.
  const hasBrokerDeal = !isSale && borrowedTl > 0 && brokerDeal !== null;
  useEffect(() => {
    // Toptancı Bağlantısı açıksa oyuncunun "Toptancıya Hemen Sat" kararı
    // vermesi gerekebilir — o durumda otomatik kapanmıyoruz.
    if (result === 'accepted' && hasBrokerDeal) return;
    if (result === 'accepted' || result === 'rejected' || result === 'timedOut') {
      const id = setTimeout(onClose, 1700);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, hasBrokerDeal]);

  const handleTest = () => {
    if (measuring) return;
    setMeasuring(true);
    setTimeout(() => {
      setMeasuring(false);
      setTested(true);
    }, MEASURE_DURATION_MS);
  };

  const releaseNegotiationActionLock = () => {
    if (actionUnlockTimeoutRef.current) {
      clearTimeout(actionUnlockTimeoutRef.current);
      actionUnlockTimeoutRef.current = null;
    }
    negotiationActionPendingRef.current = false;
    setNegotiationActionPending(false);
  };

  const scheduleNegotiationActionUnlock = () => {
    if (actionUnlockTimeoutRef.current) clearTimeout(actionUnlockTimeoutRef.current);
    actionUnlockTimeoutRef.current = setTimeout(() => {
      negotiationActionPendingRef.current = false;
      setNegotiationActionPending(false);
      actionUnlockTimeoutRef.current = null;
    }, 180);
  };

  const runNegotiationAction = (action: () => void) => {
    if (negotiationActionPendingRef.current || terminalActionStartedRef.current) return;
    negotiationActionPendingRef.current = true;
    setNegotiationActionPending(true);
    try {
      action();
    } finally {
      scheduleNegotiationActionUnlock();
    }
  };

  // Bölüm 8: düşük/cömert teklif karizmayı, Sıkı Pazarlıkçı/Ölücü'nün aşırı
  // kullanımı itibarı hafif etkiler — bu sadece bir kez, anlaşma kapandığında uygulanır.
  const applyReputationForSettledAmount = (amount: number, originalThreshold: number) => {
    const offerRatio = amount / product.marketValueTl;
    if (offerRatio < OFFER_PRESET_OLUCU_RATIO) adjustReputation(-LOW_OFFER_REPUTATION_PENALTY);
    else if (offerRatio >= OFFER_PRESET_COMERT_RATIO) adjustReputation(GENEROUS_OFFER_REPUTATION_BONUS);
    if (amount < originalThreshold && sikiPazarlikciLevel > 0) {
      adjustReputation(-SIKI_PAZARLIKCI_REPUTATION_PENALTY);
    }
    if (oluluLevel > 0 && amount < product.marketValueTl * OLUCU_AGGRESSIVE_OFFER_RATIO) {
      adjustReputation(-OLUCU_REPUTATION_PENALTY_PER_LEVEL * oluluLevel);
    }
  };

  const completeDeal = (amount: number, originalThreshold: number, roundsUsedAtSettle: number) => {
    if (terminalActionStartedRef.current) return;
    terminalActionStartedRef.current = true;
    applyReputationForSettledAmount(amount, originalThreshold);
    const outcome = settleDeal(amount, {
      name: product.name,
      category: product.category,
      karat: product.karat,
      grams: product.grams,
      marketValueTl: product.marketValueTl,
      estimatedSellPriceTl: product.estimatedSellPriceTl,
      quantity: product.quantity,
      source: product.source,
      actualKarat: product.actualKarat,
      hasHiddenFlaw: product.hasHiddenFlaw,
      stoneValueTl: product.stoneValueTl,
    });
    setOffer(amount);
    setPendingCounter(null);
    if (!outcome.success) {
      setResult('creditDenied');
      return;
    }
    setNegotiationPhase('ACCEPTED');
    setBorrowedTl(outcome.borrowedTl);
    logCompletedOffer({
      customerName: customer.name,
      productName: product.name,
      category: product.category,
      karat: product.karat,
      grams: product.grams,
      offerAmountTl: amount,
      marketValueTl: product.marketValueTl,
      quantity: product.quantity,
      status: 'kabul',
    });
    const bonus = bonusXpForDeal(roundsUsedAtSettle, product);
    grantBonusXp(bonus.amount);
    setXpToast({ amount: outcome.xpGained + bonus.amount, reason: bonus.reason });
    setResult('accepted');
  };

  const rejectBuy = (amount = offer) => {
    if (terminalActionStartedRef.current) return;
    terminalActionStartedRef.current = true;
    setPendingCounter(null);
    setNegotiationPhase('REJECTED');
    logCompletedOffer({
      customerName: customer.name,
      productName: product.name,
      category: product.category,
      karat: product.karat,
      grams: product.grams,
      offerAmountTl: amount,
      marketValueTl: product.marketValueTl,
      quantity: product.quantity,
      status: 'red',
    });
    setResult('rejected');
  };

  // Her teklif deterministik bir pazarlık turudur: sabır, tekrar teklif ve
  // son fiyat state'i engine'den gelir; para/stok işlemi yalnızca kabulde
  // mevcut settlement fonksiyonundan geçer.
  const sendBuyOffer = (amount: number, roundsUsedNow: number) => {
    setOffer(amount);
    const originalThreshold = product.marketValueTl * customer.acceptanceThreshold;
    const adjustedThreshold =
      originalThreshold * (1 - sikiPazarlikciLevel * SIKI_PAZARLIKCI_THRESHOLD_REDUCTION_PER_LEVEL);

    const outcome = evaluateNegotiationTurn({
      direction: 'buy',
      offerTl: amount,
      thresholdTl: adjustedThreshold,
      bargainingStyle: customer.bargainingStyle,
      urgency: customer.urgency,
      karizmaScore: reputationScore,
      patience,
      previousOffers: offerHistory,
      roundsUsed: roundsUsedNow,
      maxRounds: COUNTER_OFFER_MAX_ROUNDS,
      phase: negotiationPhase,
    });
    setOfferHistory((history) => [...history, amount]);
    setPatience(outcome.patienceAfter);
    setReaction({ text: outcome.reaction, tone: outcome.tone });
    setNegotiationPhase(outcome.phaseAfter);

    if (outcome.kind === 'accept') {
      completeDeal(amount, originalThreshold, roundsUsedNow);
      return;
    }
    if (outcome.kind === 'counter' || outcome.kind === 'final') {
      setPendingCounter({
        counterAmountTl: outcome.counterAmountTl,
        isFinal: outcome.kind === 'final',
        reaction: outcome.reaction,
      });
      setRoundsUsed(roundsUsedNow + 1);
      return;
    }
    if (outcome.kind === 'leave') rejectBuy(amount);
    else setRoundsUsed(roundsUsedNow + 1);
  };

  const acceptCounter = () => {
    if (!pendingCounter) return;
    const originalThreshold = product.marketValueTl * customer.acceptanceThreshold;
    completeDeal(pendingCounter.counterAmountTl, originalThreshold, roundsUsed);
  };

  // Bölüm 4.2 satış modu: dükkâna gelen müşteriye satış — artık aynı
  // karşı-teklif motorunu kullanıyor (kabul / karşı teklif / vazgeç).
  const [saleCounter, setSaleCounter] = useState<{
    counterAmountTl: number;
    isFinal: boolean;
    reaction: string;
  } | null>(null);
  const sendSaleAsk = (amount: number, roundsUsedNow: number) => {
    setOffer(amount);
    const ceiling = product.marketValueTl * customer.acceptanceThreshold;
    const outcome = evaluateNegotiationTurn({
      direction: 'sell',
      thresholdTl: ceiling,
      bargainingStyle: customer.bargainingStyle,
      urgency: customer.urgency,
      karizmaScore: reputationScore,
      patience,
      previousOffers: offerHistory,
      roundsUsed: roundsUsedNow,
      maxRounds: COUNTER_OFFER_MAX_ROUNDS,
      offerTl: amount,
      phase: negotiationPhase,
    });
    setOfferHistory((history) => [...history, amount]);
    setPatience(outcome.patienceAfter);
    setReaction({ text: outcome.reaction, tone: outcome.tone });
    setNegotiationPhase(outcome.phaseAfter);

    if (outcome.kind === 'accept') {
      resolveSaleAccept(amount, roundsUsedNow);
      return;
    }
    if (outcome.kind === 'counter' || outcome.kind === 'final') {
      setSaleCounter({
        counterAmountTl: outcome.counterAmountTl,
        isFinal: outcome.kind === 'final',
        reaction: outcome.reaction,
      });
      setRoundsUsed(roundsUsedNow + 1);
      return;
    }
    if (outcome.kind === 'leave') rejectSale(amount);
    else setRoundsUsed(roundsUsedNow + 1);
  };

  const resolveSaleAccept = (amount: number, roundsUsedAtSettle: number) => {
    if (terminalActionStartedRef.current) return;
    terminalActionStartedRef.current = true;
    const settled = resolveIncomingCustomer(true, amount);
    setOffer(amount);
    setSaleCounter(null);
    setNegotiationPhase('ACCEPTED');
    logCompletedOffer({
      customerName: customer.name,
      productName: product.name,
      category: product.category,
      karat: product.karat,
      grams: product.grams,
      offerAmountTl: amount,
      marketValueTl: product.marketValueTl,
      quantity: product.quantity,
      status: 'kabul',
    });
    const isProfitable = settled ? settled.profitTl > 0 : false;
    const bonus = isProfitable
      ? { amount: XP_BONUS_DEAL_COMPLETED, reason: 'Kârlı satış' }
      : bonusXpForDeal(roundsUsedAtSettle, product);
    grantBonusXp(bonus.amount);
    setXpToast({ amount: (settled?.xpGained ?? 0) + bonus.amount, reason: bonus.reason });
    setResult('accepted');
  };

  const acceptSaleCounter = () => {
    if (!saleCounter) return;
    resolveSaleAccept(saleCounter.counterAmountTl, roundsUsed);
  };

  const rejectSale = (amount = offer) => {
    if (terminalActionStartedRef.current) return;
    terminalActionStartedRef.current = true;
    setSaleCounter(null);
    setNegotiationPhase('REJECTED');
    logCompletedOffer({
      customerName: customer.name,
      productName: product.name,
      category: product.category,
      karat: product.karat,
      grams: product.grams,
      offerAmountTl: amount,
      marketValueTl: product.marketValueTl,
      quantity: product.quantity,
      status: 'red',
    });
    setResult('rejected');
  };

  const closeCustomerSession = () => {
    if (customerDismissStartedRef.current) return;
    customerDismissStartedRef.current = true;
    terminalActionStartedRef.current = true;
    releaseNegotiationActionLock();
    setPendingCounter(null);
    setSaleCounter(null);
    setReaction(null);
    setNegotiationPhase('REJECTED');
    setResult(null);
    onClose();
  };

  const canAct = isSale
    ? result === null && saleCounter === null && !negotiationActionPending
    : tested && !measuring && result === null && pendingCounter === null && !negotiationActionPending;
  const fullPriceShortfall = Math.max(0, product.marketValueTl - cashTl);

  // Alım/bozdurma modunda: mevcut teklifin has gram başına karşılığı —
  // oyuncunun piyasa ALIŞ fiyatıyla karşılaştırıp anlaşmayı değerlendirmesi için.
  const unitPriceTl = !isSale ? offer / equivalentGrams(product.grams, product.karat) : undefined;

  // Bölüm 5/9: kâr analizi sadece sarrafiye (gerçek ayarı kesin bilinen)
  // kalemlerde gösterilir — işçilikli üründe gerçek ayar Uzman Görüşü'yle
  // açığa çıkana kadar belirsiz, yanıltıcı bir kâr rakamı göstermemek için.
  // v3 — Hassas Terazi zorunluluğu: test edilmeden tahmini kâr gösterilmez.
  const showKarAnalizi = !isSale && product.category !== 'iscilikli' && tested;
  // Bölüm 4.2: Piyasa Sezgisi — satış modunda müşteriye ne kadar iyi
  // satabileceğini (Fırsat Skoru) pazarlığa girmeden gösterir.
  const showFirsatSkoru = isSale && piyasaSezgisiLevel > 0;
  const firsatSkoru = showFirsatSkoru
    ? calculateOpportunityScore(product.marketValueTl, product.marketValueTl * customer.acceptanceThreshold, 'positive')
    : 0;
  const estimatedResaleTl =
    equivalentGrams(product.grams, product.karat) *
    (product.quantity ?? 1) *
    (goldPrice.buyPricePerGram + wholesalerSellMarginTlPerGram);
  const firstSessionHint = !hasCompletedTutorial && !isSale
    ? !tested && !firstSessionHintsDismissed.testProduct
      ? { id: 'testProduct', text: 'Önce ürünü test et.' }
      : tested && !reaction && !firstSessionHintsDismissed.setOffer
        ? { id: 'setOffer', text: 'Şimdi teklifini belirle.' }
        : reaction && !firstSessionHintsDismissed.afterOffer
          ? { id: 'afterOffer', text: 'Müşterinin tepkisine göre teklifini değiştirebilirsin.' }
          : null
    : null;

  // [YENİ] v3 — Toplu Alım: birden fazla FARKLI ürünle gelen müşteri, kalem
  // kalem (ayrı state ağacı, ayrı tart/teklif/karşı-teklif) işlenir — tüm
  // yukarıdaki hook'lar zaten koşulsuz çağrıldı, bu erken dönüş güvenli.
  if (incomingCustomer.lines) {
    return <BulkLineNegotiationView customer={customer} lines={incomingCustomer.lines} onClose={onClose} />;
  }

  if (result) {
    return (
      <NegotiationResult
        result={result}
        isSale={isSale}
        offerAmount={offer}
        borrowedTl={borrowedTl}
        customerName={customer.name}
        productName={product.name}
        hasBrokerDeal={hasBrokerDeal}
        onResolveBrokerDeal={resolveBrokerDeal}
        onClose={onClose}
        xpToast={xpToast}
        onXpToastDone={() => setXpToast(null)}
      />
    );
  }

  return (
    <View style={styles.stack}>
      {/* [DÜZELTME] Müşteri + Ürün artık alt alta değil, yan yana iki kompakt
          panel — dikey alan kazanmak için (referans tasarım). */}
      <View style={styles.customerProductRow}>
        <CustomerNoteCard customer={customer} patienceRatio={patienceRatio} compact />
        <NegotiationProductCard
          product={product}
          uzmanGorusuLevel={uzmanGorusuLevel}
          tested={!isSale && tested}
          compact
        />
      </View>
      {showFirsatSkoru && (
        <View style={styles.scoreRow}>
          <Badge tone="positive" label={`Fırsat Skoru: ${firsatSkoru}/100`} />
        </View>
      )}

      {!isSale && <ScalePanel reading={reading} tested={tested} measuring={measuring} onTest={handleTest} />}

      {firstSessionHint && (
        <View style={styles.firstSessionHint}>
          <Text style={styles.firstSessionHintText}>{firstSessionHint.text}</Text>
          <Pressable onPress={() => dismissFirstSessionHint(firstSessionHint.id)} hitSlop={8}>
            <Text style={styles.firstSessionHintDismiss}>Kapat</Text>
          </Pressable>
        </View>
      )}

      {!pendingCounter && !saleCounter && !isSale && !tested && (
        <Pressable style={styles.rejectCustomerButton} onPress={closeCustomerSession} hitSlop={8}>
          <Text style={styles.rejectCustomerLabel}>Reddet</Text>
        </Pressable>
      )}

      {pendingCounter && (
        <CounterOfferCard
          customerName={customer.name}
          counterAmountTl={pendingCounter.counterAmountTl}
          direction="buy"
          patience={patience}
          reaction={pendingCounter.reaction}
          isFinal={pendingCounter.isFinal}
          onAccept={acceptCounter}
          onContinueNegotiating={() => setPendingCounter(null)}
          onWalkAway={closeCustomerSession}
        />
      )}
      {saleCounter && (
        <CounterOfferCard
          customerName={customer.name}
          counterAmountTl={saleCounter.counterAmountTl}
          direction="sell"
          patience={patience}
          reaction={saleCounter.reaction}
          isFinal={saleCounter.isFinal}
          onAccept={acceptSaleCounter}
          onContinueNegotiating={() => setSaleCounter(null)}
          onWalkAway={closeCustomerSession}
        />
      )}

      {/* [DÜZELTME] Teklif alanı artık test edilmeden AÇILMIYOR — büyük,
          devre dışı bırakılmış bir panel yerine sadece küçük bir bilgi
          metni gösteriliyor. Test zorunluluğu kuralı birebir korunuyor. */}
      {!pendingCounter && !saleCounter && !isSale && !tested && (
        <Text style={styles.testGateHint}>Teklif için önce ürünü test et.</Text>
      )}

      {!pendingCounter && !saleCounter && (isSale || tested) && (
        <>
          {reaction && <CustomerReaction customerName={customer.name} reaction={reaction.text} patience={patience} />}
          <CollapsibleOfferCard
            offerValueTl={offer}
            expanded={offerExpanded}
            onToggle={() => setOfferExpanded((v) => !v)}
          >
          <PriceBlock
            marketValueTl={product.marketValueTl}
            min={sliderMin}
            max={sliderMax}
            value={offer}
            onChange={setOffer}
            disabled={!canAct}
            cashLimited={cashLimited}
            unitPriceTl={unitPriceTl}
            obscureValue={!isSale && !tested}
          />

          {!isSale && (
            <OfferPresets
              disabled={!canAct}
              presets={[
                {
                  key: 'olucu',
                  label: 'Ölücü',
                  sublabel: `%${Math.round(OFFER_PRESET_OLUCU_RATIO * 100)}`,
                  onPress: () => setOffer(clampOffer(Math.round(product.marketValueTl * OFFER_PRESET_OLUCU_RATIO))),
                },
                {
                  key: 'makul',
                  label: 'Makul',
                  sublabel: `%${Math.round(OFFER_PRESET_MAKUL_RATIO * 100)}`,
                  onPress: () => setOffer(clampOffer(Math.round(product.marketValueTl * OFFER_PRESET_MAKUL_RATIO))),
                },
                {
                  key: 'comert',
                  label: 'Cömert',
                  sublabel: `%${Math.round(OFFER_PRESET_COMERT_RATIO * 100)}`,
                  onPress: () => setOffer(clampOffer(Math.round(product.marketValueTl * OFFER_PRESET_COMERT_RATIO))),
                },
              ]}
            />
          )}

          {/* [DÜZELTME] Aksiyon butonları (Gönder/Öde/Reddet) artık Kâr
              Analizi'nden ÖNCE — işlemi bitiren asıl kontrollere ulaşmak için
              ekstra kaydırma gerekmiyor. Kâr Analizi kaldırılmadı, sadece
              tamamlayıcı bilgi olarak en alta alındı. */}
          {isSale ? (
            <SaleActions
              disabled={!canAct}
              onOfferPrice={() => runNegotiationAction(() => sendSaleAsk(offer, roundsUsed))}
              onReject={closeCustomerSession}
            />
          ) : (
            <NegotiationActions
              disabled={!canAct}
              onSendOffer={() => runNegotiationAction(() => sendBuyOffer(offer, roundsUsed))}
              onPayFull={() => completeDeal(product.marketValueTl, product.marketValueTl * customer.acceptanceThreshold, 0)}
              onReject={closeCustomerSession}
              payFullHint={
                fullPriceShortfall > 0 ? `Nakdin yetmiyor — ${formatTl(fullPriceShortfall)} borç alınacak` : undefined
              }
            />
          )}

          {showKarAnalizi && (
            <>
              <Pressable
                onPress={() => setProfitAnalysisExpanded((current) => !current)}
                style={styles.profitToggle}
                hitSlop={8}
              >
                <Text style={styles.profitToggleLabel}>Kâr analizi</Text>
                <Text style={styles.profitToggleValue}>
                  {profitAnalysisExpanded ? '▾' : '▸'}
                </Text>
              </Pressable>
              {profitAnalysisExpanded && <KarAnaliziCard offerTl={offer} estimatedResaleTl={estimatedResaleTl} />}
            </>
          )}
          </CollapsibleOfferCard>
        </>
      )}
    </View>
  );
}

/**
 * [YENİ] v3 — Toplu Alım. UX revizyonu: artık kalemleri teknik bir
 * "Kalem N/M" sırasıyla dayatmıyor — önce müşterinin getirdiği TÜM ürünleri
 * doğal bir liste halinde gösteriyor (LineItemPicker), oyuncu istediği
 * ürüne dokunup pazarlığını açıyor, istediği zaman listeye dönüp başka bir
 * ürüne geçebiliyor (bkz. Bölüm gereksinimleri #3/#4). Her kalemin
 * LineItemNegotiation örneği baştan sona MOUNTED kalır (sadece `display:
 * 'none'` ile gizlenir) — böylece bir üründen ayrılıp geri dönüldüğünde
 * tartım/teklif/karşı-teklif ilerlemesi SIFIRLANMAZ; pazarlık motoru
 * (evaluateBuyOffer, terminal red, spam-istismarına kapalı deterministik
 * eşik) ve Hassas Terazi zorunluluğu hiç değişmedi. Basitleştirme (v3
 * kapsam sınırı): tüm toplu alım boyunca tek bir sabır/zaman aşımı sayacı
 * YOKTUR — müşteri tüm kalemler bitene kadar bekler.
 */
function BulkLineNegotiationView({
  customer,
  lines,
  onClose,
}: {
  customer: NegotiationCustomer;
  lines: NegotiationLine[];
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, { accepted: boolean; amountTl: number }>>({});
  const [testedMap, setTestedMap] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(onClose, 1800);
    return () => clearTimeout(id);
  }, [done, onClose]);

  if (done) {
    const accepted = Object.values(results).filter((r) => r.accepted).length;
    const rejected = Object.values(results).length - accepted;
    const totalTl = Object.values(results).reduce((sum, r) => sum + (r.accepted ? r.amountTl : 0), 0);
    return (
      <View style={styles.compactWrap}>
        <View style={styles.compactResult}>
          <View style={[styles.compactBadge, { backgroundColor: colors.positive }]}>
            <Text style={styles.compactBadgeLabel}>✓</Text>
          </View>
          <View style={styles.compactTextBlock}>
            <Text style={styles.compactTitle}>Toplu alım tamamlandı</Text>
            <Text style={styles.compactSubtitle}>
              {accepted} kalem kabul edildi, {rejected} kalem reddedildi — toplam {formatTl(totalTl)} ödendi.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const handleSettled = (index: number, result: { accepted: boolean; amountTl: number }) => {
    const nextResults = { ...results, [index]: result };
    setResults(nextResults);
    if (Object.keys(nextResults).length >= lines.length) {
      setDone(true);
    } else {
      setActiveIndex(null);
    }
  };

  const rejectCustomerSession = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onClose();
  };

  return (
    <View style={styles.stack}>
      {/* [DÜZELTME] Çok kalemli getiride yan yana dar şerit, kalem sayısı
          arttıkça yatay kaydırma gerektiriyordu (kullanılabilirlik sorunu).
          Seçim adımında (activeIndex === null) artık müşteri kartı üstte
          kompakt, ürünler altında TAM GENİŞLİK 2 sütunlu grid halinde —
          tüm kalemler yatay kaydırmadan görülüp dokunulabiliyor. Bir kalemin
          detayı açıldığında (activeIndex !== null) tekrar tek satır, çünkü
          o an LineItemNegotiation'ın kendi ürün kartı zaten gösteriliyor. */}
      <View style={styles.bulkHeaderRow}>
        <View style={styles.bulkCustomerWrap}>
          <CustomerNoteCard customer={customer} compact />
        </View>
        <View style={styles.bulkPickerWrap}>
          <Text style={styles.bulkPickerLabel}>ÜRÜNLER</Text>
          <LineItemPicker
            lines={lines}
            results={results}
            testedMap={testedMap}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            layout="chips"
          />
        </View>
      </View>
      <Pressable style={styles.rejectCustomerButton} onPress={rejectCustomerSession} hitSlop={8}>
        <Text style={styles.rejectCustomerLabel}>Reddet</Text>
      </Pressable>
      {activeIndex === null && <Text style={styles.bulkSelectHint}>Pazarlığa başlamak için bir ürün seç.</Text>}
      {lines.map((line, index) => (
        <View key={index} style={index === activeIndex ? undefined : styles.hiddenLine}>
          <LineItemNegotiation
            product={line.product}
            reading={line.scaleReading}
            customer={customer}
            itemProgressLabel={`Ürün ${index + 1} / ${lines.length}`}
            onBack={() => setActiveIndex(null)}
            onTestedChange={(t) => setTestedMap((prev) => ({ ...prev, [index]: t }))}
            onSettled={(result) => handleSettled(index, result)}
            onRejectSession={rejectCustomerSession}
          />
        </View>
      ))}
    </View>
  );
}

function NegotiationResult({
  result,
  isSale,
  offerAmount,
  borrowedTl,
  customerName,
  productName,
  hasBrokerDeal,
  onResolveBrokerDeal,
  onClose,
  xpToast,
  onXpToastDone,
}: {
  result: 'accepted' | 'rejected' | 'creditDenied' | 'timedOut';
  isSale: boolean;
  offerAmount: number;
  borrowedTl: number;
  customerName: string;
  productName: string;
  hasBrokerDeal: boolean;
  onResolveBrokerDeal: () => { saleValueTl: number; profitTl: number } | null;
  onClose: () => void;
  xpToast: { amount: number; reason: string } | null;
  onXpToastDone: () => void;
}) {
  const [brokerOutcome, setBrokerOutcome] = useState<{ profitTl: number } | null>(null);
  const [brokerResolved, setBrokerResolved] = useState(false);
  const accepted = result === 'accepted';
  const compact = (accepted && !hasBrokerDeal) || result === 'rejected' || result === 'timedOut';
  const badgeColor =
    result === 'accepted' ? colors.positive : result === 'creditDenied' ? colors.warning : colors.negative;
  const title =
    result === 'accepted'
      ? isSale
        ? 'Satıldı'
        : 'Teklif kabul edildi'
      : result === 'creditDenied'
        ? 'Toptancı kredi vermedi'
        : result === 'timedOut'
          ? 'Süre doldu'
          : isSale
            ? 'Satış olmadı'
            : 'Teklif reddedildi';
  const subtitle =
    result === 'accepted'
      ? isSale
        ? `${customerName}, ${formatTl(offerAmount)} karşılığında ${productName.toLowerCase()} satın aldı.`
        : `${customerName}, ${formatTl(offerAmount)} karşılığında ${productName.toLowerCase()} bıraktı.`
      : result === 'creditDenied'
        ? 'Toptancı Güvenin çok düşük olduğu için borç vermiyorlar. Önce nakit biriktir ya da borcunu öde.'
        : result === 'timedOut'
          ? `${customerName} sabrını yitirip dükkândan ayrıldı.`
          : isSale
            ? `${customerName} alışveriş yapmadan dükkândan ayrıldı.`
            : `${customerName} teklifi düşük buldu ve dükkândan ayrıldı.`;

  // Bölüm 3 UX: kabul/red/timeout artık tam ekran bir kesinti değil — küçük,
  // otomatik kaybolan bir özet (kapama zamanlaması NegotiationPanel'de).
  // Sadece creditDenied (oyuncunun bir şey yapması gerekebilir) manuel kalır.
  if (compact) {
    return (
      <View style={styles.compactWrap}>
        <View style={styles.compactResult}>
          <View style={[styles.compactBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.compactBadgeLabel}>{result === 'accepted' ? '✓' : '✕'}</Text>
          </View>
          <View style={styles.compactTextBlock}>
            <Text style={styles.compactTitle}>{title}</Text>
            <Text style={styles.compactSubtitle}>{subtitle}</Text>
            {accepted && borrowedTl > 0 && (
              <Text style={styles.borrowedNoteCompact}>{formatTl(borrowedTl)} borca yazıldı.</Text>
            )}
          </View>
        </View>
        {xpToast && <XpToast amount={xpToast.amount} reason={xpToast.reason} onDone={onXpToastDone} />}
      </View>
    );
  }

  return (
    <View style={styles.resultContainer}>
      <View style={[styles.resultBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.resultBadgeLabel}>!</Text>
      </View>
      <Text style={styles.resultTitle}>{title}</Text>
      <Text style={styles.resultSubtitle}>{subtitle}</Text>
      {xpToast && (
        <View style={styles.resultXpToastWrap}>
          <XpToast amount={xpToast.amount} reason={xpToast.reason} onDone={onXpToastDone} />
        </View>
      )}
      {accepted && hasBrokerDeal && !brokerResolved && (
        <>
          <Text style={styles.brokerHint}>
            Toptancı Bağlantısı açık: az önce aldığını hemen toptancıya devredip kesin kâr cebe atabilirsin.
          </Text>
          <Pressable
            style={styles.brokerButton}
            onPress={() => {
              const outcome = onResolveBrokerDeal();
              setBrokerResolved(true);
              if (outcome) setBrokerOutcome(outcome);
            }}
          >
            <Text style={styles.brokerButtonLabel}>Toptancıya Hemen Sat</Text>
          </Pressable>
        </>
      )}
      {brokerOutcome && (
        <Text style={styles.brokerOutcomeNote}>
          Toptancıya devredildi: +{formatTl(brokerOutcome.profitTl)} kâr cebe girdi.
        </Text>
      )}
      <Pressable style={styles.resultButton} onPress={onClose}>
        <Text style={styles.resultButtonLabel}>Tamam</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // [DÜZELTME] Bileşenler arası boşluk daraltıldı — Müşteri → Ürün → Test →
  // Teklif aynı ekranda, az kaydırmayla görünsün.
  stack: {
    gap: 6,
  },
  // [YENİ] Aktif olmayan kalemin LineItemNegotiation'ı unmount edilmez —
  // sadece görünmez yapılır, böylece tartım/teklif ilerlemesi korunur.
  hiddenLine: {
    display: 'none',
  },
  scoreRow: {
    marginTop: -6,
  },
  // [YENİ] Müşteri + Ürün yan yana satırı (referans tasarım) — ikisi de
  // yaklaşık eşit genişlikte, dikey alan kazandırmak için.
  customerProductRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'stretch',
  },
  // [DÜZELTME] Çoklu kalem seçim ızgarası artık dar bir yan panelde değil,
  // tam genişlikte — 2 sütunlu grid tüm kalemleri yatay kaydırmadan gösterir.
  bulkHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
  },
  bulkCustomerWrap: {
    flex: 0.46,
  },
  bulkPickerWrap: {
    flex: 0.54,
    padding: 6,
    borderRadius: radius.md,
    backgroundColor: glass.panelBg,
    borderWidth: 1,
    borderColor: glass.borderSoft,
    justifyContent: 'center',
    gap: 4,
  },
  bulkPickerLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 8,
    letterSpacing: 0.8,
    color: glass.inkMuted,
  },
  bulkSelectHint: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: glass.inkMuted,
    textAlign: 'center',
    paddingVertical: 3,
  },
  // [YENİ] Test edilmeden teklif alanı yerine gösterilen kompakt bilgi metni.
  testGateHint: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: colors.inkMutedOnDark,
    textAlign: 'center',
    paddingVertical: 6,
  },
  firstSessionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: glass.borderSoft,
    backgroundColor: 'rgba(129, 46, 208, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  firstSessionHintText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkOnDark,
  },
  firstSessionHintDismiss: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.brass,
  },
  rejectCustomerButton: {
    alignSelf: 'flex-end',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: glass.borderSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  rejectCustomerLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.negative,
  },
  profitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 3,
  },
  profitToggleLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: glass.inkMuted,
  },
  profitToggleValue: {
    fontFamily: fonts.headingBold,
    fontSize: 12,
    color: glass.gold,
  },
  compactWrap: {
    gap: 8,
  },
  compactResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: glass.panelBg,
    borderWidth: 1,
    borderColor: glass.borderSoft,
    borderRadius: radius.md,
    padding: 14,
  },
  resultXpToastWrap: {
    alignItems: 'center',
    marginTop: 14,
  },
  compactBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactBadgeLabel: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.white,
  },
  compactTextBlock: {
    flex: 1,
  },
  compactTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: glass.ink,
  },
  compactSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: glass.inkMuted,
    marginTop: 2,
  },
  borrowedNoteCompact: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: glass.warning,
    marginTop: 3,
  },
  resultContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  resultBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  resultBadgeLabel: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    color: colors.white,
  },
  resultTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.inkOnDark,
    textAlign: 'center',
  },
  resultSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.inkMutedOnDark,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  brokerHint: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: colors.inkMutedOnDark,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
  },
  brokerButton: {
    marginTop: 10,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  brokerButtonLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.white,
  },
  brokerOutcomeNote: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.positive,
    textAlign: 'center',
    marginTop: 10,
  },
  resultButton: {
    marginTop: 28,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  resultButtonLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.white,
  },
});
