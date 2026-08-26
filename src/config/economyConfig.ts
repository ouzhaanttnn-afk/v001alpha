// GDD Bölüm 32 — "Ekonomi değerlerini merkezi config/data yapısında tut."
// Bu dosya, useGameStore.ts'teki oyun motorunun okuduğu TÜM ekonomi
// sabitlerini tek yerde toplar. Dengeleme (balancing) için buradaki
// sayılar değiştirilebilir; oyun mantığının kendisi (store) bu dosyaya
// bakarak çalışır, sayıları kod içine gömmez.
import type { BargainingStyle } from '../types/negotiation';

// ---- Zaman / Saat (Bölüm 22 temeli) ----------------------------------
export const MINUTES_PER_DAY = 1440;
// Oyun saatinin gerçek zamana oranı: 1x hızda 1 gün ≈ 8 gerçek dakika.
export const GAME_MINUTES_PER_REAL_SECOND_AT_1X = 3;
// Uygulama arka planda uzun süre kaldıysa tek tick'te aşırı sıçramayı önler.
export const MAX_REAL_SECONDS_PER_TICK = 5;

// ---- Sermaye (Bölüm 2 — v3 dengeleme düzeltmesi) -------------------------
// v3 KRİTİK DÜZELTME: eski "1 kg has altın nakde çevrilir" başlangıcı
// (~6.8-7.1M TL) erken oyun zorluğunu tamamen ortadan kaldırıyordu —
// toptancı stoğunun tamamı ilk dakikada peşin alınabiliyordu. Kullanıcı
// isteğiyle sabit, mütevazı bir nakit bakiyeyle değiştirildi: oyuncu
// gerçek bir "az sermayeyle başlayan kuyumcu" hissi yaşamalı.
// v0.2 Aşama 5: başlangıç artık hedeflenen erken oyun karar döngüsüne
// dönüyor — 100.000 TL nakit, 0 stok, 0 borç. Sadece YENİ oyunları etkiler,
// mevcut kayıtlı kasa bakiyesini değiştirmez.
// PLAYTEST/BALANCE ADAYI: yeni oyun başlangıç nakdi geçici olarak 2M TL.
// Mevcut save'ler merge sırasında resetlenmez; sadece sıfırdan başlayan
// kayıtlar bu değeri kullanır.
export const STARTING_CASH_TL = 2000000;
export const STARTING_REFERENCE_PRICE = 6845; // TL, gram altın referans (orta) fiyatı — sadece piyasa başlangıcı için, sermaye artık buna bağlı değil.
// Bölüm 2: Sermaye Kademeleri — her yeni kademe bir Yetenek Ağacı puanı kazandırır.
export const CAPITAL_TIERS = [100000, 500000, 2000000, 10000000, 50000000, 250000000];

// ---- Piyasa / Günlük Fiyat Kapanışı (v0.2 Faz 6) -------------------------
// Normal piyasa günlerinde günlük getiri kesin olarak ±%3.5 ile sınırlıdır.
// Çoğu gün küçük hareket üretmesi için trend + volatilite + küçük noise modeli
// kullanılır; sonuç clamp edilir. Simülasyon sonrası tune edilecek.
export const MARKET_DAILY_RETURN_CLAMP = 0.035;
export const MARKET_DAILY_TREND_COMPONENT_MAX = 0.004;
export const MARKET_DAILY_VOLATILITY_COMPONENT_MAX = 0.018;
export const MARKET_DAILY_NOISE_COMPONENT_MAX = 0.013;
// Eski yarım-saatlik piyasa adım API'sini kırmamak için sabit tutulur; store
// artık fiyatı gün kapanışında ilerletir.
export const MARKET_STEP_MINUTES = MINUTES_PER_DAY;
export const MARKET_STEP_MIN_PERCENT = 0.3;
export const MARKET_STEP_MAX_PERCENT = 1.2;
// Uygulama kapatılıp yeniden açıldığında (rehydration) referans fiyata
// bir kez daha ekstra ±%3-5 dalgalanma uygulanır.
export const RESTART_FLUCTUATION_MIN_PERCENT = 3;
export const RESTART_FLUCTUATION_MAX_PERCENT = 5;
// ALIŞ/SATIŞ makası artık sabit bir oran değil, piyasa koşuluna göre
// (her 30 dakikalık adımda yeniden belirlenen) TL/gram bandı: dar/sakin
// piyasada ~150 TL, oynak piyasada ~400 TL'ye kadar açılabilir.
export const MARKET_SPREAD_MIN_TL_PER_GRAM = 150;
export const MARKET_SPREAD_MAX_TL_PER_GRAM = 400;
export const STARTING_USD_TRY = 33.5;
export const STARTING_EUR_TRY = 36.2;

