/**
 * Familles de polices « Pulse ».
 *
 * Une seule famille de marque, TwitNinf Sans, pour tout le texte de l'app —
 * titres, corps, boutons. Trois fichiers embarqués (Book/Medium/Bold) : la
 * famille ne fournit ni ExtraBold ni SemiBold droit (ce dernier n'existe
 * qu'en italique), donc Bold sert de graisse la plus lourde partout où
 * l'ancien duo demandait ExtraBold ou SemiBold — voir `twitninf-sans/*.otf`.
 *
 * Les polices sont chargées une seule fois dans App.tsx via `fontAssets`.
 * On référence toujours une FAMILLE PRÉCISE (un fichier = un poids) car
 * React Native ne synthétise pas les graisses avec des polices custom.
 */
// Import each weight directly. Importing a package root makes Metro resolve
// every weight exported by that package, including weights the app never uses.
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
  // Display / titres — TwitNinf Sans Bold (pas d'ExtraBold dans la famille).
  displayHeavy: 'TwitninfSans-Bold',
  display: 'TwitninfSans-Bold',
  // Pas de SemiBold droit dans la famille (600 n'existe qu'en italique) :
  // Medium marque la marche en dessous de Bold.
  heading: 'TwitninfSans-Medium',

  // Corps / UI — TwitNinf Sans
  regular: 'TwitninfSans-Book',
  medium: 'TwitninfSans-Medium',
  semibold: 'TwitninfSans-Bold',
  bold: 'TwitninfSans-Bold',

  /**
   * Chiffres et valeurs — Space Mono, INCHANGÉ.
   *
   * Une somme n'est pas une phrase : en chasse fixe, les chiffres s'alignent
   * d'une ligne a l'autre et se lisent comme une valeur frappee plutot que
   * comme du texte. TwitNinf Sans n'a pas de variante monospace, et forcer
   * des chiffres tabulaires par feature OpenType n'est pas fiable entre iOS
   * et Android sur une police custom — Space Mono reste donc la police des
   * montants tant que ce n'est pas un choix a part entiere.
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
  'TwitninfSans-Book': require('../../assets/fonts/TwitninfSans-Book.otf'),
  'TwitninfSans-Medium': require('../../assets/fonts/TwitninfSans-Medium.otf'),
  'TwitninfSans-Bold': require('../../assets/fonts/TwitninfSans-Bold.otf'),
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
