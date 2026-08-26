import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  BOZDURMA_BULK_LOT_MAX_GRAMS,
  BOZDURMA_BULK_LOT_MIN_GRAMS,
  BOZDURMA_BULK_LOT_PROBABILITY,
  BOZDURMA_DIRECTION_PROBABILITY,
  BROKER_LIQUIDATION_MAX_COST_RECOVERY_RATIO,
  BROKER_DEAL_TIMEOUT_TRUST_PENALTY,
  BROKER_DEAL_WINDOW_MINUTES,
  CRAFTED_GOOD_BASE_COUNTERFEIT_RISK,
  CRAFTED_GOOD_CUSTOMER_PROBABILITY,
  CRAFTED_GOOD_KARAT_MISMATCH,
  CRAFTED_GOOD_MIN_COUNTERFEIT_RISK,
  CUSTOMER_RUSH_REMAINING_BONUS_RATIO,
  DAILY_CUSTOMER_TARGET_CURVE,
  EARLY_CUSTOMER_ARRIVAL_PACE_MULTIPLIERS,
  MAX_WAITING_QUEUE_LENGTH,
  MULTI_ITEM_CUSTOMER_PROBABILITY,
  FOUR_X_AD_UNLOCK_MINUTES,
  GAME_MINUTES_PER_REAL_SECOND_AT_1X,
  GULER_YUZ_PATIENCE_MINUTES_PER_LEVEL,
  KARIZMA_TRAFFIC_BONUS_POINTS,
  LATE_PAYMENT_TRUST_PENALTY,
  LEVEL_MAX,
  LEVEL_MILESTONES,
  LEVEL_XP_BASE,
  LEVEL_XP_INCREMENT,
  LOAN_TERM_DAYS,
  MARKET_SPREAD_MAX_TL_PER_GRAM,
  MARKET_SPREAD_MIN_TL_PER_GRAM,
  MARKET_STEP_MINUTES,
  MAX_REAL_SECONDS_PER_TICK,
  MELTING_SMALL_LARGE_THRESHOLD_GRAMS,
  MELTING_TIME_LARGE_MAX_MINUTES,
  MELTING_TIME_LARGE_MIN_MINUTES,
  MELTING_TIME_SMALL_MAX_MINUTES,
  MELTING_TIME_SMALL_MIN_MINUTES,
  MILESTONE_BONUS_SKILL_POINTS,
  MIN_TRUST_FOR_CREDIT,
  MINUTES_PER_DAY,
  OFFER_RESOLUTION_DELAY_MINUTES,
  PROGRESSION_UNLOCKS,
  RESTART_FLUCTUATION_MAX_PERCENT,
  RESTART_FLUCTUATION_MIN_PERCENT,
  SKILL_POINTS_PER_LEVEL,
  SOGUKKANLI_PATIENCE_MINUTES_PER_LEVEL,
  JEWELRY_REQUIRED_LEVEL,
  JEWELRY_TIER_REQUIRED_LEVELS,
  STARTING_CASH_TL,
  STARTING_EUR_TRY,
  STARTING_REFERENCE_PRICE,
  STARTING_USD_TRY,
  STARTING_WHOLESALER_TRUST,
  WHOLESALER_MARGIN_MAX_TL_PER_GRAM,
  WHOLESALER_MARGIN_MIN_TL_PER_GRAM,
  WORKSHOP_CONFIG,
  XP_PER_EQUIVALENT_GRAM_TRADED,
  YENIDEN_DOGUS_TIME_REDUCTION_PER_LEVEL,
} from '../config/economyConfig';
import type { ScaleReading } from '../components/ScalePanel';
import { CRAFTED_GOOD_CATALOG, REALISTIC_KARATS } from '../data/craftedGoodCatalog';
import type { JewelryPieceType, JewelryTierId } from '../data/jewelryInvestments';
import {
  buyJewelryPieceHolding,
  computeJewelryPiecePriceTl,
  normalizeJewelryHoldings,
  settleJewelryInvestments,
  type JewelryHoldings,
} from '../engine/jewelry';
import { buildMarketAssets, stepMarketReferenceDaily } from '../engine/market';
import { craftedMeltHasGrams } from '../engine/craftedGoods';
import { CUSTOMER_PERSONAS, INCOMING_CUSTOMER_NAMES } from '../data/incomingCustomerPool';
import { toptanciStock } from '../data/toptanciStock';
import { skillTree } from '../data/skillTree';
import type {
  CapitalState,
  GoldPriceState,
  InventoryCategory,
  InventoryItem,
  ReputationState,
  WorkshopState,
} from '../types/game';
import type { IncomingCustomer, NegotiationLine } from '../types/incomingCustomer';
import type { Offer } from '../types/offer';

export type ClockSpeed = 0 | 1 | 2 | 4;

export {
  MINUTES_PER_DAY,
  OFFER_RESOLUTION_DELAY_MINUTES,
} from '../config/economyConfig';

// Bölüm 23-24: seviye n'e ulaşmak için gereken TOPLAM (kümülatif) XP —
// kapalı formül: sum_{i=1}^{n-1} [BASE + (i-1)*INCREMENT].
export function xpRequiredForLevel(level: number): number {
  const n = level - 1;
  if (n <= 0) return 0;
  return n * LEVEL_XP_BASE + (LEVEL_XP_INCREMENT * (n * (n - 1))) / 2;
}

/** Toplam ömür boyu XP'den güncel seviyeyi türetir (LEVEL_MAX'ta sınırlanır). */
export function levelForTotalXp(totalXp: number): number {
  let level = 1;
  while (level < LEVEL_MAX && xpRequiredForLevel(level + 1) <= totalXp) {
    level += 1;
  }
  return level;
}

/** Belirli bir seviyeye kadar (dahil) kazanılan toplam yetenek puanı — 1/seviye + kilometre taşı bonusu. */
export function skillPointsForLevel(level: number): number {
  let points = 0;
  for (let lvl = 2; lvl <= level; lvl++) {
    points += SKILL_POINTS_PER_LEVEL;
    if (LEVEL_MILESTONES.includes(lvl)) points += MILESTONE_BONUS_SKILL_POINTS;
  }
  return points;
}

// v3 mimari birleşimi: saf fiyatlama/ekonomi fonksiyonları artık
// `src/engine/pricing.ts`de yaşıyor (UI'dan VE store'dan bağımsız "motor"
// katmanı) — burada sadece bu store'un geri kalanının import yolunu
// değiştirmeden kullanabilmesi için yeniden dışa aktarılıyor.
export {
  equivalentGrams,
  hasEquivalentGrams,
  currentPositionValueTl,
  computeStockValueTl,
  randomInRange,
  randomSignedPercent,
  priceFromReferenceAndSpread,
  stepMarketReference,
} from '../engine/pricing';
import {
  computeStockValueTl,
  currentPositionValueTl,
  equivalentGrams,
  hasEquivalentGrams,
  priceFromReferenceAndSpread,
  randomInRange,
  randomSignedPercent,
} from '../engine/pricing';

let nextInventoryId = 1;
let nextOfferId = 1;
let nextIncomingCustomerId = 1;

/**
 * Has altın karşılığı gram/maliyet miktarını mevcut Gram Altın (Has)
 * pozisyonuyla (fungible) birleştirir — eritme geri kazanımı (Bölüm 12)
 * ve Atölye üretimi (Bölüm 17) aynı stok kalemine akar.
 */
function mergeIntoGramAltin(
  inventory: InventoryItem[],
  grams: number,
  costBasisTl: number,
  acquiredDay: number,
): InventoryItem[] {
  if (grams <= 0) return inventory;
  const gramSpec = toptanciStock.find((s) => s.id === 'gram-altin')!;
  const existingIndex = inventory.findIndex(
    (i) =>
      i.name === gramSpec.name && i.category === gramSpec.category && i.karat === gramSpec.karat && i.grams === gramSpec.grams,
  );
  return existingIndex >= 0
    ? inventory.map((i, idx) =>
        idx === existingIndex ? { ...i, quantity: i.quantity + grams, costBasisTl: i.costBasisTl + costBasisTl } : i,
      )
    : [
        ...inventory,
        {
          id: String(nextInventoryId++),
          name: gramSpec.name,
          category: gramSpec.category,
          karat: gramSpec.karat,
          grams: gramSpec.grams,
          quantity: grams,
          costBasisTl,
          acquiredDay,
        } satisfies InventoryItem,
      ];
}

function normalizeInventoryForCurrentGameplay(inventory: InventoryItem[] | undefined): InventoryItem[] {
  return (inventory ?? []).filter((item) => String(item.category) !== 'pirlanta');
}

function workshopLevelConfig(level: number) {
  return WORKSHOP_CONFIG.levels.find((entry) => entry.level === level) ?? null;
}

export function workshopDailyHasOutput(level: number): number {
  return workshopLevelConfig(level)?.dailyHasOutput ?? 0;
}

export function workshopUpgradeCostEquivalentHasGrams(currentLevel: number): number | null {
  if (currentLevel >= WORKSHOP_CONFIG.maxLevel) return null;
  const nextLevel = currentLevel + 1;
  if (nextLevel === 1) return WORKSHOP_CONFIG.unlockCostEquivalentHasGrams;
  return workshopLevelConfig(nextLevel)?.upgradeCostEquivalentHasGrams ?? null;
}

export function workshopUpgradeCostTl(currentLevel: number, buyPricePerGram: number): number | null {
  const grams = workshopUpgradeCostEquivalentHasGrams(currentLevel);
  return grams === null ? null : Math.round(grams * buyPricePerGram);
}

function normalizeWorkshopState(workshop?: Partial<WorkshopState>, legacyAtolyeLevel = 0): WorkshopState {
  const rawLevel = workshop?.level ?? legacyAtolyeLevel ?? 0;
  const level = Math.max(0, Math.min(WORKSHOP_CONFIG.maxLevel, Math.floor(rawLevel)));
  return {
    unlocked: workshop?.unlocked ?? level > 0,
    level,
    totalHasProduced: workshop?.totalHasProduced ?? 0,
    lastProductionDay: workshop?.lastProductionDay ?? null,
  };
}

function normalizeDaySettlementSummary(summary?: Partial<DaySettlementSummary> | null): DaySettlementSummary | null {
  if (!summary || typeof summary.day !== 'number') return null;
  const activeTradeCashTl = summary.activeTradeCashTl ?? 0;
  const passiveInvestmentCashTl = summary.passiveInvestmentCashTl ?? 0;
  const meltingCashTl = summary.meltingCashTl ?? 0;
  return {
    day: summary.day,
    activeTradeCashTl,
    activeTradeProfitTl: summary.activeTradeProfitTl ?? 0,
    passiveInvestmentCashTl,
    workshopHasGrams: summary.workshopHasGrams ?? 0,
    meltingCashTl,
    totalEconomicDeltaTl: summary.totalEconomicDeltaTl ?? activeTradeCashTl + passiveInvestmentCashTl + meltingCashTl,
  };
}

function normalizeCustomerQueue(customers: Array<IncomingCustomer | null | undefined>, totalMinutesNow: number): IncomingCustomer[] {
  const seen = new Set<string>();
  return customers.filter((customer): customer is IncomingCustomer => {
    if (!customer?.id || seen.has(customer.id)) return false;
    if (customer.expiresAtTotalMinutes <= totalMinutesNow) return false;
    seen.add(customer.id);
    return true;
  });
}

export function charismaTrafficBonus(score: number): number {
  const points = KARIZMA_TRAFFIC_BONUS_POINTS;
  const clamped = Math.max(0, Math.min(100, score));
  for (let i = 0; i < points.length - 1; i += 1) {
    const left = points[i];
    const right = points[i + 1];
    if (clamped >= left.score && clamped <= right.score) {
      const t = (clamped - left.score) / Math.max(1, right.score - left.score);
      return left.bonus + (right.bonus - left.bonus) * t;
    }
  }
  return points[points.length - 1]?.bonus ?? 0;
}

