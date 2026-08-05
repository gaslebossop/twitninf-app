import { useMemo } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number) {
  return PixelRatio.roundToNearestPixel(value);
}

/**
 * Mesures fluides pour remplacer les `marginTop`/`paddingTop` figés.
 * Le facteur vertical reste volontairement borné : un petit téléphone gagne de
 * l'espace utile, une tablette respire davantage, sans casser la hiérarchie.
 */
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const shortest = Math.min(width, height);
    const verticalScale = clamp(height / BASE_HEIGHT, 0.82, 1.18);
    const horizontalScale = clamp(width / BASE_WIDTH, 0.86, 1.22);
    const isCompact = shortest < 360 || height < 700;
    const isTablet = shortest >= 768;

    const space = (value: number, min = 0, max = value * 1.35) =>
      round(clamp(value * verticalScale, min, Math.max(min, max)));

    const headerTop = (base = 12) => round(insets.top + space(base, 6, isTablet ? 28 : 20));
    const modalTop = (base = 10) => round(insets.top + space(base, 6, isTablet ? 30 : 22));
    const modalMaxHeight = round(height - modalTop(8) - Math.max(insets.bottom, 8));

    return {
      width,
      height,
      insets,
      isCompact,
      isTablet,
      horizontalScale,
      verticalScale,
      space,
      headerTop,
      modalTop,
      modalMaxHeight,
    };
  }, [height, insets, width]);
}

export default useResponsiveLayout;
