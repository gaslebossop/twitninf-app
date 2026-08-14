import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, withAlpha } from '../../theme';
import { icon as iconSize, round, space, touch, type } from '../../theme/eventScale';
import type { EventArt } from '../../theme/eventArt';
import { ease } from '../../utils/gesture';
import Tappable from '../ui/Tappable';
import RewardIcon from './RewardIcon';
import type { QuestView } from '../../types/events';

/**
 * Une quête.
 *
 * ── Les règles appliquées ─────────────────────────────────────────────────
 * Toutes les valeurs viennent de `theme/eventScale`, aucune n'est choisie à
 * l'œil. Concrètement :
 *
 *  - **Grille 8pt** : rembourrage de carte à 16, écarts internes à 8 et 12.
 *    La version précédente avait des 9, 11 et 13, qui ne s'accordaient avec
 *    rien — c'est ce qu'on ressent comme « pas professionnel » sans pouvoir
 *    le nommer.
 *  - **Rembourrage identique sur toutes les cartes** : c'est l'irrégularité
 *    du rembourrage, plus que sa valeur, qui se voit.
 *  - **Corps à 14 pt minimum.** Les 11,5 et 12,5 précédents étaient sous le
 *    plancher de lisibilité mobile.
 *  - **Bouton à 48 pt** de haut, recommandation Material pour une action
 *    principale. Il était à 40, sous le minimum Apple de 44.
 *
 * ── La hiérarchie ─────────────────────────────────────────────────────────
 * Trois niveaux, et un seul élément change selon l'état :
 *
 * 1. L'icône de récompense et le titre — ce qu'on regarde en premier pour
 *    décider si ça vaut le coup.
 * 2. La description, en secondaire.
 * 3. L'avancement, en tertiaire.
 *
 * Réclamable : la carte se borde et le bouton apparaît. Terminée : tout
 * s'éteint. Le reste ne bouge jamais, donc l'œil apprend où regarder.
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
  const done = state.claimed;

  // La barre rejoint sa valeur : à l'ouverture elle est déjà en place (rien ne
  // s'anime au montage), mais après une réclamation on VOIT qu'elle a bougé —
  // seul retour visuel disant que le serveur a pris le geste en compte.
  const target = useDerivedValue(
    () => withTiming(ratio, { duration: 420, easing: ease.out }),
    [ratio],
  );
  const fillStyle = useAnimatedStyle(() => ({
    width: `${interpolate(target.value, [0, 1], [0, 100], Extrapolation.CLAMP)}%`,
  }));

  const progressLabel = useMemo(() => {
    if (done) return 'Récupéré';
    if (locked) return 'Verrouillé';
    if (quest.goal === 1) return state.completed ? 'Fait' : 'À faire';
    return `${Math.min(shown.progress, shown.goal).toLocaleString('fr-FR')} / ${shown.goal.toLocaleString('fr-FR')}`;
  }, [done, locked, quest.goal, state.completed, shown.progress, shown.goal]);

  const tint = locked || done ? art.colors.textMuted : tier.color;

  return (
    <View
      style={[
        S.card,
        { backgroundColor: art.colors.surface, borderColor: art.colors.border },
        claimable && { borderColor: withAlpha(art.colors.festive, 0.6) },
        (locked || done) && S.cardMuted,
      ]}
    >
      {claimable && (
        <LinearGradient
          colors={[withAlpha(art.colors.festive, 0.1), 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}

      {/* ── Niveau 1 : ce que c'est, ce que ça rapporte ── */}
      <View style={S.head}>
        <RewardIcon
          kind={quest.reward.kind}
          tint={tier.color}
          size={touch.min}
          dimmed={locked || done}
        />

        <View style={S.headText}>
          <Text
            style={[S.title, { color: done ? art.colors.textMuted : art.colors.text }]}
            numberOfLines={2}
          >
            {quest.title}
          </Text>
          <Text style={[S.reward, { color: tint }]} numberOfLines={1}>
            {quest.reward.label}
          </Text>
        </View>

        {(locked || done) && (
          <MaterialCommunityIcons
            name={done ? 'check-circle' : 'lock'}
            size={iconSize.md}
            color={done ? tier.color : art.colors.textMuted}
          />
        )}
      </View>

      {/* ── Niveau 2 : pourquoi ── */}
      <Text style={[S.description, { color: art.colors.textDim }]} numberOfLines={2}>
        {quest.description}
      </Text>

      {/* ── Niveau 3 : où j'en suis ── */}
      <View style={S.footer}>
        <View style={[S.track, { backgroundColor: art.colors.surfaceAlt }]}>
          <Animated.View style={[S.fill, fillStyle, { backgroundColor: tint }]} />
        </View>
        <Text style={[S.progressLabel, { color: done ? tier.color : art.colors.textMuted }]}>
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
          <MaterialCommunityIcons
            name="gift-open"
            size={iconSize.sm}
            color={art.colors.onFestive}
          />
          <Text style={[S.claimLabel, { color: art.colors.onFestive }]}>
            {claiming ? 'Un instant…' : 'Récupérer'}
          </Text>
        </Tappable>
      )}
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

/** Décalage du texte sous l'icône, pour que tout s'aligne sur une colonne. */
const TEXT_INSET = touch.min + space.sm;

const S = StyleSheet.create({
  card: {
    borderRadius: round.xl,
    overflow: 'hidden',
    marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    // Rembourrage IDENTIQUE sur les quatre côtés et sur toutes les cartes.
    padding: space.md,
    // Ombre douce plutôt que filet marqué : c'est ce qui fait flotter une
    // carte blanche sur un gris très clair.
    shadowColor: '#2A1240',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardMuted: { opacity: 0.62 },

  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headText: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.heading, ...type.h2 },
  reward: { fontFamily: fonts.bold, ...type.bodySm },

  description: {
    fontFamily: fonts.regular,
    ...type.bodySm,
    marginTop: space.sm,
    marginLeft: TEXT_INSET,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
    marginLeft: TEXT_INSET,
  },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  progressLabel: {
    fontFamily: fonts.semibold,
    ...type.caption,
    minWidth: 64,
    textAlign: 'right',
  },

  claim: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    // 48 pt : recommandation Material pour une action principale. La version
    // précédente était à 40, sous le minimum Apple de 44.
    height: touch.comfortable,
    borderRadius: round.md,
    overflow: 'hidden',
    marginTop: space.md,
  },
  claimLabel: { fontFamily: fonts.bold, ...type.label },
});
