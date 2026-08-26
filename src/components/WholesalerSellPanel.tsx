import { useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { currentPositionValueTl } from '../engine/pricing';
import type { InventoryItem } from '../types/game';
import { colors, fonts, radius } from '../theme';
import { formatTl } from '../utils/format';
import { Card } from './Card';

export type WholesalerSellSelection = {
  itemId: string;
  quantity: number;
};

export function WholesalerSellPanel({
  items,
  buyPricePerGram,
  onSellSelected,
}: {
  items: InventoryItem[];
  buyPricePerGram: number;
  onSellSelected: (selections: WholesalerSellSelection[]) => void;
}) {
  const [selectedById, setSelectedById] = useState<Record<string, number>>({});

  const rows = useMemo(
    () =>
      items.map((item) => {
        const unitSaleValueTl = currentPositionValueTl(item, buyPricePerGram) / Math.max(1, item.quantity);
        const isHas = item.name === 'HAS Altın';
        const isCoin = item.name.includes('Çeyrek');
        const itemNameLower = item.name.toLocaleLowerCase('tr-TR');
        const isBracelet = itemNameLower.includes('bilezik') || itemNameLower.includes('kelepçe');
        const stepQuantity = isHas ? 0.1 / Math.max(0.01, item.grams) : 1;
        const selectedQuantity = Math.min(item.quantity, Math.max(0, selectedById[item.id] ?? 0));
        const selectedRatio = item.quantity > 0 ? selectedQuantity / item.quantity : 0;
        const displayHeld = isHas || isBracelet
          ? `${(item.quantity * item.grams).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} g`
          : `${item.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} adet`;
        const displaySelected = isHas || isBracelet
          ? `${(selectedQuantity * item.grams).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
          : selectedQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
        const unitLabel = isCoin
          ? `${formatTl(unitSaleValueTl)}/adet`
          : `${formatTl(unitSaleValueTl / Math.max(0.01, item.grams))}/g`;
        return {
          item,
          unitSaleValueTl,
          selectedQuantity,
          displayHeld,
          displaySelected,
          unitLabel,
          stepQuantity,
          selectedRatio,
        };
      }),
    [buyPricePerGram, items, selectedById],
  );

  const selectedTotalTl = rows.reduce((sum, row) => sum + row.unitSaleValueTl * row.selectedQuantity, 0);
  const selections = rows
    .filter((row) => row.selectedQuantity > 0)
    .map((row) => ({ itemId: row.item.id, quantity: row.selectedQuantity }));

  const setQuantity = (item: InventoryItem, quantity: number, stepQuantity: number) => {
    const steppedQuantity = Math.round(quantity / stepQuantity) * stepQuantity;
    const safeQuantity = Math.round(steppedQuantity * 100) / 100;
    setSelectedById((current) => ({
      ...current,
      [item.id]: Math.min(item.quantity, Math.max(0, safeQuantity)),
    }));
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>TOPTANCIYA SAT</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>Satılabilir HAS, Gram Altın, Çeyrek veya 10g+ bilezik yok.</Text>
      ) : (
        <View style={styles.rows}>
          {rows.map((row) => (
            <View key={row.item.id} style={styles.row}>
              <View style={styles.productCell}>
                <Text style={styles.productName} numberOfLines={1}>{row.item.name}</Text>
                <Text style={styles.heldText}>{row.displayHeld}</Text>
              </View>
              <Text style={styles.unitText} numberOfLines={1}>{row.unitLabel}</Text>
              <View style={styles.controls}>
                <QuantitySlider
                  item={row.item}
                  ratio={row.selectedRatio}
                  stepQuantity={row.stepQuantity}
                  onChange={setQuantity}
                />
                <Text style={styles.selectedValue}>{row.displaySelected}</Text>
                <Pressable style={styles.maxButton} onPress={() => setQuantity(row.item, row.item.quantity, row.stepQuantity)}>
                  <Text style={styles.maxLabel}>MAX</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
      <View style={styles.footer}>
        <Text style={styles.totalLabel}>Seçilen toplam satış</Text>
        <Text style={styles.totalValue}>{formatTl(selectedTotalTl)}</Text>
      </View>
      <Pressable
        disabled={selections.length === 0}
        style={[styles.sellButton, selections.length === 0 && styles.disabled]}
        onPress={() => {
          onSellSelected(selections);
          setSelectedById({});
        }}
      >
        <Text style={styles.sellButtonLabel}>SEÇİLENLERİ TOPTANCIYA SAT</Text>
      </Pressable>
    </Card>
  );
}

function QuantitySlider({
  item,
  ratio,
  stepQuantity,
  onChange,
}: {
  item: InventoryItem;
  ratio: number;
  stepQuantity: number;
  onChange: (item: InventoryItem, quantity: number, stepQuantity: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(1);
  const updateFromEvent = (event: GestureResponderEvent) => {
    const nextRatio = Math.min(1, Math.max(0, event.nativeEvent.locationX / trackWidth));
    onChange(item, item.quantity * nextRatio, stepQuantity);
  };
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: updateFromEvent,
        onPanResponderMove: updateFromEvent,
      }),
    [item, onChange, stepQuantity, trackWidth],
  );

  return (
    <View
      style={styles.sliderTrack}
      onLayout={(event: LayoutChangeEvent) => setTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
      {...panResponder.panHandlers}
    >
      <View style={styles.sliderTrackBase} />
      <View style={[styles.sliderFill, { width: `${Math.round(ratio * 100)}%` }]} />
      <View style={[styles.sliderThumb, { left: `${Math.round(ratio * 100)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 10,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.ink,
    letterSpacing: 0.6,
  },
  empty: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkMuted,
  },
  rows: {
    marginTop: 8,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  productCell: {
    flex: 1.1,
    minWidth: 0,
  },
  productName: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.ink,
  },
  heldText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.inkMuted,
    marginTop: 1,
  },
  unitText: {
    flex: 0.9,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    color: colors.ink,
    textAlign: 'right',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
    paddingLeft: 7,
  },
  sliderTrack: {
    width: 72,
    height: 24,
    justifyContent: 'center',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 10,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  sliderThumb: {
    position: 'absolute',
    top: 7,
    width: 10,
    height: 10,
    marginLeft: -5,
    borderRadius: 5,
    backgroundColor: colors.ink,
  },
  sliderTrackBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 10,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  selectedValue: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    color: colors.ink,
    minWidth: 34,
    textAlign: 'center',
  },
  maxButton: {
    height: 24,
    justifyContent: 'center',
    paddingHorizontal: 7,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  maxLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.inkMuted,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.inkMuted,
  },
  totalValue: {
    fontFamily: fonts.monoBold,
    fontSize: 13,
    color: colors.ink,
  },
  sellButton: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  sellButtonLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.white,
  },
});
