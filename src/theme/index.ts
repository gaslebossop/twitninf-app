/**
 * Thème central « Pulse » de twitninf.
 *
 * Point d'entrée unique : `import { colors, spacing, radius, typography, fonts } from '../theme';`
 * Réutilise les tokens responsive existants (espacement, tailles, rayons, ombres)
 * pour ne pas dupliquer la logique de mise à l'échelle.
 */
import { Platform } from 'react-native';
import {
  spacing,
  fontSize,
  borderRadius,
  iconSize,
  shadow,
  wp,
  hp,
  normalize,
} from '../utils/responsive';
import { colors as _colors } from './colors';

export { colors, withAlpha, towardWhite, gradients, default as palette } from './colors';
export type { ColorToken } from './colors';
export { typography, fontWeight, fontFamily } from './typography';
export type { TypographyToken } from './typography';
export { fonts, fontAssets } from './fonts';
export type { FontToken } from './fonts';

// Vocabulaire de mouvement — durées, courbes et ressorts partagés.
export { duration, easing, spring, springSnappy, enterTiming, exitTiming } from './motion';
export { default as motion } from './motion';

// Re-export des tokens responsive sous des noms stables.
export { spacing, fontSize, iconSize, shadow, wp, hp, normalize };
export const radius = borderRadius;

/** Élévations sobres prêtes à l'emploi (ombres douces, pas de glow criard). */
export const elevation = {
  none: shadow(0),
  card: shadow(3),
  raised: shadow(6),
  overlay: shadow(12),
};

/**
 * Ombre colorée sous un élément accent (CTA, badge premium).
 * iOS uniquement rend la couleur ; Android retombe sur l'élévation neutre.
 */
export const glow = (
  color: string = _colors.accent,
  intensity: number = 14,
) => {
  if (Platform.OS === 'ios') {
    return {
      shadowColor: color,
      shadowOffset: { width: 0, height: intensity / 2 },
      shadowOpacity: 0.5,
      shadowRadius: intensity,
    };
  }
  return { elevation: Math.round(intensity / 2) };
};

import { typography as _typography } from './typography';
import { fonts as _fonts } from './fonts';

const theme = {
  colors: _colors,
  typography: _typography,
  fonts: _fonts,
  spacing,
  fontSize,
  radius: borderRadius,
  iconSize,
  elevation,
  glow,
};

export type Theme = typeof theme;
export default theme;
