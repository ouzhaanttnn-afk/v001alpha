import type { BargainingStyle } from '../types/negotiation';
import { PROGRESSION_UNLOCKS } from '../config/economyConfig';

// v2 iterasyonu: Bölüm 6'nın satış/bozdurma için ayrı arketip listeleri
// TEK bir müşteri kişiliği havuzunda birleşti — aynı 5 kişilik hem "dükkândan
// almak" hem "dükkâna bozdurmak" isteyen müşterilerde kullanılıyor. Artık
// sadece ekranda yazan bir etiket değiller: bargainingStyle NegotiationPanel'in
// karşı teklif mantığını (bkz. COUNTER_OFFER_CHANCE/POSITION), patienceMinutes
// müşterinin gerçekten ne kadar bekleyeceğini (Bölüm 6'nın "sabrı" artık
// oyun saatine bağlı gerçek bir süre) doğrudan belirliyor.
export interface CustomerPersona {
  type: string;
  bargainingStyle: BargainingStyle;
  urgency: string;
  /** Gün ilerledikçe daha zor/değerli müşteri tiplerinin havuza girmesi için. */
  minDay?: number;
  /** Müşterinin dükkânda gerçekten bekleyeceği süre (oyun-dakikası) — Soğukkanlı/Güler Yüz bunun üstüne eklenir. */
  patienceMinutes: number;
  /** Bozdurma (dükkân müşteriden alıyor): müşterinin kabul edeceği, piyasa değerine göre asgari (taban) oran. */
  minAcceptRatio: number;
  /** Satış (dükkân müşteriye satıyor): müşterinin ödemeye razı olduğu, piyasa değerine göre azami (tavan) oran. */
  maxPayRatio: number;
}

export const INCOMING_CUSTOMER_NAMES = [
  'Mehmet Bey',
  'Ayşe Hanım',
  'Kemal Bey',
  'Hasan Bey',
  'Fatma Hanım',
  'Serpil Hanım',
  'Cengiz Bey',
  'Nur Hanım',
  'Ali Bey',
  'Zeynep Hanım',
];

// 5 kişilik (Bölüm 15: "ilk playtest için 3-5 müşteri tipi yeterli"):
// Nakit Sıkışan/Bilinçli Satıcı/Sert Pazarlıkçı/Kolay İkna Olur kullanıcının
// birebir istediği isimler; Dengeli Müşteri nötr bir beşinci çeşitlilik.
export const CUSTOMER_PERSONAS: CustomerPersona[] = [
  {
    type: 'Nakit Sıkışan',
    bargainingStyle: 'kolay',
    urgency: 'Acil',
    // Beklemek istemez: kısa sabır, düşük teklifleri kolay kabul eder.
    patienceMinutes: 45,
    minAcceptRatio: 0.72,
    maxPayRatio: 1.15,
  },
  {
    type: 'Bilinçli Satıcı',
    bargainingStyle: 'sert',
    urgency: 'Acelesi yok',
    // Piyasa fiyatını bilir: düşük tekliflere sert tepki verir, kolay pes etmez.
    patienceMinutes: 100,
    minAcceptRatio: 0.9,
    maxPayRatio: 0.97,
  },
  {
    type: 'Sert Pazarlıkçı',
    bargainingStyle: 'sert',
    urgency: 'Normal',
    // Karşı teklif verme ihtimali yüksek, kolay vazgeçmez (uzun sabır).
    patienceMinutes: 110,
    minAcceptRatio: 0.85,
    maxPayRatio: 0.98,
  },
  {
    type: 'Kolay İkna Olur',
    bargainingStyle: 'kolay',
    urgency: 'Normal',
    patienceMinutes: 70,
    minAcceptRatio: 0.75,
    maxPayRatio: 1.1,
  },
  {
    type: 'Dengeli Müşteri',
    bargainingStyle: 'dengeli',
    urgency: 'Normal',
    patienceMinutes: 90,
    minAcceptRatio: 0.82,
    maxPayRatio: 1.02,
  },
  {
    type: 'Fırsatçı',
    bargainingStyle: 'sert',
    urgency: 'Normal',
    minDay: PROGRESSION_UNLOCKS.customerPersonas.fırsatçı,
    patienceMinutes: 85,
    minAcceptRatio: 0.88,
    maxPayRatio: 0.95,
  },
  {
    type: 'Makul Alıcı',
    bargainingStyle: 'dengeli',
    urgency: 'Acelesi yok',
    minDay: PROGRESSION_UNLOCKS.customerPersonas.makulAlici,
    patienceMinutes: 120,
    minAcceptRatio: 0.83,
    maxPayRatio: 1.08,
  },
  {
    type: 'Sabırsız Müşteri',
    bargainingStyle: 'kolay',
    urgency: 'Çok acil',
    minDay: PROGRESSION_UNLOCKS.customerPersonas.sabirsiz,
    patienceMinutes: 35,
    minAcceptRatio: 0.78,
    maxPayRatio: 1.12,
  },
  {
    type: 'Yüksek Bütçeli',
    bargainingStyle: 'dengeli',
    urgency: 'Normal',
    minDay: PROGRESSION_UNLOCKS.customerPersonas.yuksekButceli,
    patienceMinutes: 95,
    minAcceptRatio: 0.86,
    maxPayRatio: 1.18,
  },
  {
    type: 'Değerini Bilen',
    bargainingStyle: 'sert',
    urgency: 'Acelesi yok',
    minDay: PROGRESSION_UNLOCKS.customerPersonas.degeriniBilen,
    patienceMinutes: 130,
    minAcceptRatio: 0.93,
    maxPayRatio: 1.02,
  },
  {
    type: 'Bilgili Koleksiyoner',
    bargainingStyle: 'sert',
    urgency: 'Acelesi yok',
    minDay: PROGRESSION_UNLOCKS.customerPersonas.nadirDegerli,
    patienceMinutes: 150,
    minAcceptRatio: 0.96,
    maxPayRatio: 1.28,
  },
  {
    type: 'Nadir Koleksiyoncu',
    bargainingStyle: 'sert',
    urgency: 'Acelesi yok',
    minDay: PROGRESSION_UNLOCKS.customerPersonas.nadirDegerli,
    patienceMinutes: 140,
    minAcceptRatio: 0.95,
    maxPayRatio: 1.25,
  },
];
