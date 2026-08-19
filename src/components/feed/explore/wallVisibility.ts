/**
 * Détection de visibilité du mur Explorer — position MESURÉE (`onLayout`),
 * pas estimée. `ExploreWall` fournit des rectangles déjà en coordonnées
 * absolues (offset du conteneur `columns` + offset mesuré de la carte) ;
 * cette fonction ne fait que la géométrie, testable sans React Native.
 */

export interface CardVisibilityRect {
  id: string;
  /** Offset absolu du haut de la carte dans le contenu défilable. */
  top: number;
  height: number;
}

/**
 * Ids des cartes dont au moins `threshold` (50% par défaut — même règle que
 * le fil, `itemVisiblePercentThreshold: 50`) de leur hauteur chevauche le
 * viewport `[viewportTop, viewportTop + viewportHeight)`.
 */
export function getVisibleCardIds(
  cards: CardVisibilityRect[],
  viewportTop: number,
  viewportHeight: number,
  threshold: number = 0.5,
): string[] {
  const viewportBottom = viewportTop + viewportHeight;
  const visible: string[] = [];

  for (const card of cards) {
    if (card.height <= 0) continue;
    const cardBottom = card.top + card.height;
    const overlapTop = Math.max(card.top, viewportTop);
    const overlapBottom = Math.min(cardBottom, viewportBottom);
    const overlap = Math.max(0, overlapBottom - overlapTop);
    if (overlap / card.height >= threshold) {
      visible.push(card.id);
    }
  }

  return visible;
}
