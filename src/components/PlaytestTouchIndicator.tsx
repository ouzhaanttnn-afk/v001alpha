import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';

export const SHOW_PLAYTEST_TOUCHES = true;

type TouchPulse = {
  id: number;
  x: number;
  y: number;
};

type TouchLike = {
  pageX?: number;
  pageY?: number;
};

const TOUCH_VISIBLE_MS = 420;
const MAX_TOUCH_PULSES = 8;

export function PlaytestTouchIndicator({
  children,
  onLayout,
}: {
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const [touches, setTouches] = useState<TouchPulse[]>([]);
  const nextTouchId = useRef(1);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
      timers.current = {};
    },
    [],
  );

  const removeTouch = (id: number) => {
    setTouches((current) => current.filter((touch) => touch.id !== id));
    delete timers.current[id];
  };

  const handleTouchStart = (event: GestureResponderEvent) => {
    if (!SHOW_PLAYTEST_TOUCHES) return;

    const nativeEvent = event.nativeEvent as GestureResponderEvent['nativeEvent'] & {
      changedTouches?: TouchLike[];
    };
    const changedTouches = nativeEvent.changedTouches?.length ? nativeEvent.changedTouches : [nativeEvent];
    const nextTouches = changedTouches
      .filter((touch) => typeof touch.pageX === 'number' && typeof touch.pageY === 'number')
      .map((touch) => ({
        id: nextTouchId.current++,
        x: touch.pageX ?? 0,
        y: touch.pageY ?? 0,
      }));

    if (nextTouches.length === 0) return;

    setTouches((current) => [...current, ...nextTouches].slice(-MAX_TOUCH_PULSES));
    nextTouches.forEach((touch) => {
      timers.current[touch.id] = setTimeout(() => removeTouch(touch.id), TOUCH_VISIBLE_MS);
    });
  };

  return (
    <View style={styles.root} onLayout={onLayout} onTouchStart={handleTouchStart}>
      {children}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {touches.map((touch) => (
          <View
            key={touch.id}
            style={[
              styles.touchRing,
              {
                left: touch.x - 14,
                top: touch.y - 14,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  touchRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.82)',
    backgroundColor: 'rgba(126, 58, 242, 0.18)',
  },
});
