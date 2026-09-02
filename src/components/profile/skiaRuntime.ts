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
 * On l'importe donc tard, une seule fois, et tout le reste de l'app interroge
 * `hasSkia`. Deux protections, pas une :
 *
 *  1. **Dans Expo Go, on ne tente rien.** Le `require` vit dans le corps
 *     d'une fonction, donc Metro ne l'évalue jamais tout seul ; on ne
 *     l'appelle pas, et le code de Skia ne tourne pas une seule fois.
 *  2. **Ailleurs, le `require` est dans un `try`** — une installation
 *     partielle ou un binaire construit sans le module natif ne doit pas
 *     emporter l'écran de profil.
 *
 * ⚠️ Ce fichier ne protège PAS l'empaquetage. Metro résout
 * `@shopify/react-native-skia` statiquement, avant qu'une ligne de ce code
 * ne tourne, et le paquet déclare ses SOURCES en point d'entrée React Native
 * — sources qui ne se résolvent pas. C'est `metro.config.js` qui règle ça,
 * en pointant le build compilé. Les deux sont nécessaires : celui-ci pour
 * l'exécution, celui-là pour le bundle.
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

/**
 * Sommes-nous dans Expo Go ?
 *
 * La question n'est pas rhetorique : dans Expo Go, le module natif de Skia
 * n'existe pas, et le simple fait d'EVALUER son index JS met en place des
 * liaisons natives. Un `try` autour attrape ce qui remonte en JavaScript,
 * mais rien ne garantit qu'une erreur native se laisse attraper — et le
 * profil est un ecran trop central pour parier dessus.
 *
 * On ne tente donc meme pas le chargement. Comme le `require` vit dans le
 * corps d'une fonction, Metro ne l'evalue jamais : le code de Skia n'est pas
 * execute une seule fois de la session.
 */
function inExpoGo(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Constants = require('expo-constants').default;
    return (
      Constants?.executionEnvironment === 'storeClient' ||
      Constants?.appOwnership === 'expo'
    );
  } catch {
    // Sans reponse, on suppose le cas le plus prudent.
    return true;
  }
}

let mod: any = null;
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  if (inExpoGo()) return;
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
