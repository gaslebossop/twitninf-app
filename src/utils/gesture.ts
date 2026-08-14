import { Easing, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';
import { duration, spring, springSnappy } from '../theme/motion';

/**
 * La physique des gestes de twitninf.
 *
 * `theme/motion` dit à quelle VITESSE les choses bougent. Ce fichier dit
 * comment elles réagissent au DOIGT — et c'est un problème différent, avec
 * ses propres formules, toutes empruntées à UIKit :
 *
 *  - un élément qu'on jette doit finir sa course là où le doigt le visait,
 *    pas à une distance fixe (`projectDecay`) ;
 *  - un élément en butée doit résister progressivement au lieu de se bloquer
 *    net ou de suivre bêtement (`rubberBand`).
 *
 * Tout ici est marqué `'worklet'` : ces fonctions sont appelées depuis les
 * gestionnaires de geste de Reanimated, qui tournent sur le thread UI. Une
 * fonction non-worklet appelée depuis ce contexte lève une erreur à
 * l'exécution — c'est justement la garantie qu'on ne repasse jamais par JS
 * pendant qu'un doigt est posé sur l'écran.
 */

/**
 * Où l'élément s'arrêterait si on le laissait décélérer librement.
 *
 * C'est LE calcul qui distingue un glissé qui répond d'un glissé qui subit.
 * Sans lui, on compare la distance parcourue à un seuil fixe : un petit geste
 * très rapide ne ferme pas, alors que l'intention était évidente. Avec lui, on
 * compare la position PROJETÉE — « où le doigt a-t-il envoyé cette feuille ? »
 * — et le seuil devient une vraie frontière d'intention.
 *
 * Apple n'utilise pas la formule scolaire `v²/(2·a)` mais une décroissance
 * exponentielle, dont `decelerationRate` est le facteur par milliseconde
 * (0,998 = le défilement normal ; 0,99 = le défilement « rapide »).
 *
 * @param velocity  vitesse en px/s (celle que donne Gesture Handler).
 * @returns la distance ADDITIONNELLE en px, signée comme la vitesse.
 */
export function projectDecay(velocity: number, decelerationRate = 0.998): number {
  'worklet';
  return (velocity / 1000) * (decelerationRate / (1 - decelerationRate));
}

/**
 * Résistance en butée, formule d'`UIScrollView`.
 *
 * Le déplacement rendu croît de moins en moins vite à mesure qu'on s'éloigne :
 * asymptotiquement, l'élément ne dépasse jamais `dimension`. Traduction à
 * l'écran : la feuille tirée vers le haut colle au bord au lieu d'en décoller,
 * mais elle bouge quand même — l'utilisateur voit que son geste est reçu et
 * refusé, ce qui n'est pas la même chose qu'une interface qui ne répond pas.
 *
 * @param offset     déplacement brut du doigt, en px.
 * @param dimension  distance de référence (souvent la hauteur de l'élément).
 * @param coefficient plus il est grand, moins ça résiste. 0,55 = iOS.
 */
export function rubberBand(offset: number, dimension: number, coefficient = 0.55): number {
  'worklet';
  if (dimension <= 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const distance = Math.abs(offset);
  return sign * (1 - 1 / ((distance * coefficient) / dimension + 1)) * dimension;
}

/** Borne une valeur. Reanimated en expose une, mais pas dans toutes les versions. */
export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/**
 * Ressort qui HÉRITE de la vitesse du doigt.
 *
 * Un `withSpring` lancé sans `velocity` repart de zéro : au relâchement,
 * l'élément marque un temps d'arrêt puis redémarre. L'œil le voit, et c'est
 * exactement ce qui fait qu'une animation paraît « recollée » au geste plutôt
 * que d'en être la suite. On passe donc toujours la vitesse de fin de geste.
 */
export function springFrom(velocity: number, snappy = false): WithSpringConfig {
  'worklet';
  return { ...(snappy ? springSnappy : spring), velocity };
}

/** Courbes Reanimated — mêmes béziers que `theme/motion`, autre moteur. */
export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  in: Easing.bezier(0.5, 0, 0.75, 0),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
};

export const timing = {
  instant: { duration: duration.instant, easing: ease.out } as WithTimingConfig,
  fast: { duration: duration.fast, easing: ease.out } as WithTimingConfig,
  base: { duration: duration.base, easing: ease.out } as WithTimingConfig,
  slow: { duration: duration.slow, easing: ease.out } as WithTimingConfig,
  /** Sortie : plus court que l'entrée, sinon on attend que ça parte. */
  exit: { duration: duration.fast, easing: ease.in } as WithTimingConfig,
};

/** Configs de ressort prêtes à passer à `withSpring`, sans vitesse initiale. */
export const springs = {
  settle: spring as WithSpringConfig,
  snappy: springSnappy as WithSpringConfig,
};
