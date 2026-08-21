import React, { memo, useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors, withAlpha } from '../../theme';
import TweetSkeleton from '../feed/TweetSkeleton';

/**
 * Écran de chargement unique de l'app.
 *
 * Avant, chaque page de la navbar avait le sien : ossature grise sur le fil,
 * `ActivityIndicator` sur Recherche / Messages / Profil / Revue / Vidéos /
 * Lives, et simple texte « Chargement… » sur Notifications et Kospor. Trois
 * langages visuels pour la même attente.
 *
 * Ici, un seul : des blocs gris qui respirent, à la forme du contenu à venir.
 * Le gris (`bone`) et la respiration (1300 ms, easeInOut, jamais de ressort)
 * sont repris à l'identique de `feed/TweetSkeleton`, qui était déjà la
 * référence validée — passer d'un onglet à l'autre pendant un chargement ne
 * doit produire aucune rupture.
 *
 * `variant` ne change que la disposition des blocs, jamais leur style : une
 * grille de vidéos et une liste de conversations n'ont pas la même forme, mais
 * doivent rester manifestement le même écran de chargement.
 */

export type ScreenSkeletonVariant =
  | 'feed'
  | 'list'
  | 'notification'
  | 'detail'
  | 'grid'
  | 'tweet'
  | 'thread'
  | 'messages';

const SHIMMER_MS = 1300;
const bone = withAlpha(colors.textMuted, 0.22);

/**
 * La respiration partagée. Un seul `useSharedValue` par écran de chargement,
 * et non un par bloc : les dizaines de blocs restent ainsi rigoureusement en
 * phase, et l'animation ne coûte qu'un timer sur le thread UI.
 */
function useShimmer() {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: SHIMMER_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    // Une boucle infinie survit au démontage du squelette : sans cette
    // annulation, elle continue de tourner pour le reste de la session.
    return () => cancelAnimation(shimmer);
  }, [shimmer]);

  return useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.38, 0.75]),
  }));
}

type BoneProps = {
  w?: number | `${number}%`;
  h?: number;
  r?: number;
  circle?: boolean;
  style?: any;
  pulse: any;
};

function Bone({ w, h = 11, r = 6, circle, style, pulse }: BoneProps) {
  return (
    <Animated.View
      style={[
        {
          width: w,
          height: h,
          borderRadius: circle && typeof h === 'number' ? h / 2 : r,
          backgroundColor: bone,
        },
        style,
        pulse,
      ]}
    />
  );
}

/** Liste : vignette et deux lignes. Conversations, lives, defis. */
function ListRows({ count, pulse }: { count: number; pulse: any }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={S.listRow}>
          <Bone w={48} h={48} circle pulse={pulse} />
          <View style={S.listContent}>
            <Bone w="42%" h={12} pulse={pulse} />
            <Bone w="78%" h={10} pulse={pulse} />
          </View>
          <Bone w={28} h={10} pulse={pulse} />
        </View>
      ))}
    </>
  );
}

/**
 * Notifications : la ligne n'a pas la forme d'une conversation. Elle est en
 * deux colonnes — pastille d'icône de type à gauche, puis avatar et bouton
 * « ··· » sur une première ligne, et le texte en dessous. Les cotes suivent
 * `NotificationsScreen` (colonne de 46, pastille 36, avatar 40).
 */
function NotificationRows({ count, pulse }: { count: number; pulse: any }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={S.notifRow}>
          <View style={S.notifLeft}>
            <Bone w={36} h={36} circle pulse={pulse} />
          </View>
          <View style={S.notifRight}>
            <View style={S.notifTop}>
              <Bone w={40} h={40} circle pulse={pulse} />
              <Bone w={18} h={18} circle pulse={pulse} />
            </View>
            <Bone w="72%" h={11} pulse={pulse} />
            <Bone w="46%" h={10} pulse={pulse} />
          </View>
        </View>
      ))}
    </>
  );
}

/**
 * Détail d'un tweet : le message ciblé occupe toute la largeur, en gros, avec
 * sa barre de statistiques, puis viennent les réponses.
 *
 * Distinct de `thread` : ouvrir un tweet isolé et ouvrir un maillon de
 * conversation ne donnent pas la même page, et un squelette identique pour les
 * deux fait sauter la mise en page au moment où le contenu arrive.
 */
function TweetDetailBlocks({ pulse }: { pulse: any }) {
  return (
    <>
      <View style={S.focusBlock}>
        <View style={S.focusHead}>
          <Bone w={48} h={48} circle pulse={pulse} />
          <View style={S.focusHeadText}>
            <Bone w="52%" h={13} pulse={pulse} />
            <Bone w="34%" h={11} pulse={pulse} />
          </View>
        </View>
        <Bone w="98%" h={14} style={S.mb8} pulse={pulse} />
        <Bone w="94%" h={14} style={S.mb8} pulse={pulse} />
        <Bone w="70%" h={14} style={S.mb16} pulse={pulse} />
        <Bone w="46%" h={11} style={S.mb16} pulse={pulse} />
        <View style={S.focusStats}>
          {[0, 1, 2, 3].map((i) => (
            <Bone key={i} w={46} h={16} r={8} pulse={pulse} />
          ))}
        </View>
      </View>
      <ListRows count={3} pulse={pulse} />
    </>
  );
}

/**
 * Fil de conversation : un ou deux messages parents compacts, relies par le
 * trait vertical du fil, puis le message cible en grand.
 */