export function dailyCustomerTargetForDay(day: number, charismaScore: number, rng: () => number = Math.random): number {
  const curve = DAILY_CUSTOMER_TARGET_CURVE.find((entry) => day >= entry.fromDay && day <= entry.toDay) ?? DAILY_CUSTOMER_TARGET_CURVE[0];
  const organic = curve.min + Math.round(rng() * (curve.max - curve.min));
  return Math.max(0, Math.round(organic * (1 + charismaTrafficBonus(charismaScore))));
}

interface BozdurmaCandidate {
  name: string;
  category: InventoryCategory;
  karat: number;
  gramsPerUnit: number;
  quantity: number;
}

/** Bölüm 6/10: müşteriden alım (bozdurma) için ürün + miktar üretir — çoğunlukla stoktaki 3 kalemden biri (küçük/orta miktar), nadiren büyük karışık ayarlı bir hurda parti. */
function pickBozdurmaCandidate(day = 1): BozdurmaCandidate {
  const bulkLotChance =
    day < PROGRESSION_UNLOCKS.productPools.bulkLots
      ? 0
      : day < PROGRESSION_UNLOCKS.productPools.rareLargeLots
        ? BOZDURMA_BULK_LOT_PROBABILITY * 0.6
        : BOZDURMA_BULK_LOT_PROBABILITY;
  if (Math.random() < bulkLotChance) {
    const karat = [14, 18, 20, 22][Math.floor(Math.random() * 4)];
    const maxGrams = day < 30 ? 500 : day < 75 ? 1000 : BOZDURMA_BULK_LOT_MAX_GRAMS;
    const grams = Math.round(randomInRange(BOZDURMA_BULK_LOT_MIN_GRAMS, maxGrams));
    return { name: 'Karışık Hurda Altın', category: 'yatirim', karat, gramsPerUnit: grams, quantity: 1 };
  }
  const spec = toptanciStock[Math.floor(Math.random() * toptanciStock.length)];
  const quantity = randomQuantityForSpec(spec.id);
  return { name: spec.name, category: spec.category, karat: spec.karat, gramsPerUnit: spec.grams, quantity };
}

function randomQuantityForSpec(specId: string): number {
  return specId === 'gram-altin'
    ? 1 + Math.floor(Math.random() * 30)
    : specId === 'ceyrek-altin'
      ? 1 + Math.floor(Math.random() * 15)
      : 1 + Math.floor(Math.random() * 4);
}

/**
 * [YENİ] v3 — Toplu Alım (Kalem Bazlı Pazarlık): bir müşteri 2-3 FARKLI
 * üründen (Çeyrek/Gram/Bilezik karışımı) aynı anda bozdurmak isteyebilir.
 * Her kalem NegotiationPanel'de ayrı ayrı tartılıp ayrı ayrı pazarlık edilir.
 */
function pickMultiItemBozdurmaLines(nextBuyPrice: number): NegotiationLine[] {
  const shuffled = [...toptanciStock].sort(() => Math.random() - 0.5);
  const itemCount = 2 + Math.floor(Math.random() * Math.min(2, shuffled.length - 1));
  return shuffled.slice(0, itemCount).map((spec) => {
    const quantity = randomQuantityForSpec(spec.id);
    const marketValueTl = equivalentGrams(spec.grams, spec.karat) * quantity * nextBuyPrice;
    return {
      product: {
        name: spec.name,
        source: 'Müşteri getirdi',
        category: spec.category,
        karat: spec.karat,
        grams: spec.grams,
        quantity,
        marketValueTl,
      },
      scaleReading: { grams: spec.grams * quantity, karat: spec.karat, cleanliness: 'Temiz' },
    };
  });
}

/**
 * Bölüm 23-24: bir aktif alım-satım işlemi tamamlandığında çağrılır —
 * kazanılan XP toplam XP'ye eklenir, seviye atlandıysa yetenek puanı(ları)
 * kazanılır. Saf bir hesaplama: çağıran, döndürülen alanları kendi set()
 * çağrısına ekler (ayrı bir set() tetiklemez, tek işlemde birleşir).
 */
function applyXpGain(
  state: Pick<GameState, 'totalXp' | 'level' | 'skillPoints'>,
  xpGained: number,
): { totalXp: number; level: number; skillPoints: number } {
  const totalXp = state.totalXp + Math.max(0, xpGained);
  const level = levelForTotalXp(totalXp);
  const gainedSkillPoints = level > state.level ? skillPointsForLevel(level) - skillPointsForLevel(state.level) : 0;
  return { totalXp, level, skillPoints: state.skillPoints + gainedSkillPoints };
}

interface CraftedGoodCandidate {
  productType: string;
  claimedKarat: number;
  actualKarat: number;
  grams: number;
  hasHiddenFlaw: boolean;
  stoneValueTl: number;
}

/**
 * Bölüm 11/14: müşteriden gelen işçilikli ürün üretir — beyan edilen ayar
 * her zaman gerçek olmayabilir (sahtecilik/yanlış beyan riski), gizli
 * kusur ve taş değeri de saklı tutulur (Uzman Görüşü ile açığa çıkar).
 * `uzmanGorusuLevel` arttıkça şüpheli müşterilerin denk gelme ihtimali
 * azalır (Bölüm 37: sahtecilik riski %10-20 → skil ile %2-5).
 */
function pickCraftedGoodCandidate(uzmanGorusuLevel: number): CraftedGoodCandidate {
  const spec = CRAFTED_GOOD_CATALOG[Math.floor(Math.random() * CRAFTED_GOOD_CATALOG.length)];
  const claimedKarat = REALISTIC_KARATS[Math.floor(Math.random() * REALISTIC_KARATS.length)];
  const grams = Math.round(randomInRange(spec.minGrams, spec.maxGrams) * 10) / 10;

  const counterfeitRisk = Math.max(
    CRAFTED_GOOD_MIN_COUNTERFEIT_RISK,
    CRAFTED_GOOD_BASE_COUNTERFEIT_RISK - (CRAFTED_GOOD_BASE_COUNTERFEIT_RISK - CRAFTED_GOOD_MIN_COUNTERFEIT_RISK) * (uzmanGorusuLevel / 5),
  );
  const isMismatched = Math.random() < counterfeitRisk;
  const actualKarat = isMismatched ? Math.max(8, claimedKarat - CRAFTED_GOOD_KARAT_MISMATCH) : claimedKarat;
  const hasHiddenFlaw = isMismatched && Math.random() < 0.5;
  const stoneValueTl = spec.hasStone ? Math.round(randomInRange(2000, 15000)) : 0;

  return { productType: spec.productType, claimedKarat, actualKarat, grams, hasHiddenFlaw, stoneValueTl };
}

// Bölüm 9: büyük bozdurmalar + Toptancı Bağlantısı — müşteriden nakit
// yetmeyen bir alım borca yazıldığında, o alımın tam bu miktarı sınırlı
// bir süre için toptancıya kâr marjıyla anında satılabilir hale gelir.
export interface BrokerDeal {
  inventoryItemId: string;
  /** Bu bağlantıyla korunan, bu işlemden gelen adet (envanterdeki toplam adet değil). */
  quantity: number;
  expiresAtTotalMinutes: number;
}

// Bölüm 12: eritme — işçilikli bir ürün, envanterden çıkıp bir süreliğine
// "ocakta" kalır; süre dolunca gerçek ayar/kusur/verim üzerinden hesaplanan
// has altın Gram Altın stoğuna, varsa taş değeri nakit olarak kasaya eklenir.
export interface MeltingJob {
  productName: string;
  recoveredGrams: number;
  stoneValueTl: number;
  /** Eritilen işçilikli ürün için orijinal ödenen tutar — geri kazanılan altının maliyet tabanı (kâr/zarar burada gizli kalmaz). */
  costBasisTl: number;
  completesAtTotalMinutes: number;
}

export interface DaySettlementSummary {
  day: number;
  activeTradeCashTl: number;
  activeTradeProfitTl: number;
  passiveInvestmentCashTl: number;
  workshopHasGrams: number;
  meltingCashTl: number;
  totalEconomicDeltaTl: number;
}

