import React, { useCallback, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts } from '../theme';

/**
 * Didacticiel de la revue communautaire — affiché UNE fois, à la première
 * ouverture de l'écran.
 *
 * Sans lui, l'écran s'ouvre directement sur un texte anonymisé et deux boutons,
 * sans jamais dire ce qui est attendu ni ce que le vote déclenche. Or on demande
 * à quelqu'un de trancher sur le message d'un inconnu : c'est précisément le
 * moment où il faut expliquer les règles du jeu, pas après.
 *
 * ⚠ Le contenu des étapes est volontairement IDENTIQUE à celui de l'app Windows
 * (`twitninf-windows/src/components/ReviewTutorial.tsx`). Ce sont deux codebases
 * séparés, donc deux copies : toute modification ici doit être reportée là-bas,
 * sinon la même fonctionnalité n'explique pas la même chose selon la plateforme.
 * Seule différence assumée : l'astuce clavier, qui n'a pas de sens au doigt.
 */

export const TUTORIAL_STORAGE_KEY = 'twitninf.review.tutorial.v1';

interface Step {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: 'eye-off-outline',
    title: 'Vous jugez un texte, pas une personne',
    body: "Le message a été réécrit automatiquement : prénoms, pseudos, lieux et coordonnées "
      + "sont remplacés par des étiquettes. Vous ne saurez jamais qui l'a écrit, et c'est voulu — "
      + "savoir qui parle change ce qu'on pense de ce qui est dit.",
  },
  {
    icon: 'scale-outline',
    title: 'Une seule question',
    body: "Ce message enfreint-il l'une des règles affichées ? Répondez sur ce que vous lisez, "
      + "pas sur ce que vous imaginez du contexte. Si rien ne correspond aux règles, c'est que "
      + "le message les respecte, même s'il vous déplaît.",
  },
  {
    icon: 'people-outline',
    title: 'Vous êtes trois',
    body: "Chaque message est confié à trois personnes tirées au sort. Vous ne verrez ni leur avis, "
      + "ni le résultat une fois le vôtre rendu : c'est ce qui vous empêche de voter comme les "
      + "autres plutôt que selon votre propre lecture.",
  },
  {
    icon: 'hammer-outline',
    title: 'Votre avis agit vraiment',
    body: "Il peut mener au retrait du message. La sanction exacte, elle, est décidée après coup — "
      + "ce n'est pas à vous de la choisir. Prenez le temps de lire : un message par minute lu "
      + "correctement vaut mieux que dix expédiés.",
  },
];

interface Props {
  visible: boolean;
  onDone: () => void;
}

const ReviewTutorial: React.FC<Props> = ({ visible, onDone }) => {
  const [index, setIndex] = useState(0);
  const last = index === STEPS.length - 1;

  const next = useCallback(() => {
    if (last) {
      setIndex(0); // prêt pour une réouverture depuis le bouton d'aide
      onDone();
    } else {
      setIndex((i) => i + 1);
    }
  }, [last, onDone]);

  const skip = useCallback(() => {
    setIndex(0);
    onDone();
  }, [onDone]);

  const step = STEPS[index];

  return (
    // `onRequestClose` = bouton retour Android. Il ferme le didacticiel plutôt
    // que l'écran entier : sans ça, le retour physique donnerait l'impression
    // d'avoir quitté la revue.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={skip}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconBox}>
            <Ionicons name={step.icon} size={22} color={colors.accent} />
          </View>

          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>

          <View style={styles.foot}>
            <View style={styles.dots}>
              {STEPS.map((s, i) => (
                <View key={s.title} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>

            <View style={styles.buttons}>
              {!last && (
                <TouchableOpacity onPress={skip} style={styles.skip} activeOpacity={0.7}>
                  <Text style={styles.skipText}>Passer</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={next} style={styles.next} activeOpacity={0.85}>
                <Text style={styles.nextText}>{last ? 'Commencer' : 'Suivant'}</Text>
                <Ionicons name="arrow-forward" size={15} color={colors.onAccent} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

/**
 * A-t-on déjà montré le didacticiel ? Lecture tolérante : un stockage
 * indisponible ne doit pas empêcher l'écran de s'ouvrir, quitte à remontrer
 * l'explication une fois de trop.
 */
export async function tutorialSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(TUTORIAL_STORAGE_KEY)) === 'done';
  } catch {
    return true;
  }
}

export async function markTutorialSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, 'done');
  } catch { /* stockage plein ou indisponible : sans conséquence */ }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: colors.overlay,
  },
  // Bloc plein, pas de verre : c'est la règle de l'app mobile, l'app Windows
  // est la seule à assumer les surfaces translucides.
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: 14,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontFamily: fonts.display,
    lineHeight: 24,
    marginBottom: 9,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontFamily: fonts.regular,
    lineHeight: 21,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  dotOn: { width: 18, backgroundColor: colors.accent },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  skip: { paddingHorizontal: 12, paddingVertical: 10 },
  skipText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.medium },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  nextText: { color: colors.onAccent, fontSize: 13.5, fontFamily: fonts.semibold },
});

export default ReviewTutorial;
