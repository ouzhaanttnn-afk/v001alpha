import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { InventoryItem } from '../types/game';
import { colors, fonts, fontSizes, radius } from '../theme';
import { formatTl } from '../utils/format';
import { Badge } from './Badge';
import { Card } from './Card';
import { ProductIcon } from './icons/ProductIcon';

// Kasam / Yatırım Ürünlerin: alım-satım pozisyonu — adet, maliyet
// ortalaması, güncel değer ve aradaki makastan doğan kâr/zarar.
// Kullanıcı kararı: farklı fiyatlardan yapılan alımlar tek pozisyonda
// birikip ağırlıklı ortalama maliyet üzerinden kâr hesaplanıyor.
export function TradingPositionCard({
  item,
  currentValueTl,
  currentDay,
  onSell,
  onSellQuantity,
  onHold,
}: {
  item: InventoryItem;
  currentValueTl: number;
  /** Bölüm 4/6: kaç gündür stokta olduğunu göstermek için bugünün gün sayısı. */
  currentDay: number;
  onSell: () => void;
  onSellQuantity?: (quantity: number) => void;
  /** "Beklet" — satmayı erteleme kararını görünür kılan, hafif bir dokunuş. */
  onHold?: () => void;
}) {
  const initialSellQuantity = Math.min(1, item.quantity);
  const [sellQuantity, setSellQuantity] = useState(initialSellQuantity);
  const avgCostPerUnit = item.costBasisTl / item.quantity;
  const currentValuePerUnit = currentValueTl / item.quantity;
  const profitTl = currentValueTl - item.costBasisTl;
  const selectedQuantity = Math.min(item.quantity, Math.max(initialSellQuantity, sellQuantity));
  const selectedSaleValueTl = currentValuePerUnit * selectedQuantity;
  const selectedCostBasisTl = avgCostPerUnit * selectedQuantity;
  const selectedProfitTl = selectedSaleValueTl - selectedCostBasisTl;
  const isProfit = profitTl >= 0;
  const daysHeld = Math.max(0, currentDay - item.acquiredDay);
  const canPartialSell = !!onSellQuantity && item.quantity > initialSellQuantity;
  const isHasBalance = item.name.toLocaleLowerCase('tr-TR').includes('has') && item.grams === 1 && item.karat === 24;
  const changeSellQuantity = (delta: number) => {
    setSellQuantity((current) => Math.min(item.quantity, Math.max(initialSellQuantity, current + delta)));
  };
  const setQuantityRatio = (ratio: number) => {
    setSellQuantity(Math.max(initialSellQuantity, Math.min(item.quantity, item.quantity * ratio)));
  };
  const sellSelected = () => {
    if (!onSellQuantity) {
      onSell();
      return;
    }
    onSellQuantity(selectedQuantity);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <ProductIcon category={item.category} name={item.name} size={22} />
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} adet · {item.karat} Ayar,{' '}
            {item.grams.toLocaleString('tr-TR')}g/adet
          </Text>
          <Text style={styles.heldSince}>
            {daysHeld <= 0 ? 'Bugün alındı' : `${daysHeld} gündür stokta`}
          </Text>
        </View>
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.priceLabel}>Ort. {formatTl(avgCostPerUnit)}</Text>
        <Text style={styles.priceLabel}>Birim {formatTl(currentValuePerUnit)}</Text>
        <Text style={[styles.priceValue, { color: selectedProfitTl >= 0 ? colors.positive : colors.negative }]}>
          {selectedProfitTl >= 0 ? '+' : ''}{formatTl(selectedProfitTl)}
        </Text>
      </View>

      {canPartialSell && (
        <View style={styles.sellQuantityBlock}>
          <View style={styles.sellQuantityRow}>
            <Text style={styles.priceLabel}>{isHasBalance ? 'Satılacak HAS' : 'Satılacak adet'}</Text>
            <View style={styles.stepper}>
              <Pressable style={styles.stepperButton} onPress={() => changeSellQuantity(isHasBalance ? -10 : -1)}>
                <Text style={styles.stepperButtonLabel}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>
                {selectedQuantity.toLocaleString('tr-TR', { maximumFractionDigits: isHasBalance ? 2 : 0 })}
              </Text>
              <Pressable style={styles.stepperButton} onPress={() => changeSellQuantity(isHasBalance ? 10 : 1)}>
                <Text style={styles.stepperButtonLabel}>+</Text>
              </Pressable>
              <Pressable style={styles.allButton} onPress={() => setSellQuantity(item.quantity)}>
                <Text style={styles.allButtonLabel}>MAX</Text>
              </Pressable>
            </View>
          </View>
          {isHasBalance && (
            <View style={styles.quickRow}>
              {[0.25, 0.5, 1].map((ratio) => (
                <Pressable key={ratio} style={styles.quickButton} onPress={() => setQuantityRatio(ratio)}>
                  <Text style={styles.quickButtonLabel}>{ratio === 1 ? 'MAX' : `%${Math.round(ratio * 100)}`}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.footer}>
        <Badge
          tone={isProfit ? 'positive' : 'negative'}
          label={`Potansiyel ${isProfit ? 'kâr' : 'zarar'}: ${isProfit ? '+' : ''}${formatTl(profitTl)}`}
        />
        <View style={styles.buttonGroup}>
          {onHold && (
            <Pressable style={styles.holdButton} onPress={onHold}>
              <Text style={styles.holdButtonLabel}>Beklet</Text>
            </Pressable>
          )}
          <Pressable style={styles.sellButton} onPress={sellSelected}>
            <Text style={styles.sellButtonLabel}>
              TOPTANCIYA SAT · {formatTl(canPartialSell ? selectedSaleValueTl : currentValueTl)}
            </Text>
          </Pressable>
        </View>
      </View>
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
  heldSince: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.inkMuted,
    marginTop: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: fontSizes.xs,
    color: colors.ink,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sellQuantityBlock: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 5,
  },
  sellQuantityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 5,
  },
  quickButton: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    alignItems: 'center',
  },
  quickButtonLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.inkMuted,
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
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  stepperValue: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.xs,
    color: colors.ink,
    minWidth: 32,
    textAlign: 'center',
  },
  allButton: {
    paddingHorizontal: 8,
    height: 26,
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  allButtonLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.inkMuted,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 5,
  },
  holdButton: {
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  holdButtonLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.inkMuted,
  },
  sellButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  sellButtonLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.white,
  },
});
