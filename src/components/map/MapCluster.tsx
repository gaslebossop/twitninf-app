/**
 * Groupe de comptes trop proches pour tenir côte à côte.
 *
 * ── Ce qu'il doit dire en un coup d'œil ──
 * QUI est là, pas seulement COMBIEN. Une pastille chiffrée anonyme oblige à
 * zoomer pour savoir si le groupe vaut le détour ; trois visages empilés et un
 * « +4 » répondent tout de suite. C'est aussi la seule façon de reconnaître un
 * ami dans une ville où l'on en a plusieurs.
 *
 * Les avatars se chevauchent à la façon d'une pile de jetons : ça tient dans
 * la largeur d'une épingle, et l'empilement se lit comme « plusieurs personnes
 * au même endroit » sans qu'on ait à l'expliquer.
 *
 * Même construction que `MapPin` : l'ombre est portée par une vue distincte de
 * celle qui rogne l'avatar, parce que sur Android `elevation` et
 * `overflow: 'hidden'` sur la même vue s'annulent.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Avatar from '../Avatar';
import { colors, fonts } from '../../theme';

export interface ClusterFace {
  id: string;
  username: string;
  avatar?: string | null;
}

interface MapClusterProps {
  /** Taille totale du groupe, y compris les visages non montrés. */
  count: number;
  /** Membres à montrer, dans l'ordre. Les trois premiers sont retenus. */
  faces: ClusterFace[];
  selected?: boolean;
}

const SIZE = 42;
/** Au-delà, les visages deviennent des rondelles illisibles. */
const MAX_FACES = 3;

function MapCluster({ count, faces, selected = false }: MapClusterProps) {
  const shown = faces.slice(0, MAX_FACES);
  const rest = count - shown.length;

  return (
    <View style={styles.root}>
      <View style={[styles.stack, selected && styles.stackSelected]}>
        {shown.map((face, index) => (
          <View key={face.id} style={[styles.shadow, index > 0 && styles.overlapped]}>
            <View style={styles.ring}>
              <Avatar size={SIZE - 5} username={face.username} uri={face.avatar || undefined} />
            </View>
          </View>
        ))}

        {rest > 0 && (
          <View style={[styles.shadow, styles.overlapped]}>
            <View style={[styles.ring, styles.restRing]}>
              <Text style={styles.restText}>+{rest > 99 ? 99 : rest}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.labelWrap}>
        <Text style={styles.label} numberOfLines={1}>
          {count} personnes
        </Text>
      </View>
    </View>
  );
}

export default React.memo(MapCluster);

const styles = StyleSheet.create({
  root: { alignItems: 'center' },

  stack: { flexDirection: 'row', alignItems: 'center' },
  stackSelected: { transform: [{ scale: 1.06 }] },

  // Chevauchement : la pile reste compacte même à quatre pastilles.
  overlapped: { marginLeft: -SIZE * 0.42 },

  shadow: {
    borderRadius: SIZE / 2,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2.5,
    borderColor: colors.white,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  restRing: { backgroundColor: colors.accent, borderColor: colors.white },
  restText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },

  labelWrap: {
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
    backgroundColor: '#0A0A0A',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayStrong,
  },
  label: { fontFamily: fonts.semibold, fontSize: 10, color: colors.white },
});
