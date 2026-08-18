import React, { memo, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated';

import { colors, fonts, radius, withAlpha } from '../../../theme';
// ⚠️ Courbes REANIMATED (worklets), pas celles de `theme/motion` — voir les
// contraintes globales : un easing de `motion.ts` fait lever Reanimated.
import { springs, timing } from '../../../utils/gesture';
import feedback from '../../../utils/feedback';
import type { Tweet } from '../../../types/api';
import type { CardRect } from './ExploreCard';

interface ExploreActionSheetProps {
  /** `null` = fermé. */
  tweet: Tweet | null;
  origin: CardRect | null;
  isFollowing: boolean;
  onClose: () => void;
  onLike: (tweet: Tweet) => void;
  onFollow: (tweet: Tweet) => void;
  onReply: (tweet: Tweet) => void;
  onShare: (tweet: Tweet) => void;
  onNotInterested: (tweet: Tweet) => void;
}

const SHEET_WIDTH = 232;

/**
 * Panneau d'actions ouvert par appui long sur une carte.
 *
 * ── Pourquoi pas une <Modal> ───────────────────────────────────────────────
 * Une `<Modal>` est une FENÊTRE NATIVE : elle n'affiche jamais ce qu'il y a
 * derrière, donc le mur disparaîtrait — exactement l'aller-retour qu'on
 * cherche à supprimer. Ici c'est une vue absolue au-dessus de la grille : la
 * position de défilement est intacte, et on voit la carte concernée.
 *
 * ── Pourquoi il grandit depuis la carte ────────────────────────────────────
 * Un panneau qui apparaît au centre de l'écran n'a aucun lien visible avec ce
 * qu'on vient de toucher. Ancré sur le rectangle mesuré, il dit de quoi il
 * parle sans le moindre libellé. On part de 0,92 et jamais de 0 : une échelle
 * nulle donne un surgissement, pas une ouverture.
 */
function ExploreActionSheet({
  tweet, origin, isFollowing, onClose, onLike, onFollow, onReply, onShare, onNotInterested,
}: ExploreActionSheetProps) {
  const { width, height } = useWindowDimensions();
  const open = useSharedValue(0);

  useEffect(() => {
    if (tweet) {
      open.value = withSpring(1, springs.settle);
    } else {
      open.value = withTiming(0, timing.exit);
    }
  }, [tweet, open]);

  // Position : collée à la carte, rabattue dans l'écran si elle déborde.
  const anchor = useMemo(() => {
    if (!origin) return { top: height / 2 - 120, left: width / 2 - SHEET_WIDTH / 2 };
    const left = Math.min(Math.max(12, origin.x), width - SHEET_WIDTH - 12);
    const below = origin.y + origin.height + 8;
    const top = below + 260 > height ? Math.max(60, origin.y - 268) : below;
    return { top, left };
  }, [origin, width, height]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: open.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [{ scale: 0.92 + open.value * 0.08 }],
  }));

  if (!tweet) return null;

  const act = (fn: (t: Tweet) => void) => () => {
    feedback.tap();
    fn(tweet);
    onClose();
  };

  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }[] = [
    { icon: 'heart-outline', label: 'Aimer', onPress: act(onLike) },
    // Pas de « Ne plus suivre » : `handleExploreFollow` sort immédiatement si
    // l'auteur est déjà suivi. Proposer un geste qui ne fait rien est pire que
    // ne pas le proposer.
    ...(isFollowing
      ? []
      : [{ icon: 'person-add-outline' as const, label: 'Suivre l’auteur', onPress: act(onFollow) }]),
    { icon: 'chatbubble-outline', label: 'Répondre', onPress: act(onReply) },
    { icon: 'arrow-redo-outline', label: 'Partager', onPress: act(onShare) },
    { icon: 'eye-off-outline', label: 'Moins de ça', onPress: act(onNotInterested), danger: true },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
      </Animated.View>

      <Animated.View style={[styles.sheet, anchor, sheetStyle]}>
        {rows.map((row, i) => (
          <Pressable
            key={row.label}
            onPress={row.onPress}
            style={({ pressed }) => [
              styles.row,
              i > 0 && styles.rowBorder,
              pressed && styles.rowPressed,
            ]}
          >
            <Ionicons
              name={row.icon}
              size={17}
              color={row.danger ? colors.textMuted : colors.textPrimary}
            />
            <Text
              style={[styles.rowText, row.danger && styles.rowTextDanger]}
              maxFontSizeMultiplier={1.2}
            >
              {row.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

export default memo(ExploreActionSheet);

const styles = StyleSheet.create({
  backdrop: { backgroundColor: withAlpha(colors.black, 0.45) },
  sheet: {
    position: 'absolute',
    width: SHEET_WIDTH,
    borderRadius: radius.lg,
    // Fond OPAQUE obligatoire : rien ne doit transparaître à travers.
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: `0 12px 32px ${withAlpha(colors.black, 0.45)}`,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 13 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceHover },
  rowText: { flex: 1, color: colors.textPrimary, fontSize: 14, fontFamily: fonts.medium },
  rowTextDanger: { color: colors.textMuted },
});
