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
  SIKI_PAZARLIKCI_THRESHOLD_REDUCTION_PER_LEVEL,
  XP_BONUS_DEAL_COMPLETED,
  XP_BONUS_GOOD_BARGAIN,
} from '../config/economyConfig';
import {
  evaluateNegotiationTurn,
  initialNegotiationPatience,
  type NegotiationPhase,
  type NegotiationReactionTone,
} from '../engine/negotiation';
import { equivalentGrams, useGameStore } from '../store/useGameStore';
import type { NegotiationCustomer, NegotiationProduct } from '../types/negotiation';
import type { ScaleReading } from './ScalePanel';
import { fonts, fontSizes } from '../theme';
import { glass } from '../theme/glass';
import { formatTl } from '../utils/format';
import { CollapsibleOfferCard } from './CollapsibleOfferCard';
import { CounterOfferCard } from './CounterOfferCard';
import { CustomerReaction } from './CustomerReaction';
import { NegotiationActions } from './NegotiationActions';
import { NegotiationProductCard } from './NegotiationProductCard';
import { OfferPresets } from './OfferPresets';
import { PriceBlock } from './PriceBlock';
import { ScalePanel } from './ScalePanel';
import { XpToast } from './XpToast';

const MEASURE_DURATION_MS = 900;
// [DÜZELTME] Teklif tabanı %80'e çekildiği için bu eşik de o tabanın
// altında kalmayacak şekilde güncellendi (aksi halde hiç tetiklenemezdi).
const OLUCU_AGGRESSIVE_OFFER_RATIO = 0.85;
const SIKI_PAZARLIKCI_REPUTATION_PENALTY = 1;

/**
 * [YENİ] v3 — Toplu Alım'ın TEK bir kalemi için bağımsız pazarlık akışı
 * (kendi terazi/teklif/karşı-teklif/sonuç döngüsü). NegotiationPanel bunu
 * her kalem için `key={lineIndex}` ile yeniden mount ederek sırayla işletir
 * — mevcut tek-ürün akışıyla (NegotiationPanel'in kendi buy-path'i) AYNI
 * pazarlık motorunu (evaluateBuyOffer) kullanır, kod kopyalanmıştır ama
 * MANTIK BİREBİR AYNIDIR (deterministik eşik + terminal red — spam istismarına kapalı).
 */
