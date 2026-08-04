import { Easing } from 'react-native';

/**
 * Le vocabulaire de mouvement de twitninf.
 *
 * L'app avait autant de façons de bouger que d'écrans : des fondus de 800 ms
 * au montage, des ressorts à `bounciness: 6`, des `Easing.linear` sur des
 * apparitions. Résultat, rien ne se ressemblait et tout paraissait lent —
 * un diaporama plutôt qu'une interface.
 *
 * Trois principes tenus ici :
 *
 * 1. **Rien ne s'anime au montage.** Un écran qui se dévoile en fondu est un
 *    écran qu'on attend. Le contenu est là, tout de suite. Ce qui bouge, c'est
 *    ce qui RÉPOND à un geste, ou ce qui suit le doigt.
 * 2. **Court.** 120 à 280 ms. Au-delà, on regarde l'animation au lieu de
 *    regarder le contenu.
 * 3. **Ça se pose, ça ne rebondit pas.** Les courbes ci-dessous décélèrent
 *    fortement puis s'arrêtent net. Un ressort qui oscille se lit comme un
 *    défaut, pas comme du soin.
 */

/** Durées. Le nom dit l'intention, pas le nombre. */
export const duration = {
  /** Retour d'appui, changement d'état d'une icône. */
  instant: 120,
  /** Bascule, dépliage court, entrée d'une pastille. */
  fast: 180,
  /** Feuille qui monte, carte qui entre, changement de section. */
  base: 260,
  /** Le maximum admissible : un panneau plein écran, jamais du contenu. */
  slow: 340,
};

export const easing = {
  /**
   * La courbe par défaut de l'app (proche d'un easeOutExpo).
   * Départ franc, décélération longue, arrêt net : c'est ce qui donne
   * l'impression que l'élément a du poids sans jamais osciller.
   */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /** Sortie : l'inverse, l'élément part vite et disparaît. */
  in: Easing.bezier(0.5, 0, 0.75, 0),
  /** Déplacement d'un point A à un point B, sans entrée ni sortie. */
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Suivi du doigt, valeur qui compte : linéaire, sinon ça patine. */
  linear: Easing.linear,
};

/**
 * Ressort en amortissement critique — il atteint sa cible sans la dépasser.
 * La relation `damping ≈ 2·√(stiffness · mass)` est ce qui garantit l'absence
 * de rebond ; ne pas baisser `damping` sans recalculer.
 */
export const spring = {
  damping: 28,
  stiffness: 190,
  mass: 1,
  /** Utile pour Reanimated : coupe l'animation dès que l'oeil ne voit plus rien. */
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

/** Ressort un peu plus vif, pour un petit élément (pastille, icône). */
export const springSnappy = {
  damping: 22,
  stiffness: 300,
  mass: 1,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

/** Réglage prêt à l'emploi pour `Animated.timing` en entrée. */
export const enterTiming = {
  duration: duration.base,
  easing: easing.out,
  useNativeDriver: true,
};

/** Réglage prêt à l'emploi pour `Animated.timing` en sortie. */
export const exitTiming = {
  duration: duration.fast,
  easing: easing.in,
  useNativeDriver: true,
};

export default { duration, easing, spring, springSnappy, enterTiming, exitTiming };
