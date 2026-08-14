import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, withAlpha } from '../../theme';
import { useEvents } from '../../contexts/EventsContext';
import Tappable from '../ui/Tappable';

/**
 * Le bandeau d'événement du fil.
 *
 * ── Ce qu'il remplace ─────────────────────────────────────────────────────
 * `EventBanner` ET `FunctionalEventBanner` : deux composants, deux sources,
 * empilés l'un au-dessus de l'autre en haut du fil. Quand les deux systèmes
 * étaient actifs en même temps — le cas nominal, puisqu'un événement complet
 * demandait d'en créer un dans chacun — l'utilisateur voyait DEUX bandeaux
 * annonçant la même fête.
 *
 * ── Pourquoi une ligne et pas une carte ───────────────────────────────────
 * L'ancien bandeau faisait 88 px de haut, avec dégradé animé, emoji, titre,
 * description et pastille. Sur le fil, il repoussait le premier tweet sous la
 * ligne de flottaison — pendant huit jours, tous les jours. Ici : une ligne
 * de 44 px qui dit ce qui se passe, combien il reste à récupérer, et emmène
 * au hub. Le décor est SUR la page d'événement ; le fil, lui, reste le fil.
 *
 * Le bandeau ne s'affiche que s'il y a quelque chose à dire : pas d'événement,
 * pas de ligne. Et il passe en doré dès qu'une récompense attend — c'est la
 * seule chose qui justifie d'attirer l'œil hors de la page d'événement.
 */
export default function EventStrip() {
  const navigation = useNavigation<any>();
  const { event, quests, art, isLive } = useEvents();

  const claimable = useMemo(
    () => quests.filter((q) => q.state.completed && !q.state.claimed && !q.locked).length,
    [quests],
  );

  if (!isLive || !event || event.features.banner === false) return null;

  const message = event.banner_message || event.name;
  const urgent = claimable > 0;

  return (
    <Tappable
      style={S.wrap}
      scaleTo={0.985}
      haptic="select"
      onPress={() => navigation.navigate('Event')}
      accessibilityLabel={`Événement ${event.name}`}
    >
      <LinearGradient
        colors={art.gradients.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[S.edge, { backgroundColor: art.colors.festive }]} />

      <View style={[S.icon, { backgroundColor: withAlpha(art.colors.festive, 0.16) }]}>
        <Ionicons
          name={urgent ? 'gift' : 'sparkles'}
          size={15}
          color={art.colors.festive}
        />
      </View>

      <View style={S.text}>
        <Text style={S.message} numberOfLines={1}>
          {message}
        </Text>
        {urgent && (
          <Text style={[S.claimable, { color: art.colors.festive }]} numberOfLines={1}>
            {claimable === 1 ? '1 récompense à récupérer' : `${claimable} récompenses à récupérer`}
          </Text>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Tappable>
  );
}

const S = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 2,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 9,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  message: { color: colors.textPrimary, fontFamily: fonts.semibold, fontSize: 13.5 },
  claimable: { fontFamily: fonts.semibold, fontSize: 11.5, marginTop: 1 },
});