// ---- Toptancı (Bölüm 5) --------------------------------------------------
// Toptancı, genel piyasa SATIŞ fiyatının şu kadar TL/gram ALTINDAN
// oyuncuya satar (oyuncunun kâr marjı buradan gelir) ve genel piyasa
// ALIŞ/bozdurma fiyatının şu kadar TL/gram ÜSTÜNDEN oyuncudan alır —
// iki bağımsız marj, aynı 30 dakikalık adımda yeniden belirlenir.
export const WHOLESALER_MARGIN_MIN_TL_PER_GRAM = 20;
export const WHOLESALER_MARGIN_MAX_TL_PER_GRAM = 40;

// Toptancı Güveni: borç aldığında bir vade başlar, vadeyi geç ödersen
// güven düşer. Güven eşiğin altındaysa toptancı artık kredi vermez.
export const STARTING_WHOLESALER_TRUST = 65;
export const LOAN_TERM_DAYS = 5;
export const LATE_PAYMENT_TRUST_PENALTY = 15;
export const MIN_TRUST_FOR_CREDIT = 30;

// ---- Gelen Müşteri Akışı (Bölüm 6) --------------------------------------
// Dükkâna sürekli akan müşteri: hem "satın almak" hem "bozdurmak"
// isteyen müşteriler oyunun ilk dakikasından itibaren aynı havuzdan gelir.
// [YENİ] Müşteri Bekleme Kuyruğu: artık üretilen müşteri doğrudan tezgahı
// (incomingCustomer) işgal etmiyor, önce bu kuyruğa giriyor — oyuncu
// callNextCustomerToCounter() ile sırayla tezgaha çağırıyor. Kuyruk bu
// uzunluğa ulaşınca (mekan dolu) yeni müşteri üretimi geçici olarak durur.
export const MAX_WAITING_QUEUE_LENGTH = 5;
export const INCOMING_CUSTOMER_CHECKS_PER_DAY = 20;

// ---- Merkezi Progression / Unlock Haritası -------------------------------
// Level tabanlı açılımlar tek mantıksal kaynakta tutulur. Eski export isimleri
// aşağıda bu haritadan türetilir; böylece ekranlar ve store dağınık magic
// number okumaz.
export const PROGRESSION_UNLOCKS = {
  workshop: 7,
  jewelry: {
    base: 7,
    tiers: {
      ayar8: 7,
      ayar14: 12,
      ayar18: 18,
      ayar22: 28,
    },
  },
  customerPersonas: {
    early: 1,
    fırsatçı: 8,
    makulAlici: 12,
    sabirsiz: 16,
    yuksekButceli: 25,
    degeriniBilen: 40,
    nadirDegerli: 70,
  },
  productPools: {
    standard: 1,
    craftedGoods: 4,
    multiItem: 10,
    bulkLots: 15,
    rareLargeLots: 45,
  },
} as const;
export const INCOMING_CUSTOMER_TRIGGER_PROBABILITY = 1;
export const INCOMING_CUSTOMER_EXPIRY_MINUTES = 90;
export const DAILY_CUSTOMER_TARGET_CURVE = [
  { fromDay: 1, toDay: 10, average: 20, min: 16, max: 24 },
  { fromDay: 11, toDay: 30, average: 23, min: 18, max: 28 },
  { fromDay: 31, toDay: 60, average: 27, min: 22, max: 32 },
  { fromDay: 61, toDay: 100, average: 31, min: 25, max: 37 },
  { fromDay: 101, toDay: 150, average: 36, min: 29, max: 43 },
  { fromDay: 151, toDay: Number.POSITIVE_INFINITY, average: 40, min: 32, max: 48 },
];
export const KARIZMA_TRAFFIC_BONUS_POINTS = [
  { score: 0, bonus: 0 },
  { score: 25, bonus: 0.05 },
  { score: 50, bonus: 0.1 },
  { score: 75, bonus: 0.17 },
  { score: 100, bonus: 0.25 },
];
export const CUSTOMER_RUSH_REMAINING_BONUS_RATIO = 0.4;
// İlk oturumda bekleme hissini azaltır: günlük hedefi/kârı değiştirmez,
// sadece erken günlerde hedef müşterilerin gün içine biraz daha erken
// yayılmasını sağlar. Day 11+ progression davranışı korunur.
export const EARLY_CUSTOMER_ARRIVAL_PACE_MULTIPLIERS = [
  { fromDay: 1, toDay: 3, multiplier: 1.45 },
  { fromDay: 4, toDay: 10, multiplier: 1.2 },
];
// Bölüm 7: Soğukkanlı ve Güler Yüz müşteri sabrını (oyun-dakikası
// cinsinden) uzatır — Pazarlık ekranındaki gerçek-zamanlı sayaçtan (bkz.
// NegotiationPanel'in kendi sabitleri) bağımsız, oyun saatine bağlı ayrı bir etki.
export const SOGUKKANLI_PATIENCE_MINUTES_PER_LEVEL = 15;
export const GULER_YUZ_PATIENCE_MINUTES_PER_LEVEL = 10;
// Yeni bir müşteri geldiğinde alım (satış) mı yoksa bozdurma mı istediği
// yarı yarıya rastgele belirlenir.
export const BOZDURMA_DIRECTION_PROBABILITY = 0.5;
// Bozdurma müşterilerinin nadiren getirdiği büyük, karışık ayarlı hurda
// parti (200g-2kg) — "büyük işlem" çeşitliliği (Bölüm 10).
export const BOZDURMA_BULK_LOT_PROBABILITY = 0.12;
export const BOZDURMA_BULK_LOT_MIN_GRAMS = 200;
export const BOZDURMA_BULK_LOT_MAX_GRAMS = 2000;