function ThreadBlocks({ pulse }: { pulse: any }) {
  return (
    <>
      {[0, 1].map((i) => (
        <View key={i} style={S.ancestorRow}>
          <View style={S.ancestorGutter}>
            <Bone w={36} h={36} circle pulse={pulse} />
            <View style={S.threadLine} />
          </View>
          <View style={S.ancestorBody}>
            <Bone w="44%" h={11} pulse={pulse} />
            <Bone w="92%" h={10} pulse={pulse} />
            <Bone w="61%" h={10} pulse={pulse} />
          </View>
        </View>
      ))}
      <TweetDetailBlocks pulse={pulse} />
    </>
  );
}

/**
 * Messages : bulles alternées gauche/droite, pas la forme du fil.
 *
 * Distinct de `thread` (page de tweet + réponses) : une transcription n'a ni
 * gouttière ni avatar répété, et un squelette qui ne reprend pas cette forme
 * fait sauter la mise en page à l'arrivée des vrais messages. Les rangées
 * resserrées (`marginTop: 3`) miment une salve ; l'écart plus large
 * (`marginTop: 16`) mime le passage à la suivante — même rythme que
 * `ConversationThreadScreen2B`.
 */
const MESSAGE_ROWS: Array<{ w: number; mine: boolean; start: boolean }> = [
  { w: 150, mine: false, start: true },
  { w: 96, mine: false, start: false },
  { w: 128, mine: true, start: true },
  { w: 170, mine: false, start: true },
  { w: 110, mine: true, start: true },
  { w: 140, mine: true, start: false },
];

function MessageBlocks({ pulse }: { pulse: any }) {
  return (
    <View style={S.msgList}>
      {MESSAGE_ROWS.map((row, i) => (
        <View
          key={i}
          style={[
            S.msgRow,
            row.mine ? S.msgRowMine : S.msgRowOther,
            { marginTop: row.start ? 16 : 3 },
          ]}
        >
          <Bone w={row.w} h={36} r={14} pulse={pulse} />
        </View>
      ))}
    </View>
  );
}

/** Détail : une carte haute puis des cartes secondaires. */
function DetailBlocks({ pulse }: { pulse: any }) {
  return (
    <View style={S.detail}>
      <Bone w="52%" h={14} r={7} style={S.mb16} pulse={pulse} />
      <Bone w="100%" h={132} r={20} style={S.mb20} pulse={pulse} />
      <View style={[S.inline, S.mb20]}>
        <Bone w="48%" h={64} r={16} pulse={pulse} />
        <Bone w="48%" h={64} r={16} pulse={pulse} />
      </View>
      <Bone w="38%" h={13} r={7} style={S.mb16} pulse={pulse} />
      {[0, 1, 2].map((i) => (
        <Bone key={i} w="100%" h={58} r={16} style={S.mb12} pulse={pulse} />
      ))}
    </View>
  );
}

/** Grille : vignettes plein cadre. Le fil vidéo. */
function GridTiles({ pulse }: { pulse: any }) {
  const { width } = useWindowDimensions();
  const gap = 4;
  const size = (width - gap * 2) / 3;

  return (
    <View style={S.grid}>
      {Array.from({ length: 12 }, (_, i) => (
        <Bone key={i} w={size} h={size * 1.55} r={6} pulse={pulse} />
      ))}
    </View>
  );
}

function ScreenSkeleton({
  variant = 'feed',
  count = 6,
}: {
  variant?: ScreenSkeletonVariant;
  count?: number;
}) {
  const pulse = useShimmer();

  return (
    <View style={S.container} pointerEvents="none" accessibilityLabel="Chargement">
      {/* Le fil garde son ossature d'origine : c'est elle la reference dont
          le gris et la respiration sont repris ici, la redupliquer n'aurait
          fait que creer deux sources de verite pour le meme rendu. */}
      {variant === 'feed' && <TweetSkeleton count={count} />}
      {variant === 'list' && <ListRows count={count} pulse={pulse} />}
      {variant === 'notification' && <NotificationRows count={count} pulse={pulse} />}
      {variant === 'detail' && <DetailBlocks pulse={pulse} />}
      {variant === 'grid' && <GridTiles pulse={pulse} />}
      {variant === 'tweet' && <TweetDetailBlocks pulse={pulse} />}
      {variant === 'thread' && <ThreadBlocks pulse={pulse} />}
      {variant === 'messages' && <MessageBlocks pulse={pulse} />}
    </View>
  );
}

export default memo(ScreenSkeleton);

const S = StyleSheet.create({
  container: {
    flex: 1,
  },
  inline: {
    flexDirection: 'row',
    gap: 8,
  },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
  mb20: { marginBottom: 20 },


  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listContent: {
    flex: 1,
    gap: 8,
  },

  notifRow: {
    flexDirection: 'row',
    paddingLeft: 12,
    paddingRight: 16,
    paddingVertical: 14,
    marginHorizontal: 10,
    marginBottom: 2,
  },
  notifLeft: {
    width: 46,
    alignItems: 'center',
    paddingTop: 2,
    flexShrink: 0,
  },
  notifRight: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 4,
    gap: 8,
  },
  notifTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },

  detail: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  focusBlock: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  focusHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  focusHeadText: {
    flex: 1,
    gap: 8,
  },
  focusStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  ancestorRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  ancestorGutter: {
    alignItems: 'center',
    width: 36,
  },
  /** Le trait qui relie un parent au message suivant, comme dans le vrai fil. */
  threadLine: {
    flex: 1,
    width: StyleSheet.hairlineWidth * 2,
    minHeight: 22,
    marginTop: 6,
    backgroundColor: colors.border,
  },
  ancestorBody: {
    flex: 1,
    gap: 7,
    paddingBottom: 12,
  },

  msgList: { paddingHorizontal: 16, paddingTop: 4 },
  msgRow: { flexDirection: 'row' },
  msgRowOther: { justifyContent: 'flex-start' },
  msgRowMine: { justifyContent: 'flex-end' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
});
