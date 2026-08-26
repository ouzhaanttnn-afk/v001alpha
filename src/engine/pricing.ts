import type { GoldPriceState, InventoryItem } from '../types/game';

/**
 * v3 mimari birleşimi (Oyun A + Oyun B): UI'dan ve Zustand'dan tamamen
 * bağımsız, saf fiyatlama/ekonomi fonksiyonları — "motor" katmanı.
 * useGameStore.ts bu dosyadaki fonksiyonları ORKESTRE eder, hiçbirini
 * yeniden tanımlamaz.
 *
 * KRİTİK — ÇİFTE İNDİRİM HATASI (v3 düzeltmesi): bir parçanın has (saf
 * altın) karşılığı SADECE burada, TEK bir yerde ve TEK bir formülle
 * hesaplanır: grams * (karat/24). `grams` alanı HER ZAMAN parçanın brüt/
 * nominal ağırlığıdır (ör. Çeyrek Altın 1,754 g) — bu zaten resmî has
 * standardına (22 ayar = 916,6 milyem ≈ 22/24) birebir orantılıdır. Bu
 * fonksiyonun DIŞINDA hiçbir yerde ayrıca bir "purity"/"milyem" çarpanı
 * UYGULANMAMALIDIR — aksi halde has değeri iki kez indirime uğrar (Oyun
 * B'nin economyConfig.products[].purity alanı gibi AYRI bir milyem alanı
 * asla eklenmemeli, equivalentGrams tek başına yeterlidir).
 */
export function equivalentGrams(grams: number, karat: number): number {
  return grams * (karat / 24);
}

export function hasEquivalentGrams(item: Pick<InventoryItem, 'grams' | 'karat'>): number {
  return equivalentGrams(item.grams, item.karat);
}

/** Bir pozisyonun güncel toplam değeri (tüm adet dahil, canlı kurdan). */
export function currentPositionValueTl(
  item: Pick<InventoryItem, 'grams' | 'karat' | 'quantity'>,
  buyPricePerGram: number,
): number {
  return hasEquivalentGrams(item) * item.quantity * buyPricePerGram;
}

/**
 * Pazarlık/valuation UI'ında gösterilecek birim fiyatı, ürün kartında ayrı
 * bir gross gram formülü kurmadan doğrudan aynı toplam değer kaynağından
 * türetir: marketValueTl / toplam has karşılığı gram. Böylece Çeyrek gibi
 * nominal gram ürünlerinde purity ikinci kez uygulanmaz.
 */
export function valuationUnitPriceLabel(
  item: Pick<InventoryItem, 'name' | 'grams' | 'karat'> & { quantity?: number; marketValueTl: number },
): { amountTl: number; unit: 'gram' | 'adet' } {
  const quantity = Math.max(1, item.quantity ?? 1);
  const name = item.name.toLocaleLowerCase('tr-TR');
  const pricedPerPiece = name.includes('çeyrek') || name.includes('lira');
  if (pricedPerPiece) {
    return { amountTl: item.marketValueTl / quantity, unit: 'adet' };
  }
  return { amountTl: item.marketValueTl / Math.max(0.01, item.grams * quantity), unit: 'gram' };
}

export function isHasAltinItem(item: Pick<InventoryItem, 'name' | 'karat' | 'grams'>): boolean {
  return item.name === 'HAS Altın' && item.karat === 24 && item.grams === 1;
}

export function isWholesalerSellableInventoryItem(item: InventoryItem): boolean {
  if (item.category === 'iscilikli') return false;
  if (isHasAltinItem(item)) return true;
  if (item.name === 'Gram Altın' && item.karat === 24 && item.grams === 1) return true;
  if (item.name === 'Gram Altın (Has)' && item.karat === 24 && item.grams === 1) return true;
  if (item.name === 'Çeyrek Altın') return true;
  const name = item.name.toLocaleLowerCase('tr-TR');
  return name.includes('bilezik') && item.grams >= 10;
}

/** Stok değerini envanterden yeniden hesaplar: sarrafiye güncel kurda mark-to-market, işçilikli ürün de has karşılığıyla değerlenir. */
export function computeStockValueTl(inventory: InventoryItem[], buyPricePerGram: number): number {
  return inventory.reduce((sum, item) => {
    return sum + currentPositionValueTl(item, buyPricePerGram);
  }, 0);
}

/** [min, max] aralığında düzgün dağılımlı rastgele değer. */
export function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** ±magnitude yüzdesinde, rastgele işaretli bir fiyat hareketi. */
export function randomSignedPercent(minMagnitude: number, maxMagnitude: number): number {
  const magnitude = randomInRange(minMagnitude, maxMagnitude);
  return Math.random() < 0.5 ? -magnitude : magnitude;
}

/** Referans (orta) fiyat + makastan alış/satış fiyatlarını türetir. */
export function priceFromReferenceAndSpread(
  reference: number,
  spreadTlPerGram: number,
): Pick<GoldPriceState, 'buyPricePerGram' | 'sellPricePerGram'> {
  return {
    buyPricePerGram: reference - spreadTlPerGram / 2,
    sellPricePerGram: reference + spreadTlPerGram / 2,
  };
}

/**
 * Piyasa referans fiyatını N bağımsız ±yüzde adımıyla ilerletir. Logaritmik
 * (exp) uygulama, ardışık aritmetik yüzdenin yarattığı sistematik aşağı
 * yönlü sapmayı (volatilite sürüklenmesi) ortadan kaldırır.
 */
export function stepMarketReference(
  currentReference: number,
  steps: number,
  minPercent: number,
  maxPercent: number,
): number {
  let next = currentReference;
  for (let i = 0; i < steps; i++) {
    const percent = randomSignedPercent(minPercent, maxPercent);
    next *= Math.exp(percent / 100);
  }
  return Math.max(next, 100);
}
