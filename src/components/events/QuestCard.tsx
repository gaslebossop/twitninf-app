import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius, withAlpha } from '../../theme';
import type { EventArt } from '../../theme/eventArt';
import { ease } from '../../utils/gesture';
import Tappable from '../ui/Tappable';
import type { QuestView } from '../../types/events';

/**
 * Une quête, telle qu'elle se lit dans le hub.
 *
 * ── La règle de lecture ───────────────────────────────────────────────────
 * Une carte de quête doit répondre à trois questions dans cet ordre, sans
 * qu'on ait à chercher : qu'est-ce qu'on me demande, où j'en suis, qu'est-ce
 * que ça rapporte. L'ancienne version affichait le titre, la description, la
 * barre, la récompense et le bouton à la même force typographique — il fallait
 * lire les cinq pour comprendre lequel comptait.
 *
 * Ici, un seul élément change d'apparence selon l'état : le bloc de droite.
 * Il porte la progression tant qu'il en reste, puis le bouton quand c'est
 * gagné, puis rien quand c'est encaissé. Le reste de la carte ne bouge pas.
 *
 * ── Ce qui distingue verrouillé et caché ──────────────────────────────────
 * Verrouillé : on VOIT la quête, on sait ce qu'il faut faire avant. C'est ce
 * qui donne envie de finir la précédente. Caché : la carte n'existe pas —
 * c'est le contexte qui l'écarte, jamais ce composant.
 */

interface Props {
  quest: QuestView;
  art: EventArt;
  claiming: boolean;
  onClaim: (questId: string) => void;
}

function QuestCardBase({ quest, art, claiming, onClaim }: Props) {
  const tier = art.tier[quest.tier];
  const { state, locked } = quest;

  /** Sur une quête collective, la barre montre l'avancement de TOUS. */
  const shown = state.community ?? { progress: state.progress, goal: state.goal };
  const ratio = Math.min(1, shown.goal > 0 ? shown.progress / shown.goal : 0);

  const claimable = state.completed && !state.claimed && !locked;

  // La barre s'anime vers sa valeur : à l'ouverture du hub elle est déjà à sa
  // place (rien ne s'anime au montage), mais après une réclamation ou un
  // rafraîchissement, on VOIT qu'elle a bougé — c'est le seul retour visuel
  // qui dit que le serveur a bien pris en compte le geste.
  const target = useDerivedValue(() => withTiming(ratio, { duration: 420, easing: ease.out }), [ratio]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${interpolate(target.value, [0, 1], [0, 100], Extrapolation.CLAMP)}%`,
  }));

  const progressLabel = useMemo(() => {
    if (state.claimed) return 'Récupéré';
    if (locked) return 'Verrouillé';
    if (quest.goal === 1) return state.completed ? 'Fait' : 'À faire';
    return `${Math.min(shown.progress, shown.goal).toLocaleString('fr-FR')} / ${shown.goal.toLocaleString('fr-FR')}`;
  }, [state.claimed, state.completed, locked, quest.goal, shown.progress, shown.goal]);

  return (
    <View style={[S.card, locked && S.cardLocked]}>
      <LinearGradient
        colors={art.gradients.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Le liseré de palier est la seule couleur forte de la carte : c'est
          lui qui hiérarchise la liste d'un coup d'œil. */}
      <View style={[S.tierEdge, { backgroundColor: locked ? colors.border : tier.color }]} />

      <View style={S.body}>
        <View style={S.head}>
          <View
            style={[
              S.icon,
              { backgroundColor: locked ? colors.surfaceElevated : withAlpha(tier.color, 0.16) },
            ]}
          >
            <Ionicons
              name={(locked ? 'lock-closed' : quest.icon) as any}
              size={17}
              color={locked ? colors.textMuted : tier.color}
            />
          </View>

          <View style={S.headText}>
            <Text style={[S.title, locked && S.dimmed]} numberOfLines={1}>
              {quest.title}
            </Text>
            <Text style={[S.tierLabel, { color: locked ? colors.textMuted : tier.color }]}>
              {tier.label}
              {quest.kind === 'collective' ? ' · communauté' : ''}
              {quest.kind === 'secret' ? ' · secrète' : ''}
            </Text>
          </View>
        </View>

        <Text style={[S.description, locked && S.dimmed]}>{quest.description}</Text>

        {/* Récompense : toujours écrite en toutes lettres, jamais devinée
            depuis le type. Un « paquet surprise » annonce sa table sans
            annoncer son tirage. */}
        <View style={S.rewardRow}>
          <Ionicons
            name="gift"
            size={13}
            color={locked ? colors.textMuted : art.colors.festive}
          />
          <Text style={[S.reward, { color: locked ? colors.textMuted : art.colors.festive }]}>
            {quest.reward.label}
          </Text>
        </View>
        {!!quest.reward.teaser?.length && !locked && (
          <Text style={S.teaser}>Peut contenir : {quest.reward.teaser.join(' · ')}</Text>
        )}

        <View style={S.footer}>
          <View style={S.track}>
            <Animated.View
              style={[
                S.fill,
                fillStyle,
                { backgroundColor: locked ? colors.borderStrong : tier.color },
              ]}
            />
          </View>
          <Text style={[S.progressLabel, state.claimed && { color: tier.color }]}>
            {progressLabel}
          </Text>
        </View>

        {claimable && (
          <Tappable
            style={S.claim}
            onPress={() => onClaim(quest.id)}
            disabled={claiming}
            haptic="select"
            accessibilityLabel={`Récupérer : ${quest.reward.label}`}
          >
            <LinearGradient
              colors={art.gradients.festive}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={[S.claimLabel, { color: art.colors.onFestive }]}>
              {claiming ? 'Un instant…' : 'Récupérer'}
            </Text>
          </Tappable>
        )}
      </View>
    </View>
  );
}

/**
 * Onze cartes, un rafraîchissement toutes les cinq minutes : sans mémoïsation,
 * chaque réponse serveur reconstruit les onze sous-arbres, dégradés compris.
 */
export default memo(QuestCardBase, (prev, next) => {
  const a = prev.quest.state;
  const b = next.quest.state;
  return (
    prev.claiming === next.claiming &&
    prev.art.id === next.art.id &&
    prev.quest.locked === next.quest.locked &&
    a.progress === b.progress &&
    a.completed === b.completed &&
    a.claimed === b.claimed &&
    a.community?.progress === b.community?.progress
  );
});

const S = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardLocked: { opacity: 0.55 },
  tierEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  body: { padding: 14, paddingLeft: 16 },

  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headText: { flex: 1 },
  title: { color: colors.textPrimary, fontFamily: fonts.heading, fontSize: 15.5 },
  tierLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.3, marginTop: 1 },
  dimmed: { color: colors.textMuted },

  description: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18.5,
    marginBottom: 10,
  },

  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reward: { fontFamily: fonts.semibold, fontSize: 13 },
  teaser: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
  },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
  progressLabel: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    minWidth: 62,
    textAlign: 'right',
  },

  claim: {
    height: 42,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  claimLabel: { fontFamily: fonts.bold, fontSize: 14.5 },
});
