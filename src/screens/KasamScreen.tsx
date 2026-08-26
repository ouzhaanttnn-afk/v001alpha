import { useRoute, type RouteProp } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MainTabsParamList, StokScrollTarget } from '../navigation/types';
import { ActionToast, type ActionToastState } from '../components/ActionToast';
import { AtolyeCard } from '../components/AtolyeCard';
import { Card } from '../components/Card';
import { CraftedGoodCard } from '../components/CraftedGoodCard';
import { JewelryTierCard } from '../components/JewelryTierCard';
import { MeltingJobBanner } from '../components/MeltingJobBanner';
import { SectionLabel } from '../components/SectionLabel';
import { StockCard } from '../components/StockCard';
import { WholesalerSellPanel, type WholesalerSellSelection } from '../components/WholesalerSellPanel';
import {
  JEWELRY_REQUIRED_LEVEL,
  JEWELRY_TIER_REQUIRED_LEVELS,
  LOW_CASH_WARNING_THRESHOLD_TL,
  MINUTES_PER_DAY,
  WORKSHOP_CONFIG,
  XP_BONUS_DEAL_COMPLETED,
  XP_BONUS_PROFITABLE_SALE,
  XP_PER_EQUIVALENT_GRAM_TRADED,
} from '../config/economyConfig';
import { XpToast } from '../components/XpToast';
import { JEWELRY_PIECES, JEWELRY_TIERS } from '../data/jewelryInvestments';
import { computeJewelryPieceDailyReturnTl, computeJewelryPiecePriceTl, holdingKey, isJewelrySetComplete } from '../engine/jewelry';
import { isWholesalerSellableInventoryItem } from '../engine/pricing';
import { toptanciStock } from '../data/toptanciStock';
import { currentPositionValueTl, equivalentGrams, useGameStore, workshopDailyHasOutput, workshopUpgradeCostTl } from '../store/useGameStore';
import { colors, fonts, fontSizes } from '../theme';
import { formatTl } from '../utils/format';

const BANNER_VISIBLE_MS = 4000;