interface GameState {
  /** Bölüm 31: Profil — oyuncunun özelleştirebildiği oyuncu ve dükkân adı. */
  playerName: string;
  setPlayerName: (name: string) => void;
  shopName: string;
  setShopName: (name: string) => void;
  capital: CapitalState;
  goldPrice: GoldPriceState;
  reputation: ReputationState;
  inventory: InventoryItem[];
  /** Bölüm 4.6: Bekleyen/Kabul/Red durumundaki tüm pazarlık teklifleri. */
  offers: Offer[];
  /** Piyasa: dükkâna gelmiş, o an aktif müşteri (alım ya da bozdurma isteyebilir) — yani TEZGAHTAKİ müşteri. */
  incomingCustomer: IncomingCustomer | null;
  /** [YENİ] Müşteri Bekleme Kuyruğu — üretilen müşteriler önce buraya girer, tezgaha çağrılmayı bekler. */
  waitingCustomers: IncomingCustomer[];
  dailyCustomerTarget: number;
  dailyCustomersGenerated: number;
  customerRushUsedDay: number | null;
  customerRushFeedback: string | null;
  /**
   * [YENİ] Kuyruktaki ilk (index 0) müşteriyi tezgaha (incomingCustomer)
   * çağırır. Tezgah doluysa (incomingCustomer !== null) ya da kuyruk
   * boşsa false döner.
   */
  callNextCustomerToCounter: () => boolean;
  day: number;
  minuteOfDay: number;
  speed: ClockSpeed;
  /**
   * Yeni bir müşteri belirdiği anda (Pazarlık paneli render olmadan ÖNCE,
   * React'ın render döngüsünü beklemeden tick() içinde) oyun otomatik
   * duraklatılır — müşterinin sabrı oyuncu tepki verene kadar tükenmesin.
   * Bu alan, müşteri kapanınca hangi hıza dönüleceğini tutar.
   */
  preNegotiationSpeed: ClockSpeed | null;
  referencePriceAtDayStart: number;
  /** Bölüm 4.4: genel piyasa ALIŞ/SATIŞ makası (TL/gram) — her 30 dakikalık piyasa adımında yeniden belirlenir. */
  marketSpreadTlPerGram: number;
  /** Bölüm 5: toptancının SATIŞ fiyatının şu kadar altından oyuncuya sattığı marj (TL/gram). */
  wholesalerBuyMarginTlPerGram: number;
  /** Bölüm 5: toptancının ALIŞ/bozdurma fiyatının şu kadar üstünden oyuncudan aldığı marj (TL/gram) — ileri fazlardaki Toptancı Bağlantısı için ayrılmış. */
  wholesalerSellMarginTlPerGram: number;
  wholesalerTrust: number;
  /** Aktif borcun ödenmesi gereken oyun günü; borç yoksa null. */
  loanDueDay: number | null;
  /** Bölüm 9: açık Toptancı Bağlantısı — süresi içinde toptancıya satılmazsa güven düşer. */
  brokerDeal: BrokerDeal | null;
  /** Bölüm 12: aktif eritme işi — tamamlanınca has altın Gram Altın stoğuna eklenir. */
  meltingJob: MeltingJob | null;
  /** v0.2: bağımsız pasif HAS üretim sistemi; işçilikli ürünlerle bağlantısı yoktur. */
  workshop: WorkshopState;
  /** @deprecated Eski kayıtlarla uyumluluk için aynalanır; yeni gameplay `workshop.level` kullanır. */
  atolyeLevel: number;
  /** [YENİ] v3 — Takı Yatırımı (Parça & Set): "tier.piece" anahtarlarıyla sahip olunan kalıcı pasif gelir parçaları. Seviye 7+ gerektirir. */
  jewelryHoldings: JewelryHoldings;
  /** Son tamamlanan oyun günü için kısa settlement özeti; ödeme hesabını tekrar çalıştırmaz. */
  lastDaySettlementSummary: DaySettlementSummary | null;
  /** Gün içinde gerçekleşen aktif ticaretin gün sonu özetine taşınan nakit hareketi. */
  dailyActiveTradeCashTl: number;
  /** Gün içinde gerçekleşen aktif ticaretin realize kâr/zarar toplamı. */
  dailyActiveTradeProfitTl: number;
  /** Bölüm 22: 4x hızın açık olduğu GERÇEK DÜNYA epoch ms'i (Date.now() ile karşılaştırılır) — reklamla kazanılır, yoksa null. */
  fourXUnlockedUntilMs: number | null;
  /** Bölüm 22: küçük bir IAP ile alınan kalıcı sınırsız 4x hakkı. */
  fourXUnlimited: boolean;
  /**
   * 1x/2x/duraklat her zaman serbest; 4x sadece reklam penceresi açıkken
   * ya da sınırsız hak alınmışsa uygulanır — aksi halde speed değişmez ve
   * false döner (arayüz bunu reklam/IAP teklifini göstermek için kullanır).
   */
  setSpeed: (speed: ClockSpeed) => boolean;
  /** Bölüm 22 YER TUTUCU: "reklam izlendi" onayından sonra çağrılır — 4x'i FOUR_X_AD_UNLOCK_MINUTES kadar (üst üste eklenerek) açar. */
  unlockFourXViaAd: () => void;
  /** Bölüm 22 YER TUTUCU: "satın alındı" onayından sonra çağrılır — 4x'i kalıcı ve sınırsız açar. */
  purchaseFourXUnlimited: () => void;
  /** @deprecated Eski real-time müşteri hype kaydı; Faz 6’da gün-bazlı customerRushUsedDay kullanılır. */
  customerHypeUntilMs: number | null;
  /** Müşteri Akını: günde bir kez kalan günlük müşteri potansiyeline doğal hareketlilik bonusu verir. */
  watchAdForCustomerHype: () => void;
  /** Gerçek zamanda geçen saniyeyi oyun saatine, altın fiyatına ve müşteri akışına işler. */
  tick: (realSecondsElapsed: number) => void;
  /** Uygulama yeniden açıldığında (rehydration) referans fiyata bir kez daha ekstra ±%3-5 dalgalanma uygular. */
  applyRestartFluctuation: () => void;
  /**
   * Bir alımı kapatır: önce nakitten öder, yetmeyen kısmı borca yazar.
   * Alınan ürün envantere eklenir; aynı ürün (isim/kategori/ayar/gram)
   * zaten stoktaysa mevcut pozisyona eklenip maliyet ortalaması güncellenir.
   * Toptancı Güveni eşiğin altındaysa ve nakit yetmiyorsa işlem reddedilir.
   */
  settleDeal: (
    paidAmountTl: number,
    item: {
      name: string;
      category: InventoryCategory;
      karat: number;
      grams: number;
      marketValueTl: number;
      estimatedSellPriceTl?: number;
      /** Bölüm 10: büyük işlemler — tek pazarlıkta N adet aynı SKU'nun toplu alımı. Belirtilmezse 1. */
      quantity?: number;
      source?: string;
      /** Bölüm 11-16: sadece category:'iscilikli' — karat/grams beyan, bunlar gizli gerçek değerler. */
      actualKarat?: number;
      hasHiddenFlaw?: boolean;
      stoneValueTl?: number;
    },
  ) => { success: true; borrowedTl: number; xpGained: number } | { success: false; borrowedTl: 0; xpGained: 0 };
  /**
   * Bölüm 9: açık Toptancı Bağlantısı'nı hemen kullanır — o işlemden gelen
   * malı genel ALIŞ fiyatından acil likiditeye çevirir. Bu bir kâr kanalı
   * değil, borç/soft-lock riskini yönetmek için sınırlı tasfiye penceresidir.
   */
  resolveBrokerDeal: () => { saleValueTl: number; profitTl: number } | null;
  /**
   * Bölüm 12/16: bir işçilikli ürünü eritmeye başlar — envanterden hemen
   * kalkar, bir süre sonra (Yeniden Doğuş kısaltır) gerçek ayar/kusur
   * üzerinden hesaplanan has altın Gram Altın stoğuna, taş değeri (Taş
   * Ustası şartıyla) nakit olarak eklenir. İşçilikli ürün asla başka bir
   * müşteriye satılmaz — tek çıkış yolu budur.
   */
  meltCraftedGood: (itemId: string) => boolean;
  /** @deprecated Ürün-bazlı Atölye gameplay'den kaldırıldı; her zaman false döner. */
  startCraftedGoodWorkshop: (itemId: string) => boolean;
  /** @deprecated Ürün-bazlı Atölye gameplay'den kaldırıldı; her zaman false döner. */
  collectCraftedGoodWorkshop: (itemId: string) => boolean;
  /** Atölye'yi Lv1-Lv10 arasında yükseltir; maliyet config'teki HAS gram karşılığından TL'ye çevrilir. */
  upgradeAtolye: () => boolean;
  /** [YENİ] v3: bir Takı Yatırımı parçası satın alır — Seviye 7 altında, parça zaten sahipse ya da nakit yetmiyorsa false döner. */
  buyJewelryPiece: (tierId: JewelryTierId, piece: JewelryPieceType) => boolean;
  /** Bir pozisyonun tamamını güncel kurdan nakde çevirir; alış-satış makasından gerçekleşen kârı döner. */
  sellInventoryItem: (
    itemId: string,
  ) => { saleValueTl: number; profitTl: number; quantity: number; xpGained: number } | null;
  /**
   * Piyasa: Toptancıdan Stok Al — pazarlıksız, her an açık restok. Genel
   * piyasa SATIŞ kurunun toptancı marjı kadar altından, sadece nakit
   * yettiği kadar (borç/kredi yok) anında satın alır.
   */
  buyInvestmentUnits: (
    spec: { name: string; karat: number; grams: number; category: InventoryCategory },
    quantity: number,
  ) => { success: true } | { success: false; reason: 'insufficient_cash' };
  /** Bir pozisyondan istenen adedi (kısmi olabilir) güncel ALIŞ kurundan anında nakde çevirir. */
  sellInvestmentUnits: (
    itemId: string,
    quantity: number,
  ) => { saleValueTl: number; profitTl: number; quantity: number } | null;
  /** Nakitten borcu (kısmen ya da tamamen) kapatır. */
  repayDebt: (amountTl: number) => void;
  /**
   * Kaydırma çubuğuyla gönderilen bir alım teklifini "bekleyen" olarak
   * kaydeder. Sonuç (kabul/red) aslında gönderildiği anda `willAccept` ile
   * belirlenmiştir — tick() içinde vadesi (OFFER_RESOLUTION_DELAY_MINUTES)
   * dolunca açığa çıkar ve kabul ise settleDeal ile aynı şekilde kapanır.
   */
  sendPendingOffer: (offer: {
    customerName: string;
    productName: string;
    category: InventoryCategory;
    karat: number;
    grams: number;
    offerAmountTl: number;
    marketValueTl: number;
    estimatedSellPriceTl?: number;
    quantity?: number;
    actualKarat?: number;
    hasHiddenFlaw?: boolean;
    stoneValueTl?: number;
    willAccept: boolean;
  }) => void;
  /**
   * v2: pazarlıklar artık anında sonuçlanıyor (bkz. NegotiationPanel'in
   * karşı teklif akışı) — bu, sonucu Müşteriler ekranında (header zili)
   * geçmiş olarak görünsün diye ÇÖZÜLMÜŞ (kabul/red) bir teklif kaydı
   * ekler, bekleme mekanizmasını (sendPendingOffer/tick) TETİKLEMEZ.
   */
  logCompletedOffer: (offer: {
    customerName: string;
    productName: string;
    category: InventoryCategory;
    karat: number;
    grams: number;
    offerAmountTl: number;
    marketValueTl: number;
    quantity?: number;
    status: 'kabul' | 'red';
  }) => void;
  /**
   * Aktif gelen müşterinin satış işlemini (direction:'satis') sonuçlandırır. Kabulde
   * (accepted=true, saleAmountTl ile) stoktan bir adet düşülür,
   * karşılığında pazarlıkla anlaşılan tutar nakde eklenir. Aktif müşteri
   * burada temizlenmez; sonuç ekranı kapanırken clearIncomingCustomer(id)
   * tek kontrollü kapanış noktasıdır.
   */
  resolveIncomingCustomer: (
    accepted: boolean,
    saleAmountTl?: number,
  ) => { profitTl: number; xpGained: number } | null;
  /**
   * Bölüm 6: direction:'bozdurma' bir müşterinin pazarlığı (mevcut 'alis'
   * modu, settleDeal üzerinden) sonuçlandığında aktif müşteriyi temizler
   * — sadece hâlâ aynı müşteri aktifse (id eşleşirse) etkilidir.
   */
  clearIncomingCustomer: (id: string) => void;
  /**
   * Aktif müşteri oturumunu ekonomi settlement'ına girmeden kapatır.
   * İki kez çağrılırsa ikinci çağrı etkisizdir; aynı id kuyrukta kalmışsa
   * tekrar hydrate olmaması için kuyruktan da temizlenir.
   */
  dismissActiveCustomer: (id?: string) => boolean;
  /** Alım-satım makasından bugüne kadar gerçekleşen toplam kâr/zarar. */
  realizedTradingProfitTl: number;
  /** Profil'deki Kâr Analizi için: satılan sarrafiye kaleminin toplam maliyet tabanı (realizedTradingProfitTl'in payda tarafı). */
  totalTradingCostBasisTl: number;

  // Bölüm 23-24: Seviye — paradan bağımsız, yalnızca aktif alım-satımdan
  // (asla pasif gelirden) kazanılan XP ile ilerler. Her seviye bir yetenek
  // puanı, Sv.10/20/30/40/50'de ekstra puan kazandırır.
  totalXp: number;
  level: number;
  // Bölüm 7: Yetenek Ağacı — puanlar skillTree'deki yeteneklere harcanır.
  skillPoints: number;
  skillLevels: Record<string, number>;
  /** Bir yeteneği bir seviye yükseltir; puan yoksa ya da zaten maksimumdaysa false döner. */
  levelUpSkill: (skillId: string) => boolean;
  /** Bölüm 30: Yetenekleri sıfırlar, o seviyeye kadar kazanılan tüm puanları iade eder. YER TUTUCU: reklam SDK'sı bağlanınca burası gerçek "reklam izlendi" onayından sonra çağrılacak. */
  resetSkills: () => void;
  /** İtibarı 0-100 aralığında sınırlayarak değiştirir (skill etkileri, gelecekte olaylar vb. için). */
  adjustReputation: (delta: number) => void;
  /**
   * Bölüm 23-24 UX: isimlendirilmiş bonus XP (ör. "Kârlı satış", "İyi
   * pazarlık") ekler — temel has-gram XP'sinin üstüne, oyuncunun "neden
   * XP geldiğini" görmesi için (bkz. NegotiationPanel/KasamScreen XP toast'ı).
   */
  grantBonusXp: (amount: number) => void;

  /** [YENİ] v3 — Onboarding: ilk oyun deneyimi için minimal eğitim altyapısı. */
  hasCompletedTutorial: boolean;
  firstSessionHintsDismissed: Record<string, boolean>;
  completeTutorial: () => void;
  dismissFirstSessionHint: (hintId: string) => void;
  /** Playtest/debug: mevcut save'i tek new-game state kaynağına döndürür. */
  resetGame: () => void;

  /** Kalıcı kayıt (AsyncStorage) yüklenene kadar false — bkz. App.tsx'teki yükleme ekranı. */
  hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;
}

const STARTING_MARKET_SPREAD_TL_PER_GRAM = randomInRange(
  MARKET_SPREAD_MIN_TL_PER_GRAM,
  MARKET_SPREAD_MAX_TL_PER_GRAM,
);
const STARTING_DAILY_CUSTOMER_TARGET = dailyCustomerTargetForDay(1, 50);

