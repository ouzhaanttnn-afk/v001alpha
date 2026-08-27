import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../components/Card';
import { MihenkaynakLogo } from '../components/MihenkaynakBrand';
import { ProfitAnalysisCard } from '../components/ProfitAnalysisCard';
import { ShopNameHeader } from '../components/ShopNameHeader';
import { currentPositionValueTl, useGameStore } from '../store/useGameStore';
import { colors, fonts, fontSizes, radius } from '../theme';

// Profil artık HUD bilgilerini tekrar etmez. Bu ekran oyuncu/dükkân adı,
// gerçekleşen alım-satım kâr analizi ve ileride açılacak Market temelidir.
export function ProfilScreen() {
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const shopName = useGameStore((s) => s.shopName);
  const setShopName = useGameStore((s) => s.setShopName);
  const realizedTradingProfitTl = useGameStore((s) => s.realizedTradingProfitTl);
  const totalTradingCostBasisTl = useGameStore((s) => s.totalTradingCostBasisTl);
  const inventory = useGameStore((s) => s.inventory);
  const goldPrice = useGameStore((s) => s.goldPrice);
  const resetGame = useGameStore((s) => s.resetGame);

  const stockPotentialTl = useMemo(
    () =>
      inventory.reduce((sum, item) => {
        if (item.category === 'iscilikli') return sum;
        return sum + (currentPositionValueTl(item, goldPrice.buyPricePerGram) - item.costBasisTl);
      }, 0),
    [inventory, goldPrice.buyPricePerGram],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <MihenkaynakLogo width={132} height={48} />
          <Text style={styles.title}>Profil</Text>
        </View>

        <Card style={styles.identityCard}>
          <Field label="OYUNCU" value={playerName} onChange={setPlayerName} />
          <View style={styles.fieldDivider} />
          <Field label="KUYUMCU" value={shopName} onChange={setShopName} />
        </Card>

        <ProfitAnalysisCard
          title="ALIM-SATIM KÂR ANALİZİ"
          costLabel="Satılan Stoğun Maliyeti"
          profitLabel="Gerçekleşen Kâr"
          costTl={totalTradingCostBasisTl}
          profitTl={realizedTradingProfitTl}
          showSaleValue
          tip="Gerçekleşen kâr sadece satılan stoktan hesaplanır; eldeki stok nakit değildir."
          secondary={{
            label: 'Stok Potansiyeli',
            valueTl: stockPotentialTl,
            caption: 'Satılmamış likit stoğun bugünkü kurla olası kâr/zararı.',
          }}
        />

        <Card style={styles.marketCard}>
          <View>
            <Text style={styles.marketTitle}>MARKET</Text>
            <Text style={styles.marketHint}>Lüks, prestij ve kozmetik alanı için temel hazır. Gerçek ödeme yok.</Text>
          </View>
          <View style={styles.marketGrid}>
            {['Lüks Vitrin', 'Prestij Paketi', 'Özel Tema'].map((item) => (
              <View key={item} style={styles.marketChip}>
                <Text style={styles.marketChipTitle}>{item}</Text>
                <Text style={styles.marketChipStatus}>Yakında</Text>
              </View>
            ))}
          </View>
        </Card>

        <Pressable
          style={styles.resetButton}
          onPress={() =>
            Alert.alert('Oyunu sıfırla', 'Mevcut oyun ilerlemesi silinecek. Emin misin?', [
              { text: 'İPTAL', style: 'cancel' },
              { text: 'SIFIRLA', style: 'destructive', onPress: resetGame },
            ])
          }
        >
          <Text style={styles.resetButtonLabel}>OYUNU SIFIRLA</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ShopNameHeader name={value} onChange={onChange} onDark={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.inkOnDark,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 2,
  },
  identityCard: {
    gap: 8,
  },
  field: {
    gap: 3,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.inkMuted,
    letterSpacing: 1,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  marketCard: {
    gap: 10,
  },
  marketTitle: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.ink,
  },
  marketHint: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: colors.inkMuted,
    marginTop: 2,
  },
  marketGrid: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  marketChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 7,
    paddingHorizontal: 9,
    minWidth: 96,
    backgroundColor: colors.surfaceSunken,
  },
  marketChipTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.ink,
  },
  marketChipStatus: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.inkMuted,
    marginTop: 1,
  },
  resetButton: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    opacity: 0.75,
  },
  resetButtonLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.inkMutedOnDark,
    letterSpacing: 0.8,
  },
});
