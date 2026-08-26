import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActiveOfferSummary, type ActiveOffer } from '../components/ActiveOfferSummary';
import { BellIcon } from '../components/icons/BellIcon';
import { MetalRing, RadialOrb } from '../components/icons/MetalRing';
import { BankShortcutIcon, GemShortcutIcon, HammerShortcutIcon } from '../components/icons/ShortcutIcons';
import { ShieldBadge } from '../components/icons/ShieldBadge';
import { glass } from '../theme/glass';
import { BrokerDealBanner } from '../components/BrokerDealBanner';
import { CapitalSummary } from '../components/CapitalSummary';
import { CustomerHypeCard } from '../components/CustomerHypeCard';
import { FourXUnlockCard } from '../components/FourXUnlockCard';
import { GoldTicker } from '../components/GoldTicker';
import { NegotiationPanel } from '../components/NegotiationPanel';
import { OFFER_STATUS_LABEL } from '../components/OfferCard';
import { SectionLabel } from '../components/SectionLabel';
import { StokOzetiCard } from '../components/StokOzetiCard';
import type { MainTabsParamList, RootStackParamList } from '../navigation/types';
import type { ClockSpeed } from '../store/useGameStore';
import { MINUTES_PER_DAY, useGameStore, workshopDailyHasOutput, xpRequiredForLevel } from '../store/useGameStore';
import { colors, fonts, fontSizes } from '../theme';
import { formatGameTime, formatTl } from '../utils/format';

// [DÜZELTME] "Müşteriler" artık bir sekme değil, üst stack'e (RootNavigator)
// ait bir modal — header'daki zile basınca oraya gitmek için sekme
// navigasyonu + üst stack navigasyonunu birleştiren bir composite tip gerekiyor.
type DukkanNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabsParamList, 'Dükkân'>,
  NativeStackNavigationProp<RootStackParamList>
>;

// [DÜZELTME] Premium mor+altın referans tasarımına taşındı — hero artık
// krem/fildişi değil, ince altın çerçeveli koyu mor "cam" bir panel.
// KASITLI OLARAK sadece bu ekrana özel, yerel bir palet: Stok/Yetenekler/
// Profil/Müşteriler ekranlarının mevcut theme/colors.ts kimliği (dış zemin
// hariç — bkz. colors.background) DEĞİŞTİRİLMEDİ.
const lux = {
  panelBg: 'rgba(58, 32, 91, 0.9)',
  panelBgSoft: 'rgba(154, 69, 232, 0.08)',
  glass: 'rgba(154, 69, 232, 0.14)',
  glassStrong: 'rgba(154, 69, 232, 0.24)',
  gold: '#E3B83F',
  goldBright: '#F0C95A',
  goldDeep: '#A9761E',
  purple: '#812ED0',
  purpleBright: '#9A45E8',
  ink: '#F4ECFF',
  inkMuted: '#C8B8D9',
};

