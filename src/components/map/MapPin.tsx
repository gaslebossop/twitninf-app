/**
 * Épingle d'un compte sur la Carte NF.
 *
 * ── Ce qu'elle doit dire en un coup d'œil ──
 *   - QUI c'est : l'avatar, en grand, c'est le seul contenu qui compte ;
 *   - qu'il s'agit d'une personne et pas d'un lieu : anneau blanc et ombre
 *     portée, qui la détachent du fond de carte quelle qu'en soit la couleur ;
 *   - le prénom, sous l'avatar, parce qu'un visage en 44 px ne suffit pas à
 *     reconnaître quelqu'un qu'on croise peu ;
 *   - si la position est APPROXIMATIVE : anneau discontinu. Sans ce signal,
 *     une position arrondie à l'agglomération se lit comme une adresse.
 *
 * L'ombre est portée par une vue séparée de celle qui rogne l'avatar : sur
 * Android, `elevation` et `overflow: 'hidden'` sur la même vue s'annulent — on
 * perd soit l'ombre, soit le cercle.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Avatar from '../Avatar';
import { colors, fonts } from '../../theme';

interface MapPinProps {
  username: string;
  avatar?: string | null;
  /** Nom court affiché sous l'épingle. */
  label?: string | null;
  approximate?: boolean;
  selected?: boolean;
  /** L'épingle de l'utilisateur lui-même se distingue des autres. */
  self?: boolean;
}

const SIZE = 46;

export default function MapPin({
  username,
  avatar,
  label,
  approximate = false,
  selected = false,
  self = false,
}: MapPinProps) {
  return (
    <View style={styles.root}>
      <View style={[styles.shadow, selected && styles.shadowSelected]}>
        <View
          style={[
            styles.ring,
            approximate && styles.ringApproximate,
            selected && styles.ringSelected,
            self && styles.ringSelf,
          ]}
        >
          <Avatar size={SIZE - 6} username={username} uri={avatar || undefined} />
        </View>
      </View>

      {/* Pointe : elle désigne le point exact sous l'épingle. */}
      <View style={[styles.tip, selected && styles.tipSelected]} />

      {!!label && (
        <View style={styles.labelWrap}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },

  shadow: {
    borderRadius: SIZE / 2,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  shadowSelected: { shadowOpacity: 0.35, shadowRadius: 10 },

  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: colors.white,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  ringApproximate: { borderStyle: 'dashed', borderColor: '#E4E4E4' },
  ringSelected: { borderColor: colors.accent, borderWidth: 3.5 },
  ringSelf: { borderColor: colors.accent },

  tip: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.white,
  },
  tipSelected: { borderTopColor: colors.accent },

  labelWrap: {
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    maxWidth: 96,
  },
  label: { fontFamily: fonts.semibold, fontSize: 10, color: colors.white },
});
