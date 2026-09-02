/**
 * Chargement OPTIONNEL de Skia.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────
 *
 * `@shopify/react-native-skia` est un module NATIF. Dans Expo Go il n'est pas
 * dans le binaire : un `import` en tête de fichier ferait planter l'écran au
 * chargement du module, avant même le premier rendu, et sur un écran aussi
 * central que le profil ça veut dire une app inutilisable en développement.
 *
 * On l'importe donc dans un `try`, une seule fois, et tout le reste de l'app
 * interroge `hasSkia`. Metro résout bien le paquet à l'empaquetage (il est
 * dans `node_modules`), c'est l'accès au module natif au moment de
 * l'exécution qui échoue — et c'est exactement ce que ce `try` attrape.
 *
 * ── La règle qui en découle ──────────────────────────────────────────────
 *
 * Tout ce qui s'appuie sur Skia doit avoir un chemin de repli COMPLET, jamais
 * un écran vide. Sur le profil il y en a deux, dans cet ordre :
 *
 *   Skia  →  shader GLSL `expo-gl`  →  dégradés `react-native-svg`
 *
 * Les trois dessinent la même image, avec de moins en moins de matière. Rien
 * ne disparaît quand on descend d'un cran : on perd du grain, du flou et de
 * la finesse, jamais un élément.
 *
 * ── Ce que Skia apporte, et que les deux autres ne peuvent pas ───────────
 *
 *  • **Un vrai flou gaussien.** `expo-blur` floute ce qui est DERRIÈRE une
 *    vue ; il ne sait pas flouter une forme qu'on vient de dessiner. Un néon
 *    est exactement ça : le glyphe, flouté à plusieurs rayons, et rallumé.
 *  • **Du bruit fractal par pixel** (`fbm`), donc une vraie structure de
 *    nuage — pas deux dégradés qui se croisent.
 *  • **Le dégradé conique**, impossible en SVG et coûteux à écrire à la main.
 */

let mod: any = null;
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    mod = require('@shopify/react-native-skia');
    // Le paquet peut se charger sans que la partie native réponde (Expo Go
    // sert alors un module au squelette vide). On vérifie donc un symbole
    // qui n'existe que si le natif est réellement là, plutôt que la présence
    // du module — un `hasSkia` optimiste est pire que pas de Skia du tout.
    if (!mod?.Skia?.RuntimeEffect?.Make) mod = null;
  } catch {
    mod = null;
  }
}

/** Le module Skia, ou `null` quand il n'est pas dans le binaire. */
export function skia(): any {
  load();
  return mod;
}

/** `true` seulement si Skia répond vraiment — voir la note dans `load()`. */
export function hasSkia(): boolean {
  load();
  return mod !== null;
}