function createNewGameState(): Partial<GameState> {
  const marketSpreadTlPerGram = randomInRange(MARKET_SPREAD_MIN_TL_PER_GRAM, MARKET_SPREAD_MAX_TL_PER_GRAM);
  return {
    playerName: 'Oyuncu',
    shopName: 'Kuyumcum',
    capital: {
      cashTl: STARTING_CASH_TL,
      stockValueTl: 0,
      debtTl: 0,
    },
    goldPrice: {
      ...priceFromReferenceAndSpread(STARTING_REFERENCE_PRICE, marketSpreadTlPerGram),
      dailyChangePercent: 0,
      marketAssets: buildMarketAssets(STARTING_REFERENCE_PRICE, STARTING_REFERENCE_PRICE, STARTING_USD_TRY, STARTING_EUR_TRY),
    },
    reputation: { score: 50 },
    inventory: [],
    offers: [],
    incomingCustomer: null,
    waitingCustomers: [],
    dailyCustomerTarget: dailyCustomerTargetForDay(1, 50),
    dailyCustomersGenerated: 0,
    customerRushUsedDay: null,
    customerRushFeedback: null,
    day: 1,
    minuteOfDay: 0,
    speed: 1,
    preNegotiationSpeed: null,
    referencePriceAtDayStart: STARTING_REFERENCE_PRICE,
    marketSpreadTlPerGram,
    wholesalerBuyMarginTlPerGram: randomInRange(WHOLESALER_MARGIN_MIN_TL_PER_GRAM, WHOLESALER_MARGIN_MAX_TL_PER_GRAM),
    wholesalerSellMarginTlPerGram: randomInRange(WHOLESALER_MARGIN_MIN_TL_PER_GRAM, WHOLESALER_MARGIN_MAX_TL_PER_GRAM),
    wholesalerTrust: STARTING_WHOLESALER_TRUST,
    loanDueDay: null,
    brokerDeal: null,
    meltingJob: null,
    workshop: {
      unlocked: false,
      level: 0,
      totalHasProduced: 0,
      lastProductionDay: null,
    },
    atolyeLevel: 0,
    jewelryHoldings: {},
    lastDaySettlementSummary: null,
    dailyActiveTradeCashTl: 0,
    dailyActiveTradeProfitTl: 0,
    fourXUnlockedUntilMs: null,
    fourXUnlimited: false,
    customerHypeUntilMs: null,
    realizedTradingProfitTl: 0,
    totalTradingCostBasisTl: 0,
    totalXp: 0,
    level: 1,
    skillPoints: 0,
    skillLevels: {},
    hasCompletedTutorial: false,
    firstSessionHintsDismissed: {},
    hasHydrated: true,
  };
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
  playerName: 'Oyuncu',
  setPlayerName: (name) => set({ playerName: name.trim().length > 0 ? name.trim().slice(0, 40) : 'Oyuncu' }),
  shopName: 'Kuyumcum',
  setShopName: (name) => set({ shopName: name.trim().length > 0 ? name.trim().slice(0, 40) : 'Kuyumcum' }),
  capital: {
    cashTl: STARTING_CASH_TL,
    stockValueTl: 0,
    debtTl: 0,
  },
  goldPrice: {
    ...priceFromReferenceAndSpread(STARTING_REFERENCE_PRICE, STARTING_MARKET_SPREAD_TL_PER_GRAM),
    dailyChangePercent: 0,
    marketAssets: buildMarketAssets(STARTING_REFERENCE_PRICE, STARTING_REFERENCE_PRICE, STARTING_USD_TRY, STARTING_EUR_TRY),
  },
  reputation: {
    score: 50,
  },
  inventory: [],
  offers: [],
  incomingCustomer: null,
  waitingCustomers: [],
  dailyCustomerTarget: STARTING_DAILY_CUSTOMER_TARGET,
  dailyCustomersGenerated: 0,
  customerRushUsedDay: null,
  customerRushFeedback: null,
  day: 1,
  minuteOfDay: 0,
  speed: 1,
  preNegotiationSpeed: null,
  referencePriceAtDayStart: STARTING_REFERENCE_PRICE,
  marketSpreadTlPerGram: STARTING_MARKET_SPREAD_TL_PER_GRAM,
  wholesalerBuyMarginTlPerGram: randomInRange(WHOLESALER_MARGIN_MIN_TL_PER_GRAM, WHOLESALER_MARGIN_MAX_TL_PER_GRAM),
  wholesalerSellMarginTlPerGram: randomInRange(WHOLESALER_MARGIN_MIN_TL_PER_GRAM, WHOLESALER_MARGIN_MAX_TL_PER_GRAM),
  wholesalerTrust: STARTING_WHOLESALER_TRUST,
  loanDueDay: null,
  brokerDeal: null,
  meltingJob: null,
  workshop: {
    unlocked: false,
    level: 0,
    totalHasProduced: 0,
    lastProductionDay: null,
  },
  atolyeLevel: 0,
  jewelryHoldings: {},
  lastDaySettlementSummary: null,
  dailyActiveTradeCashTl: 0,
  dailyActiveTradeProfitTl: 0,
  fourXUnlockedUntilMs: null,
  fourXUnlimited: false,
  customerHypeUntilMs: null,
  realizedTradingProfitTl: 0,
  totalTradingCostBasisTl: 0,
  totalXp: 0,
  level: 1,
  skillPoints: 0,
  skillLevels: {},

  setSpeed: (speed) => {
    const state = get();
    if (speed === 4) {
      const fourXUnlocked =
        state.fourXUnlimited || (state.fourXUnlockedUntilMs !== null && state.fourXUnlockedUntilMs > Date.now());
      if (!fourXUnlocked) return false;
    }
    set({ speed });
    return true;
  },

  unlockFourXViaAd: () => {
    const state = get();
    const now = Date.now();
    const currentDeadline = state.fourXUnlockedUntilMs !== null ? Math.max(state.fourXUnlockedUntilMs, now) : now;
    set({ fourXUnlockedUntilMs: currentDeadline + FOUR_X_AD_UNLOCK_MINUTES * 60 * 1000 });
  },

  purchaseFourXUnlimited: () => {
    set({ fourXUnlimited: true });
  },

  watchAdForCustomerHype: () => {
    const state = get();
    if (state.customerRushUsedDay === state.day) return;
    const remainingPotential = Math.max(0, state.dailyCustomerTarget - state.dailyCustomersGenerated);
    const bonusCustomers = Math.ceil(remainingPotential * CUSTOMER_RUSH_REMAINING_BONUS_RATIO);
    set({
      dailyCustomerTarget: state.dailyCustomerTarget + bonusCustomers,
      customerRushUsedDay: state.day,
      customerRushFeedback: 'Bugün dükkân daha hareketli.',
      customerHypeUntilMs: null,
    });
  },

  tick: (realSecondsElapsedRaw) => {
    const state = get();
    if (state.speed === 0) return;

    // Bölüm 22: 4x'in reklamla açılan GERÇEK DÜNYA penceresi süresi
    // dolduysa (sınırsız hak yoksa) hız burada otomatik 1x'e düşer —
    // oyuncu uygulamayı 4x açıkken arka planda bıraksa bile geçerli.
    let speed = state.speed;
    if (speed === 4 && !state.fourXUnlimited) {
      const stillUnlocked = state.fourXUnlockedUntilMs !== null && state.fourXUnlockedUntilMs > Date.now();
      if (!stillUnlocked) {
        speed = 1;
        set({ speed });
      }
    }

    const realSecondsElapsed = Math.min(realSecondsElapsedRaw, MAX_REAL_SECONDS_PER_TICK);
    const gameMinutes = realSecondsElapsed * speed * GAME_MINUTES_PER_REAL_SECOND_AT_1X;
    if (gameMinutes <= 0) return;

    // Faz 6: piyasa kapanışı günlük çalışır. Eski adım sabiti import uyumu
    // için kalsa da MARKET_STEP_MINUTES artık 1 oyun günüdür.
    const totalMinutesBefore = state.day * MINUTES_PER_DAY + state.minuteOfDay;
    const totalMinutesAfterRaw = totalMinutesBefore + gameMinutes;
    const stepsToApply = Math.max(
      0,
      Math.floor(totalMinutesAfterRaw / MARKET_STEP_MINUTES) - Math.floor(totalMinutesBefore / MARKET_STEP_MINUTES),
    );

    const currentReference = (state.goldPrice.buyPricePerGram + state.goldPrice.sellPricePerGram) / 2;
    let nextReference = currentReference;
    for (let i = 0; i < stepsToApply; i += 1) {
      nextReference = stepMarketReferenceDaily(nextReference).reference;
    }

    // Makas ve toptancı marjları da piyasa adımıyla birlikte yeniden belirlenir.
    const marketSpreadTlPerGram =
      stepsToApply > 0
        ? randomInRange(MARKET_SPREAD_MIN_TL_PER_GRAM, MARKET_SPREAD_MAX_TL_PER_GRAM)
        : state.marketSpreadTlPerGram;
    const wholesalerBuyMarginTlPerGram =
      stepsToApply > 0
        ? randomInRange(WHOLESALER_MARGIN_MIN_TL_PER_GRAM, WHOLESALER_MARGIN_MAX_TL_PER_GRAM)
        : state.wholesalerBuyMarginTlPerGram;
    const wholesalerSellMarginTlPerGram =
      stepsToApply > 0
        ? randomInRange(WHOLESALER_MARGIN_MIN_TL_PER_GRAM, WHOLESALER_MARGIN_MAX_TL_PER_GRAM)
        : state.wholesalerSellMarginTlPerGram;

    // nextBuyPrice/nextSellPrice bu tick'in sonunda goldPrice.buyPricePerGram/
    // sellPricePerGram olarak set edilir (bkz. aşağıdaki set() çağrısı) —
    // yani müşteriden bozdurma alırken kullanılan ALIŞ fiyatı ve müşteriye
    // satarken kullanılan SATIŞ fiyatı, ticker'da (GoldTicker) o an
    // görünecek olanla birebir aynı, ayrı bir hesap değil.
    const { buyPricePerGram: nextBuyPrice, sellPricePerGram: nextSellPrice } = priceFromReferenceAndSpread(
      nextReference,
      marketSpreadTlPerGram,
    );

    let minuteOfDay = state.minuteOfDay + gameMinutes;
    let day = state.day;
    let referencePriceAtDayStart = state.referencePriceAtDayStart;
    let daysElapsed = 0;
    while (minuteOfDay >= MINUTES_PER_DAY) {
      minuteOfDay -= MINUTES_PER_DAY;
      day += 1;
      daysElapsed += 1;
      referencePriceAtDayStart = nextReference;
    }

    const previousCloseForDisplay = stepsToApply > 0 ? currentReference : referencePriceAtDayStart;
    const dailyChangePercent =
      ((nextReference - previousCloseForDisplay) / previousCloseForDisplay) * 100;
    const marketAssets = buildMarketAssets(nextReference, previousCloseForDisplay, STARTING_USD_TRY, STARTING_EUR_TRY);

    // Bekleyen tekliflerin vadesi (OFFER_RESOLUTION_DELAY_MINUTES) dolduysa
    // açığa çıkar: kabul ise settleDeal ile aynı şekilde kapanır (kredi
    // reddedilirse red'e düşer), red ise doğrudan red olur. Sonuç aslında
    // gönderildiği anda (willAccept) belirlenmişti, burada sadece açıklanıyor.
    const currentTotalMinutes = day * MINUTES_PER_DAY + minuteOfDay;
    const offers = state.offers.map((offer) => {
      if (offer.status !== 'bekleyen' || currentTotalMinutes < offer.resolvesAtTotalMinutes) {
        return offer;
      }
      if (!offer.willAccept) {
        return { ...offer, status: 'red' as const };
      }
      const result = get().settleDeal(offer.offerAmountTl, {
        name: offer.productName,
        category: offer.category,
        karat: offer.karat,
        grams: offer.grams,
        marketValueTl: offer.marketValueTl,
        estimatedSellPriceTl: offer.estimatedSellPriceTl,
        quantity: offer.quantity,
        actualKarat: offer.actualKarat,
        hasHiddenFlaw: offer.hasHiddenFlaw,
        stoneValueTl: offer.stoneValueTl,
      });
      return { ...offer, status: result.success ? ('kabul' as const) : ('red' as const) };
    });
    // settleDeal, teklif kabul edildiyse kasa/envanteri zaten güncelledi —
    // aşağıdaki gün-içi işlemler için o güncel hâli temel alıyoruz.
    const postOfferState = get();

    // Vadesi geçmiş borç varsa Toptancı Güveni düşer, vade yeniden ötelenir.
    let wholesalerTrust = postOfferState.wholesalerTrust;
    let loanDueDay = postOfferState.loanDueDay;
    if (postOfferState.capital.debtTl > 0 && loanDueDay !== null) {
      while (day > loanDueDay) {
        wholesalerTrust = Math.max(0, wholesalerTrust - LATE_PAYMENT_TRUST_PENALTY);
        loanDueDay += LOAN_TERM_DAYS;
      }
    } else if (postOfferState.capital.debtTl <= 0) {
      loanDueDay = null;
    }

    // Bölüm 9: Toptancı Bağlantısı'nın süresi doldu ama kullanılmadıysa —
    // toptancı güveni düşer, bağlantı kapanır (mal normal stokta kalır).
    let brokerDeal = postOfferState.brokerDeal;
    if (brokerDeal && currentTotalMinutes >= brokerDeal.expiresAtTotalMinutes) {
      wholesalerTrust = Math.max(0, wholesalerTrust - BROKER_DEAL_TIMEOUT_TRUST_PENALTY);
      brokerDeal = null;
    }

    // Bölüm 12: eritme süresi dolduysa geri kazanılan has altın, mevcut
    // Gram Altın pozisyonuyla (fungible) birleşerek stoğa eklenir; orijinal
    // işçilikli ürüne ödenen tutar maliyet tabanı olarak taşınır (kâr/zarar
    // gizlenmez). Taş değeri varsa (Taş Ustası şartıyla) doğrudan nakde girer.
    let inventory = postOfferState.inventory;
    let meltingJob = postOfferState.meltingJob;
    let meltingCashBonus = 0;
    if (meltingJob && currentTotalMinutes >= meltingJob.completesAtTotalMinutes) {
      inventory = mergeIntoGramAltin(inventory, meltingJob.recoveredGrams, meltingJob.costBasisTl, day);
      meltingCashBonus = meltingJob.stoneValueTl;
      meltingJob = null;
    }

    // v0.2 ara aşama: Atölye artık işçilikli ürün işlemez; yalnızca oyun
    // günü kapanışında bağımsız Gram Altın (Has) üretir. Üretim idempotent:
    // aynı tamamlanmış gün, save/load ya da tekrar tick ile ikinci kez yazılmaz.
    let workshop = normalizeWorkshopState(postOfferState.workshop, postOfferState.atolyeLevel);
    let workshopHasProduced = 0;
    if (workshop.level > 0 && daysElapsed > 0) {
      const dailyHasOutput = workshopDailyHasOutput(workshop.level);
      const completedThroughDay = day - 1;
      const lastProductionDay = workshop.lastProductionDay ?? 0;
      const productionDays = Math.max(0, completedThroughDay - lastProductionDay);
      if (productionDays > 0 && dailyHasOutput > 0) {
        workshopHasProduced = Math.round(dailyHasOutput * productionDays * 100) / 100;
        inventory = mergeIntoGramAltin(inventory, workshopHasProduced, 0, day);
        workshop = {
          ...workshop,
          unlocked: true,
          totalHasProduced: Math.round((workshop.totalHasProduced + workshopHasProduced) * 100) / 100,
          lastProductionDay: completedThroughDay,
        };
      }
    }

    // Faz 6 — Takı Yatırımı: 30 oyun günü sermaye bağlama kontratları.
    // Her tamamlanan gün için gelir ayrı settle edilir; vade dolunca anapara
    // yalnızca principalRefunded=false iken geri döner.
    let jewelryHoldings = normalizeJewelryHoldings(postOfferState.jewelryHoldings, postOfferState.day);
    let jewelryCashDelta = 0;
    if (daysElapsed > 0) {
      for (let settledDay = postOfferState.day; settledDay < day; settledDay += 1) {
        const result = settleJewelryInvestments(jewelryHoldings, settledDay);
        jewelryHoldings = result.holdings;
        jewelryCashDelta += result.dailyIncomeTl + result.principalRefundTl;
      }
    }

    // Tezgâha çağrılan müşteri, işlem yaşam döngüsünün tek kaynağı olan
    // incomingCustomer'da tutulur. Kuyruktaki sabır zaman aşımı yalnızca
    // waitingCustomers için geçerlidir; aktif müşteriyi tick() üzerinden
    // silmek pazarlık ekranını React render'ı tamamlanmadan kapatabilirdi.
    // Aktif müşteri yalnızca sonuç akışının kontrollü kapanışında
    // clearIncomingCustomer(id) ile temizlenir.
    const incomingCustomer = postOfferState.incomingCustomer;

    // Kuyruktaki müşterilerden sabrı (expiresAtTotalMinutes) dolanlar,
    // tezgaha hiç çağrılmadan otomatik olarak kuyruktan silinir.
    let waitingCustomers = postOfferState.waitingCustomers.filter(
      (c) => currentTotalMinutes < c.expiresAtTotalMinutes,
    );
    let dailyCustomerTarget =
      daysElapsed > 0 ? dailyCustomerTargetForDay(day, postOfferState.reputation.score) : postOfferState.dailyCustomerTarget;
    let dailyCustomersGenerated = daysElapsed > 0 ? 0 : postOfferState.dailyCustomersGenerated;
    const customerRushUsedDay = daysElapsed > 0 ? null : postOfferState.customerRushUsedDay;
    const customerRushFeedback = daysElapsed > 0 ? null : postOfferState.customerRushFeedback;

    // Yeni müşteri üretimi artık DOĞRUDAN tezgahı değil, kuyruğu besler —
    // tezgah meşgulken bile (oyuncu pazarlık ederken) kuyruk dolmaya devam
    // eder, ta ki MAX_WAITING_QUEUE_LENGTH'e ("mekan dolu") ulaşana kadar.
    let newCustomer: IncomingCustomer | undefined;
    if (waitingCustomers.length < MAX_WAITING_QUEUE_LENGTH && dailyCustomersGenerated < dailyCustomerTarget) {
      const remainingTarget = Math.max(0, dailyCustomerTarget - dailyCustomersGenerated);
      const remainingMinutes = Math.max(1, MINUTES_PER_DAY - minuteOfDay);
      const arrivalPace =
        EARLY_CUSTOMER_ARRIVAL_PACE_MULTIPLIERS.find((entry) => day >= entry.fromDay && day <= entry.toDay)
          ?.multiplier ?? 1;
      const willTrigger =
        Math.random() < Math.min(0.95, (remainingTarget / remainingMinutes) * gameMinutes * arrivalPace);

      if (willTrigger) {
        const direction: 'satis' | 'bozdurma' =
          Math.random() < BOZDURMA_DIRECTION_PROBABILITY ? 'bozdurma' : 'satis';
        const customerName =
          INCOMING_CUSTOMER_NAMES[Math.floor(Math.random() * INCOMING_CUSTOMER_NAMES.length)];
        // v2: 5 kişilik havuzundan (Nakit Sıkışan/Bilinçli Satıcı/Sert
        // Pazarlıkçı/Kolay İkna Olur/Dengeli) tek bir kişilik seçilir — hem
        // satış hem bozdurma yönünde aynı havuz kullanılır.
        const availablePersonas = CUSTOMER_PERSONAS.filter((candidate) => (candidate.minDay ?? 1) <= day);
        const persona = availablePersonas[Math.floor(Math.random() * availablePersonas.length)] ?? CUSTOMER_PERSONAS[0];
        // Bölüm 6: her kişiliğin kendi gerçek sabır süresi var artık ("Nakit
        // Sıkışan" kısa, "Sert Pazarlıkçı" uzun) — Soğukkanlı/Güler Yüz bunun
        // üstüne eklenir.
        const patienceMinutes =
          persona.patienceMinutes +
          (state.skillLevels['sogukkanli'] ?? 0) * SOGUKKANLI_PATIENCE_MINUTES_PER_LEVEL +
          (state.skillLevels['guler-yuz'] ?? 0) * GULER_YUZ_PATIENCE_MINUTES_PER_LEVEL;

        if (direction === 'satis') {
          // Cumhuriyet (Tam) Altını değerce 4 Çeyrek'e, Yarım Altın 2
          // Çeyrek'e eşit olduğundan ayrı stok tutulmuyor — müşteri isteği
          // Çeyrek stoğundan bu kadarı düşülerek karşılanıyor.
          // İşçilikli ürün (Bölüm 16) hariç — GDD'nin kararı gereği asla
          // başka bir müşteriye işçilikli ürün olarak satılmaz.
          const candidates = inventory
            .filter((i) => i.category !== 'iscilikli' && i.quantity > 0)
            .map((item) => ({
              target: item,
              unitsRequired: 1,
              displayName: item.name,
              displayKarat: item.karat,
              displayGrams: item.grams,
            }));
          const ceyrek = inventory.find((i) => i.category === 'yatirim' && i.name === 'Çeyrek Altın');
          if (ceyrek && ceyrek.quantity >= 2) {
            candidates.push({
              target: ceyrek,
              unitsRequired: 2,
              displayName: 'Yarım Altın',
              displayKarat: 22,
              displayGrams: 3.508,
            });
          }
          if (ceyrek && ceyrek.quantity >= 4) {
            candidates.push({
              target: ceyrek,
              unitsRequired: 4,
              displayName: 'Cumhuriyet Altını (Tam Altın)',
              displayKarat: 22,
              displayGrams: 7.016,
            });
          }

          if (candidates.length > 0) {
            const candidate = candidates[Math.floor(Math.random() * candidates.length)];
            const marketValueTl = equivalentGrams(candidate.displayGrams, candidate.displayKarat) * nextSellPrice;
            newCustomer = {
              id: String(nextIncomingCustomerId++),
              direction: 'satis',
              customer: {
                name: customerName,
                type: persona.type,
                request: `${candidate.displayName} almak istiyorum, elindeki en iyi fiyatı öğrenmek isterim.`,
                urgency: persona.urgency,
                bargainingStyle: persona.bargainingStyle,
                // Bölüm 4.3: satış modunda bu, müşterinin ödemeye razı olduğu
                // TAVAN oranı olarak yorumlanır (alım modunda taban olarak
                // yorumlanmasının simetriği) — bkz. NegotiationPanel satış modu.
                acceptanceThreshold: persona.maxPayRatio,
              },
              product: {
                name: candidate.displayName,
                source: 'Dükkân stoğu',
                category: candidate.target.category,
                karat: candidate.displayKarat,
                grams: candidate.displayGrams,
                marketValueTl,
              },
              inventoryItemId: candidate.target.id,
              unitsRequired: candidate.unitsRequired,
              expiresAtTotalMinutes: currentTotalMinutes + patienceMinutes,
            };
          }
        } else if (day >= PROGRESSION_UNLOCKS.productPools.craftedGoods && Math.random() < CRAFTED_GOOD_CUSTOMER_PROBABILITY) {
          // Bölüm 11/14: işçilikli ürün müşterisi — beyan edilen ayar
          // (karat) her zaman gerçek olmayabilir; gerçek ayar/kusur/taş
          // değeri Uzman Görüşü ile açığa çıkana kadar gizli kalır.
          const uzmanGorusuLevel = state.skillLevels['uzman-gorusu'] ?? 0;
          const good = pickCraftedGoodCandidate(uzmanGorusuLevel);
          // Piyasa değeri, oyuncunun görebildiği tek bilgi olan BEYAN edilen
          // ayar üzerinden hesaplanır — gerçek değer eritmede ortaya çıkar.
          const marketValueTl = equivalentGrams(good.grams, good.claimedKarat) * nextBuyPrice + good.stoneValueTl;
          const scaleReading: ScaleReading = {
            grams: good.grams,
            karat: good.claimedKarat,
            cleanliness: good.hasHiddenFlaw ? 'Şüpheli, dikkatli incelenmeli' : 'Temiz',
          };
          newCustomer = {
            id: String(nextIncomingCustomerId++),
            direction: 'bozdurma',
            customer: {
              name: customerName,
              type: persona.type,
              request: `${good.productType} bozdurmak istiyorum, ${good.claimedKarat} ayar diyorum.`,
              urgency: persona.urgency,
              bargainingStyle: persona.bargainingStyle,
              acceptanceThreshold: persona.minAcceptRatio,
            },
            product: {
              name: good.productType,
              source: 'Müşteri getirdi',
              category: 'iscilikli',
              karat: good.claimedKarat,
              grams: good.grams,
              marketValueTl,
              actualKarat: good.actualKarat,
              hasHiddenFlaw: good.hasHiddenFlaw,
              stoneValueTl: good.stoneValueTl,
            },
            scaleReading,
            expiresAtTotalMinutes: currentTotalMinutes + patienceMinutes,
          };
        } else if (day >= PROGRESSION_UNLOCKS.productPools.multiItem && Math.random() < MULTI_ITEM_CUSTOMER_PROBABILITY) {
          // [YENİ] v3 — Toplu Alım: 2-3 farklı üründen oluşan, kalem bazlı
          // pazarlık edilen bir bozdurma ziyareti.
          const lines = pickMultiItemBozdurmaLines(nextBuyPrice);
          newCustomer = {
            id: String(nextIncomingCustomerId++),
            direction: 'bozdurma',
            customer: {
              name: customerName,
              type: persona.type,
              // [DÜZELTME] Teknik "N farklı kalem bozdurmak istiyorum: A, B."
              // ifadesi doğal bir müşteri cümlesine çevrildi — ürünlerin
              // dökümü artık ayrı bir liste UI'sinde (bkz. NegotiationPanel'in
              // BulkLineNegotiationView'ı) gösteriliyor, alıntı metninde değil.
              request: 'Şunları bozdurmak istiyorum:',
              urgency: persona.urgency,
              bargainingStyle: persona.bargainingStyle,
              acceptanceThreshold: persona.minAcceptRatio,
            },
            product: lines[0].product,
            scaleReading: lines[0].scaleReading,
            lines,
            expiresAtTotalMinutes: currentTotalMinutes + patienceMinutes,
          };
        } else {
          // Bölüm 6/10: müşteriden alım (bozdurma) — stoktan bağımsız,
          // dükkânın nakdi/kredisi yettiği sürece her zaman mümkün
          // (mevcut 'alis' modu Pazarlık ekranı + settleDeal zaten bu
          // kredi/borç mantığını işletiyor, yeni bir sistem gerekmiyor).
          const candidate = pickBozdurmaCandidate(day);
          const totalEquivGrams = equivalentGrams(candidate.gramsPerUnit, candidate.karat) * candidate.quantity;
          const marketValueTl = totalEquivGrams * nextBuyPrice;
          const scaleReading: ScaleReading = {
            grams: candidate.gramsPerUnit * candidate.quantity,
            karat: candidate.karat,
            cleanliness: candidate.name === 'Karışık Hurda Altın' ? 'Karışık, ayrıştırma gerekiyor' : 'Temiz',
          };
          newCustomer = {
            id: String(nextIncomingCustomerId++),
            direction: 'bozdurma',
            customer: {
              name: customerName,
              type: persona.type,
              request:
                candidate.quantity > 1
                  ? `${candidate.quantity} adet ${candidate.name} bozdurmak istiyorum.`
                  : `${candidate.name} bozdurmak istiyorum.`,
              urgency: persona.urgency,
              bargainingStyle: persona.bargainingStyle,
              // Bölüm 4.3: alım modunda (bkz. NegotiationPanel) bu, oyuncunun
              // teklif verebileceği asgari (taban) oran olarak yorumlanır.
              acceptanceThreshold: persona.minAcceptRatio,
            },
            product: {
              name: candidate.name,
              source: 'Müşteri getirdi',
              category: candidate.category,
              karat: candidate.karat,
              grams: candidate.gramsPerUnit,
              quantity: candidate.quantity,
              marketValueTl,
            },
            scaleReading,
            expiresAtTotalMinutes: currentTotalMinutes + patienceMinutes,
          };
        }
      }
    }
    // Üretilen müşteri (varsa) tezgahı değil, kuyruğun sonunu doldurur.
    if (newCustomer) {
      const usedCustomerIds = new Set([
        incomingCustomer?.id,
        ...waitingCustomers.map((customer) => customer.id),
      ].filter(Boolean));
      while (usedCustomerIds.has(newCustomer.id)) {
        newCustomer = { ...newCustomer, id: String(nextIncomingCustomerId++) };
      }
      waitingCustomers = [...waitingCustomers, newCustomer];
      dailyCustomersGenerated += 1;
    }

    const capital: CapitalState = {
      ...postOfferState.capital,
      cashTl: postOfferState.capital.cashTl + meltingCashBonus + jewelryCashDelta,
      stockValueTl: computeStockValueTl(inventory, nextBuyPrice),
    };
    const lastDaySettlementSummary =
      daysElapsed > 0
        ? {
            day: day - 1,
            activeTradeCashTl: postOfferState.dailyActiveTradeCashTl,
            activeTradeProfitTl: postOfferState.dailyActiveTradeProfitTl,
            passiveInvestmentCashTl: jewelryCashDelta,
            workshopHasGrams: workshopHasProduced,
            meltingCashTl: meltingCashBonus,
            totalEconomicDeltaTl: postOfferState.dailyActiveTradeCashTl + jewelryCashDelta + meltingCashBonus,
          }
        : postOfferState.lastDaySettlementSummary;
    const dailyActiveTradeCashTl = daysElapsed > 0 ? 0 : postOfferState.dailyActiveTradeCashTl;
    const dailyActiveTradeProfitTl = daysElapsed > 0 ? 0 : postOfferState.dailyActiveTradeProfitTl;

    // [YENİ] Not: müşteri artık tick() içinde asla doğrudan tezgahı
    // (incomingCustomer) doldurmuyor — sadece kuyruğa ekleniyor. Otomatik
    // duraklatma bu yüzden burada değil, callNextCustomerToCounter()'da
    // tetiklenir (oyuncu birini tezgaha çağırdığı an, aynı "sabrı tükenmeden
    // önce duraklat" garantisiyle).
    set({
      minuteOfDay,
      day,
      referencePriceAtDayStart,
      marketSpreadTlPerGram,
      wholesalerBuyMarginTlPerGram,
      wholesalerSellMarginTlPerGram,
      wholesalerTrust,
      loanDueDay,
      brokerDeal,
      meltingJob,
      workshop,
      atolyeLevel: workshop.level,
      inventory,
      offers,
      incomingCustomer,
      waitingCustomers,
      dailyCustomerTarget,
      dailyCustomersGenerated,
      customerRushUsedDay,
      customerRushFeedback,
      jewelryHoldings,
      lastDaySettlementSummary,
      dailyActiveTradeCashTl,
      dailyActiveTradeProfitTl,
      capital,
      goldPrice: {
        buyPricePerGram: nextBuyPrice,
        sellPricePerGram: nextSellPrice,
        dailyChangePercent,
        marketAssets,
      },
    });
  },

  applyRestartFluctuation: () => {
    const state = get();
    const currentReference = (state.goldPrice.buyPricePerGram + state.goldPrice.sellPricePerGram) / 2;
    const percent = randomSignedPercent(RESTART_FLUCTUATION_MIN_PERCENT, RESTART_FLUCTUATION_MAX_PERCENT);
    const nextReference = Math.max(100, currentReference * Math.exp(percent / 100));
    const { buyPricePerGram, sellPricePerGram } = priceFromReferenceAndSpread(
      nextReference,
      state.marketSpreadTlPerGram,
    );
    const dailyChangePercent =
      ((nextReference - state.referencePriceAtDayStart) / state.referencePriceAtDayStart) * 100;

    set({
      goldPrice: {
        buyPricePerGram,
        sellPricePerGram,
        dailyChangePercent,
        marketAssets: buildMarketAssets(nextReference, state.referencePriceAtDayStart, STARTING_USD_TRY, STARTING_EUR_TRY),
      },
      capital: {
        ...state.capital,
        stockValueTl: computeStockValueTl(state.inventory, buyPricePerGram),
      },
    });
  },

  settleDeal: (paidAmountTl, item) => {
    const state = get();
    const shortfall = Math.max(0, paidAmountTl - state.capital.cashTl);

    if (shortfall > 0 && state.wholesalerTrust < MIN_TRUST_FOR_CREDIT) {
      return { success: false, borrowedTl: 0, xpGained: 0 };
    }

    const quantity = Math.max(1, item.quantity ?? 1);
    const cashTl = Math.max(0, state.capital.cashTl - paidAmountTl);
    const loanDueDay =
      shortfall > 0 && state.loanDueDay === null ? state.day + LOAN_TERM_DAYS : state.loanDueDay;

    // Fungible ürünler (aynı isim/kategori/ayar/gram) zaten envanterdeyse
    // yeni alım o pozisyona eklenir, maliyet ortalaması güncellenir.
    // İşçilikli ürün (Bölüm 11/16) hiçbir zaman birleşmez — her parça
    // kendine has gerçek ayar/kusur/taş değeri taşıyan benzersiz bir kayıt.
    const existingIndex =
      item.category === 'iscilikli'
        ? -1
        : state.inventory.findIndex(
            (i) => i.name === item.name && i.category === item.category && i.karat === item.karat && i.grams === item.grams,
          );

    const settledItemId = existingIndex >= 0 ? state.inventory[existingIndex].id : String(nextInventoryId);
    const inventory =
      existingIndex >= 0
        ? state.inventory.map((i, idx) =>
            idx === existingIndex
              ? { ...i, quantity: i.quantity + quantity, costBasisTl: i.costBasisTl + paidAmountTl }
              : i,
          )
        : [
            ...state.inventory,
            {
              id: String(nextInventoryId++),
              name: item.name,
              category: item.category,
              karat: item.karat,
              grams: item.grams,
              quantity,
              costBasisTl: paidAmountTl,
              acquiredDay: state.day,
              acquiredMinuteOfDay: state.minuteOfDay,
              source: item.source,
              estimatedValueTl: item.estimatedSellPriceTl ?? (item.category === 'iscilikli' ? item.marketValueTl : undefined),
              actualKarat: item.actualKarat,
              hasHiddenFlaw: item.hasHiddenFlaw,
              stoneValueTl: item.stoneValueTl,
            } satisfies InventoryItem,
          ];

    // Bölüm 9: nakit yetmeyip borca yazıldıysa, bu işlemin tam bu miktarı
    // sınırlı bir süre için toptancıya kâr marjıyla anında satılabilir
    // hale gelir ("Toptancı Bağlantısı") — açık bir bağlantı varsa yenisi
    // onun yerine geçer (basitleştirme, bkz. yorum). İşçilikli ürün hariç:
    // GDD'nin "asla işlenmemiş satılmaz" kuralı gereği doğrudan toptancıya
    // devredilemez, önce eritilmesi şart.
    const totalMinutesNow = state.day * MINUTES_PER_DAY + state.minuteOfDay;
    const brokerDeal: BrokerDeal | null =
      shortfall > 0 && item.category !== 'iscilikli'
        ? { inventoryItemId: settledItemId, quantity, expiresAtTotalMinutes: totalMinutesNow + BROKER_DEAL_WINDOW_MINUTES }
        : state.brokerDeal;

    // Bölüm 23-24: aktif alım — XP, işlemdeki has altın karşılığı hacme göre kazanılır.
    const xpGained = equivalentGrams(item.grams, item.karat) * quantity * XP_PER_EQUIVALENT_GRAM_TRADED;

    set({
      inventory,
      capital: {
        ...state.capital,
        cashTl,
        debtTl: state.capital.debtTl + shortfall,
        stockValueTl: computeStockValueTl(inventory, state.goldPrice.buyPricePerGram),
      },
      loanDueDay,
      brokerDeal,
      dailyActiveTradeCashTl: state.dailyActiveTradeCashTl - paidAmountTl,
      ...applyXpGain(state, xpGained),
    });
    return { success: true, borrowedTl: shortfall, xpGained };
  },

  resolveBrokerDeal: () => {
    const state = get();
    const deal = state.brokerDeal;
    if (!deal) return null;
    const item = state.inventory.find((i) => i.id === deal.inventoryItemId);
    const sellQuantity = item ? Math.min(deal.quantity, item.quantity) : 0;
    if (!item || sellQuantity <= 0) {
      set({ brokerDeal: null });
      return null;
    }

    // v3 KRİTİK DÜZELTME (istismar kapatma): Toptancı Bağlantısı artık
    // toptancı marjı EKLEMEZ — sadece genel piyasa ALIŞ fiyatından (marjsız)
    // anında nakde çevirir. Eskiden buraya wholesalerSellMarginTlPerGram
    // eklenip "borca yazılan malı anında devret, kesin kâr cebe gir"
    // şeklinde RİSKSİZ bir kâr garantisi oluşuyordu — bu, bağlantının
    // amacını (SADECE acil borç kapatma) aşıp bağımsız bir kâr stratejisine
    // dönüştürüyordu. Kâr/zarar artık tamamen müşteriyle yapılan ASIL
    // pazarlığın sonucuna bağlı (ucuza alınmışsa hâlâ kârlı olabilir, ama
    // toptancı buna EK bir garanti eklemiyor).
    const soldCostBasisTl = (item.costBasisTl / item.quantity) * sellQuantity;
    const wholesalerPricePerGram = state.goldPrice.buyPricePerGram;
    const unitPriceTl = equivalentGrams(item.grams, item.karat) * wholesalerPricePerGram;
    const marketSaleValueTl = unitPriceTl * sellQuantity;
    const liquidationCapTl = soldCostBasisTl * BROKER_LIQUIDATION_MAX_COST_RECOVERY_RATIO;
    const saleValueTl = Math.min(marketSaleValueTl, liquidationCapTl);
    const profitTl = saleValueTl - soldCostBasisTl;
    const remainingQuantity = item.quantity - sellQuantity;

    const inventory =
      remainingQuantity > 0
        ? state.inventory.map((i) =>
            i.id === item.id
              ? { ...i, quantity: remainingQuantity, costBasisTl: i.costBasisTl - soldCostBasisTl }
              : i,
          )
        : state.inventory.filter((i) => i.id !== item.id);

    const xpGained = equivalentGrams(item.grams, item.karat) * sellQuantity * XP_PER_EQUIVALENT_GRAM_TRADED;

    set({
      inventory,
      brokerDeal: null,
      realizedTradingProfitTl: state.realizedTradingProfitTl + profitTl,
      totalTradingCostBasisTl: state.totalTradingCostBasisTl + soldCostBasisTl,
      dailyActiveTradeCashTl: state.dailyActiveTradeCashTl + saleValueTl,
      dailyActiveTradeProfitTl: state.dailyActiveTradeProfitTl + profitTl,
      capital: {
        ...state.capital,
        cashTl: state.capital.cashTl + saleValueTl,
        stockValueTl: computeStockValueTl(inventory, state.goldPrice.buyPricePerGram),
      },
      ...applyXpGain(state, xpGained),
    });
    return { saleValueTl, profitTl };
  },

  meltCraftedGood: (itemId) => {
    const state = get();
    // v1 basitleştirmesi: aynı anda tek eritme işi — GDD'nin süre/verim
    // mekaniğini bozmadan basit tutar; ikinci bir ürün ilki bitene kadar bekler.
    if (state.meltingJob) return false;
    const item = state.inventory.find((i) => i.id === itemId);
    if (!item || item.category !== 'iscilikli') return false;

    const actualKarat = item.actualKarat ?? item.karat;
    const hasHiddenFlaw = item.hasHiddenFlaw ?? false;
    const yenidenDogusLevel = state.skillLevels['yeniden-dogus'] ?? 0;
    // Bölüm 15: Taş Ustası olmadan taşın ayrı değeri eritmede kaybolur.
    const tasUstasiLevel = state.skillLevels['tas-ustasi'] ?? 0;

    const recoveredGrams = craftedMeltHasGrams(item.grams, actualKarat) * (hasHiddenFlaw ? 0.85 : 1);
    const stoneValueTl = tasUstasiLevel > 0 ? (item.stoneValueTl ?? 0) : 0;

    const isSmall = item.grams <= MELTING_SMALL_LARGE_THRESHOLD_GRAMS;
    const baseMinutes = isSmall
      ? randomInRange(MELTING_TIME_SMALL_MIN_MINUTES, MELTING_TIME_SMALL_MAX_MINUTES)
      : randomInRange(MELTING_TIME_LARGE_MIN_MINUTES, MELTING_TIME_LARGE_MAX_MINUTES);
    const timeReduction = Math.min(0.75, yenidenDogusLevel * YENIDEN_DOGUS_TIME_REDUCTION_PER_LEVEL);
    const minutes = Math.max(1, Math.round(baseMinutes * (1 - timeReduction)));

    const inventory = state.inventory.filter((i) => i.id !== itemId);
    const totalMinutesNow = state.day * MINUTES_PER_DAY + state.minuteOfDay;

    set({
      inventory,
      capital: {
        ...state.capital,
        stockValueTl: computeStockValueTl(inventory, state.goldPrice.buyPricePerGram),
      },
      meltingJob: {
        productName: item.name,
        recoveredGrams,
        stoneValueTl,
        costBasisTl: item.costBasisTl,
        completesAtTotalMinutes: totalMinutesNow + minutes,
      },
    });
    return true;
  },

  startCraftedGoodWorkshop: (itemId) => {
    void itemId;
    return false;
  },

  collectCraftedGoodWorkshop: (itemId) => {
    void itemId;
    return false;
  },

  upgradeAtolye: () => {
    const state = get();
    const workshop = normalizeWorkshopState(state.workshop, state.atolyeLevel);
    if (state.level < WORKSHOP_CONFIG.requiredLevel) return false;
    if (workshop.level >= WORKSHOP_CONFIG.maxLevel) return false;
    const cost = workshopUpgradeCostTl(workshop.level, state.goldPrice.buyPricePerGram);
    if (cost === null || cost > state.capital.cashTl) return false;
    const nextLevel = workshop.level + 1;
    const nextWorkshop: WorkshopState = {
      ...workshop,
      unlocked: true,
      level: nextLevel,
    };

    set({
      workshop: nextWorkshop,
      atolyeLevel: nextLevel,
      capital: { ...state.capital, cashTl: state.capital.cashTl - cost },
    });
    return true;
  },

  buyJewelryPiece: (tierId, piece) => {
    const state = get();
    const requiredLevel = JEWELRY_TIER_REQUIRED_LEVELS[tierId] ?? JEWELRY_REQUIRED_LEVEL;
    if (state.level < requiredLevel) return false;
    if (state.jewelryHoldings[`${tierId}.${piece}`]) return false;
    const priceTl = computeJewelryPiecePriceTl(tierId, state.goldPrice.buyPricePerGram, piece);
    if (priceTl > state.capital.cashTl) return false;

    set({
      jewelryHoldings: buyJewelryPieceHolding(state.jewelryHoldings, tierId, piece, state.day),
      capital: { ...state.capital, cashTl: state.capital.cashTl - priceTl },
    });
    return true;
  },

  sellInventoryItem: (itemId) => {
    const state = get();
    const item = state.inventory.find((i) => i.id === itemId);
    // İşçilikli ürün (Bölüm 16) burada da hariç: asla doğrudan satılmaz, tek çıkış yolu eritme.
    if (!item || item.category === 'iscilikli') return null;

    const saleValueTl = currentPositionValueTl(item, state.goldPrice.buyPricePerGram);
    const profitTl = saleValueTl - item.costBasisTl;
    const inventory = state.inventory.filter((i) => i.id !== itemId);
    const xpGained = equivalentGrams(item.grams, item.karat) * item.quantity * XP_PER_EQUIVALENT_GRAM_TRADED;

    set({
      inventory,
      realizedTradingProfitTl: state.realizedTradingProfitTl + profitTl,
      totalTradingCostBasisTl: state.totalTradingCostBasisTl + item.costBasisTl,
      dailyActiveTradeCashTl: state.dailyActiveTradeCashTl + saleValueTl,
      dailyActiveTradeProfitTl: state.dailyActiveTradeProfitTl + profitTl,
      capital: {
        ...state.capital,
        cashTl: state.capital.cashTl + saleValueTl,
        stockValueTl: computeStockValueTl(inventory, state.goldPrice.buyPricePerGram),
      },
      ...applyXpGain(state, xpGained),
    });
    return { saleValueTl, profitTl, quantity: item.quantity, xpGained };
  },

  buyInvestmentUnits: (spec, quantity) => {
    const state = get();
    if (quantity <= 0) return { success: false, reason: 'insufficient_cash' };

    // Bölüm 5: toptancı, genel piyasa SATIŞ fiyatının marjı kadar altından satar.
    const wholesalerUnitPriceTlPerGram = Math.max(
      1,
      state.goldPrice.sellPricePerGram - state.wholesalerBuyMarginTlPerGram,
    );
    const unitPriceTl = equivalentGrams(spec.grams, spec.karat) * wholesalerUnitPriceTlPerGram;
    const totalCostTl = unitPriceTl * quantity;
    if (totalCostTl > state.capital.cashTl) {
      return { success: false, reason: 'insufficient_cash' };
    }

    const existingIndex = state.inventory.findIndex(
      (i) =>
        i.category === spec.category && i.name === spec.name && i.karat === spec.karat && i.grams === spec.grams,
    );
    const inventory =
      existingIndex >= 0
        ? state.inventory.map((i, idx) =>
            idx === existingIndex
              ? { ...i, quantity: i.quantity + quantity, costBasisTl: i.costBasisTl + totalCostTl }
              : i,
          )
        : [
            ...state.inventory,
            {
              id: String(nextInventoryId++),
              name: spec.name,
              category: spec.category,
              karat: spec.karat,
              grams: spec.grams,
              quantity,
              costBasisTl: totalCostTl,
              acquiredDay: state.day,
            } satisfies InventoryItem,
          ];

    const xpGained = equivalentGrams(spec.grams, spec.karat) * quantity * XP_PER_EQUIVALENT_GRAM_TRADED;

    set({
      inventory,
      capital: {
        ...state.capital,
        cashTl: state.capital.cashTl - totalCostTl,
        stockValueTl: computeStockValueTl(inventory, state.goldPrice.buyPricePerGram),
      },
      dailyActiveTradeCashTl: state.dailyActiveTradeCashTl - totalCostTl,
      ...applyXpGain(state, xpGained),
    });
    return { success: true };
  },

  sellInvestmentUnits: (itemId, quantity) => {
    const state = get();
    const item = state.inventory.find((i) => i.id === itemId);
    if (!item || item.category === 'iscilikli') return null;
    const sellQuantity = Math.min(quantity, item.quantity);
    if (sellQuantity <= 0) return null;

    const unitPriceTl = equivalentGrams(item.grams, item.karat) * state.goldPrice.buyPricePerGram;
    const saleValueTl = unitPriceTl * sellQuantity;
    const soldCostBasisTl = (item.costBasisTl / item.quantity) * sellQuantity;
    const profitTl = saleValueTl - soldCostBasisTl;
    const remainingQuantity = item.quantity - sellQuantity;

    const inventory =
      remainingQuantity > 0
        ? state.inventory.map((i) =>
            i.id === itemId
              ? { ...i, quantity: remainingQuantity, costBasisTl: i.costBasisTl - soldCostBasisTl }
              : i,
          )
        : state.inventory.filter((i) => i.id !== itemId);

    const xpGained = equivalentGrams(item.grams, item.karat) * sellQuantity * XP_PER_EQUIVALENT_GRAM_TRADED;

    set({
      inventory,
      realizedTradingProfitTl: state.realizedTradingProfitTl + profitTl,
      totalTradingCostBasisTl: state.totalTradingCostBasisTl + soldCostBasisTl,
      dailyActiveTradeCashTl: state.dailyActiveTradeCashTl + saleValueTl,
      dailyActiveTradeProfitTl: state.dailyActiveTradeProfitTl + profitTl,
      capital: {
        ...state.capital,
        cashTl: state.capital.cashTl + saleValueTl,
        stockValueTl: computeStockValueTl(inventory, state.goldPrice.buyPricePerGram),
      },
      ...applyXpGain(state, xpGained),
    });
    return { saleValueTl, profitTl, quantity: sellQuantity };
  },

  repayDebt: (amountTl) => {
    const state = get();
    const payment = Math.min(amountTl, state.capital.debtTl, state.capital.cashTl);
    if (payment <= 0) return;
    const debtTl = state.capital.debtTl - payment;
    set({
      capital: {
        ...state.capital,
        cashTl: state.capital.cashTl - payment,
        debtTl,
      },
      loanDueDay: debtTl <= 0 ? null : state.loanDueDay,
    });
  },

  sendPendingOffer: (offer) => {
    const state = get();
    const totalMinutesNow = state.day * MINUTES_PER_DAY + state.minuteOfDay;
    const newOffer: Offer = {
      id: String(nextOfferId++),
      customerName: offer.customerName,
      productName: offer.productName,
      category: offer.category,
      karat: offer.karat,
      grams: offer.grams,
      offerAmountTl: offer.offerAmountTl,
      marketValueTl: offer.marketValueTl,
      estimatedSellPriceTl: offer.estimatedSellPriceTl,
      quantity: offer.quantity,
      actualKarat: offer.actualKarat,
      hasHiddenFlaw: offer.hasHiddenFlaw,
      stoneValueTl: offer.stoneValueTl,
      status: 'bekleyen',
      willAccept: offer.willAccept,
      createdDay: state.day,
      createdMinuteOfDay: state.minuteOfDay,
      resolvesAtTotalMinutes: totalMinutesNow + OFFER_RESOLUTION_DELAY_MINUTES,
    };
    set({ offers: [newOffer, ...state.offers] });
  },

  logCompletedOffer: (offer) => {
    const state = get();
    const totalMinutesNow = state.day * MINUTES_PER_DAY + state.minuteOfDay;
    const newOffer: Offer = {
      id: String(nextOfferId++),
      customerName: offer.customerName,
      productName: offer.productName,
      category: offer.category,
      karat: offer.karat,
      grams: offer.grams,
      offerAmountTl: offer.offerAmountTl,
      marketValueTl: offer.marketValueTl,
      quantity: offer.quantity,
      status: offer.status,
      willAccept: offer.status === 'kabul',
      createdDay: state.day,
      createdMinuteOfDay: state.minuteOfDay,
      resolvesAtTotalMinutes: totalMinutesNow,
    };
    set({ offers: [newOffer, ...state.offers] });
  },

  resolveIncomingCustomer: (accepted, saleAmountTl) => {
    const state = get();
    const customer = state.incomingCustomer;
    if (!customer || customer.direction !== 'satis') return null;

    if (!accepted) return null;

    const item = state.inventory.find((i) => i.id === customer.inventoryItemId);
    const unitsRequired = customer.unitsRequired ?? 1;
    if (!item || item.quantity < unitsRequired) return null;

    const amountTl = saleAmountTl ?? 0;
    const costBasisPerUnit = item.costBasisTl / item.quantity;
    const soldCostBasisTl = costBasisPerUnit * unitsRequired;
    const profitTl = amountTl - soldCostBasisTl;
    const remainingQuantity = item.quantity - unitsRequired;

    const inventory =
      remainingQuantity > 0
        ? state.inventory.map((i) =>
            i.id === item.id
              ? { ...i, quantity: remainingQuantity, costBasisTl: i.costBasisTl - soldCostBasisTl }
              : i,
          )
        : state.inventory.filter((i) => i.id !== item.id);

    const xpGained = equivalentGrams(item.grams, item.karat) * unitsRequired * XP_PER_EQUIVALENT_GRAM_TRADED;

    set({
      inventory,
      realizedTradingProfitTl: state.realizedTradingProfitTl + profitTl,
      totalTradingCostBasisTl: state.totalTradingCostBasisTl + soldCostBasisTl,
      dailyActiveTradeCashTl: state.dailyActiveTradeCashTl + amountTl,
      dailyActiveTradeProfitTl: state.dailyActiveTradeProfitTl + profitTl,
      capital: {
        ...state.capital,
        cashTl: state.capital.cashTl + amountTl,
        stockValueTl: computeStockValueTl(inventory, state.goldPrice.buyPricePerGram),
      },
      ...applyXpGain(state, xpGained),
    });
    return { profitTl, xpGained };
  },

  clearIncomingCustomer: (id) => {
    const state = get();
    if (state.incomingCustomer?.id === id) {
      set({ incomingCustomer: null });
    }
  },

  dismissActiveCustomer: (id) => {
    const state = get();
    const activeId = state.incomingCustomer?.id;
    const dismissId = id ?? activeId;
    if (!dismissId || (activeId && activeId !== dismissId)) return false;
    const waitingCustomers = state.waitingCustomers.filter((customer) => customer.id !== dismissId);
    if (!activeId && waitingCustomers.length === state.waitingCustomers.length) return false;
    set({
      incomingCustomer: activeId === dismissId ? null : state.incomingCustomer,
      waitingCustomers,
    });
    return true;
  },

  callNextCustomerToCounter: () => {
    const state = get();
    if (state.incomingCustomer) return false;
    if (state.waitingCustomers.length === 0) return false;
    const [next, ...rest] = state.waitingCustomers;
    // Tezgaha çağrılan müşterinin sabrı, oyuncu pazarlığa tepki verene
    // kadar (özellikle 2x/4x hızda) tükenmesin diye oyun anında duraklatılır
    // — NegotiationPanel mount olduğunda da aynısını garanti eder (defense
    // in depth), kapanınca preNegotiationSpeed'e geri döner.
    set({
      incomingCustomer: next,
      waitingCustomers: rest,
      speed: 0,
      preNegotiationSpeed: state.speed,
    });
    return true;
  },

  levelUpSkill: (skillId) => {
    const state = get();
    const definition = skillTree.find((s) => s.id === skillId);
    if (!definition) return false;
    const currentLevel = state.skillLevels[skillId] ?? 0;
    if (state.skillPoints <= 0 || currentLevel >= definition.maxLevel) return false;

    set({
      skillPoints: state.skillPoints - 1,
      skillLevels: { ...state.skillLevels, [skillId]: currentLevel + 1 },
    });
    return true;
  },

  resetSkills: () => {
    const state = get();
    set({ skillLevels: {}, skillPoints: skillPointsForLevel(state.level) });
  },

  adjustReputation: (delta) => {
    set((state) => ({
      reputation: { score: Math.max(0, Math.min(100, state.reputation.score + delta)) },
    }));
  },

  grantBonusXp: (amount) => {
    const state = get();
    set({ ...applyXpGain(state, amount) });
  },

  hasCompletedTutorial: false,
  firstSessionHintsDismissed: {},
  completeTutorial: () => set({ hasCompletedTutorial: true }),
  dismissFirstSessionHint: (hintId) =>
    set((state) => ({
      firstSessionHintsDismissed: {
        ...state.firstSessionHintsDismissed,
        [hintId]: true,
      },
    })),
  resetGame: () => {
    nextInventoryId = 1;
    nextOfferId = 1;
    nextIncomingCustomerId = 1;
    set(createNewGameState());
  },

  hasHydrated: false,
  setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
    }),
    {
      // v3: ekonomi temelden değişti (başlangıç sermayesi, atölye/takı
      // yatırımı modeli) — eski kayıtlarla karışmasın diye sürüm atlandı.
      name: 'cepkaynak-save-v13',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<GameState>;
        const workshop = normalizeWorkshopState(persisted.workshop, persisted.atolyeLevel ?? currentState.atolyeLevel);
        const day = persisted.day ?? currentState.day;
        const minuteOfDay = persisted.minuteOfDay ?? currentState.minuteOfDay;
        const totalMinutesNow = day * MINUTES_PER_DAY + minuteOfDay;
        const jewelryHoldings = normalizeJewelryHoldings(persisted.jewelryHoldings, day);
        const waitingCustomers = normalizeCustomerQueue(
          [persisted.incomingCustomer, ...(persisted.waitingCustomers ?? [])],
          totalMinutesNow,
        );
        return {
          ...currentState,
          ...persisted,
          incomingCustomer: null,
          waitingCustomers,
          workshop,
          atolyeLevel: workshop.level,
          jewelryHoldings,
          inventory: normalizeInventoryForCurrentGameplay(persisted.inventory ?? currentState.inventory),
          dailyCustomerTarget:
            persisted.dailyCustomerTarget ?? dailyCustomerTargetForDay(day, persisted.reputation?.score ?? currentState.reputation.score),
          dailyCustomersGenerated: persisted.dailyCustomersGenerated ?? 0,
          customerRushUsedDay: persisted.customerRushUsedDay ?? null,
          customerRushFeedback: persisted.customerRushFeedback ?? null,
          firstSessionHintsDismissed: persisted.firstSessionHintsDismissed ?? {},
          lastDaySettlementSummary: normalizeDaySettlementSummary(persisted.lastDaySettlementSummary),
          dailyActiveTradeCashTl: persisted.dailyActiveTradeCashTl ?? 0,
          dailyActiveTradeProfitTl: persisted.dailyActiveTradeProfitTl ?? 0,
        };
      },
      // Skill tanımları/oyun kodu değişse bile eski kayıtlar yüklenebilsin diye
      // sadece serileştirilebilir oyun verisi tutulur — aksiyon fonksiyonları
      // ve geçici alanlar (hasHydrated) hariç tutulur.
      partialize: (state) => ({
        playerName: state.playerName,
        shopName: state.shopName,
        capital: state.capital,
        goldPrice: state.goldPrice,
        reputation: state.reputation,
        inventory: state.inventory,
        offers: state.offers,
        incomingCustomer: state.incomingCustomer,
        waitingCustomers: state.waitingCustomers,
        dailyCustomerTarget: state.dailyCustomerTarget,
        dailyCustomersGenerated: state.dailyCustomersGenerated,
        customerRushUsedDay: state.customerRushUsedDay,
        customerRushFeedback: state.customerRushFeedback,
        day: state.day,
        minuteOfDay: state.minuteOfDay,
        speed: state.speed,
        referencePriceAtDayStart: state.referencePriceAtDayStart,
        marketSpreadTlPerGram: state.marketSpreadTlPerGram,
        wholesalerBuyMarginTlPerGram: state.wholesalerBuyMarginTlPerGram,
        wholesalerSellMarginTlPerGram: state.wholesalerSellMarginTlPerGram,
        wholesalerTrust: state.wholesalerTrust,
        loanDueDay: state.loanDueDay,
        brokerDeal: state.brokerDeal,
        meltingJob: state.meltingJob,
        workshop: state.workshop,
        atolyeLevel: state.atolyeLevel,
        jewelryHoldings: state.jewelryHoldings,
        lastDaySettlementSummary: state.lastDaySettlementSummary,
        dailyActiveTradeCashTl: state.dailyActiveTradeCashTl,
        dailyActiveTradeProfitTl: state.dailyActiveTradeProfitTl,
        fourXUnlockedUntilMs: state.fourXUnlockedUntilMs,
        fourXUnlimited: state.fourXUnlimited,
        customerHypeUntilMs: state.customerHypeUntilMs,
        realizedTradingProfitTl: state.realizedTradingProfitTl,
        totalTradingCostBasisTl: state.totalTradingCostBasisTl,
        totalXp: state.totalXp,
        level: state.level,
        skillPoints: state.skillPoints,
        skillLevels: state.skillLevels,
        hasCompletedTutorial: state.hasCompletedTutorial,
        firstSessionHintsDismissed: state.firstSessionHintsDismissed,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        // Bölüm 4.4: "oyun kapatılıp açıldığında ekstra dalgalanma".
        state?.applyRestartFluctuation();
      },
    },
  ),
);
