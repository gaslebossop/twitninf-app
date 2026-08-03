import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

const GRID_SIZE = 28;

export default function DarkGridOverlay() {
  const { width, height } = Dimensions.get('window');

  const verticalLines = useMemo(() => {
    const cols = Math.ceil(width / GRID_SIZE) + 2;
    return Array.from({ length: cols }, (_, i) => i * GRID_SIZE);
  }, [width]);

  const horizontalLines = useMemo(() => {
    const rows = Math.ceil(height / GRID_SIZE) + 4;
    return Array.from({ length: rows }, (_, i) => i * GRID_SIZE);
  }, [height]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={StyleSheet.absoluteFill}>
        {verticalLines.map((left) => (
          <View key={`v-${left}`} style={[styles.vLine, { left }]} />
        ))}
        {horizontalLines.map((top) => (
          <View key={`h-${top}`} style={[styles.hLine, { top }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  vLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(180,180,180,0.16)',
  },
  hLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(180,180,180,0.16)',
  },
});
