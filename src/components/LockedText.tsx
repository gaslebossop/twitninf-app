import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import { colors } from '../theme';

/**
 * Texte d'un contenu payant non acheté.
 *
 * Le serveur n'envoie jamais le vrai texte : il renvoie un brouillage de même
 * longueur, espaces et retours à la ligne conservés. Affiché tel quel, ça ne
 * ressemble pas à un contenu verrouillé mais à un bug d'encodage — d'où le
 * flou, qui rend au bloc la SILHOUETTE d'un texte sans rien donner à lire.
 *
 * Le flou vient d'une ombre portée sur un texte transparent : pas de
 * `BlurView` (la DA « Pulse » proscrit le verre décoratif), pas de module
 * natif, et un rendu identique sur iOS et Android.
 *
 * Ne jamais utiliser ce composant sur un aperçu écrit par le créateur : cet
 * aperçu-là est une accroche, il est fait pour être lu.
 */

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Couleur du texte flouté — celle qu'aurait eue le texte réel. */
  tint?: string;
}

export default function LockedText({ text, style, numberOfLines, tint }: Props) {
  return (
    <Text
      style={[style, styles.blurred, { textShadowColor: tint || colors.textPrimary }]}
      numberOfLines={numberOfLines}
      // Le brouillage n'a aucun sens à voix haute : on annonce l'état, et le
      // verrou juste en dessous porte le prix et le bouton.
      accessibilityLabel="Contenu réservé, non déverrouillé"
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  blurred: {
    color: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 7,
  },
});
