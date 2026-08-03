import { Dimensions } from 'react-native';

/**
 * Hauteur du bandeau profil (tab + stack, mentions avec username seul).
 * Mélange largeur (~1.9:1) et fraction de la hauteur d'écran pour rester lisible.
 */
export function getProfileBannerHeight(widthPx: number, heightPx: number): number {
  const fb = Dimensions.get('window');
  const w = widthPx > 16 ? widthPx : fb.width;
  const h = heightPx > 16 ? heightPx : fb.height;
  const fromW = Math.round(w / 1.9);
  const fromH = Math.round(h * 0.265);
  const softCap = Math.round(h * 0.36);
  return Math.max(196, Math.min(Math.max(fromW, fromH), softCap));
}