export function LineItemNegotiation({
  product,
  reading,
  customer,
  itemProgressLabel,
  onBack,
  onTestedChange,
  onSettled,
  onRejectSession,
}: {
  product: NegotiationProduct;
  reading: ScaleReading;
  customer: NegotiationCustomer;
  /** [YENİ] UX revizyonu — teknik "Kalem N/M" yerine küçük, doğal ilerleme metni (ör. "Ürün 1 / 2"). */
  itemProgressLabel: string;
  /** [YENİ] UX revizyonu — ürün listesine geri dönüş; oyuncu istediği zaman kalemler arasında geçebilmeli. */
  onBack: () => void;
  /** [YENİ] Bu kalemin test edilip edilmediğini üst listeye (mini kart rozeti için) bildirir. */
  onTestedChange?: (tested: boolean) => void;
  onSettled: (result: { accepted: boolean; amountTl: number }) => void;
  onRejectSession?: () => void;
}) {
  const reputationScore = useGameStore((s) => s.reputation.score);
  const skillLevels = useGameStore((s) => s.skillLevels);
  const cashTl = useGameStore((s) => s.capital.cashTl);
  const settleDeal = useGameStore((s) => s.settleDeal);
  const logCompletedOffer = useGameStore((s) => s.logCompletedOffer);
  const grantBonusXp = useGameStore((s) => s.grantBonusXp);
  const adjustReputation = useGameStore((s) => s.adjustReputation);
  const sikiPazarlikciLevel = skillLevels['siki-pazarlikci'] ?? 0;
  const oluluLevel = skillLevels['olucu'] ?? 0;

  const [tested, setTested] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [offerExpanded, setOfferExpanded] = useState(true);
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
  const [result, setResult] = useState<{ accepted: boolean; amountTl: number; borrowedTl: number; xp: number; reason: string } | null>(
    null,
  );

  const baseMin = Math.round(product.marketValueTl * OFFER_RANGE_MIN_RATIO);
  const baseMax = Math.round(product.marketValueTl * OFFER_RANGE_MAX_RATIO);
  const sliderMax = Math.max(1, Math.min(baseMax, Math.round(cashTl)));
  const sliderMin = Math.min(baseMin, sliderMax);
  const clampOffer = (amount: number) => Math.max(sliderMin, Math.min(sliderMax, amount));

  const [offer, setOffer] = useState(() => clampOffer(Math.round(product.marketValueTl * OFFER_PRESET_OLUCU_RATIO)));

  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => onSettled({ accepted: result.accepted, amountTl: result.amountTl }), 1500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const handleTest = () => {
    if (measuring) return;
    setMeasuring(true);
    setTimeout(() => {
      setMeasuring(false);
      setTested(true);
      onTestedChange?.(true);
    }, MEASURE_DURATION_MS);
  };

  const settleAccepted = (amount: number, originalThreshold: number, roundsUsedAtSettle: number) => {
    if (terminalActionStartedRef.current) return;
    terminalActionStartedRef.current = true;
    const offerRatio = amount / product.marketValueTl;
    if (offerRatio < OFFER_PRESET_OLUCU_RATIO) adjustReputation(-LOW_OFFER_REPUTATION_PENALTY);
    else if (offerRatio >= OFFER_PRESET_COMERT_RATIO) adjustReputation(GENEROUS_OFFER_REPUTATION_BONUS);
    if (amount < originalThreshold && sikiPazarlikciLevel > 0) adjustReputation(-SIKI_PAZARLIKCI_REPUTATION_PENALTY);
    if (oluluLevel > 0 && amount < product.marketValueTl * OLUCU_AGGRESSIVE_OFFER_RATIO) {
      adjustReputation(-OLUCU_REPUTATION_PENALTY_PER_LEVEL * oluluLevel);
    }

    const outcome = settleDeal(amount, {
      name: product.name,
      category: product.category,
      karat: product.karat,
      grams: product.grams,
      marketValueTl: product.marketValueTl,
      quantity: product.quantity,
      source: product.source,
    });
    setPendingCounter(null);
    if (!outcome.success) {
      setResult({ accepted: false, amountTl: amount, borrowedTl: 0, xp: 0, reason: 'Toptancı kredi vermedi' });
      return;
    }
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
    const bonus = roundsUsedAtSettle > 0 ? { amount: XP_BONUS_GOOD_BARGAIN, reason: 'İyi pazarlık' } : { amount: XP_BONUS_DEAL_COMPLETED, reason: 'Müşteri işlemi tamamlandı' };
    grantBonusXp(bonus.amount);
    setResult({ accepted: true, amountTl: amount, borrowedTl: outcome.borrowedTl, xp: outcome.xpGained + bonus.amount, reason: bonus.reason });
  };

  const rejectLine = (amount = offer) => {
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
    setResult({ accepted: false, amountTl: offer, borrowedTl: 0, xp: 0, reason: '' });
  };
  const rejectSession = onRejectSession ?? rejectLine;

  const sendOffer = (amount: number, roundsUsedNow: number) => {
    setOffer(amount);
    const originalThreshold = product.marketValueTl * customer.acceptanceThreshold;
    const adjustedThreshold = originalThreshold * (1 - sikiPazarlikciLevel * SIKI_PAZARLIKCI_THRESHOLD_REDUCTION_PER_LEVEL);
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
      settleAccepted(amount, originalThreshold, roundsUsedNow);
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
    if (outcome.kind === 'leave') rejectLine(amount);
    else setRoundsUsed(roundsUsedNow + 1);
  };

  const canAct = tested && !measuring && result === null && pendingCounter === null;

  if (result) {
    return (
      <View style={styles.resultWrap}>
        <View style={[styles.resultBadge, { backgroundColor: result.accepted ? glass.positive : glass.negative }]}>
          <Text style={styles.resultBadgeLabel}>{result.accepted ? '✓' : '✕'}</Text>
        </View>
        <View style={styles.resultTextBlock}>
          <Text style={styles.resultTitle}>
            {product.name} — {result.accepted ? 'kabul edildi' : 'reddedildi'}
          </Text>
          {result.accepted && (
            <Text style={styles.resultSubtitle}>
              {formatTl(result.amountTl)} karşılığında {product.name.toLowerCase()} alındı.
            </Text>
          )}
        </View>
        {result.accepted && result.xp > 0 && <XpToast amount={result.xp} reason={result.reason} onDone={() => {}} />}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backRow}>
        <Text style={styles.backLabel}>‹ Ürünlere dön</Text>
        <Text style={styles.progressLabel}>{itemProgressLabel}</Text>
      </Pressable>
      <NegotiationProductCard product={product} tested={tested} compact />
      <ScalePanel reading={reading} tested={tested} measuring={measuring} onTest={handleTest} />

      {/* [DÜZELTME] Teklif alanı test edilmeden AÇILMIYOR — kompakt bir bilgi
          metni gösteriliyor, büyük devre dışı bir panel değil. */}
      {!tested && !pendingCounter && (
        <Text style={styles.testGateHint}>Teklif için önce ürünü test et.</Text>
      )}

      {pendingCounter ? (
        <CounterOfferCard
          customerName={customer.name}
          counterAmountTl={pendingCounter.counterAmountTl}
          direction="buy"
          patience={patience}
          reaction={pendingCounter.reaction}
          isFinal={pendingCounter.isFinal}
          onAccept={() => settleAccepted(pendingCounter.counterAmountTl, product.marketValueTl * customer.acceptanceThreshold, roundsUsed)}
          onContinueNegotiating={() => setPendingCounter(null)}
          onWalkAway={rejectSession}
        />
      ) : tested ? (
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
          />
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
          <NegotiationActions
            disabled={!canAct}
            onSendOffer={() => sendOffer(offer, roundsUsed)}
            onPayFull={() => settleAccepted(product.marketValueTl, product.marketValueTl * customer.acceptanceThreshold, 0)}
            onReject={rejectSession}
          />
          </CollapsibleOfferCard>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 6 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: glass.goldBright,
  },
  progressLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: glass.inkMuted,
  },
  testGateHint: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: glass.inkMuted,
    textAlign: 'center',
    paddingVertical: 3,
  },
  resultWrap: { gap: 10 },
  resultBadge: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBadgeLabel: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },
  resultTextBlock: { alignItems: 'center' },
  resultTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: glass.ink,
    textAlign: 'center',
  },
  resultSubtitle: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: glass.inkMuted,
    textAlign: 'center',
    marginTop: 2,
  },
});
