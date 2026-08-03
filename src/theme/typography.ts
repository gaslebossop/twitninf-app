/**
 * Échelle typographique « Encre ».
 *
 * Duo Plus Jakarta Sans (titres) + Inter (corps). La hiérarchie repose sur
 * la famille, la taille, la hauteur de ligne et le letterSpacing — jamais sur
 * `fontWeight` (les polices custom portent leur graisse dans le fichier).
 */
import { TextStyle } from 'react-native';
import { fontSize } from '../utils/responsive';
import { colors } from './colors';
import { fonts } from './fonts';

/** Conservé pour compatibilité — préférer les familles de `fonts`. */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Famille par défaut du corps de texte. */
export const fontFamily = fonts.regular;

const text = (style: TextStyle): TextStyle => style;

export const typography = {
  /** Gros titre d'écran (héros, onboarding). */
  display: text({
    fontFamily: fonts.displayHeavy,
    fontSize: fontSize.giant,
    color: colors.textPrimary,
    letterSpacing: -1,
    lineHeight: fontSize.giant * 1.05,
  }),
  /** Titre d'écran. */
  title: text({
    fontFamily: fonts.display,
    fontSize: fontSize.xxl,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: fontSize.xxl * 1.15,
  }),
  /** Titre de section. */
  heading: text({
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    lineHeight: fontSize.lg * 1.25,
  }),
  /** Nom d'affichage, libellés forts. */
  strong: text({
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    letterSpacing: -0.1,
  }),
  /** Nom d'utilisateur / titre de carte (caractère Jakarta). */
  name: text({
    fontFamily: fonts.display,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  }),
  /** Corps de texte par défaut. */
  body: text({
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    lineHeight: fontSize.md * 1.45,
  }),
  /** Texte secondaire (métadonnées, sous-titres). */
  secondary: text({
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    color: colors.textSecondary,
    lineHeight: fontSize.base * 1.4,
  }),
  /** Petits libellés. */
  caption: text({
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  }),
  /** Chiffres / statistiques (Inter SemiBold, bien lisible). */
  numeric: text({
    fontFamily: fonts.semibold,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  }),
  /** Sur-titre en capitales espacées (sobre, pas criard). */
  overline: text({
    fontFamily: fonts.semibold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  }),
  /** Libellé de bouton. */
  button: text({
    fontFamily: fonts.semibold,
    fontSize: fontSize.md,
    letterSpacing: 0.2,
  }),
} as const;

export type TypographyToken = keyof typeof typography;

export default typography;
