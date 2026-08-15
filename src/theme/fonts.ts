/**
 * Familles de polices « Encre ».
 *
 * Duo premium :
 *  - Plus Jakarta Sans → titres, noms, chiffres marquants (caractère, géométrie).
 *  - Inter → corps, UI, métadonnées (lisibilité irréprochable).
 *
 * Les polices sont chargées une seule fois dans App.tsx via `fontAssets`.
 * On référence toujours une FAMILLE PRÉCISE (un fichier = un poids) car
 * React Native ne synthétise pas les graisses avec des polices custom.
 */
// Import each weight directly. Importing a package root makes Metro resolve
// every weight exported by that package, including weights the app never uses.
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Anton_400Regular } from '@expo-google-fonts/anton/400Regular';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';
import { Lora_700Bold } from '@expo-google-fonts/lora/700Bold';
import { SpaceMono_700Bold } from '@expo-google-fonts/space-mono/700Bold';
import { Oswald_600SemiBold } from '@expo-google-fonts/oswald/600SemiBold';
// Les dix familles ajoutees pour la personnalisation du nom de profil.
// Toutes en 700 : c'est un vrai fichier Bold dessine par le fondeur, pas une
// graisse synthetisee — React Native ne sait pas epaissir une police custom.
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { Raleway_700Bold } from '@expo-google-fonts/raleway/700Bold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Rubik_700Bold } from '@expo-google-fonts/rubik/700Bold';
import { Merriweather_700Bold } from '@expo-google-fonts/merriweather/700Bold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Orbitron_700Bold } from '@expo-google-fonts/orbitron/700Bold';
import { Caveat_700Bold } from '@expo-google-fonts/caveat/700Bold';
import { Cinzel_700Bold } from '@expo-google-fonts/cinzel/700Bold';

/** Noms de familles utilisés partout dans le thème. */
export const fonts = {
  // Display / titres — Plus Jakarta Sans
  displayHeavy: 'Jakarta-ExtraBold',
  display: 'Jakarta-Bold',
  heading: 'Jakarta-SemiBold',

  // Corps / UI — Inter
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',

  /**
   * Chiffres et valeurs — Space Mono.
   *
   * Une somme n'est pas une phrase : en chasse fixe, les chiffres s'alignent
   * d'une ligne a l'autre et se lisent comme une valeur frappee plutot que
   * comme du texte. La famille etait deja embarquee, mais seulement declaree
   * dans `displayNameFonts` — le catalogue des polices de NOM de profil. La
   * reprendre depuis la faisait dependre un montant d'un reglage cosmetique
   * qui n'a rien a voir.
   */
  mono: 'SpaceMono-Bold',
} as const;

/**
 * Polices du nom affiché (personnalisation Pro).
 *
 * Elles sont EMBARQUÉES, pas empruntées au système. La version précédente
 * passait par des noms de familles natives (`Georgia-Bold` côté iOS,
 * `sans-serif-condensed` côté Android) : sur Android, « Éditorial » et
 * « Serif » désignaient tous deux `serif`, les variantes sans-serif
 * retombaient sur Roboto dès qu'un `fontWeight` numérique était posé, et sur
 * le web aucun des noms iOS ne résolvait. Résultat : toutes les options se
 * ressemblaient. Une police embarquée rend exactement pareil sur les trois
 * plateformes.
 */
export const displayNameFonts = {
  poster: 'Anton-Regular',
  editorial: 'PlayfairDisplay-Bold',
  serif: 'Lora-Bold',
  mono: 'SpaceMono-Bold',
  condensed: 'Oswald-SemiBold',

  // Dix familles supplementaires, toutes en Bold reel.
  geometric: 'Montserrat-Bold',
  rounded: 'Poppins-Bold',
  elegant: 'Raleway-Bold',
  soft: 'Nunito-Bold',
  friendly: 'Rubik-Bold',
  classic: 'Merriweather-Bold',
  grotesque: 'Archivo-Bold',
  techno: 'Orbitron-Bold',
  handwritten: 'Caveat-Bold',
  roman: 'Cinzel-Bold',
} as const;

/** Map passée à `useFonts` / `Font.loadAsync`. */
export const fontAssets = {
  'Jakarta-SemiBold': PlusJakartaSans_600SemiBold,
  'Jakarta-Bold': PlusJakartaSans_700Bold,
  'Jakarta-ExtraBold': PlusJakartaSans_800ExtraBold,
  'Inter-Regular': Inter_400Regular,
  'Inter-Medium': Inter_500Medium,
  'Inter-SemiBold': Inter_600SemiBold,
  'Inter-Bold': Inter_700Bold,
  [displayNameFonts.poster]: Anton_400Regular,
  [displayNameFonts.editorial]: PlayfairDisplay_700Bold,
  [displayNameFonts.serif]: Lora_700Bold,
  [displayNameFonts.mono]: SpaceMono_700Bold,
  [displayNameFonts.condensed]: Oswald_600SemiBold,
  [displayNameFonts.geometric]: Montserrat_700Bold,
  [displayNameFonts.rounded]: Poppins_700Bold,
  [displayNameFonts.elegant]: Raleway_700Bold,
  [displayNameFonts.soft]: Nunito_700Bold,
  [displayNameFonts.friendly]: Rubik_700Bold,
  [displayNameFonts.classic]: Merriweather_700Bold,
  [displayNameFonts.grotesque]: Archivo_700Bold,
  [displayNameFonts.techno]: Orbitron_700Bold,
  [displayNameFonts.handwritten]: Caveat_700Bold,
  [displayNameFonts.roman]: Cinzel_700Bold,
};

export type FontToken = keyof typeof fonts;

export default fonts;
