import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { fonts, withAlpha } from '../../theme';
import { round, space, touch, type } from '../../theme/eventScale';
import type { EventArt } from '../../theme/eventArt';
import { ease, springs } from '../../utils/gesture';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import RewardIcon from './RewardIcon';
import Tappable from '../ui/Tappable';
import type { QuestReward } from '../../types/events';

/**
 * La révélation d'une récompense.
 *
 * ── Pourquoi ça manquait ──────────────────────────────────────────────────
 * Réclamer affichait un toast en haut de l'écran, qui disparaissait tout seul.
 * Pour un gain de 120 NF au bout d'une quête, c'est le même retour que pour
 * « brouillon enregistré ». Or c'est le SEUL moment de tout l'événement où il
 * se passe quelque chose de bon — et c'est aussi le seul endroit où le contenu
 * d'un paquet surprise peut être annoncé, puisqu'il n'existe qu'une fois tiré.
 *
 * ── Ce qu'elle montre ─────────────────────────────────────────────────────
 * Ce que le SERVEUR a réellement accordé, jamais ce que la quête annonçait.
 * Sur un paquet, les deux diffèrent par construction.
 *
 * ── La séquence ───────────────────────────────────────────────────────────
 * Trois temps, et un seul dépasse le vocabulaire de mouvement de l'app :
 * l'objet apparaît avec un léger dépassement d'échelle. C'est la seule
 * exception assumée du projet — un ressort qui rebondit se lit ailleurs comme
 * un défaut, mais ici il dit « c'est à toi », et c'est exactement ce qu'on
 * veut dire. Tout est coupé si « Réduire les animations » est actif.
 */

interface Props {
  visible: boolean;
  reward: QuestReward | null;
  art: EventArt;
  onClose: () => void;
}

export default function RewardReveal({ visible, reward, art, onClose }: Props) {
  const reduceMotion = useReduceMotion();

  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      opacity.value = 0;
      scale.value = 0.7;
      glow.value = 0;
      return;
    }

    if (reduceMotion) {
      opacity.value = 1;
      scale.value = 1;
      glow.value = 1;
      return;
    }

    opacity.value = withTiming(1, { duration: 180, easing: ease.out });
    // Dépassement volontaire : 1,06 puis retour. Voir l'en-tête.
    scale.value = withSequence(
      withSpring(1.06, { ...springs.snappy, velocity: 3 }),
      withSpring(1, springs.settle),
    );
    // Le halo arrive APRÈS l'objet : il le désigne au lieu de l'accompagner.
    glow.value = withDelay(140, withTiming(1, { duration: 420, easing: ease.out }));
  }, [visible, reduceMotion, opacity, scale, glow]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }] as const,
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.9 }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!reward) return null;

  const isLoot = reward.kind === 'lootbox';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Une `<Modal>` rend dans SA fenêtre : le `GestureHandlerRootView` de
          `App.tsx` ne la couvre pas, et le bouton (un `Tappable`, donc un
          geste natif) ne répondrait pas sous Android sans celui-ci. */}
      <GestureHandlerRootView style={S.root}>
        <Animated.View style={[StyleSheet.absoluteFill, S.scrim, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[S.card, { backgroundColor: art.colors.surface }, cardStyle]}
        >
          {/* Halo derrière l'objet. Il vient de la couleur de la fête, pas du
              palier : c'est l'événement qui offre, pas la quête. */}
          <Animated.View style={[S.glow, glowStyle]} pointerEvents="none">
            <LinearGradient
              colors={[withAlpha(art.colors.festive, 0.35), 'transparent']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>

          <Text style={[S.eyebrow, { color: art.colors.festive }]}>
            {isLoot ? 'PAQUET OUVERT' : 'RÉCOMPENSE DÉBLOQUÉE'}
          </Text>

          <View style={S.artWrap}>
            <RewardIcon kind={reward.kind} tint={art.colors.festive} size={96} />
          </View>

          <Text style={[S.label, { color: art.colors.text }]}>{reward.label}</Text>

          <Text style={[S.note, { color: art.colors.textDim }]}>
            {isLoot
              ? 'Le contenu du paquet est tiré à l\'ouverture — celui-ci est le tien.'
              : 'Elle est à toi, et elle le reste après l\'événement.'}
          </Text>

          <Tappable
            style={S.close}
            onPress={onClose}
            haptic="select"
            accessibilityLabel="Fermer"
          >
            <LinearGradient
              colors={art.gradients.festive}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <MaterialCommunityIcons name="check" size={18} color={art.colors.onFestive} />
            <Text style={[S.closeLabel, { color: art.colors.onFestive }]}>Super</Text>
          </Tappable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  scrim: { backgroundColor: 'rgba(10,6,16,0.62)' },

  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: round.xxl,
    padding: space.lg,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#2A1240',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },

  eyebrow: { fontFamily: fonts.bold, ...type.caption, letterSpacing: 1.5 },
  artWrap: { marginTop: space.md, marginBottom: space.md },
  label: { fontFamily: fonts.display, ...type.h1, textAlign: 'center' },
  note: {
    fontFamily: fonts.regular,
    ...type.bodySm,
    textAlign: 'center',
    marginTop: space.xs,
  },

  close: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    alignSelf: 'stretch',
    height: touch.comfortable,
    borderRadius: round.pill,
    overflow: 'hidden',
    marginTop: space.lg,
  },
  closeLabel: { fontFamily: fonts.bold, ...type.label },
});
