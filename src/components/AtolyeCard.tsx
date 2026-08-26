import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSizes, radius } from '../theme';
import { formatTl } from '../utils/format';
import { Card } from './Card';

// Bölüm 17: Atölye — oyun hızından bağımsız, sürekli çalışan pasif has
// altın üretimi. Yükseltme parayla, anlamlı bir fırsat maliyeti kararı;
// kurulduktan sonra günlük yönetim istemez.
export function AtolyeCard({
  level,
  maxLevel,
  gramsPerDay,
  nextGramsPerDay,
  totalHasProduced,
  upgradeCostTl,
  canAfford,
  locked,
  requiredLevel,
  onUpgrade,
}: {
  level: number;
  maxLevel: number;
  gramsPerDay: number;
  nextGramsPerDay: number;
  totalHasProduced: number;
  upgradeCostTl: number | null;
  canAfford: boolean;
  /** v3: Seviye 7'den önce erişilemez — erken oyunda pasif gelire kaçışı engeller. */
  locked?: boolean;
  requiredLevel?: number;
  onUpgrade: () => void;
}) {
  const isMax = upgradeCostTl === null;
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>ATÖLYE</Text>
        <Text style={styles.level}>
          Sv.{level}/{maxLevel}
        </Text>
      </View>
      {locked ? (
        <Text style={styles.production}>ATÖLYE 🔒 · Seviye {requiredLevel}'de açılır</Text>
      ) : (
        <View style={styles.metrics}>
          <Row label="Günlük üretim" value={`${gramsPerDay.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}g HAS / gün`} />
          {!isMax && (
            <Row
              label="Sonraki seviye"
              value={`${nextGramsPerDay.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}g HAS / gün`}
            />
          )}
          <Row label="Toplam üretim" value={`${totalHasProduced.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}g HAS`} />
          {!isMax && <Row label="Yükseltme maliyeti" value={formatTl(upgradeCostTl!)} />}
        </View>
      )}
      <Pressable
        disabled={locked || isMax || !canAfford}
        onPress={onUpgrade}
        style={[styles.button, (locked || isMax || !canAfford) && styles.disabled]}
      >
        <Text style={styles.buttonLabel}>
          {locked
            ? `Kilitli — Sv.${requiredLevel}`
            : isMax
              ? 'Maksimum Seviye'
              : level === 0
                ? `KUR · ${formatTl(upgradeCostTl!)}`
                : `YÜKSELT · ${formatTl(upgradeCostTl!)}`}
        </Text>
      </Pressable>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
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
  title: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.inkMuted,
    letterSpacing: 1,
  },
  level: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  production: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.ink,
    marginTop: 4,
  },
  metrics: {
    marginTop: 6,
    gap: 3,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  metricLabel: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: colors.inkMuted,
  },
  metricValue: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.xs,
    color: colors.ink,
    textAlign: 'right',
    flexShrink: 1,
  },
  button: {
    marginTop: 7,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: 7,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.white,
  },
});
