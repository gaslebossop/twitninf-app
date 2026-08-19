import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, withAlpha } from '../../theme';
import { round, space, type } from '../../theme/eventScale';
import type { EventArt } from '../../theme/eventArt';
import useResponsiveLayout from '../../hooks/useResponsiveLayout';
import RewardIcon from './RewardIcon';
import { enterItem } from './enter';
import type { QuestRewardKind, QuestView } from '../../types/events';

/**
 * L'onglet « Récompenses » — la vitrine.
 *
 * ── Pourquoi une vue séparée alors que chaque quête montre déjà la sienne ──
 * Parce que ce ne sont pas les mêmes questions. Sur une quête, la récompense
 * répond à « est-ce que ça vaut le coup de faire ÇA ? ». Ici, l'ensemble
 * répond à « qu'est-ce qu'il y a à gagner en tout ? » — la question qu'on se
 * pose AVANT de commencer, et celle qui décide si on s'y met.
 *
 * ── Pourquoi une grille et pas une liste ──────────────────────────────────
 * Une vitrine se regarde, elle ne se lit pas. En liste, on parcourt des
 * libellés ; en grille, on voit d'un coup ce qu'il y a, ce qu'on a, ce qu'il
 * manque. Chaque case porte une illustration vectorielle propre à son type,
 * teintée par le palier de sa quête — trente-deux visuels distincts sans un
 * seul fichier image (voir `RewardArt`).
 *
 * ── Responsive ────────────────────────────────────────────────────────────
 * Le nombre de colonnes suit la largeur réelle : deux sur téléphone, trois sur
 * tablette, et les illustrations sont vectorielles donc elles grandissent sans
 * perdre un pixel. Rien n'est figé en dur.
 */

interface Props {
  art: EventArt;
  quests: QuestView[];
}

const KIND_LABEL: Record<QuestRewardKind, string> = {
  coins: 'Monnaie',
  pro_days: 'Accès Pro',
  cosmetic: 'Cosmétique',
  badge: 'Badge',
  title: 'Titre',
  lootbox: 'Surprise',
  multiplier: 'Bonus',
  unlock: 'Déblocage',
};

