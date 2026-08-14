import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, radius, withAlpha } from '../../theme';
import type { EventArt } from '../../theme/eventArt';
import useResponsiveLayout from '../../hooks/useResponsiveLayout';
import RewardArt from './RewardArt';
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
      artSize: Math.round(cardWidth * (isCompact ? 0.46 : 0.5)),
    };
  }, [width, isTablet, isCompact]);

  const { owned, locked } = useMemo(
    () => ({
      owned: quests.filter((q) => q.state.claimed),
      locked: quests.filter((q) => !q.state.claimed),
    }),
    [quests],
  );

  const renderCard = (quest: QuestView, isOwned: boolean) => {
    const tier = art.tier[quest.tier];
    const kind = quest.reward.kind;

    return (
      <View
        key={quest.id}
        style={[
          S.card,
          {
            width: layout.cardWidth,
            backgroundColor: art.colors.surface,
            borderColor: isOwned ? withAlpha(tier.color, 0.5) : art.colors.border,
          },
        ]}
      >
        {/* La case obtenue prend la couleur de son palier. C'est la seule
            différence de traitement, et elle suffit : une vitrine où le
            possédé et le manquant se ressemblent ne montre pas de progression. */}
        <LinearGradient
          colors={
            isOwned
              ? [withAlpha(tier.color, 0.22), withAlpha(tier.color, 0.04)]
              : [withAlpha(art.colors.text, 0.04), 'transparent']
          }
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={S.artWrap}>
          <RewardArt
            kind={kind}
            tint={tier.color}
            accent={isOwned ? art.colors.festive : art.colors.ember}
            size={layout.artSize}
            dimmed={!isOwned}
          />
          {isOwned && (
            <View style={[S.check, { backgroundColor: tier.color }]}>
              <Ionicons name="checkmark" size={11} color={art.colors.onFestive} />
            </View>
          )}
        </View>

        <Text
          style={[S.kind, { color: isOwned ? tier.color : art.colors.textMuted }]}
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
      </View>
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
          {data.map((quest) => renderCard(quest, isOwned))}
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
  root: { gap: 4 },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    // Ombre douce plutôt que filet : c'est ce qui fait « flotter » une carte
    // blanche sur un gris très clair. Une bordure, à cet écart de valeur, se
    // verrait comme un trait sale.
    shadowColor: '#2A1240',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,

    padding: 15,
    marginBottom: 6,
    overflow: 'hidden',
  },
  summaryValue: { fontSize: 30, letterSpacing: 0.3 },
  summaryLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 10,
  },
  sectionTitle: { fontFamily: fonts.display, fontSize: 14.5, letterSpacing: 0.2 },
  sectionCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  sectionCountText: { fontFamily: fonts.bold, fontSize: 11 },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    // Ombre douce plutôt que filet : c'est ce qui fait « flotter » une carte
    // blanche sur un gris très clair. Une bordure, à cet écart de valeur, se
    // verrait comme un trait sale.
    shadowColor: '#2A1240',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    paddingHorizontal: 11,
    paddingTop: 12,
    paddingBottom: 13,
    overflow: 'hidden',
  },
  artWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  check: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kind: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 1.1 },
  label: { fontFamily: fonts.semibold, fontSize: 12.5, lineHeight: 16.5, marginTop: 3 },
  from: { fontFamily: fonts.regular, fontSize: 10.5, marginTop: 5 },
});
