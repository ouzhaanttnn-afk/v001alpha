import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { JewelryPieceSpec, JewelryTierSpec } from '../data/jewelryInvestments';
import type { JewelryInvestmentPosition } from '../engine/jewelry';
import { colors, fonts, fontSizes, radius } from '../theme';
import { formatTl } from '../utils/format';
import { Badge } from './Badge';
import { Card } from './Card';

// [YENİ] v3 — Takı Yatırımı (Parça & Set) kartı: bir ayar kademesindeki 4
// parçayı (Kolye/Yüzük/Küpe/Bileklik) tek tek gösterir; hepsi sahiplenilince
// Set Bonusu rozeti belirir.
export function JewelryTierCard({
  tier,
  pieces,
  positions,
  piecePricesTl,
  pieceDailyReturnsTl,
  hasSetBonus,
  cashTl,
  currentDay,
  locked,
  requiredLevel,
  onBuyPiece,
}: {
  tier: JewelryTierSpec;
  pieces: JewelryPieceSpec[];
  positions: Record<string, JewelryInvestmentPosition | null>;
  piecePricesTl: Record<string, number>;
  pieceDailyReturnsTl: Record<string, number>;
  hasSetBonus: boolean;
  cashTl: number;
  currentDay: number;
  locked?: boolean;
  requiredLevel?: number;
  onBuyPiece: (pieceId: string) => void;
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.name}>{tier.label}</Text>
        {hasSetBonus && <Badge tone="positive" label="Set Bonusu +%10" />}
      </View>
      {locked ? (
        <Text style={styles.meta}>Kilitli — Seviye {requiredLevel} gerekiyor</Text>
      ) : (
        <Text style={styles.meta}>30 gün · 4/4 set günlük gelire +%10</Text>
      )}
      <View style={styles.piecesRow}>
        {pieces.map((piece) => {
          const position = positions[piece.id];
          const owned = !!position && !position.principalRefunded;
          const priceTl = piecePricesTl[piece.id] ?? 0;
          const dailyReturnTl = pieceDailyReturnsTl[piece.id] ?? 0;
          const canAfford = priceTl <= cashTl;
          const daysLeft = position ? Math.max(0, position.maturityDay - currentDay) : 0;
          return (
            <Pressable
              key={piece.id}
              disabled={locked || owned || !canAfford}
              onPress={() => onBuyPiece(piece.id)}
              style={[
                styles.pieceButton,
                owned && styles.pieceButtonOwned,
                (locked || (!owned && !canAfford)) && styles.disabled,
              ]}
            >
              <Text style={[styles.pieceLabel, owned && styles.pieceLabelOwned]}>{piece.label}</Text>
              <Text style={[styles.pieceStatus, owned && styles.pieceLabelOwned]}>
                {owned ? `${daysLeft} gün · ${formatTl(position!.dailyIncomeTl)}/gün` : locked ? '—' : formatTl(priceTl)}
              </Text>
              <Text style={[styles.pieceStatus, owned && styles.pieceLabelOwned]}>
                {owned ? `Ana para ${formatTl(position!.principalTl)}` : locked ? 'Kilitli' : `${formatTl(dailyReturnTl)}/gün`}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 9,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    marginTop: 2,
  },
  piecesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 7,
  },
  pieceButton: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.surfaceSunken,
  },
  pieceButtonOwned: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  disabled: {
    opacity: 0.4,
  },
  pieceLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.ink,
  },
  pieceLabelOwned: {
    color: colors.accentDark,
  },
  pieceStatus: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.inkMuted,
    marginTop: 2,
  },
});
