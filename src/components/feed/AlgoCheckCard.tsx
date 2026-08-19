import React, { useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius, withAlpha, duration as D, easing as E } from '../../theme';
import feedback from '../../utils/feedback';
import Tappable from '../ui/Tappable';

/**
 * « Ce genre de tweet, ça te parle ? »
 *
 * Une question posée dans le fil, à un moment choisi (voir `utils/algoCheck` —
 * c'est lui qui décide QUAND, ce composant ne décide que du COMMENT).
 *
 * Trois règles qui la séparent d'un sondage intrusif :
 *
 * 1. **Elle ne bloque rien.** Pas de modale, pas de voile : c'est une ligne de
 *    plus dans le fil. On peut la dépasser sans répondre, et elle ne
 *    réapparaîtra pas sur le même tweet.
 * 2. **Elle se referme sur elle-même.** Une fois répondu, la carte ne
 *    disparaît pas d'un coup — elle bascule sur un remerciement puis
 *    s'efface. Un élément qui s'évapore sous le doigt donne l'impression
 *    d'avoir raté quelque chose.
 * 3. **Elle dit à quoi elle sert.** « Ça m'aide à mieux choisir tes tweets »
 *    est la seule contrepartie honnête qu'on puisse offrir à quelqu'un à qui
 *    on demande un effort.
 */

export interface AlgoCheckCardProps {
  /** Réponse de l'utilisateur. `true` = ça lui plaît. */
  onAnswer: (liked: boolean) => void;
  /** Fermeture sans réponse. */
  onDismiss: () => void;
}

export default function AlgoCheckCard({ onAnswer, onDismiss }: AlgoCheckCardProps) {
  const [answered, setAnswered] = useState<null | boolean>(null);
  const fade = useRef(new Animated.Value(1)).current;

  const answer = useCallback(
    (liked: boolean) => {
      if (answered !== null) return;
      setAnswered(liked);
      feedback.success();
      onAnswer(liked);

      // Remerciement affiché, puis la carte s'éteint. La disparition est
      // différée : le temps de lire, pas le temps d'attendre.
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(fade, {
          toValue: 0,
          duration: D.base,
          easing: E.in,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onDismiss();
      });
    },
    [answered, fade, onAnswer, onDismiss],
  );

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: fade,
          transform: [
            { scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
          ],
        },
      ]}
    >
      {answered === null ? (
        <>
          <View style={styles.head}>
            <View style={styles.icon}>
              <Ionicons name="sparkles" size={15} color={colors.accent} />
            </View>
            <View style={styles.headText}>
              <Text style={styles.title}>Ce genre de tweet, ça te parle ?</Text>
              <Text style={styles.subtitle}>Ça m’aide à mieux choisir ce que je te montre.</Text>
            </View>
            <Tappable onPress={onDismiss} scaleTo={0.9} haptic={false} style={styles.close}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Tappable>
          </View>

          <View style={styles.actions}>
            <Tappable onPress={() => answer(false)} scaleTo={0.96} haptic={false} style={styles.half}>
              <View style={[styles.btn, styles.btnGhost]}>
                <Ionicons name="thumbs-down-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.btnGhostLabel}>Pas trop</Text>
              </View>
            </Tappable>

            <Tappable onPress={() => answer(true)} scaleTo={0.96} haptic={false} style={styles.half}>
              <View style={[styles.btn, styles.btnPrimary]}>
                <Ionicons name="thumbs-up" size={16} color={colors.onAccent} />
                <Text style={styles.btnPrimaryLabel}>Oui, j’aime</Text>
              </View>
            </Tappable>
          </View>
        </>
      ) : (
        <View style={styles.thanksRow}>
          <View style={[styles.icon, styles.iconDone]}>
            <Ionicons name="checkmark" size={15} color={colors.success} />
          </View>
          <Text style={styles.thanks}>
            {answered ? 'Noté — tu en verras plus.' : 'Noté — tu en verras moins.'}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 8,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: withAlpha(colors.accent, 0.22),
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.accent, 0.16),
  },
  iconDone: {
    backgroundColor: withAlpha(colors.success, 0.16),
  },
  headText: {
    flex: 1,
    paddingHorizontal: 10,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 14.5,
    lineHeight: 19,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  close: {
    padding: 4,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  half: {
    flex: 1,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: radius.md,
    gap: 7,
  },
  btnGhost: {
    backgroundColor: colors.surfaceElevated,
  },
  btnGhostLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 13.5,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
  },
  btnPrimaryLabel: {
    color: colors.onAccent,
    fontFamily: fonts.bold,
    fontSize: 13.5,
  },
  thanksRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thanks: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.medium,
    fontSize: 13.5,
    marginLeft: 10,
  },
});
