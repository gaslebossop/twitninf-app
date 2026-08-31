import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius, spacing, withAlpha } from '../../theme';
import Tappable from '../ui/Tappable';

/**
 * Bandeau d'entrée vers le vote hebdomadaire du meilleur tweet — idée retenue
 * sur La Forge. Même gabarit que `EventStrip` (une ligne de 44 px, pas de
 * carte qui repousse le fil), mais permanent : contrairement à un événement,
 * le vote de la semaine n'a pas de fin de campagne, juste une semaine qui en
 * remplace une autre.
 */
export default function WeeklyVoteStrip() {
  const navigation = useNavigation<any>();

  return (
    <Tappable
      style={styles.wrap}
      scaleTo={0.985}
      haptic="select"
      onPress={() => navigation.navigate('WeeklyVote')}
      accessibilityLabel="Voter pour le tweet de la semaine"
    >
      <View style={styles.icon}>
        <Ionicons name="trophy" size={15} color={colors.gold} />
      </View>
      <Text style={styles.message} numberOfLines={1}>Vote : le tweet de la semaine</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: 2,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    minHeight: 44,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.gold, 0.16),
  },
  message: { flex: 1, color: colors.textPrimary, fontFamily: fonts.semibold, fontSize: 14 },
});
