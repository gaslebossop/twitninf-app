import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * « Réduire les animations » du système.
 *
 * Le réglage existe sur les deux plateformes et n'est pas une préférence
 * esthétique : il est coché par des gens à qui le mouvement donne la nausée ou
 * déclenche des migraines. Une app qui l'ignore ne leur est pas seulement
 * désagréable, elle leur est inutilisable.
 *
 * Un seul composant le consultait jusqu'ici (`PremiumProfileEntrance`), avec sa
 * propre copie du branchement. Ce module le centralise :
 *
 *  - `isReduceMotionEnabled()` — lecture SYNCHRONE, utilisable dans un
 *    gestionnaire d'événement ou hors composant. C'est le point important :
 *    `AccessibilityInfo.isReduceMotionEnabled()` est une promesse, et
 *    l'interroger au moment de déclencher l'animation arrive toujours trop
 *    tard. On la lit donc une fois au chargement du module et on suit ensuite
 *    les changements par abonnement.
 *  - `useReduceMotion()` — la même chose, mais qui redéclenche un rendu quand
 *    le réglage change pendant que l'app tourne.
 *
 * Ce qu'on coupe quand il est actif : les décorations (rebonds, éclats,
 * parallaxes, pulsations en boucle). Ce qu'on garde TOUJOURS : ce qui suit le
 * doigt, et les fondus courts qui expliquent d'où vient un élément. Supprimer
 * ces derniers rend l'interface plus dure à suivre, pas plus confortable.
 */

let enabled = false;
const listeners = new Set<(value: boolean) => void>();

function publish(value: boolean) {
  if (value === enabled) return;
  enabled = value;
  listeners.forEach((listener) => listener(value));
}

AccessibilityInfo.isReduceMotionEnabled()
  .then(publish)
  .catch(() => {
    // Plateforme sans l'API : on reste sur « animations complètes ».
  });

AccessibilityInfo.addEventListener('reduceMotionChanged', publish);

/** Lecture synchrone, y compris hors composant. */
export function isReduceMotionEnabled(): boolean {
  return enabled;
}

/**
 * Durée à appliquer : 0 quand le mouvement est réduit.
 *
 * Zéro plutôt que « pas d'animation du tout » : la valeur atteint sa cible
 * immédiatement, mais le code appelant garde une seule branche — donc aucun
 * risque qu'un état de fin d'animation ne soit jamais posé.
 */
export function motionDuration(ms: number): number {
  return enabled ? 0 : ms;
}

export function useReduceMotion(): boolean {
  const [value, setValue] = useState(enabled);

  useEffect(() => {
    // Le module a pu recevoir la valeur réelle entre son chargement et ce
    // rendu : on se resynchronise avant de s'abonner.
    setValue(enabled);
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  return value;
}

export default useReduceMotion;