// ---- Teklifler (Bölüm 4.6) -----------------------------------------------
// Kaydırma çubuğuyla gönderilen bir teklif anında sonuçlanmaz, müşterinin
// düşünmesi için bir süre "bekleyen" kalır.
export const OFFER_RESOLUTION_DELAY_MINUTES = 30;

// ---- Pazarlık Teklif Aralığı + Hızlı Ön Ayarlar (Bölüm 7/8) --------------
// Sadece müşteriden alım/bozdurma modunda (dükkân müşteriden alıyor):
// teklif çubuğu piyasa değerinin %80-110'u aralığında. Üç hızlı ön ayar
// butonu çubuğu doğrudan bu oranlara götürür.
// [DÜZELTME] Eski aralık (%15-100) sliderın anlamsız derecede düşük
// tekliflere inmesine izin veriyordu — taban %80'e, tavan %110'a çekildi.
export const OFFER_RANGE_MIN_RATIO = 0.8;
export const OFFER_RANGE_MAX_RATIO = 1.1;
export const OFFER_PRESET_OLUCU_RATIO = 0.85;
export const OFFER_PRESET_MAKUL_RATIO = 0.95;
export const OFFER_PRESET_COMERT_RATIO = 1.02;
// Bölüm 8: Karizma — düşük bir teklif kabul edilirse hafif itibar riski,
// cömert bir teklif kabul edilirse hafif itibar kazancı. Skill'lerden
// (Sıkı Pazarlıkçı/Ölücü) bağımsız, çubuğun kendi temel davranışı.
export const LOW_OFFER_REPUTATION_PENALTY = 1;
export const GENEROUS_OFFER_REPUTATION_BONUS = 1;
// Bölüm 7: Sıkı Pazarlıkçı kabul eşiğini düşürür (Sv.1 %5 → Sv.5 %25);
// Ölücü'nün agresif kullanımı seviye başına itibar riski taşır.
export const SIKI_PAZARLIKCI_THRESHOLD_REDUCTION_PER_LEVEL = 0.05;
export const OLUCU_REPUTATION_PENALTY_PER_LEVEL = 2;