// Mockup birleşimi: Dükkân artık sadece sermaye/gün özeti değil — gelen
// müşteriyle pazarlık (NegotiationPanel) doğrudan burada, ayrı bir modal
// ekrana gitmeden yürüyor (bkz. Bölüm 4.1-4.3, artık tek ekranda).
export function DukkanScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<DukkanNavigationProp>();
  const playerName = useGameStore((s) => s.playerName);
  const shopName = useGameStore((s) => s.shopName);
  const capital = useGameStore((s) => s.capital);
  const goldPrice = useGameStore((s) => s.goldPrice);
  const reputation = useGameStore((s) => s.reputation);
  const inventory = useGameStore((s) => s.inventory);
  const day = useGameStore((s) => s.day);
  const minuteOfDay = useGameStore((s) => s.minuteOfDay);
  const speed = useGameStore((s) => s.speed);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const level = useGameStore((s) => s.level);
  const totalXp = useGameStore((s) => s.totalXp);
  const wholesalerTrust = useGameStore((s) => s.wholesalerTrust);
  const loanDueDay = useGameStore((s) => s.loanDueDay);
  const repayDebt = useGameStore((s) => s.repayDebt);
  const offers = useGameStore((s) => s.offers);
  const brokerDeal = useGameStore((s) => s.brokerDeal);
  const resolveBrokerDeal = useGameStore((s) => s.resolveBrokerDeal);
  const fourXUnlockedUntilMs = useGameStore((s) => s.fourXUnlockedUntilMs);
  const fourXUnlimited = useGameStore((s) => s.fourXUnlimited);
  const unlockFourXViaAd = useGameStore((s) => s.unlockFourXViaAd);
  const purchaseFourXUnlimited = useGameStore((s) => s.purchaseFourXUnlimited);
  const customerRushUsedDay = useGameStore((s) => s.customerRushUsedDay);
  const watchAdForCustomerHype = useGameStore((s) => s.watchAdForCustomerHype);
  const incomingCustomer = useGameStore((s) => s.incomingCustomer);
  const waitingCustomers = useGameStore((s) => s.waitingCustomers);
  const callNextCustomerToCounter = useGameStore((s) => s.callNextCustomerToCounter);
  const dismissActiveCustomer = useGameStore((s) => s.dismissActiveCustomer);
  const workshop = useGameStore((s) => s.workshop);
  const jewelryHoldings = useGameStore((s) => s.jewelryHoldings);
  const hasCompletedTutorial = useGameStore((s) => s.hasCompletedTutorial);
  const firstSessionHintsDismissed = useGameStore((s) => s.firstSessionHintsDismissed);
  const completeTutorial = useGameStore((s) => s.completeTutorial);
  const dismissFirstSessionHint = useGameStore((s) => s.dismissFirstSessionHint);

  const currentTotalMinutes = day * MINUTES_PER_DAY + minuteOfDay;
  const brokerMinutesLeft = brokerDeal ? brokerDeal.expiresAtTotalMinutes - currentTotalMinutes : 0;

  const xpForCurrentLevel = xpRequiredForLevel(level);
  const xpForNextLevel = xpRequiredForLevel(level + 1);
  const xpProgress = Math.max(
    0,
    Math.min(1, (totalXp - xpForCurrentLevel) / Math.max(1, xpForNextLevel - xpForCurrentLevel)),
  );

  // Bölüm 22: 4x'in reklamla açılan penceresi GERÇEK DÜNYA süresiyle
  // ölçülür (oyun saatiyle değil) — canlı geri sayım için ayrı, saniyede
  // bir tetiklenen bir saat gerekiyor.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const fourXUnlocked = fourXUnlimited || (fourXUnlockedUntilMs !== null && fourXUnlockedUntilMs > nowMs);
  const fourXMinutesLeft =
    !fourXUnlimited && fourXUnlockedUntilMs !== null ? Math.max(0, (fourXUnlockedUntilMs - nowMs) / 60000) : 0;

  const customerHypeActive = customerRushUsedDay === day;
  const summaryRowWide = width >= 720;

  const [showFourXOffer, setShowFourXOffer] = useState(false);
  const handleSpeedChange = (nextSpeed: ClockSpeed) => {
    const applied = setSpeed(nextSpeed);
    setShowFourXOffer(nextSpeed === 4 && !applied);
  };

  // En son gönderilen bekleyen teklif öncelikli gösterilir; bekleyen yoksa
  // en son sonuçlanan teklif gösterilir (offers dizisi en yeniden en eskiye sıralı).
  const activeOffer: ActiveOffer | null = useMemo(() => {
    const source = offers.find((offer) => offer.status === 'bekleyen') ?? offers[0] ?? null;
    if (!source) return null;
    return {
      customerName: source.customerName,
      productName: `${source.productName} — ${source.karat} Ayar`,
      offerAmountTl: source.offerAmountTl,
      status: OFFER_STATUS_LABEL[source.status],
    };
  }, [offers]);

  const canCallNext = !incomingCustomer && waitingCustomers.length > 0;
  // [YENİ] Header zili — Müşteriler artık sekme değil, buradan açılan bir
  // modal. Badge, TekliflerScreen'in kendi tanımladığı "bekleyen" sayısıyla
  // birebir aynı metriği kullanıyor (offers, status:'bekleyen').
  const pendingCustomerCount = useMemo(
    () => offers.filter((offer) => offer.status === 'bekleyen').length,
    [offers],
  );
  const activeJewelryCount = Object.values(jewelryHoldings).filter((position) => !position.principalRefunded).length;
  const firstSessionHint = useMemo(() => {
    if (hasCompletedTutorial) return null;
    if (incomingCustomer) return null;
    if (waitingCustomers.length > 0 && !firstSessionHintsDismissed.firstCustomer) {
      return { id: 'firstCustomer', text: 'Müşteriyi ağırlayarak ürünü incele.' };
    }
    if (speed === 1 && waitingCustomers.length === 0 && !firstSessionHintsDismissed.noCustomer) {
      return { id: 'noCustomer', text: 'Yeni müşteri bekleniyor. Zamanı hızlandırabilirsin.' };
    }
    return null;
  }, [firstSessionHintsDismissed, hasCompletedTutorial, incomingCustomer, speed, waitingCustomers.length]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* ================= HERO — referans tasarım ================= */}
        <View style={styles.hero}>
          <Text style={styles.playtestBadge}>v0.2 PLAYTEST</Text>
          {/* Üst bar: avatar halkası + kalkan rozeti + XP çubuğu + bakiye + zil —
              referans tasarımın (cepkaynak-referans-ekran3.html) `.topbar` bloğu
              birebir: camsı/bulanık zemin, metalik altın halkalar, Cinzel/
              JetBrains Mono fontlar. */}
          <BlurView intensity={40} tint="dark" style={styles.topBar}>
            <View style={styles.topBarTint} pointerEvents="none" />
            <View style={styles.avatarRing}>
              <MetalRing size={46} strokeWidth={4} />
              <View style={styles.avatarInner}>
                <RadialOrb size={38} colorStart="#5A2E86" colorEnd="#2A1140" />
                <Text style={styles.avatarLetter}>
                  {(playerName || shopName).trim().charAt(0).toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.levelGroup}>
              <ShieldBadge level={level} width={21} height={26} />
              <View style={styles.xp}>
                <View style={styles.xpTrack}>
                  <View style={[styles.xpFill, { width: `${Math.round(xpProgress * 100)}%` }]} />
                </View>
                <Text style={styles.xpLabel} numberOfLines={1}>
                  SEVİYE {level} · {totalXp.toLocaleString('tr-TR')} XP
                </Text>
              </View>
            </View>
            <BlurView intensity={25} tint="dark" style={styles.balancePill}>
              <View style={styles.balancePillTint} pointerEvents="none" />
              <Text style={styles.balanceText} numberOfLines={1}>
                {formatTl(capital.cashTl)}
              </Text>
            </BlurView>
            <Pressable
              onPress={() => navigation.navigate('Müşteriler')}
              style={styles.bellBtn}
              hitSlop={8}
            >
              <MetalRing size={38} strokeWidth={4} />
              <View style={styles.bellInner}>
                <RadialOrb size={32} colorStart="#4B2472" colorEnd="#25103A" />
                {/* [DÜZELTME] react-native-svg'nin ham <Svg>'i (View/Text'in
                    aksine) web'de RN'in position:relative reset'ini almıyor —
                    bu yüzden mutlak konumlu RadialOrb'un ALTINDA çiziliyordu.
                    zIndex'li bir View'a sarmak paint sırasını düzeltiyor. */}
                <View style={styles.bellIconWrap}>
                  <BellIcon color={glass.refGold2} size={15} />
                </View>
              </View>
              {pendingCustomerCount > 0 && (
                <View style={styles.hudBellBadge}>
                  <Text style={styles.hudBellBadgeLabel}>
                    {pendingCustomerCount > 9 ? '9+' : pendingCustomerCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </BlurView>

          {/* [DÜZELTME] Hız kontrolü artık ana içerik gibi büyük bir alan
              kaplamıyor — üst HUD'a ait, tek satırlık, küçük bir kontrol.
              Zil artık üst profil çubuğuna taşındı (bkz. topBar). */}
          <View style={styles.hudControlRow}>
            <View style={styles.hudSpeedLeftGroup}>
              <Pressable
                onPress={() => handleSpeedChange(speed === 0 ? 1 : 0)}
                style={styles.hudPauseBtn}
                hitSlop={8}
              >
                <Text style={styles.hudPauseLabel}>{speed === 0 ? '▶' : 'II'}</Text>
              </Pressable>
              <View style={styles.hudSpeedCluster}>
                <Pressable
                  onPress={() => handleSpeedChange(1)}
                  style={[styles.hudSpeedBtn, speed === 1 && styles.hudSpeedBtnActive]}
                >
                  <Text style={[styles.hudSpeedLabel, speed === 1 && styles.hudSpeedLabelActive]}>1x</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSpeedChange(2)}
                  style={[styles.hudSpeedBtn, speed === 2 && styles.hudSpeedBtnActive]}
                >
                  <Text style={[styles.hudSpeedLabel, speed === 2 && styles.hudSpeedLabelActive]}>2x</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSpeedChange(4)}
                  style={[styles.hudSpeedBtn, speed === 4 && styles.hudSpeedBtnActive]}
                >
                  <Text style={[styles.hudSpeedLabel, speed === 4 && styles.hudSpeedLabelActive]}>
                    4x{!fourXUnlocked ? '🔒' : ''}
                  </Text>
                </Pressable>
              </View>
              {fourXMinutesLeft > 0 && (
                <Text style={styles.fourXCountdown}>4x: {Math.ceil(fourXMinutesLeft)} dk</Text>
              )}
            </View>
            <View style={styles.reputationRow}>
              <HudStatChip label="KARİZMA" value={`${reputation.score}/100`} size="inline" />
              <HudStatChip label="TOPTANCI GÜVENİ" value={`${wholesalerTrust}/100`} size="inline" />
            </View>
          </View>

          {/* Piyasa/Stok/Servet/Borç mobil ekrana dört eşit, taşmayan hücre
              halinde sığar; yatay kaydırma müşteri akışına gerekmez. */}
          <View style={styles.hudStatsRow}>
            <HudStatChip label="PİYASA" value={formatTl(goldPrice.buyPricePerGram)} />
            <HudStatChip label="STOK" value={formatTl(capital.stockValueTl)} />
            <HudStatChip label="SERVET" value={formatTl(capital.cashTl + capital.stockValueTl - capital.debtTl)} />
            <HudStatChip label="BORÇ" value={formatTl(capital.debtTl)} warn={capital.debtTl > 0} />
          </View>

          {/* [DÜZELTME] Kaba dev daire buton yerine şık, yatay hap (pill) buton —
              parlama artık arkaya çizilen bir şekilden değil, butonun kendi
              shadowColor/shadowRadius/elevation değerlerinden geliyor. */}
          {incomingCustomer ? (
            <View style={styles.activeCounterStatus}>
              <Text style={styles.activeCounterLabel}>TEZGÂH AKTİF</Text>
              <Text style={styles.activeCounterValue} numberOfLines={1}>
                {incomingCustomer.customer.name} ile işlem sürüyor
              </Text>
            </View>
          ) : (
            <Pressable
              disabled={!canCallNext}
              onPress={() => callNextCustomerToCounter()}
              style={({ pressed }) => [
                styles.callButton,
                !canCallNext && styles.callButtonDisabled,
                pressed && canCallNext && styles.callButtonPressed,
              ]}
            >
              <Text style={styles.callButtonTitle}>
                {waitingCustomers.length > 0 ? 'Müşteriyi Karşıla' : 'Boş'}
              </Text>
              <Text style={styles.callButtonSubtitle}>Bekleyen: {waitingCustomers.length}</Text>
            </Pressable>
          )}
        </View>

        <GoldTicker goldPrice={goldPrice} />

        {/* [DÜZELTME] Müşteri ve isteği artık hero'nun HEMEN altında, ekranın
            en üst kısmında — oyuncu kaydırmadan önce müşteriyi görmeli. Tüm
            ikincil banner/kartlar (kısayollar, tutorial, acil kredi, 4x,
            toptancı, müşteri akını) TEZGÂH'tan SONRA geliyor. */}
        <SectionLabel>TEZGÂH</SectionLabel>
        {incomingCustomer ? (
          <NegotiationPanel
            incomingCustomer={incomingCustomer}
            onClose={() => dismissActiveCustomer(incomingCustomer.id)}
          />
        ) : (
          <Text style={styles.emptyHint}>
            {waitingCustomers.length > 0
              ? 'Kuyrukta bekleyen müşteri var — "Müşteriyi Karşıla"ya bas.'
              : 'Şu an kuyrukta müşteri yok — birazdan biri gelecek.'}
          </Text>
        )}

        {/* ================= Fonksiyonel bölümler (mevcut sistemler) ================= */}
        {/* [DÜZELTME] Envanter/pasif gelir kısayolları artık hero'da değil —
            ana müşteri akışından sonra, ikincil bir bölüm olarak duruyor. */}
        <View style={styles.statsRow3}>
          <Pressable
            style={styles.bottomGlassCard}
            onPress={() => navigation.navigate('Stok')}
          >
            <GemShortcutIcon color={lux.goldBright} />
            <Text style={styles.bottomCardLabel}>Toptancı</Text>
            <Text style={styles.bottomCardMeta}>Stok / satış</Text>
          </Pressable>
          <Pressable
            style={styles.bottomGlassCard}
            onPress={() => navigation.navigate('Stok', { scrollTo: 'atolye' })}
          >
            <HammerShortcutIcon color={lux.goldBright} />
            <Text style={styles.bottomCardLabel}>Atölye</Text>
            <Text style={styles.bottomCardMeta}>
              Lv.{workshop.level}/10 · {workshopDailyHasOutput(workshop.level).toFixed(2)}g/gün
            </Text>
          </Pressable>
          <Pressable
            style={styles.bottomGlassCard}
            onPress={() => navigation.navigate('Stok', { scrollTo: 'yatirimlar' })}
          >
            <BankShortcutIcon color={lux.goldBright} />
            <Text style={styles.bottomCardLabel}>Yatırımlar</Text>
            <Text style={styles.bottomCardMeta}>{activeJewelryCount} aktif parça</Text>
          </Pressable>
        </View>
        {firstSessionHint && (
          <View style={styles.tutorialCard}>
            <Text style={styles.tutorialText}>
              {firstSessionHint.text}
            </Text>
            <Pressable
              onPress={() => {
                dismissFirstSessionHint(firstSessionHint.id);
                if (firstSessionHint.id === 'firstCustomer') completeTutorial();
              }}
              hitSlop={8}
            >
              <Text style={styles.tutorialDismiss}>Kapat</Text>
            </Pressable>
          </View>
        )}

        {showFourXOffer && (
          <FourXUnlockCard
            onWatchAd={() => {
              unlockFourXViaAd();
              setSpeed(4);
              setShowFourXOffer(false);
            }}
            onBuyUnlimited={() => {
              purchaseFourXUnlimited();
              setSpeed(4);
              setShowFourXOffer(false);
            }}
          />
        )}

        {brokerDeal && brokerMinutesLeft > 0 && (
          <BrokerDealBanner minutesLeft={brokerMinutesLeft} onResolve={() => resolveBrokerDeal()} />
        )}

        <CustomerHypeCard
          active={customerHypeActive}
          onWatchAd={watchAdForCustomerHype}
        />

        {!incomingCustomer && <CapitalSummary
          capital={capital}
          goldPrice={goldPrice}
          loanDueDay={loanDueDay}
          currentDay={day}
          onRepayDebt={() => repayDebt(capital.cashTl)}
        />}

        <View style={[styles.shopSummaryRow, summaryRowWide && styles.shopSummaryRowWide]}>
          <View style={[styles.shopSummaryColumn, summaryRowWide && styles.shopSummaryColumnWide]}>
            <StokOzetiCard items={inventory} onSeeAll={() => navigation.navigate('Stok')} />
          </View>

          {activeOffer && (
            <View style={[styles.shopSummaryColumn, summaryRowWide && styles.shopSummaryColumnWide]}>
              <SectionLabel>AKTİF TEKLİF</SectionLabel>
              <ActiveOfferSummary offer={activeOffer} onContinue={() => navigation.navigate('Müşteriler')} />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HudStatChip({
  label,
  value,
  warn,
  size = 'sm',
}: {
  label: string;
  value: string;
  warn?: boolean;
  /** `inline` — hız kontrolü yanında duran kompakt sosyal statü kartı. */
  size?: 'sm' | 'inline';
}) {
  return (
    <View style={[styles.hudStatChip, size === 'inline' && styles.hudStatChipInline]}>
      <Text style={[styles.hudStatChipLabel, size === 'inline' && styles.hudStatChipLabelInline]}>{label}</Text>
      <Text
        style={[
          styles.hudStatChipValue,
          size === 'inline' && styles.hudStatChipValueInline,
          warn && styles.hudStatChipValueWarn,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 3,
  },
  shopSummaryRow: {
    gap: 4,
  },
  shopSummaryRowWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  shopSummaryColumn: {
    minWidth: 0,
  },
  shopSummaryColumnWide: {
    flex: 1,
  },

  // ---------- HERO ----------
  // [DÜZELTME] Aşırı dikey boşluklar (padding/gap) daraltıldı — amaç: Kasa,
  // Piyasa, Stok Özeti ve Tezgâha Al butonunun mümkün olduğunca kaydırmadan
  // görünmesi.
  hero: {
    backgroundColor: lux.panelBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: lux.gold,
    padding: 4,
    gap: 2,
    shadowColor: lux.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  playtestBadge: {
    alignSelf: 'flex-end',
    marginBottom: -1,
    fontFamily: fonts.monoBold,
    fontSize: 8,
    letterSpacing: 0.7,
    color: lux.goldBright,
    opacity: 0.82,
  },
  // [YENİ] Referans tasarımın (cepkaynak-referans-ekran3.html) `.gframe.topbar`
  // bloğu — camsı/bulanık zemin (BlurView + yarı saydam mor ton), metalik
  // altın çerçeve ve dışa altın ışıma. `overflow:hidden` BlurView'ın ve tint
  // katmanının yuvarlak köşeleri taşmasını engelliyor.
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 18,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(232,180,74,0.55)',
    overflow: 'hidden',
    shadowColor: glass.refGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  topBarTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: glass.refGlass,
  },
  // [DÜZELTME] `shadowColor`/`shadowRadius` (glow) her zaman View'ın DİKDÖRTGEN
  // kutusunu takip eder — çember hissi için sarmalayan View'a da (SVG halkanın
  // kendisine değil) borderRadius=çap/2 vermek gerekiyor, yoksa ışıma kare
  // görünüyor.
  avatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: glass.refGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarLetter: {
    fontFamily: fonts.displayBold,
    fontSize: 13,
    color: glass.refGold2,
  },
  levelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  xp: {
    flex: 1,
    minWidth: 0,
  },
  xpTrack: {
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(20,8,34,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(232,180,74,0.5)',
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: glass.refViolet2,
    shadowColor: glass.refViolet2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
  },
  xpLabel: {
    fontFamily: fonts.numeric,
    fontSize: 7,
    letterSpacing: 0.2,
    color: glass.refTextDim,
    marginTop: 1,
  },
  balancePill: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(232,180,74,0.34)',
    paddingVertical: 4,
    paddingHorizontal: 7,
    overflow: 'hidden',
  },
  balancePillTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: glass.refGlass2,
  },
  balanceText: {
    fontFamily: fonts.numericBold,
    fontSize: 10,
    color: glass.refGold2,
    textShadowColor: 'rgba(232,180,74,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  // [YENİ] Zil artık üst profil çubuğunun bir parçası — referanstaki `.bell`
  // ile birebir aynı halka/parlama tekniği (bkz. avatarRing).
  bellBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: glass.refGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 14,
    elevation: 7,
  },
  bellInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bellIconWrap: {
    zIndex: 1,
  },
  // [DÜZELTME] Hız kontrolü artık üst HUD'un parçası — tek satırlık, küçük.
  // Play/pause ayrı büyük bir buton değil, ufak bir daire; 1x/2x/4x tek bir
  // ince hap içinde. Amaç: hız kontrolü ana içerikmiş gibi görünmesin.
  hudControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  hudSpeedLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // [YENİ] Müşteriler artık sekme değil — bu zil header'daki tek erişim
  // noktası. Rozet, TekliflerScreen'in "bekleyen" sayısını yansıtır.
  hudBellBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.negative,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: lux.panelBg,
  },
  hudBellBadgeLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.white,
  },
  hudPauseBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: lux.purple,
    borderWidth: 1,
    borderColor: lux.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudPauseLabel: {
    fontFamily: fonts.headingBold,
    fontSize: 10,
    color: lux.goldBright,
  },
  hudSpeedCluster: {
    flexDirection: 'row',
    backgroundColor: lux.glassStrong,
    borderWidth: 1,
    borderColor: lux.gold,
    borderRadius: 999,
    padding: 1,
    gap: 1,
  },
  hudSpeedBtn: {
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 999,
  },
  hudSpeedBtnActive: {
    backgroundColor: lux.purple,
  },
  hudSpeedLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: lux.inkMuted,
  },
  hudSpeedLabelActive: {
    color: lux.goldBright,
  },
  // [YENİ] Karizma + Toptancı Güveni — ekonomik göstergelerden ayrı, yan
  // yana iki belirgin kart (referans tasarım).
  reputationRow: {
    flexDirection: 'row',
    flex: 1,
    gap: 4,
  },
  // [DÜZELTME] Piyasa/Stok/Servet/Borç artık küçük, yatay kaydırılabilir
  // bir HUD şeridi — yardımcı bilgi, ana müşteri akışının önüne geçecek
  // kadar dikey yer kaplamıyor.
  hudStatsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  hudStatChip: {
    flex: 1,
    minWidth: 0,
    backgroundColor: lux.glass,
    borderWidth: 1,
    borderColor: lux.gold,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 3,
    alignItems: 'center',
  },
  hudStatChipInline: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 3,
    paddingHorizontal: 2,
    borderRadius: 8,
  },
  hudStatChipLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 7,
    letterSpacing: 0.25,
    color: lux.inkMuted,
    textAlign: 'center',
  },
  hudStatChipLabelInline: {
    fontSize: 6.5,
    letterSpacing: 0.15,
  },
  hudStatChipValue: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    color: lux.ink,
    marginTop: 1,
    textAlign: 'center',
  },
  hudStatChipValueInline: {
    fontSize: 10,
    marginTop: 0,
  },
  hudStatChipValueWarn: {
    color: colors.negative,
  },
  // [DÜZELTME] Kaba dev daire yerine şık, yatay hap (pill) buton. Parlama
  // efekti artık arkaya çizilen bir mor daireden değil, butonun kendi
  // shadowColor (mor) + elevation değerlerinden geliyor.
  callButton: {
    alignSelf: 'center',
    width: '82%',
    borderRadius: 12,
    backgroundColor: lux.gold,
    borderWidth: 2,
    borderColor: lux.goldBright,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 1,
    shadowColor: lux.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  callButtonPressed: {
    backgroundColor: lux.goldDeep,
  },
  callButtonDisabled: {
    opacity: 0.45,
    shadowOpacity: 0.15,
  },
  callButtonTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 13,
    color: '#3A2A00',
    letterSpacing: 0.4,
  },
  callButtonSubtitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: '#4A3600',
  },
  activeCounterStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: lux.glass,
    borderWidth: 1,
    borderColor: 'rgba(227, 184, 63, 0.45)',
  },
  activeCounterLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 0.6,
    color: lux.goldBright,
  },
  activeCounterValue: {
    maxWidth: 210,
    fontFamily: fonts.body,
    fontSize: 10,
    color: lux.inkMuted,
  },
  statsRow3: {
    flexDirection: 'row',
    gap: 5,
  },
  bottomGlassCard: {
    flex: 1,
    backgroundColor: lux.glass,
    borderWidth: 1,
    borderColor: lux.gold,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 1,
  },
  bottomCardLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: lux.ink,
  },
  bottomCardMeta: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: lux.inkMuted,
    textAlign: 'center',
  },
  fourXCountdown: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: lux.inkMuted,
  },

  // ---------- Fonksiyonel bölümler (mevcut karanlık kimlik) ----------
  emptyHint: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.inkMutedOnDark,
  },
  tutorialCard: {
    backgroundColor: 'rgba(129, 46, 208, 0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(227, 184, 63, 0.38)',
    padding: 10,
    gap: 4,
  },
  tutorialText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.inkOnDark,
  },
  tutorialDismiss: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.brass,
    alignSelf: 'flex-end',
  },
});
