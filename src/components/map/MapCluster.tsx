/**
 * Groupe de comptes trop proches pour tenir côte à côte.
 *
 * Montre le premier avatar et le nombre — assez pour comprendre « il y a du
 * monde ici, et voilà à quoi il ressemble » — plutôt qu'une pastille chiffrée
 * anonyme. Toucher le groupe zoome dessus jusqu'à ce qu'il se sépare.
 *
 * Même construction que `MapPin` : l'ombre est portée par une vue distincte de
 * celle qui rogne l'avatar, parce que sur Android `elevation` et
 * `overflow: 'hidden'` sur la même vue s'annulent.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Avatar from '../Avatar';
import { colors, fonts } from '../../theme';

interface MapClusterProps {
  count: number;
  /** Avatar mis en avant — celui du premier membre du groupe. */
  username: string;
  avatar?: string | null;
}

const SIZE = 52;

export default function MapCluster({ count, username, avatar }: MapClusterProps) {
  return (
    <View style={styles.root}>
      <View style={styles.shadow}>
        <View style={styles.ring}>
          <Avatar size={SIZE - 8} username={username} uri={avatar || undefined} />
        </View>
      </View>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },

  shadow: {
    borderRadius: SIZE / 2,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
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

  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.white },
});