// ---- Satış Modu Fiyat Aralığı + Ret Hakkı (mega-ekran birleşimi sonrası) --
// Dükkândan müşteriye satış modunda: teklif çubuğu piyasa değerinin en
// fazla %10 altına inebilir (aşırı düşük/anlamsız iskontoları önlemek
// için), tavanı ise pazarlık payı bırakır. Müşteri fiyatı çok yüksek
// bulup reddederse oyuncuya hemen kaybettirmek yerine SALE_REJECTION_ATTEMPTS
// kadar deneme hakkı tanınır — son denemede de reddederse müşteri ayrılır.
export const SALE_OFFER_MIN_RATIO = 0.9;
export const SALE_OFFER_MAX_RATIO = 1.3;
export const SALE_REJECTION_ATTEMPTS = 2;

// ---- XP / Seviye + Yetenek Sıfırlama (Bölüm 23-24/30) --------------------
// Seviye tamamen paradan bağımsız — sadece aktif alım-satımdan (toptancıdan
// restok, müşteriyle pazarlık, envanterden satış, Toptancı Bağlantısı)
// kazanılan XP ile ilerler; pasif gelirden (pırlanta vb.) asla XP gelmez.
// Hedef 50 seviye; her seviyede 1 yetenek puanı + kilometre taşlarında
// (Sv.10/20/30/40/50) ekstra puan. Sayılar Bölüm 37'nin dediği gibi
// dengeleme amaçlı başlangıç placeholder'ları.
export const LEVEL_MAX = 50;
export const XP_PER_EQUIVALENT_GRAM_TRADED = 1;
// Seviye n'e ulaşmak için gereken toplam XP: (n-1)*BASE + INCREMENT*artan basamak.
export const LEVEL_XP_BASE = 50;
export const LEVEL_XP_INCREMENT = 15;
export const SKILL_POINTS_PER_LEVEL = 1;
export const LEVEL_MILESTONES = [10, 20, 30, 40, 50];
export const MILESTONE_BONUS_SKILL_POINTS = 1;

// ---- İşçilikli Ürün + Eritme (Bölüm 11-16) -------------------------------
// Kolye/yüzük/küpe/işlemeli bilezik/taşlı gibi işçilikli ürünler müşteriden
// bozdurma yoluyla alınır ve GDD'nin açık kararı gereği ASLA başka bir
// müşteriye işçilikli ürün olarak satılmaz — her zaman eritilip has altın
// karşılığı sarrafiye stoğuna (Gram Altın) geri kazandırılır.
// Bozdurma müşterisi geldiğinde, bunun standart sarrafiye yerine işçilikli
// bir ürün getirme ihtimali:
export const CRAFTED_GOOD_CUSTOMER_PROBABILITY = 0.3;
// [YENİ] v3 — Toplu Alım (Kalem Bazlı Pazarlık): bir bozdurma müşterisinin
// (işçilikli ürün değilse) 2-3 FARKLI sarrafiye kalemiyle birden gelme
// ihtimali — her kalem NegotiationPanel'de ayrı pazarlık edilir.
export const MULTI_ITEM_CUSTOMER_PROBABILITY = 0.2;
// Uzman Görüşü yatırılmamışsa (Sv.0) müşterinin beyan ettiği ayardan farklı
// çıkma (yanlış ayar/sahtecilik) ihtimali en yüksek; skil arttıkça iddialı
// müşteriler daha az denk gelir (deneyimli kuyumcu şüpheli malı daha baştan
// eler) — Bölüm 37: "sahtecilik riski %10-20 → skil ile %2-5".
export const CRAFTED_GOOD_BASE_COUNTERFEIT_RISK = 0.2;
export const CRAFTED_GOOD_MIN_COUNTERFEIT_RISK = 0.03;
// Beyan edilenle gerçek ayar arasındaki fark, sahtecilik durumunda kaç ayar.
export const CRAFTED_GOOD_KARAT_MISMATCH = 4;
// Uzman Görüşü: Sv.1'de gerçek değeri ±%15 hata payıyla tahmin eder, her
// seviyede hata payı daralır; Sv.5'te gizli kusur/taş durumu da açığa çıkar.
export const UZMAN_GORUSU_BASE_ERROR_PERCENT = 15;
export const UZMAN_GORUSU_ERROR_REDUCTION_PER_LEVEL = 3;
// Eritme verimi (Bölüm 37 placeholder): geri kazanılan has altının oranı.
export const MELTING_EFFICIENCY_MIN = 0.92;
export const MELTING_EFFICIENCY_MAX = 0.98;
// Eritme süresi: küçük parçalar (≤50g) 1-2 dk, büyük parçalar 5-10 dk (oyun-içi).
export const MELTING_SMALL_LARGE_THRESHOLD_GRAMS = 50;
export const MELTING_TIME_SMALL_MIN_MINUTES = 1;
export const MELTING_TIME_SMALL_MAX_MINUTES = 2;
export const MELTING_TIME_LARGE_MIN_MINUTES = 5;
export const MELTING_TIME_LARGE_MAX_MINUTES = 10;
// Yeniden Doğuş: eritme süresini seviye başına kısaltır.
export const YENIDEN_DOGUS_TIME_REDUCTION_PER_LEVEL = 0.15;
export const CRAFTED_MELT_PURITY_BY_KARAT: Record<number, number> = {
  8: 0.333,
  14: 0.585,
  18: 0.75,
  22: 0.916,
};

