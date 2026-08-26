import { Cinzel_600SemiBold, Cinzel_700Bold } from '@expo-google-fonts/cinzel';
import {
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  ZillaSlab_600SemiBold,
  ZillaSlab_700Bold,
} from '@expo-google-fonts/zilla-slab';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { PlaytestTouchIndicator } from './src/components/PlaytestTouchIndicator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGameClock } from './src/hooks/useGameClock';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useGameStore } from './src/store/useGameStore';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded] = useFonts({
    ZillaSlab_600SemiBold,
    ZillaSlab_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    // [YENİ] Referans tasarımı (cepkaynak-referans-ekran3.html) fontları —
    // şimdilik yalnızca Dükkân üst profil çubuğunda kullanılıyor.
    Cinzel_600SemiBold,
    Cinzel_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  // Kalıcı kayıt (AsyncStorage) yüklenmeden önce oyun ekranı gösterilmez —
  // aksi halde bir anlığına sıfırdan başlayan durum görünüp kayıtlı
  // veriyle üzerine yazılabilir.
  const hasHydrated = useGameStore((s) => s.hasHydrated);

  useGameClock();

  const ready = fontsLoaded && hasHydrated;

  const onLayoutRootView = useCallback(async () => {
    if (ready) {
      await SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <PlaytestTouchIndicator onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <RootNavigator />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </PlaytestTouchIndicator>
  );
}
