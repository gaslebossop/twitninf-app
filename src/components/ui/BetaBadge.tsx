/**
 * 🧪 Pastille « BETA » posée à côté du mot-marque.
 *
 * Elle dit une seule chose : **ce compte est dans la beta**. Elle n'est donc
 * jamais rendue pour un non-membre — un badge qui s'affiche à tout le monde
 * ne signifie plus rien, et laisserait croire que l'app entière est instable.
 *
 * ── Pourquoi deux tons ──
 * L'en-tête du fil normal est en « Pulse » (noir plat, accent magenta), celui
 * du fil 2B en « papier » (encre sur papier, accent corail). Une seule
 * pastille magenta posée sur le papier 2B y ferait tache : le magenta n'existe
 * nulle part dans cette palette, et l'œil le lit comme un élément collé venu
 * d'un autre écran.
 *
 * ── Pourquoi elle est tapable ──
 * C'est le chemin le plus court vers l'écran BETA pour qui veut signaler un
 * bug ou quitter le programme. Le passage par Réglages existe aussi, mais il
 * demande trois gestes.
 */

import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fonts } from '../../theme';
import { paper } from '../../theme/paper2b';
import Tappable from './Tappable';

export type BetaBadgeTone = 'pulse' | 'paper';

interface Props {
  /** `pulse` pour le fil normal (défaut), `paper` pour le fil 2B. */
  tone?: BetaBadgeTone;
  onPress?: () => void;
  style?: ViewStyle;
}

const BetaBadge: React.FC<Props> = ({ tone = 'pulse', onPress, style }) => {
  const isPaper = tone === 'paper';

  const pill = [
    S.pill,
    isPaper
      ? { backgroundColor: paper.pillWash, borderColor: paper.outline }
      : { backgroundColor: colors.accent, borderColor: 'transparent' },
    style,
  ];

  // Sur papier : encre sur voile, contour fin — la pastille se lit comme un
  // tampon, pas comme un bouton. Sur Pulse : aplat magenta plein, texte noir,
  // conformément à la règle « surfaces pleines » du design system.
  const label = [S.label, { color: isPaper ? paper.inkSoft : colors.bg }];

  const content = (
    <View style={pill}>
      <Text style={label} allowFontScaling={false}>
        BETA
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Tappable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Programme beta"
    >
      {content}
    </Tappable>
  );
};

const S = StyleSheet.create({
  pill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'center',
  },
  label: {
    // `allowFontScaling={false}` plus haut : à la taille de texte maximale du
    // système, une pastille qui grossit pousse le mot-marque hors de l'écran.
    fontSize: 8.5,
    lineHeight: 11,
    letterSpacing: 0.9,
    fontFamily: fonts.bold,
  },
});

export default BetaBadge;