// ---- 4x Hız Tekelleştirmesi (Bölüm 22) -------------------------------------
// 1x/2x/duraklat her zaman serbest; sadece 4x parayla (reklam ya da IAP)
// açılıyor. Bu, GERÇEK DÜNYA (wall-clock) süresi — Bölüm 9'un Toptancı
// Bağlantısı'ndaki 10 OYUN-dakikalık pencereyle karıştırılmamalı.
export const FOUR_X_AD_UNLOCK_MINUTES = 15;

// ---- Müşteri Akını (reklam bazlı monetizasyon) -----------------------------
// Günde en fazla bir kez, o günün kalan organik müşteri potansiyeline doğal
// bir hareketlilik bonusu verir. UI teknik multiplier göstermemelidir.
export const CUSTOMER_HYPE_AD_DURATION_MINUTES = 15;
export const CUSTOMER_HYPE_ARRIVAL_MULTIPLIER = 1.4;

// ---- Atölye (v0.2 ara aşama — gerçek tasarım) -----------------------------
// Atölye işçilikli ürün işleyen bir sistem DEĞİLDİR. Tek bağımsız pasif
// HAS üretim rayıdır: Seviye 7'de kurulabilir, Lv1-Lv10 arasında geliştirilir
// ve yalnızca oyun günü kapanışında Gram Altın (Has) üretir.
//
// SIMULATION_TUNING_REQUIRED: Aşağıdaki maliyet/üretim eğrisi nihai balance
// değildir. Simülasyon raporu bu değerlerin ekonomiye etkisini ölçmek için
// üretilecek; production değerleri bu görevde simülasyona bakarak
// değiştirilmemelidir.
export const WORKSHOP_CONFIG = {
  simulationTuningRequired: true,
  requiredLevel: PROGRESSION_UNLOCKS.workshop,
  maxLevel: 10,
  unlockCostEquivalentHasGrams: 18,
  levels: [
    { level: 1, upgradeCostEquivalentHasGrams: 18, dailyHasOutput: 0.35 },
    { level: 2, upgradeCostEquivalentHasGrams: 30, dailyHasOutput: 0.7 },
    { level: 3, upgradeCostEquivalentHasGrams: 48, dailyHasOutput: 1.1 },
    { level: 4, upgradeCostEquivalentHasGrams: 75, dailyHasOutput: 1.65 },
    { level: 5, upgradeCostEquivalentHasGrams: 115, dailyHasOutput: 2.35 },
    { level: 6, upgradeCostEquivalentHasGrams: 175, dailyHasOutput: 3.2 },
    { level: 7, upgradeCostEquivalentHasGrams: 270, dailyHasOutput: 4.25 },
    { level: 8, upgradeCostEquivalentHasGrams: 430, dailyHasOutput: 5.5 },
    { level: 9, upgradeCostEquivalentHasGrams: 700, dailyHasOutput: 7 },
    { level: 10, upgradeCostEquivalentHasGrams: 1150, dailyHasOutput: 8.75 },
  ],
} as const;

// Eski isimler geçiş sürecinde import kırmamak için tutulur; yeni gameplay
// WORKSHOP_CONFIG üzerinden çalışır.
export const ATOLYE_REQUIRED_LEVEL = WORKSHOP_CONFIG.requiredLevel;
export const ATOLYE_MAX_LEVEL = WORKSHOP_CONFIG.maxLevel;

