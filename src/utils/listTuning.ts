import { Platform } from 'react-native';

/**
 * Réglage de virtualisation partagé des listes au gabarit ORDINAIRE — une
 * ligne de la hauteur d'un avatar plus deux lignes de texte.
 *
 * ── Pourquoi une constante et pas cinq props recopiées ──
 * Le dépôt avait déjà ce réglage, écrit cinq fois à l'identique
 * (`TweetsScreen`, `FeedGutterScreen`, `ProfileScreen`, `UserProfileScreen`,
 * `NotificationsScreen`) — et absent des quinze autres listes. Recopier cinq
 * props dans quinze fichiers est précisément ce qui produit cet écart : la
 * seizième liste écrite demain les oubliera à son tour.
 *
 * ── Pourquoi ces valeurs ──
 * Les défauts de React Native (`initialNumToRender: 10`, `windowSize: 21`,
 * soit 10 hauteurs d'écran de chaque côté du visible) ne sont pas mauvais en
 * soi : sur une liste courte ils ne coûtent rien. Ils deviennent coûteux dès
 * que la liste peut grandir sans plafond. `windowSize: 7` garde trois hauteurs
 * d'écran de part et d'autre — assez pour que le défilement ne montre jamais
 * de blanc, sans monter dix écrans de contenu jamais regardé.
 *
 * `removeClippedSubviews` reste faux sur iOS : il y est connu pour faire
 * disparaître des vues à l'intérieur de cellules à contenu variable, et le
 * gain y est marginal. Sur Android il détache réellement les vues hors champ.
 *
 * ── Ce à quoi il ne s'applique PAS ──
 * Les listes dont un élément occupe une hauteur ou une largeur d'écran
 * (`twitninfvideo`, `ImageViewerPaper`) : « sept hauteurs d'écran » y veut dire
 * sept pages, pas sept lignes. Elles gardent leurs valeurs propres, réglées
 * sur place avec la raison écrite à côté.
 */
export const LIST_TUNING = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 6,
  updateCellsBatchingPeriod: 50,
  windowSize: 7,
  removeClippedSubviews: Platform.OS === 'android',
} as const;

export default LIST_TUNING;