// Bölüm 2/GDD: sarrafiye stoğu (gram/çeyrek altın + 22 ayar bilezik + HAS)
// tek tip ağırlıklı ortalama maliyetle takip edilir — hepsi güncel kurdan
// mark-to-market değerlenip Stok ekranından toptancıya satılabilir.
export function KasamScreen() {
  const { width } = useWindowDimensions();
  const inventory = useGameStore((s) => s.inventory);
  const goldPrice = useGameStore((s) => s.goldPrice);
  const sellInvestmentUnits = useGameStore((s) => s.sellInvestmentUnits);
  const realizedTradingProfitTl = useGameStore((s) => s.realizedTradingProfitTl);
  const meltingJob = useGameStore((s) => s.meltingJob);
  const meltCraftedGood = useGameStore((s) => s.meltCraftedGood);
  const day = useGameStore((s) => s.day);
  const minuteOfDay = useGameStore((s) => s.minuteOfDay);
  const cashTl = useGameStore((s) => s.capital.cashTl);
  const debtTl = useGameStore((s) => s.capital.debtTl);
  const loanDueDay = useGameStore((s) => s.loanDueDay);
  const repayDebt = useGameStore((s) => s.repayDebt);
  const workshop = useGameStore((s) => s.workshop);
  const upgradeAtolye = useGameStore((s) => s.upgradeAtolye);
  const jewelryHoldings = useGameStore((s) => s.jewelryHoldings);
  const buyJewelryPiece = useGameStore((s) => s.buyJewelryPiece);
  const level = useGameStore((s) => s.level);
  const wholesalerBuyMarginTlPerGram = useGameStore((s) => s.wholesalerBuyMarginTlPerGram);
  const buyInvestmentUnits = useGameStore((s) => s.buyInvestmentUnits);
  const grantBonusXp = useGameStore((s) => s.grantBonusXp);

  const [actionToast, setActionToast] = useState<ActionToastState | null>(null);
  const actionToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [xpToast, setXpToast] = useState<{ amount: number; reason: string } | null>(null);
  // Bölüm 4: "Beklet" — satmayı erteleme kararını görünür kılan hafif bir
  // onay; hiçbir state'i değiştirmiyor, sadece kararın alındığını teyit ediyor.
  const [holdHintItemId, setHoldHintItemId] = useState<string | null>(null);
  const [craftedFeedback, setCraftedFeedback] = useState<string | null>(null);
  const holdHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const craftedFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showActionToast = (toast: ActionToastState) => {
    setActionToast(toast);
    if (actionToastTimer.current) clearTimeout(actionToastTimer.current);
    actionToastTimer.current = setTimeout(() => setActionToast(null), BANNER_VISIBLE_MS);
  };
  const showCraftedFeedback = (message: string) => {
    setCraftedFeedback(message);
    if (craftedFeedbackTimer.current) clearTimeout(craftedFeedbackTimer.current);
    craftedFeedbackTimer.current = setTimeout(() => setCraftedFeedback(null), 2600);
  };
  const handleHold = (itemId: string) => {
    setHoldHintItemId(itemId);
    if (holdHintTimer.current) clearTimeout(holdHintTimer.current);
    holdHintTimer.current = setTimeout(() => setHoldHintItemId(null), 1800);
  };
  const handleMeltCraftedGood = (itemId: string) => {
    const item = inventory.find((inventoryItem) => inventoryItem.id === itemId);
    if (!item) return;
    if (meltCraftedGood(itemId)) {
      showCraftedFeedback(`${item.name} eritiliyor · işçilik değeri kaybedilecek.`);
    }
  };

  useEffect(
    () => () => {
      if (actionToastTimer.current) clearTimeout(actionToastTimer.current);
      if (holdHintTimer.current) clearTimeout(holdHintTimer.current);
      if (craftedFeedbackTimer.current) clearTimeout(craftedFeedbackTimer.current);
    },
    [],
  );

  // Hızlı Erişim (Dükkân): ilgili bölüme kaydırmalı geçiş için Y konumları.
  // Stok ekranı ilk kez mount olduğunda onLayout ölçümleri scrollTo efektinden
  // sonra gelebilir — bu yüzden her yeni ölçümde layoutTick artırılıp efekt
  // tekrar denenir.
  const scrollViewRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Partial<Record<StokScrollTarget, number>>>({});
  const [layoutTick, setLayoutTick] = useState(0);
  const recordSectionOffset = (target: StokScrollTarget, y: number) => {
    sectionOffsets.current[target] = y;
    setLayoutTick((v) => v + 1);
  };
  const route = useRoute<RouteProp<MainTabsParamList, 'Stok'>>();
  const scrollTo = route.params?.scrollTo;
  useEffect(() => {
    if (!scrollTo) return;
    const y = sectionOffsets.current[scrollTo];
    if (y !== undefined) {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  }, [scrollTo, layoutTick]);

  const sarrafiyeItems = inventory.filter(isWholesalerSellableInventoryItem);
  const sarrafiyeCurrentValueTl = sarrafiyeItems.reduce(
    (sum, item) => sum + currentPositionValueTl(item, goldPrice.buyPricePerGram),
    0,
  );
  const sarrafiyeCostBasisTl = sarrafiyeItems.reduce((sum, item) => sum + item.costBasisTl, 0);
  const unrealizedTradingProfitTl = sarrafiyeCurrentValueTl - sarrafiyeCostBasisTl;
  const craftedGoodItems = inventory.filter((item) => item.category === 'iscilikli');
  const meltingMinutesLeft = meltingJob
    ? meltingJob.completesAtTotalMinutes - (day * MINUTES_PER_DAY + minuteOfDay)
    : 0;
  const atolyeLocked = level < WORKSHOP_CONFIG.requiredLevel;
  const atolyeUpgradeCostTl = workshopUpgradeCostTl(workshop.level, goldPrice.buyPricePerGram);
  const jewelryLocked = level < JEWELRY_REQUIRED_LEVEL;
  const wideStockLayout = width >= 720;

  const handleSellSelections = (selections: WholesalerSellSelection[]) => {
    let totalSaleValueTl = 0;
    let totalProfitTl = 0;
    let totalBaseXp = 0;
    selections.forEach((selection) => {
      const item = inventory.find((inventoryItem) => inventoryItem.id === selection.itemId);
      if (!item) return;
      const result = sellInvestmentUnits(selection.itemId, selection.quantity);
      if (!result) return;
      totalSaleValueTl += result.saleValueTl;
      totalProfitTl += result.profitTl;
      totalBaseXp += equivalentGrams(item.grams, item.karat) * result.quantity * XP_PER_EQUIVALENT_GRAM_TRADED;
    });
    if (totalSaleValueTl <= 0) return;

    showActionToast({
      tone: 'success',
      message: `✓ Toptancıya satış tamamlandı · +${formatTl(totalSaleValueTl)}`,
    });
    const bonus =
      totalProfitTl > 0
        ? { amount: XP_BONUS_PROFITABLE_SALE, reason: 'Kârlı toptancı satışı' }
        : { amount: XP_BONUS_DEAL_COMPLETED, reason: 'Toptancı satışı tamamlandı' };
    grantBonusXp(bonus.amount);
    setXpToast({ amount: totalBaseXp + bonus.amount, reason: bonus.reason });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Stok</Text>

        <Card>
          <View style={styles.cashDebtHeader}>
            <View>
              <Text style={styles.summaryLabel}>Nakit</Text>
              <Text style={[styles.cashValue, cashTl < LOW_CASH_WARNING_THRESHOLD_TL && styles.warningText]}>
                {formatTl(cashTl)}
              </Text>
            </View>
            <View style={styles.debtBlock}>
              <Text style={styles.summaryLabel}>Borç</Text>
              <Text style={[styles.cashValue, debtTl > 0 && styles.debtText]}>{formatTl(debtTl)}</Text>
            </View>
          </View>
          {debtTl > 0 && (
            <View style={styles.debtActionRow}>
              <Text style={styles.summaryHintMuted}>
                {loanDueDay !== null ? `Vade: Gün ${loanDueDay}` : 'Vade yok'} · ödeme nakitten düşer.
              </Text>
              <Pressable
                disabled={cashTl <= 0}
                style={[styles.debtPayButton, cashTl <= 0 && styles.disabledButton]}
                onPress={() => repayDebt(debtTl)}
              >
                <Text style={styles.debtPayButtonLabel}>Öde</Text>
              </Pressable>
            </View>
          )}
        </Card>

        <SectionLabel>TOPTANCIDAN STOK AL</SectionLabel>
        {toptanciStock.map((spec) => {
          const ownedItem = inventory.find(
            (item) =>
              item.category === spec.category &&
              item.name === spec.name &&
              item.karat === spec.karat &&
              item.grams === spec.grams,
          );
          return (
            <StockCard
              key={spec.id}
              spec={spec}
              goldPrice={goldPrice}
              wholesalerBuyMarginTlPerGram={wholesalerBuyMarginTlPerGram}
              cashTl={cashTl}
              ownedItem={ownedItem}
              onBuy={(quantity) => buyInvestmentUnits(spec, quantity)}
            />
          );
        })}

        <ActionToast toast={actionToast} />
        {xpToast && (
          <XpToast amount={xpToast.amount} reason={xpToast.reason} onDone={() => setXpToast(null)} />
        )}

        <SectionLabel>SARRAFİYE STOĞUN</SectionLabel>
        <View style={[styles.stockActionLayout, wideStockLayout && styles.stockActionLayoutWide]}>
          <Card style={[styles.stockSummaryCard, wideStockLayout && styles.stockSummaryCardWide]}>
            <Text style={styles.summaryLabel}>Toplam Alım-Satım Kârı</Text>
            <Text
              style={[
                styles.summaryValue,
                { color: realizedTradingProfitTl >= 0 ? colors.positive : colors.negative },
              ]}
            >
              {realizedTradingProfitTl >= 0 ? '+' : ''}
              {formatTl(realizedTradingProfitTl)}
            </Text>
            <Text style={styles.summaryHintMuted}>Alış ve satış fiyatın arasındaki makastan gelir.</Text>
            <View style={styles.divider} />
            <Text style={styles.summaryLabel}>Stok Potansiyeli</Text>
            <Text
              style={[
                styles.summaryValueSmall,
                { color: unrealizedTradingProfitTl >= 0 ? colors.positive : colors.negative },
              ]}
            >
              {unrealizedTradingProfitTl >= 0 ? '+' : ''}
              {formatTl(unrealizedTradingProfitTl)}
            </Text>
            <Text style={styles.summaryHintMuted}>
              Henüz gerçekleşmedi · stok satılırsa nakde döner.
            </Text>
          </Card>

          <View style={styles.stockSellColumn}>
            <WholesalerSellPanel
              items={sarrafiyeItems}
              buyPricePerGram={goldPrice.buyPricePerGram}
              onSellSelected={handleSellSelections}
            />
          </View>
        </View>

        <View
          style={styles.sectionAnchor}
          onLayout={(e) => recordSectionOffset('iscilikli', e.nativeEvent.layout.y)}
        >
          <SectionLabel>İŞÇİLİKLİ ÜRÜNLER</SectionLabel>
          <Text style={styles.emptyHint}>
            Müşteriden gelen kolye/yüzük/küpe gibi parçalar. Beklet veya milyem hesabıyla erit;
            işçilik değeri has altına eklenmez.
          </Text>
          {craftedFeedback && <Text style={styles.craftedFeedback}>{craftedFeedback}</Text>}
          {meltingJob && <MeltingJobBanner job={meltingJob} minutesLeft={meltingMinutesLeft} />}
          {craftedGoodItems.length === 0 ? (
            <Text style={styles.emptyHint}>Elinde henüz eritilecek işçilikli ürün yok.</Text>
          ) : (
            craftedGoodItems.map((item) => (
              <CraftedGoodCard
                key={item.id}
                item={item}
                buyPricePerGram={goldPrice.buyPricePerGram}
                meltDisabled={meltingJob !== null}
                holdActive={holdHintItemId === item.id}
                onHold={() => handleHold(item.id)}
                onMelt={() => handleMeltCraftedGood(item.id)}
              />
            ))
          )}
        </View>

        <View
          style={styles.sectionAnchor}
          onLayout={(e) => recordSectionOffset('atolye', e.nativeEvent.layout.y)}
        >
          <SectionLabel>ATÖLYE</SectionLabel>
          <AtolyeCard
            level={workshop.level}
            maxLevel={WORKSHOP_CONFIG.maxLevel}
            gramsPerDay={workshopDailyHasOutput(workshop.level)}
            nextGramsPerDay={workshopDailyHasOutput(workshop.level + 1)}
            totalHasProduced={workshop.totalHasProduced}
            upgradeCostTl={atolyeUpgradeCostTl}
            canAfford={atolyeUpgradeCostTl !== null && atolyeUpgradeCostTl <= cashTl}
            locked={atolyeLocked}
            requiredLevel={WORKSHOP_CONFIG.requiredLevel}
            onUpgrade={upgradeAtolye}
          />
        </View>

        <View
          style={styles.sectionAnchor}
          onLayout={(e) => recordSectionOffset('yatirimlar', e.nativeEvent.layout.y)}
        >
          <SectionLabel>TAKI YATIRIMI</SectionLabel>
          <Text style={styles.emptyHint}>
            30 oyun günü sermaye bağla, günlük TL getirisi al. Vade sonunda ana para tam olarak geri döner.
            Aynı ayardaki 4 parça birlikte aktifse yalnızca o setin günlük getirisine +%10 eklenir.
          </Text>
          {JEWELRY_TIERS.map((tier) => {
            const requiredLevel = JEWELRY_TIER_REQUIRED_LEVELS[tier.id] ?? JEWELRY_REQUIRED_LEVEL;
            const tierLocked = level < requiredLevel;
            return (
              <JewelryTierCard
                key={tier.id}
                tier={tier}
                pieces={JEWELRY_PIECES}
                positions={Object.fromEntries(
                  JEWELRY_PIECES.map((p) => [p.id, jewelryHoldings[holdingKey(tier.id, p.id)] ?? null]),
                )}
                piecePricesTl={Object.fromEntries(
                  JEWELRY_PIECES.map((p) => [p.id, computeJewelryPiecePriceTl(tier.id, goldPrice.buyPricePerGram, p.id)]),
                )}
                pieceDailyReturnsTl={Object.fromEntries(
                  JEWELRY_PIECES.map((p) => [p.id, computeJewelryPieceDailyReturnTl(tier.id, goldPrice.buyPricePerGram, p.id)]),
                )}
                hasSetBonus={isJewelrySetComplete(jewelryHoldings, tier.id)}
                cashTl={cashTl}
                currentDay={day}
                locked={jewelryLocked || tierLocked}
                requiredLevel={requiredLevel}
                onBuyPiece={(pieceId) => buyJewelryPiece(tier.id, pieceId as (typeof JEWELRY_PIECES)[number]['id'])}
              />
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 12,
    gap: 10,
  },
  // Hızlı Erişim'in kaydırdığı bölümleri saran view — dıştaki ScrollView
  // içeriğinin gap'ini kendi içinde de koruması için aynı gap tekrarlanır.
  sectionAnchor: {
    gap: 10,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.inkOnDark,
  },
  summaryLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.inkMuted,
    letterSpacing: 1,
  },
  summaryValue: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.xl,
    color: colors.ink,
    marginTop: 4,
  },
  summaryHintMuted: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.inkMuted,
    marginTop: 4,
  },
  emptyHint: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.inkMutedOnDark,
  },
  holdHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkMutedOnDark,
    marginTop: 6,
    textAlign: 'center',
  },
  summaryValueSmall: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.lg,
    color: colors.ink,
    marginTop: 4,
  },
  stockActionLayout: {
    gap: 10,
  },
  stockActionLayoutWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stockSummaryCard: {
    width: '100%',
  },
  stockSummaryCardWide: {
    flex: 1,
    maxWidth: '50%',
  },
  stockSellColumn: {
    flex: 1,
    minWidth: 0,
  },
  cashDebtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  cashValue: {
    fontFamily: fonts.monoBold,
    fontSize: fontSizes.lg,
    color: colors.ink,
    marginTop: 2,
  },
  debtBlock: {
    alignItems: 'flex-end',
  },
  debtText: {
    color: colors.negative,
  },
  warningText: {
    color: colors.warning,
  },
  debtActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  debtPayButton: {
    backgroundColor: colors.ink,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  disabledButton: {
    opacity: 0.45,
  },
  debtPayButtonLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.white,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 7,
  },
  craftedFeedback: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.accent,
    textAlign: 'center',
  },
});
