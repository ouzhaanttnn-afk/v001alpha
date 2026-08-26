import { StyleSheet, Text, View } from 'react-native';
import { UZMAN_GORUSU_BASE_ERROR_PERCENT, UZMAN_GORUSU_ERROR_REDUCTION_PER_LEVEL } from '../config/economyConfig';
import { valuationUnitPriceLabel } from '../engine/pricing';
import type { NegotiationProduct } from '../types/negotiation';
import { fonts, fontSizes } from '../theme';
import { glass } from '../theme/glass';
import { formatTl } from '../utils/format';
import { GlassCard } from './GlassCard';
import { ProductIcon } from './icons/ProductIcon';
import { SealIcon } from './icons/SealIcon';

// Bölüm 4.3/10/11: Ürün kartı — ürün adı, kaynağı, ayar/gram rozetleri,
// varsa ayar onaylı mührü, büyük işlemlerde ("10 Çeyrek" gibi) adet.
// İşçilikli ürünlerde (Bölüm 13-14) `karat` alanı müşterinin BEYANI —
// Uzman Görüşü yatırılmadıkça gerçek ayar/kusur gizli kalır.
export function NegotiationProductCard({
  product,
  uzmanGorusuLevel = 0,
  tested,
  compact,
}: {
  product: NegotiationProduct;
  uzmanGorusuLevel?: number;
  /** [YENİ] Terazi ile tartıldıysa küçük bir "TEST EDİLDİ" rozeti gösterir. */
  tested?: boolean;
  /** [YENİ] Müşteri+Ürün yan yana yerleşiminde kullanılan dar/kısa versiyon. */
  compact?: boolean;
}) {
  const hasQuantity = (product.quantity ?? 1) > 1;
  const isCraftedGood = product.category === 'iscilikli';
  const unitPrice = valuationUnitPriceLabel(product);
  const unitPriceLabel = `Birim fiyat: ${formatTl(unitPrice.amountTl)}/${unitPrice.unit}`;

  let expertRange: { min: number; max: number } | null = null;
  if (isCraftedGood && uzmanGorusuLevel > 0 && product.actualKarat !== undefined) {
    const errorPercent = Math.max(
      0,
      UZMAN_GORUSU_BASE_ERROR_PERCENT - (uzmanGorusuLevel - 1) * UZMAN_GORUSU_ERROR_REDUCTION_PER_LEVEL,
    );
    const errorMagnitude = Math.round(product.actualKarat * (errorPercent / 100));
    expertRange = {
      min: Math.max(8, product.actualKarat - errorMagnitude),
      max: Math.min(24, product.actualKarat + errorMagnitude),
    };
  }
  const revealsFlaw = isCraftedGood && uzmanGorusuLevel >= 5;

  if (compact) {
    return (
      <GlassCard style={styles.compactCard}>
        <View style={styles.compactTopRow}>
          <ProductIcon category={product.category} name={product.name} size={18} />
          <Text style={styles.compactName} numberOfLines={1}>
            {hasQuantity ? `${product.quantity} adet ${product.name}` : product.name}
          </Text>
          {tested && (
            <View style={styles.testedBadgeCompact}>
              <Text style={styles.testedBadgeLabel}>✓</Text>
            </View>
          )}
        </View>
        <Text style={styles.compactSubtitle} numberOfLines={1}>
          {product.karat} Ayar · {product.grams.toLocaleString('tr-TR')} g
          {hasQuantity ? '/adet' : ''}
        </Text>
        <Text style={styles.compactUnitPrice} numberOfLines={1}>{unitPriceLabel}</Text>
        {isCraftedGood && (
          <Text style={styles.compactExpertHint} numberOfLines={1}>
            {expertRange ? `Tahmini: ${expertRange.min}–${expertRange.max} ayar` : 'Ayar beyana dayalı'}
          </Text>
        )}
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.card}>
      {product.sealVerified && (
        <View style={styles.seal}>
          <SealIcon size={32} />
        </View>
      )}
      <View style={styles.row}>
        <ProductIcon category={product.category} name={product.name} size={30} />
        <View style={styles.info}>
          <Text style={styles.name}>
            {hasQuantity ? `${product.quantity} adet ${product.name}` : product.name}
          </Text>
          <Text style={styles.source}>{product.source}</Text>
        </View>
        {tested && (
          <View style={styles.testedBadge}>
            <Text style={styles.testedBadgeLabel}>TEST EDİLDİ</Text>
          </View>
        )}
      </View>
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{product.karat} Ayar {isCraftedGood ? '(beyan)' : ''}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>
            {product.grams.toLocaleString('tr-TR')} g{hasQuantity ? '/adet' : ''}
          </Text>
        </View>
      </View>
      <Text style={styles.unitPrice} numberOfLines={1}>{unitPriceLabel}</Text>

      {isCraftedGood && (
        <View style={styles.expertBox}>
          {expertRange ? (
            <>
              <Text style={styles.expertLabel}>UZMAN GÖRÜŞÜ</Text>
              <Text style={styles.expertValue}>
                Tahmini gerçek ayar: {expertRange.min}–{expertRange.max}
              </Text>
              {revealsFlaw && (
                <Text style={styles.expertValue}>
                  {product.hasHiddenFlaw ? 'Gizli kusur tespit edildi.' : 'Gizli kusur yok, sağlam.'}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.expertLocked}>Kilitli — Uzman Görüşü ile gerçek ayarı gör</Text>
          )}
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  // [DÜZELTME] Ürün kartı da kompaktlaştırıldı — test/teklif alanına daha
  // az kaydırmayla ulaşılsın.
  card: {
    overflow: 'visible',
    padding: 10,
  },
  seal: {
    position: 'absolute',
    top: -10,
    right: -6,
    zIndex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  info: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: glass.ink,
  },
  source: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: glass.inkMuted,
  },
  testedBadge: {
    backgroundColor: glass.purpleSoft,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  testedBadgeLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.3,
    color: glass.positive,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  badge: {
    backgroundColor: glass.sunken,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: glass.borderSoft,
  },
  badgeLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: glass.goldBright,
  },
  expertBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: glass.borderSoft,
  },
  expertLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 1,
    color: glass.inkMuted,
    marginBottom: 2,
  },
  expertValue: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: glass.ink,
  },
  expertLocked: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: glass.inkMuted,
    fontStyle: 'italic',
  },
  // ---------- compact (yan yana Müşteri + Ürün düzeni) ----------
  compactCard: {
    flex: 1,
    minWidth: 0,
    padding: 7,
    gap: 3,
  },
  compactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  compactName: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: glass.ink,
  },
  compactSubtitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: glass.goldBright,
  },
  compactUnitPrice: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: glass.inkMuted,
  },
  compactExpertHint: {
    fontFamily: fonts.body,
    fontSize: 8.5,
    color: glass.inkMuted,
    fontStyle: 'italic',
  },
  testedBadgeCompact: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: glass.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitPrice: {
    marginTop: 5,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: glass.inkMuted,
  },
});
