import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CapitalState, GoldPriceState } from '../types/game';
import { colors, fonts, fontSizes, radius } from '../theme';
import { formatGram, formatPercent, formatTl } from '../utils/format';
import { Card } from './Card';

// Bölüm 2: Sermaye Gösterimi + Nakit/Stok/Borç Ayrımı.
// Ayrıca Toptancı Güveni: borcunu vadesinde ödemezsen düşer, düşerse
// toptancı artık kredi (borçla tamamlama) vermez.
export function CapitalSummary({
  capital,
  goldPrice,
  loanDueDay,
  currentDay,
  onRepayDebt,
}: {
  capital: CapitalState;
  goldPrice: GoldPriceState;
  loanDueDay: number | null;
  currentDay: number;
  onRepayDebt: () => void;
}) {
  // Kasadaki nakit anlık kurdan gram altına çevrilerek gösterilir — ayrı,
  // sabit bir "rezerv" yok, sermayenin tamamı bu tek rakamda.
  const cashInGrams = capital.cashTl / goldPrice.buyPricePerGram;
  const netWorth = capital.cashTl + capital.stockValueTl - capital.debtTl;
  const netWorthInGrams = netWorth / goldPrice.buyPricePerGram;
  const isUp = goldPrice.dailyChangePercent >= 0;
  const canRepay = capital.debtTl > 0 && capital.cashTl > 0;

  return (
    <Card>
      <Text style={styles.label}>SERMAYEN</Text>
      <View style={styles.headlineRow}>
        <Text style={styles.headline}>{formatGram(cashInGrams)} altın</Text>
        <Text style={styles.headlineApprox}>≈ {formatTl(capital.cashTl)}</Text>
      </View>
      <Text style={[styles.change, { color: isUp ? colors.positive : colors.negative }]}>
        {formatPercent(goldPrice.dailyChangePercent)} (bugün)
      </Text>

      <View style={styles.divider} />

      <Row label="Nakit (Kasa)" value={formatTl(capital.cashTl)} />
      <Row label="Stok değeri (has altın karşılığı)" value={formatTl(capital.stockValueTl)} />
      <Row label="Borç" value={formatTl(capital.debtTl)} valueColor={colors.negative} />

      {capital.debtTl > 0 && (
        <View style={styles.debtActionRow}>
          {loanDueDay !== null && (
            <Text style={styles.dueLabel}>
              Vade: Gün {loanDueDay} (bugün {currentDay})
            </Text>
          )}
          {canRepay && (
            <Pressable style={styles.repayButton} onPress={onRepayDebt}>
              <Text style={styles.repayButtonLabel}>Borcu Öde</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.divider} />
      <Row label="Net Servet" value={formatTl(netWorth)} bold />
      <Text style={styles.netWorthGrams}>≈ {formatGram(netWorthInGrams)} altın karşılığı</Text>
    </Card>
  );
}

function Row({
  label,
  value,
  bold,
  valueColor,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.rowLabelBold]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          bold && styles.rowValueBold,
          valueColor ? { color: valueColor } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.inkMuted,
    letterSpacing: 1,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  headline: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.ink,
  },
  headlineApprox: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.md,
    color: colors.inkMuted,
  },
  change: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  rowLabel: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.inkMuted,
  },
  rowLabelBold: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
  },
  rowValue: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  rowValueBold: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.md,
  },
  netWorthGrams: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    color: colors.inkMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  debtActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  dueLabel: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: colors.inkMuted,
  },
  repayButton: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  repayButtonLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.white,
  },
});
