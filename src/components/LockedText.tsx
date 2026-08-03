import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import { colors, withAlpha } from '../theme';

/**
 * Texte d'un contenu payant non acheté.
 *
 * Le serveur n'envoie jamais le vrai texte : il renvoie un brouillage de même
 * longueur, espaces et retours à la ligne conservés. Affiché tel quel, ça ne
 * ressemble pas à un contenu verrouillé mais à un bug d'encodage — d'où le
 * flou, qui rend au bloc la SILHOUETTE d'un texte sans rien donner à lire.
 *
 * Le flou vient d'un halo (ombre portée sans décalage) posé sur des lettres
 * très pâles. Pas de `BlurView` : la DA « Pulse » proscrit le verre décoratif,
 * et le flou natif d'Android demande un mode expérimental.
 *
 * **Les lettres gardent volontairement un peu d'opacité.** Android ne dessine
 * pas l'ombre d'un texte entièrement transparent : le bloc devenait alors
 * totalement vide, ce qui donnait l'impression d'un tweet cassé plutôt que
 * verrouillé. Avec ce fond de lettres, le pire cas reste un texte pâle et
 * illisible — jamais un trou.
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
  const tone = tint || colors.textPrimary;

  return (
    <Text
      style={[
        style,
        styles.blurred,
        { color: withAlpha(tone, 0.22), textShadowColor: withAlpha(tone, 0.8) },
      ]}
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
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