// ---- Takı Yatırımı — 30 Günlük Sermaye Bağlama (v0.2 Faz 6) ---------------
export const JEWELRY_REQUIRED_LEVEL = PROGRESSION_UNLOCKS.jewelry.base;
export const JEWELRY_TIER_REQUIRED_LEVELS = PROGRESSION_UNLOCKS.jewelry.tiers;
export const PASSIVE_INVESTMENT_TERM_DAYS = 30;
export const JEWELRY_SET_BONUS_PCT = 0.1;
export const PASSIVE_INVESTMENT_CONFIG = {
  simulationTuningRequired: true,
  termDays: PASSIVE_INVESTMENT_TERM_DAYS,
  setBonusPct: JEWELRY_SET_BONUS_PCT,
  tiers: [
    {
      id: 'ayar8',
      label: '8 Ayar',
      karat: 8,
      requiredLevel: JEWELRY_TIER_REQUIRED_LEVELS.ayar8,
      roi30Days: 0.16,
      pieces: [
        { id: 'yuzuk', label: 'Yüzük', principalTl: 120000 },
        { id: 'kupe', label: 'Küpe', principalTl: 150000 },
        { id: 'kolye', label: 'Kolye', principalTl: 180000 },
        { id: 'bileklik', label: 'Bileklik', principalTl: 220000 },
      ],
    },
    {
      id: 'ayar14',
      label: '14 Ayar',
      karat: 14,
      requiredLevel: JEWELRY_TIER_REQUIRED_LEVELS.ayar14,
      roi30Days: 0.19,
      pieces: [
        { id: 'yuzuk', label: 'Yüzük', principalTl: 300000 },
        { id: 'kupe', label: 'Küpe', principalTl: 380000 },
        { id: 'kolye', label: 'Kolye', principalTl: 470000 },
        { id: 'bileklik', label: 'Bileklik', principalTl: 580000 },
      ],
    },
    {
      id: 'ayar18',
      label: '18 Ayar',
      karat: 18,
      requiredLevel: JEWELRY_TIER_REQUIRED_LEVELS.ayar18,
      roi30Days: 0.22,
      pieces: [
        { id: 'yuzuk', label: 'Yüzük', principalTl: 700000 },
        { id: 'kupe', label: 'Küpe', principalTl: 850000 },
        { id: 'kolye', label: 'Kolye', principalTl: 1050000 },
        { id: 'bileklik', label: 'Bileklik', principalTl: 1250000 },
      ],
    },
    {
      id: 'ayar22',
      label: '22 Ayar',
      karat: 22,
      requiredLevel: JEWELRY_TIER_REQUIRED_LEVELS.ayar22,
      roi30Days: 0.26,
      pieces: [
        { id: 'yuzuk', label: 'Yüzük', principalTl: 2000000 },
        { id: 'kupe', label: 'Küpe', principalTl: 2400000 },
        { id: 'kolye', label: 'Kolye', principalTl: 2900000 },
        { id: 'bileklik', label: 'Bileklik', principalTl: 3500000 },
      ],
    },
  ],
} as const;

// ---- Pazarlık: Karşı Teklif (v2 iterasyonu — gerçek pazarlık hissi) ------
// Kaydırma çubuğuyla gönderilen bir teklif artık anında sonuçlanır (30 dk'lık
// bekleme kaldırıldı): teklif eşiğin altındaysa, eşiğin en az şu oranı kadarsa
// (COUNTER_OFFER_FLOOR_RATIO) müşteri pazarlık tarzına göre karşı teklif
// verebilir; daha düşükse pazarlık bile açılmadan doğrudan reddeder.
export const COUNTER_OFFER_FLOOR_RATIO = 0.6;
// Pazarlık tarzına göre karşı teklif verme ihtimali.
export const COUNTER_OFFER_CHANCE: Record<BargainingStyle, number> = {
  sert: 0.8,
  dengeli: 0.5,
  kolay: 0.2,
};
// Karşı teklifin, oyuncunun teklifiyle eşik arasındaki mesafede nereye
// düştüğü (0 = oyuncunun teklifine yakın/ucuz, 1 = tam eşiğin kendisi).
export const COUNTER_OFFER_POSITION: Record<BargainingStyle, number> = {
  sert: 0.92,
  dengeli: 0.6,
  kolay: 0.3,
};
// "Teklifi Yükselt": oyuncunun teklifiyle müşterinin karşı teklifi arasında
// yarı yolda yeni bir teklif üretir (tam kabul etmek yerine bir miktar
// direnme fırsatı) — en fazla COUNTER_OFFER_MAX_ROUNDS tur karşı teklif gösterilir.
export const COUNTER_OFFER_MEET_HALFWAY_RATIO = 0.5;
export const COUNTER_OFFER_MAX_ROUNDS = 2;

