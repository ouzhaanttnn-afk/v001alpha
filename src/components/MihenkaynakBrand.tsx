import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

const markSource = require('../../assets/mihenkaynak/mihenkaynak_mark_secondary.png');
const logoSource = require('../../assets/mihenkaynak/mihenkaynak_logo_primary.png');

export function MihenkaynakMark({
  size = 32,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.markFrame, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Image source={markSource} style={styles.markImage} resizeMode="cover" />
    </View>
  );
}

export function MihenkaynakLogo({
  width = 156,
  height = 58,
  style,
}: {
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return <Image source={logoSource} style={[{ width, height }, style]} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  markFrame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markImage: {
    width: '100%',
    height: '100%',
  },
});
