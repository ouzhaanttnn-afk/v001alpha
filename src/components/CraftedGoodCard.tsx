import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { InventoryItem } from '../types/game';
import { craftedGoodEstimatedValueTl, craftedGoodMetalValueTl, craftedMeltHasGrams } from '../engine/craftedGoods';
import { colors, fonts, fontSizes, radius } from '../theme';
import { Card } from './Card';
import { ProductIcon } from './icons/ProductIcon';
import { formatTl } from '../utils/format';

// Bölüm 16: işçilikli ürün kartı — GDD'nin kesin kararı gereği burada
// "Sat" değil sadece "Erit" var; işçilikli ürün başka bir müşteriye asla
// işçilikli ürün olarak satılmıyor.
export function CraftedGoodCard({
  item,
  buyPricePerGram,
  onMelt,
  onHold,
  meltDisabled,
  holdActive,
}: {
  item: InventoryItem;
  buyPricePerGram: number;
  onMelt: () => void;
  onHold: () => void;
  meltDisabled?: boolean;
  holdActive?: boolean;
}) {
  const actualKarat = item.actualKarat ?? item.karat;
  const meltHasGrams = craftedMeltHasGrams(item.grams, actualKarat) * (item.hasHiddenFlaw ? 0.85 : 1);
  const metalValueTl = craftedGoodMetalValueTl(item, buyPricePerGram);
  const estimatedValueTl = craftedGoodEstimatedValueTl(item, buyPricePerGram);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <ProductIcon category={item.category} name={item.name} size={22} />
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.karat} Ayar (beyan), {item.grams.toLocaleString('tr-TR')}g
          </Text>
          <Text style={styles.source}>{item.source ?? 'Müşteri getirdi'}</Text>
        </View>
        <Text style={styles.status}>{holdActive ? 'BEKLETİLİYOR' : 'STOKTA'}</Text>
      </View>
      <View style={styles.valueGrid}>
        <View style={styles.valueCell}>
          <Text style={styles.valueLabel}>Alış</Text>
          <Text style={styles.valueText}>{formatTl(item.costBasisTl)}</Text>
        </View>
        <View style={styles.valueCell}>
          <Text style={styles.valueLabel}>Eritme</Text>
          <Text style={styles.valueText}>
            → {meltHasGrams.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}g HAS
          </Text>
        </View>
        <View style={styles.valueCell}>
          <Text style={styles.valueLabel}>Metal</Text>
          <Text style={styles.valueText}>{formatTl(metalValueTl)}</Text>
        </View>
        <View style={styles.valueCell}>
          <Text style={styles.valueLabel}>Tahmini</Text>
          <Text style={styles.valueText}>{formatTl(estimatedValueTl)}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onHold} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonLabel}>BEKLET</Text>
        </Pressable>
        <Pressable
          disabled={meltDisabled}
          onPress={onMelt}
          style={[styles.meltButton, meltDisabled && styles.disabled]}
        >
          <Text style={styles.meltButtonLabel}>ERİT</Text>
        </Pressable>
      </View>
      <View style={styles.notesRow}>
        <Text style={styles.note}>
          {actualKarat} Ayar · {item.grams.toLocaleString('tr-TR')}g →{' '}
          {meltHasGrams.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}g HAS
        </Text>
        <Text style={styles.note}>Eritme işçilik değerini has altına eklemez.</Text>
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
  source: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.inkMuted,
    marginTop: 1,
  },
  status: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    color: colors.inkMuted,
  },
  valueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 4,
    marginTop: 7,
  },
  valueCell: {
    width: '50%',
  },
  valueLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.inkMuted,
  },
  valueText: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.xs,
    color: colors.ink,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.inkMuted,
  },
  meltButton: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: 5,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  meltButtonLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.white,
  },
  notesRow: {
    marginTop: 6,
    gap: 2,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.inkMuted,
  },
});