// ---- Karizma — pazarlık üzerindeki gerçek etkisi -------------------------
// reputation.score (Karizma/İtibar, 0-100) 50 nötr kabul edilir; nötrden her
// puan sapma, müşterinin kabul eşiğini ve karşı teklifin oyuncu lehine
// kayma miktarını hafifçe etkiler — Bölüm 8'in "sadece rozet değil, gerçek
// etkisi olsun" kararı.
export const KARIZMA_NEUTRAL_SCORE = 50;
export const KARIZMA_THRESHOLD_EFFECT_PER_POINT = 0.0015;
export const KARIZMA_COUNTER_POSITION_EFFECT_PER_POINT = 0.002;

// ---- Pazarlık turu: sabır / tekrar teklif / son fiyat --------------------
// Bunlar fiyatlandırma ya da ekonomi dengesi değil, aktif müşteriyle yapılan
// tek bir pazarlığın davranış sınırlarıdır. Motor bu değerlerle deterministik
// çalışır; aynı teklif tekrarlarında yeni bir kabul zarı atılmaz.
export const NEGOTIATION_INITIAL_PATIENCE: Record<BargainingStyle, number> = {
  kolay: 4,
  dengeli: 3,
  sert: 4,
};
export const NEGOTIATION_REPEAT_OFFER_BAND_RATIO = 0.01;
export const NEGOTIATION_MINOR_GAP_RATIO = 0.06;
export const NEGOTIATION_LOW_GAP_RATIO = 0.12;
export const NEGOTIATION_INSULTING_GAP_RATIO = 0.28;

// ---- XP — işlem başına görünür kazanım (Bölüm 23-24 UX iyileştirmesi) ----
// Mevcut has-gram-bazlı temel XP'nin (XP_PER_EQUIVALENT_GRAM_TRADED) üstüne,
// oyuncunun "neden XP geldiğini" anlaması için görünür, isimlendirilmiş
// bonuslar eklenir — bir işlem tamamlandığında hangi bonusun tetiklendiği
// XP toast'ında (bkz. NegotiationPanel/KasamScreen) tek satırda gösterilir.
export const XP_BONUS_DEAL_COMPLETED = 10;
export const XP_BONUS_PROFITABLE_SALE = 15;
export const XP_BONUS_GOOD_BARGAIN = 10; // teklif, eşiğin altında ama karşı teklif turlarıyla kapandıysa
export const XP_BONUS_RARE_ITEM = 20; // işçilikli/nadir ürün ya da büyük (çoklu adet) işlem

// Büyük alım/yatırım sonrası kasa bunun altına düşerse UI oyuncuyu uyarır;
// işlem engellenmez, sadece "nakit tamponun eriyor" sinyali verilir.
export const LOW_CASH_WARNING_THRESHOLD_TL = 10000;

// ---- Büyük Bozdurmalar + Toptancı Bağlantısı (Bölüm 9) -------------------
// Müşteriden nakit yetmeyen bir alım yapılıp borca yazıldığında, oyuncu
// az önce aldığı malı hemen toptancıya (kâr marjıyla) satıp borcu
// doğuran işlemi anında kapatabilir. Bu "bağlantı" sınırlı bir oyun-içi
// süre için açık kalır; süresi dolarsa toptancı güveni düşer.
export const BROKER_DEAL_WINDOW_MINUTES = 10;
export const BROKER_DEAL_TIMEOUT_TRUST_PENALTY = 10;
// Borçla alınan malın Toptancı Bağlantısı üzerinden anında çevrilmesi bir
// acil likidite/tasfiye hamlesidir, kâr stratejisi değil. Piyasa zıplasa
// bile satış bedeli maliyetin bu oranını aşamaz.
export const BROKER_LIQUIDATION_MAX_COST_RECOVERY_RATIO = 0.98;
