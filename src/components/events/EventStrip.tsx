import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, withAlpha } from '../../theme';
import { round, space, touch, type } from '../../theme/eventScale';
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
 * ── Pourquoi il suit le thème de l'app, et pas la DA ──────────────────────
 * Une première version peignait ici le dégradé sombre de l'événement tout en
 * laissant les textes sur les jetons du thème. En thème CLAIR, cela donnait du
 * texte foncé sur un violet profond — illisible. La règle qui en découle : une
 * DA n'impose son fond que sur SA page. Ailleurs, elle ne prête qu'une couleur
 * d'accent, et c'est la surface de l'écran hôte qui commande. Le bandeau vit
 * dans le fil, il a donc le fond du fil.
 *
 * Le bandeau ne s'affiche que s'il y a quelque chose à dire : pas d'événement,
 * pas de ligne. Et il se dore dès qu'une récompense attend — c'est la seule
 * chose qui justifie d'attirer l'œil hors de la page d'événement.
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
      {/* Un voile de la couleur de fête sur la surface du fil — assez pour
          qu'on remarque la ligne, jamais assez pour repeindre le fond. */}
      <LinearGradient
        colors={[withAlpha(art.colors.festive, urgent ? 0.16 : 0.09), 'transparent']}
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
    gap: space.sm,
    marginHorizontal: space.md,
    marginTop: space.xs,
    marginBottom: space.xxs / 2,
    paddingLeft: space.sm,
    paddingRight: space.sm,
    // 44 pt : le bandeau est tapable, il tient donc la meme regle de cible
    // tactile que tout le reste.
    minHeight: touch.min,
    borderRadius: round.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    // La surface du FIL, pas celle de l'événement : sans ce fond opaque, le
    // voile doré ci-dessus se poserait sur le vide et changerait d'aspect
    // selon le thème.
    backgroundColor: colors.surface,
  },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  message: { color: colors.textPrimary, fontFamily: fonts.semibold, ...type.bodySm },
  claimable: { fontFamily: fonts.semibold, ...type.caption, marginTop: 2 },
});
