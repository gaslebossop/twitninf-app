import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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

  // Contenu réellement monté, séparé du prop `tweet`. `tweet` bascule à
  // `null` pour fermer (contrat du composant) : si le rendu se basait
  // directement dessus, `if (!tweet) return null` démonterait la vue au
  // même commit, AVANT que l'effet ci-dessous n'ait pu jouer la sortie —
  // un effet passif s'exécute après le commit, trop tard pour une vue déjà
  // retirée de l'arbre. On garde donc le dernier tweet ouvert en état local
  // et on ne l'efface qu'une fois l'animation de sortie terminée.
  const [renderedTweet, setRenderedTweet] = useState<Tweet | null>(null);
  // `origin` peut être remis à `null` par le parent en même temps que
  // `tweet` : sans son propre état local, l'ancre retomberait sur la
  // branche centre-écran de `anchor` et le panneau sauterait au milieu de
  // l'écran pendant qu'il s'estompe.
  const [renderedOrigin, setRenderedOrigin] = useState<CardRect | null>(null);

  // Identité stable (deps vides) : passée à `scheduleOnRN` depuis un
  // worklet, elle doit rester la même fonction d'un rendu à l'autre.
  const clearRendered = useCallback(() => {
    setRenderedTweet(null);
    setRenderedOrigin(null);
  }, []);

  useEffect(() => {
    if (tweet) {
      setRenderedTweet(tweet);
      setRenderedOrigin(origin);
      open.value = withSpring(1, springs.settle);
    } else {
      open.value = withTiming(0, timing.exit, (done) => {
        'worklet';
        // Une réouverture pendant la sortie (voir la branche `if (tweet)`
        // ci-dessus) annule ce `withTiming` : son callback arrive quand
        // même, mais avec `done === false`. Sans cette garde, un callback
        // de fermeture arrivé en retard effacerait le contenu que la
        // réouverture vient de remettre en place.
        if (done) scheduleOnRN(clearRendered);
      });
    }
  }, [tweet, origin, open, clearRendered]);

  // Nettoyage à la vraie disparition du composant uniquement : `open` est
  // une shared value, son identité est stable pour toute la durée de vie du
  // composant, donc cet effet ne se rejoue jamais entre `tweet`/`origin` —
  // exactement le piège qui avait figé l'animation de la Tâche 4 (cleanup
  // câblé sur une dépendance qui change à chaque mise à jour).
  useEffect(() => () => cancelAnimation(open), [open]);

  // Position : collée à la carte, rabattue dans l'écran si elle déborde.
  const anchor = useMemo(() => {
    if (!renderedOrigin) return { top: height / 2 - 120, left: width / 2 - SHEET_WIDTH / 2 };
    const left = Math.min(Math.max(12, renderedOrigin.x), width - SHEET_WIDTH - 12);
    const below = renderedOrigin.y + renderedOrigin.height + 8;
    const top = below + 260 > height ? Math.max(60, renderedOrigin.y - 268) : below;
    return { top, left };
  }, [renderedOrigin, width, height]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: open.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [{ scale: 0.92 + open.value * 0.08 }],
  }));

  if (!renderedTweet) return null;

  const act = (fn: (t: Tweet) => void) => () => {
    feedback.tap();
    fn(renderedTweet);
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
