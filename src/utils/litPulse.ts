import { Animated, Easing } from 'react-native';

/**
 * Horloge UNIQUE des effets « allumés » : le halo du nom (`NameHalo`) et la
 * pastille de certification (`VerifiedBadge`).
 *
 * Les deux respiraient auparavant sur leur propre `Animated.loop`, démarrée au
 * montage de chaque composant. Deux boucles de même durée mais lancées à
 * quelques millisecondes d'écart dérivent l'une par rapport à l'autre : le nom
 * et la pastille finissaient en opposition de phase, et le passage par ce
 * déphasage se lisait comme un à-coup. Comme le nom et la pastille sont côte à
 * côte et portent la même couleur, la moindre dérive se voit.
 *
 * En partageant une seule `Animated.Value`, ils sont en phase PAR CONSTRUCTION —
 * il n'y a plus rien à resynchroniser. Le pilote est natif : la boucle ne coûte
 * rien au thread JS, quel que soit le nombre de pastilles montées.
 */
const HALF_CYCLE_MS = 1500;

/** Cycle complet, en ms. Exporté : le néon Skia doit battre sur le même. */
export const LIT_PULSE_CYCLE_MS = HALF_CYCLE_MS * 2;

let driver: Animated.Value | null = null;
let startedAt = 0;

function getDriver(): Animated.Value {
  if (!driver) {
    startedAt = Date.now();
    driver = new Animated.Value(0);
    Animated.loop(
      Animated.timing(driver, {
        toValue: 1,
        duration: HALF_CYCLE_MS * 2,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }
  return driver;
}

/**
 * Va-et-vient 0 → 1 → 0 sur un cycle complet. Tous les appelants reçoivent la
 * même valeur : ils ne peuvent pas se désynchroniser.
 */
export function litPulse(): Animated.AnimatedInterpolation<number> {
  return getDriver().interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1, 0],
  });
}

/**
 * Instant de démarrage de l'horloge, en temps mural.
 *
 * Le néon dessiné par Skia ne peut pas LIRE cette `Animated.Value` — elle vit
 * côté natif du cœur RN, pas dans le monde Skia. Il rejoue donc la même onde,
 * et il lui faut l'origine pour tomber en phase. Sans elle, le nom et la
 * pastille de certif respireraient à contretemps jusqu'à une seconde et demie
 * d'écart — exactement le déphasage que ce fichier existe pour supprimer.
 */
export function litPulseEpoch(): number {
  getDriver();
  return startedAt;
}

export default litPulse;
