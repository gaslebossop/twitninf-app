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
import { fonts, radius, withAlpha } from '../../theme';
import type { EventArt } from '../../theme/eventArt';
import { ease } from '../../utils/gesture';
import Tappable from '../ui/Tappable';
import type { QuestView } from '../../types/events';

/**
 * Une quête.
 *
 * ── Ce que la première version ratait ─────────────────────────────────────
 * Elle empilait onze blocs strictement identiques : même taille, même poids
 * typographique pour le titre, la description, la récompense et l'état. Rien
 * ne disait lequel comptait, et on ne voyait que deux quêtes par écran — sur
 * onze. Le résultat se lisait comme un formulaire, pas comme une fête.
 *
 * Trois corrections structurelles :
 *
 * 1. **La récompense est une pastille, pas une ligne.** C'est l'accroche : ce
 *    qu'on regarde en premier pour décider si ça vaut le coup. Elle est
 *    remontée sur la ligne du titre, à droite, où l'œil la trouve sans lire.
 * 2. **Le palier est une couleur, pas un mot.** « Bronze » écrit en toutes
 *    lettres sous chaque titre prenait une ligne pour ne rien dire de plus
 *    que la teinte de la pastille.
 * 3. **Une seule zone change selon l'état.** Réclamable : la carte se borde
 *    d'or et le bouton apparaît. Terminée : tout s'éteint. Le reste ne bouge
 *    jamais, donc l'œil apprend où regarder.
 *
 * ── Autonomie de la palette ───────────────────────────────────────────────
 * Toutes les couleurs viennent de `art.colors`, jamais des jetons du thème.
 * La version précédente mélangeait les deux : en thème clair, la page gardait
 * son fond sombre imposé et récupérait des cartes blanches à texte foncé.
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
        // La bordure dorée est réservée au réclamable. C'est la seule chose de
        // la liste qui appelle une action immédiate ; lui donner un traitement
        // que rien d'autre ne porte est ce qui la rend trouvable d'un coup d'œil.
        claimable && { borderColor: art.colors.festive, borderWidth: 1.5 },
        (locked || done) && S.cardMuted,
      ]}
    >
      {claimable && (
        <LinearGradient
          colors={[withAlpha(art.colors.festive, 0.14), 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}

      {/* ── Ligne 1 : ce que c'est, et ce que ça rapporte ── */}
      <View style={S.head}>
        <View style={[S.icon, { backgroundColor: withAlpha(tint, 0.15) }]}>
          <Ionicons
            name={(locked ? 'lock-closed' : done ? 'checkmark' : quest.icon) as any}
            size={16}
            color={tint}
          />
        </View>

        <Text
          style={[S.title, { color: done ? art.colors.textMuted : art.colors.text }]}
          numberOfLines={1}
        >
          {quest.title}
        </Text>

        <View
          style={[
            S.rewardChip,
            {
              backgroundColor: withAlpha(locked || done ? art.colors.textMuted : art.colors.festive, 0.14),
            },
          ]}
        >
          <Text
            style={[
              S.rewardText,
              { color: locked || done ? art.colors.textMuted : art.colors.festive },
            ]}
            numberOfLines={1}
          >
            {quest.reward.label}
          </Text>
        </View>
      </View>

      {/* ── Ligne 2 : pourquoi, en deux lignes maximum ── */}
      <Text style={[S.description, { color: art.colors.textDim }]} numberOfLines={2}>
        {quest.description}
      </Text>

      {/* ── Ligne 3 : où j'en suis ── */}
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

const S = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingTop: 11,
    paddingBottom: 12,
  },
  cardMuted: { opacity: 0.6 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontFamily: fonts.heading, fontSize: 15 },
  rewardChip: {
    maxWidth: '42%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  rewardText: { fontFamily: fonts.bold, fontSize: 11.5 },

  description: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 17.5,
    marginTop: 8,
    // Aligné sur le titre, pas sur l'icône : le bloc de texte forme une
    // colonne nette au lieu de repartir du bord à chaque carte.
    marginLeft: 39,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginLeft: 39,
  },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  progressLabel: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    minWidth: 58,
    textAlign: 'right',
  },

  claim: {
    height: 40,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 11,
  },
  claimLabel: { fontFamily: fonts.bold, fontSize: 14 },
});
