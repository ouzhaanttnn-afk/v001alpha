import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StockSpec } from '../data/toptanciStock';
import type { GoldPriceState, InventoryItem } from '../types/game';
import { LOW_CASH_WARNING_THRESHOLD_TL } from '../config/economyConfig';
import { colors, fonts, fontSizes, radius } from '../theme';
import { formatTl } from '../utils/format';
import { Badge } from './Badge';
import { Card } from './Card';
import { ProductIcon } from './icons/ProductIcon';

// Piyasa: Toptancıdan Stok Al — pazarlıksız, her an açık restok satırı.
// Sadece alım var; stok müşteriye pazarlıkla satılır (bkz. Pazarlık satış modu).
// Bölüm 5: toptancı, genel piyasa SATIŞ fiyatının bir marj kadar
// altından satar — bu marj genel ticker'dan bağımsız, kendi başına
// dalgalanan bir değer (bkz. useGameStore'daki wholesalerBuyMarginTlPerGram).
export function StockCard({
  spec,
  goldPrice,
  wholesalerBuyMarginTlPerGram,
  cashTl,
  ownedItem,
  onBuy,
}: {
  spec: StockSpec;
  goldPrice: GoldPriceState;
  wholesalerBuyMarginTlPerGram: number;
  cashTl: number;
  ownedItem?: InventoryItem;
  onBuy: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);

  const equivGrams = spec.grams * (spec.karat / 24);
  const wholesalerPricePerGram = Math.max(1, goldPrice.sellPricePerGram - wholesalerBuyMarginTlPerGram);
  const unitPriceTl = equivGrams * wholesalerPricePerGram;
  const totalCostTl = unitPriceTl * quantity;
  const cashAfterTl = cashTl - totalCostTl;

  const ownedQuantity = ownedItem?.quantity ?? 0;
  const canBuy = totalCostTl <= cashTl;
  const leavesLowCash = canBuy && cashAfterTl < LOW_CASH_WARNING_THRESHOLD_TL;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <ProductIcon category={spec.category} name={spec.name} size={22} />
        <View style={styles.info}>
          <Text style={styles.name}>{spec.name}</Text>
          <Text style={styles.meta}>
            {spec.karat} Ayar, {spec.grams.toLocaleString('tr-TR')}g/adet
          </Text>
        </View>
        {ownedQuantity > 0 && (
          <Badge
            tone="neutral"
            label={`${ownedQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} adet stokta`}
          />
        )}
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.priceLabel}>Birim {formatTl(unitPriceTl)}</Text>
        <Text style={styles.priceLabel}>Toplam {formatTl(totalCostTl)}</Text>
        <Text style={[styles.priceValueSmall, leavesLowCash && styles.warningValue]}>
          Kalan {formatTl(Math.max(0, cashAfterTl))}
        </Text>
      </View>

      <View style={styles.stepperRow}>
        <View style={styles.stepper}>
          <Pressable
            style={styles.stepperButton}
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            <Text style={styles.stepperButtonLabel}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{quantity}</Text>
          <Pressable style={styles.stepperButton} onPress={() => setQuantity((q) => q + 1)}>
            <Text style={styles.stepperButtonLabel}>+</Text>
          </Pressable>
        </View>

        <Pressable
          disabled={!canBuy}
          onPress={() => onBuy(quantity)}
          style={[styles.buyButton, !canBuy && styles.buyButtonDisabled]}
        >
          <Text style={styles.buyButtonLabel}>Satın Al · {formatTl(totalCostTl)}</Text>
        </Pressable>
      </View>
      {!canBuy && <Text style={styles.hint}>Nakdin yetmiyor.</Text>}
      {leavesLowCash && (
        <Text style={styles.hint}>Uyarı: Bu alımdan sonra nakit tamponun çok düşecek.</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 9,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  info: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    color: colors.inkMuted,
    marginTop: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  priceLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.inkMuted,
  },
  priceValue: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.md,
    color: colors.ink,
  },
  priceValueSmall: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  warningValue: {
    color: colors.warning,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
  },
  stepperButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.md,
    color: colors.ink,
  },
  stepperValue: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
    minWidth: 20,
    textAlign: 'center',
  },
  buyButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: 6,
    alignItems: 'center',
  },
  buyButtonDisabled: {
    opacity: 0.4,
  },
  buyButtonLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.white,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.warning,
    marginTop: 6,
    textAlign: 'center',
  },
});
