import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '../../theme';
import { round } from '../../theme/eventScale';
import type { QuestRewardKind } from '../../types/events';

/**
 * L'icône d'une récompense.
 *
 * ── Pourquoi une bibliothèque et plus du SVG dessiné à la main ────────────
 * Une version précédente traçait chaque récompense en `<Path>` : pile de
 * pièces, étoile, banderole, éclair. Le résultat était maison — proportions
 * approximatives, épaisseurs de trait qui ne s'accordaient pas entre elles,
 * optique jamais corrigée. C'est exactement ce qui distingue un jeu d'icônes
 * dessiné par un fondeur d'un jeu d'icônes improvisé.
 *
 * `MaterialCommunityIcons` est déjà dans le binaire (via `@expo/vector-icons`,
 * utilisé partout dans l'app) : sept mille pictogrammes dessinés sur une même
 * grille, avec la même graisse et la même correction optique. Zéro octet
 * ajouté.
 *
 * ── Le choix des symboles ─────────────────────────────────────────────────
 * Tous UNIVERSELS, règle de conception d'interface ludique : un coffre pour la
 * surprise, une médaille pour l'accomplissement, une couronne pour le statut,
 * un éclair pour le bonus temporaire. Un symbole qu'il faut apprendre est un
 * symbole raté — on ne dispose que d'un coup d'œil.
 *
 * ── Ce qui reste dessiné ici ──────────────────────────────────────────────
 * Le CONTENANT, pas le symbole : pastille arrondie, dégradé teinté par le
 * palier de la quête, halo léger. C'est lui qui donne les trente-deux
 * variantes visuelles (huit types × quatre paliers) et l'identité de la fête,
 * pendant que l'icône reste un pictogramme propre.
 */

interface Props {
  kind: QuestRewardKind;
  /** Couleur du palier de la quête. */
  tint: string;
  size?: number;
  /** Éteint : récompense pas encore obtenue. */
  dimmed?: boolean;
}

/**
 * Le symbole de chaque type.
 *
 * Choisis pour être reconnus sans légende — voir l'en-tête. Le coffre est le
 * seul qui doive dire « on ne sait pas ce qu'il y a dedans », et c'est
 * précisément ce qu'un coffre fermé raconte.
 */
const SYMBOL: Record<QuestRewardKind, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  coins: 'cash-multiple',
  pro_days: 'crown',
  cosmetic: 'palette',
  badge: 'medal',
  title: 'label',
  lootbox: 'treasure-chest',
  multiplier: 'lightning-bolt',
  unlock: 'key-variant',
};

function RewardIconBase({ kind, tint, size = 48, dimmed = false }: Props) {
  // Le pictogramme occupe un peu plus de la moitié de la pastille : c'est le
  // rapport qui laisse l'anneau respirer sans que le symbole ne devienne
  // décoratif. En dessous il flotte, au-dessus il étouffe.
  const glyph = Math.round(size * 0.52);
  const color = dimmed ? withAlpha(tint, 0.45) : tint;

  return (
    <View
      style={[
        S.wrap,
        {
          width: size,
          height: size,
          // Rayon proportionnel plutôt que fixe : la pastille garde la même
          // rondeur qu'elle fasse 40 px dans une liste ou 72 px en vitrine.
          borderRadius: Math.max(round.md, size * 0.3),
          borderColor: withAlpha(tint, dimmed ? 0.14 : 0.28),
        },
      ]}
    >
      <LinearGradient
        colors={[
          withAlpha(tint, dimmed ? 0.1 : 0.24),
          withAlpha(tint, dimmed ? 0.04 : 0.08),
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <MaterialCommunityIcons name={SYMBOL[kind] ?? 'gift'} size={glyph} color={color} />
    </View>
  );
}

export default memo(RewardIconBase);

const S = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