export default function EventRewards({ art, quests }: Props) {
  const { width, isTablet, isCompact } = useResponsiveLayout();

  const layout = useMemo(() => {
    // La grille se déduit de la largeur DISPONIBLE (l'écran moins les marges
    // de la page), jamais d'un palier d'appareil : c'est ce qui la fait tenir
    // aussi en écran partagé ou en fenêtre redimensionnée.
    const available = width - 32;
    const columns = isTablet ? 3 : 2;
    const gap = 10;
    const cardWidth = (available - gap * (columns - 1)) / columns;
    return {
      columns,
      gap,
      cardWidth,
      // L'illustration occupe une part constante de la case : elle grandit
      // donc avec elle, du petit téléphone à la tablette.
      // Taille d'icone ramenee sur la grille : une pastille a 53,4 px casse
      // l'alignement de tout ce qui l'entoure.
      artSize: Math.round((cardWidth * (isCompact ? 0.46 : 0.5)) / 8) * 8,
    };
  }, [width, isTablet, isCompact]);

  const { owned, locked } = useMemo(
    () => ({
      owned: quests.filter((q) => q.state.claimed),
      locked: quests.filter((q) => !q.state.claimed),
    }),
    [quests],
  );

  const renderCard = (quest: QuestView, isOwned: boolean, index: number) => {
    const tier = art.tier[quest.tier];
    const kind = quest.reward.kind;

    /**
     * Une récompense OBTENUE doit se lire comme un gain, jamais comme une case
     * grisée.
     *
     * La première version teintait la carte par son palier. Or l'argent est un
     * gris : sur fond clair, une récompense gagnée au palier argent devenait
     * une carte grise à icône grise — exactement l'apparence d'un élément
     * désactivé. Le contraire de ce qu'on veut dire.
     *
     * Le palier reste sur l'ICÔNE, qui est là pour hiérarchiser. Le chrome de
     * la carte (fond, bordure, pastille de validation) passe, lui, à la
     * couleur de la fête : c'est elle qui dit « c'est à toi ».
     */
    const ownedTint = art.colors.festive;

    return (
      <Animated.View
        key={quest.id}
        entering={enterItem(index)}
        style={[
          S.card,
          {
            width: layout.cardWidth,
            backgroundColor: art.colors.surface,
            borderColor: isOwned ? withAlpha(ownedTint, 0.45) : art.colors.border,
          },
        ]}
      >
        {/* La case obtenue prend la couleur de son palier. C'est la seule
            différence de traitement, et elle suffit : une vitrine où le
            possédé et le manquant se ressemblent ne montre pas de progression. */}
        <LinearGradient
          colors={
            isOwned
              ? [withAlpha(ownedTint, 0.16), withAlpha(ownedTint, 0.03)]
              : [withAlpha(art.colors.text, 0.035), 'transparent']
          }
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={S.artWrap}>
          <RewardIcon
            kind={kind}
            tint={tier.color}
            size={layout.artSize}
            dimmed={!isOwned}
          />
          {isOwned && (
            <View style={[S.check, { backgroundColor: ownedTint }]}>
              <Ionicons name="checkmark" size={13} color="#FFFFFF" />
            </View>
          )}
        </View>

        <Text
          style={[S.kind, { color: isOwned ? ownedTint : art.colors.textMuted }]}
          numberOfLines={1}
        >
          {KIND_LABEL[kind] ?? 'Récompense'}
        </Text>

        <Text
          style={[S.label, { color: isOwned ? art.colors.text : art.colors.textDim }]}
          numberOfLines={3}
        >
          {quest.reward.label}
        </Text>

        <Text style={[S.from, { color: art.colors.textMuted }]} numberOfLines={1}>
          {quest.title}
        </Text>
      </Animated.View>
    );
  };

  const section = (title: string, data: QuestView[], isOwned: boolean) =>
    data.length === 0 ? null : (
      <View>
        <View style={S.sectionHead}>
          <Text style={[S.sectionTitle, { color: art.colors.text }]}>{title}</Text>
          <View style={[S.sectionCount, { backgroundColor: art.colors.surfaceAlt }]}>
            <Text style={[S.sectionCountText, { color: art.colors.textDim }]}>{data.length}</Text>
          </View>
        </View>
        <View style={[S.grid, { gap: layout.gap }]}>
          {data.map((quest, index) => renderCard(quest, isOwned, index))}
        </View>
      </View>
    );

  return (
    <View style={S.root}>
      <View
        style={[S.summary, { backgroundColor: art.colors.surface, borderColor: art.colors.border }]}
      >
        <LinearGradient
          colors={[withAlpha(art.colors.festive, 0.14), 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Text
          style={[S.summaryValue, { fontFamily: art.fonts.display, color: art.colors.festive }]}
        >
          {owned.length}/{quests.length}
        </Text>
        <Text style={[S.summaryLabel, { color: art.colors.textDim }]}>
          récompenses débloquées. Après le 31 août, celles qui restent ne seront
          plus jamais distribuées.
        </Text>
      </View>

      {section('À toi', owned, true)}
      {section('À gagner', locked, false)}
    </View>
  );
}

const S = StyleSheet.create({
  root: { gap: 0 },

  // Rembourrage identique a celui des cartes de quete : deux familles de
  // cartes avec deux rembourrages differents se voient immediatement.
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: round.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    marginBottom: space.xs,
    overflow: 'hidden',
    shadowColor: '#2A1240',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  summaryValue: { ...type.numeric },
  summaryLabel: { flex: 1, fontFamily: fonts.regular, ...type.bodySm },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  sectionTitle: { fontFamily: fonts.display, ...type.h1 },
  sectionCount: {
    minWidth: 24,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: round.pill,
    alignItems: 'center',
  },
  sectionCountText: { fontFamily: fonts.bold, ...type.caption },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    borderRadius: round.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    overflow: 'hidden',
    shadowColor: '#2A1240',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  artWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  check: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kind: { fontFamily: fonts.bold, ...type.caption, letterSpacing: 1 },
  label: { fontFamily: fonts.semibold, ...type.bodySm, marginTop: 2 },
  from: { fontFamily: fonts.regular, ...type.caption, marginTop: space.xxs },
});
