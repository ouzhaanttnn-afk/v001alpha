import type { InventoryCategory } from '../types/game';

export interface StockSpec {
  id: string;
  name: string;
  karat: number;
  grams: number;
  category: InventoryCategory;
}

// Piyasa: Toptancıdan Stok Al — standart sarrafiye stoğu tek valuation
// motoruyla canlı kurdan değerlenir. Yarım Altın ve Cumhuriyet (Tam)
// Altını ayrı bir stok kalemi DEĞİL — değerce 2 ve 4 Çeyrek'e eşit olduğu
// için müşteri isteği bu stoktan otomatik karşılanıyor (bkz. useGameStore).
//
// Has altın orantılaması (araştırıldı, T.C. Darphane/piyasa standardı):
// - Çeyrek Altın resmî nominal ağırlığı 1,754 g (halk arasında 1,75 g'a
//   yuvarlanır) — has hesabında tam değer kullanılıyor.
// - Yarım Altın (3,508 g) tam olarak 2×Çeyrek, ziynet grubu Tam Altın
//   (7,016 g) tam olarak 4×Çeyrek'tir — bu yüzden ayrı stok kalemi
//   tutmadan Çeyrek üzerinden türetmek gerçek piyasayla birebir örtüşüyor
//   (not: adı benzese de 7,216 g'lık "Cumhuriyet Altını" sikke grubu ayrı
//   bir ürün, Çeyrek'in tam katı değil — modellenmiyor).
// - 22 ayar saflığı 916,6 milyem = 22/24 ile birebir aynı oran
//   (equivalentGrams'taki karat/24 formülü zaten bu resmî standartla örtüşüyor).
export const toptanciStock: StockSpec[] = [
  { id: 'gram-altin', name: 'Gram Altın', karat: 24, grams: 1, category: 'yatirim' },
  { id: 'ceyrek-altin', name: 'Çeyrek Altın', karat: 22, grams: 1.754, category: 'yatirim' },
  { id: '22-ayar-bilezik', name: '22 Ayar Bilezik', karat: 22, grams: 10, category: 'taki' },
  { id: '22-ayar-kelepce', name: '22 Ayar Kelepçe', karat: 22, grams: 18, category: 'taki' },
];
