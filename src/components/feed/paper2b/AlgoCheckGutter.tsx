import React, { useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  paper,
  paperFonts,
  ps,
  GUTTER_W,
  ROW_PAD_X,
  ROW_GAP,
} from '../../../theme/paper2b';
import feedback from '../../../utils/feedback';

/**
 * 🧪 « Des tweets comme celui-ci, tu en veux… » — version « 2B — Gouttière ».
 *
 * Même rôle que `components/feed/AlgoCheckCard.tsx` (qui sert le fil d'origine)
 * et même contrat : `utils/algoCheck` décide QUAND, ce composant ne décide que
 * du COMMENT. Ce qui change, c'est tout le dessin.
 *
 * ── Pourquoi le dessin d'origine ne pouvait pas être repris ──────────────
 * La carte de Pulse est un rectangle posé SUR le fil : surface relevée, coins
 * arrondis, contour teinté d'accent, pastille d'icône, et deux boutons pleins
 * qui se partagent la largeur. Dans un fil sans une seule carte, sans un seul
 * filet et sans un seul aplat, elle ne se lit pas comme une question du fil :
 * elle se lit comme une publicité qu'on a laissée tomber dedans.
 *
 * ── Le dessin retenu : la colonne des compteurs pose la question ─────────
 * 2B a une colonne verticale à gauche où descend, ligne après ligne, un
 * chiffre en Archivo Bold — le nombre de cœurs. La question s'y insère : là où
 * il y aurait un compteur, il y a un « ? », au même corps, sur la même ligne
 * de base que la première ligne de texte. Le fil ne s'interrompt pas, sa
 * colonne de chiffres devient une question le temps d'une ligne.
 *
 * C'est tout le dessin. Pas d'encadré, pas de fond, pas de filet : la question
 * est une ligne du fil à qui il manque son tweet.
 *
 * ── La phrase finit dans les boutons ─────────────────────────────────────
 * « Des tweets comme celui-ci, tu en veux… » puis « Moins » / « Plus ». Les
 * deux pilules complètent la phrase au lieu de répondre à côté — c'est ce qui
 * permet de tenir en DEUX lignes là où la carte d'origine en prenait six
 * (titre, sous-titre, deux boutons, une croix).
 *
 * ── Les deux réponses sont dessinées à l'identique ───────────────────────
 * Même contour, même encre, aucun accent sur l'une des deux. Mettre « Plus »
 * en couleur en ferait la réponse attendue, et on récolterait des « Plus » de
 * politesse : la donnée collectée vaudrait moins que pas de question du tout.
 *
 * ── Aucune animation d'entrée ────────────────────────────────────────────
 * Le bloc est rendu dans le `renderItem` de la `FlatList`. Une animation de
 * montage y est rejouée à chaque recyclage de la ligne — on la voit repartir
 * en revenant sur ses pas, et le fil se met à clignoter à chaque aller-retour.
 * Seule la SORTIE est animée : elle, elle répond à un geste de l'utilisateur.
 *
 * ── `Animated` du cœur de React Native, pas Reanimated ───────────────────
 * La sortie enchaîne un délai, un fondu, puis un appel JS (`onDismiss`). En
 * Reanimated, ce rappel passerait par un worklet, et une fonction JS ordinaire
 * appelée depuis un worklet tue l'app sans le moindre journal. Pour un fondu
 * de 200 ms, le pont n'est pas le problème.
 */

export interface AlgoCheckGutterProps {
  /** Réponse de l'utilisateur. `true` = il en veut plus. */
  onAnswer: (liked: boolean) => void;
  /** Fermeture — après réponse ici, la question n'ayant pas de croix. */
  onDismiss: () => void;
}

/** Durée du fondu de sortie. */
const FADE_MS = 200;

/** Temps de lecture du reçu avant que le bloc s'efface. */
const RECEIPT_MS = 900;

function AlgoCheckGutter({ onAnswer, onDismiss }: AlgoCheckGutterProps) {
  const [answered, setAnswered] = useState<null | boolean>(null);
  const fade = useRef(new Animated.Value(1)).current;

  const answer = useCallback(
    (more: boolean) => {
      if (answered !== null) return;
      setAnswered(more);
      feedback.success();
      onAnswer(more);

      // Le reçu s'affiche, puis le bloc s'efface. Le retirer à l'instant du
      // geste donne l'impression d'avoir raté quelque chose : on a touché,
      // et la ligne a disparu sans dire ce qu'elle a compris.
      Animated.sequence([
        Animated.delay(RECEIPT_MS),
        Animated.timing(fade, {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onDismiss();
      });
    },
    [answered, fade, onAnswer, onDismiss],
  );

  return (
    <Animated.View style={[S.block, { opacity: fade }]}>
      {/* ── Gouttière : la marque, à la place du compteur ── */}
      <View style={S.gutter}>
        {answered === null ? (
          <Text style={S.mark} accessibilityElementsHidden>
            ?
          </Text>
        ) : (
          <View style={S.markDone}>
            <Ionicons name="checkmark" size={ps(22)} color={paper.accent} />
          </View>
        )}
      </View>

      {/* ── Contenu ── */}
      <View style={S.content}>
        {answered === null ? (
          <>
            <Text style={S.question}>Des tweets comme celui-ci, tu en veux…</Text>

            <View style={S.answers}>
              <TouchableOpacity
                style={S.pill}
                onPress={() => answer(false)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Moins de tweets comme celui-ci"
              >
                <Text style={S.pillText}>Moins</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={S.pill}
                onPress={() => answer(true)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Plus de tweets comme celui-ci"
              >
                <Text style={S.pillText}>Plus</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          // Le reçu dit ce que le fil va faire, pas merci : « merci » ne se
          // vérifie pas, « tu en verras plus » se vérifie en défilant.
          <Text style={S.receipt} accessibilityLiveRegion="polite">
            {answered ? 'Noté. Tu en verras plus.' : 'Noté. Tu en verras moins.'}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

export default React.memo(AlgoCheckGutter);

// ─── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // Exactement le gabarit d'une ligne du fil : même retrait, même gouttière,
  // même écart. C'est ce qui fait que le « ? » tombe dans la colonne des
  // compteurs et pas à côté.
  block: {
    flexDirection: 'row',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(4),
    paddingBottom: ps(18),
    backgroundColor: paper.bg,
  },
  gutter: {
    width: GUTTER_W,
    alignItems: 'center',
  },
  // Corps et interligne du compteur de cœurs (`countMain`), pour que le « ? »
  // et la première ligne de la question partagent leur ligne de base.
  mark: {
    fontFamily: paperFonts.display,
    fontSize: ps(21),
    lineHeight: ps(28),
    letterSpacing: ps(-0.63),
    color: paper.inkMeta,
  },
  // Même hauteur que la marque qu'elle remplace : sans ça, la ligne du reçu
  // remonte de quelques pixels au moment de la réponse.
  markDone: {
    height: ps(28),
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  question: {
    fontFamily: paperFonts.bodyStrong,
    fontSize: ps(19),
    lineHeight: ps(28),
    color: paper.ink,
  },
  answers: {
    flexDirection: 'row',
    gap: ps(8),
    marginTop: ps(12),
  },
  // La pilule « Répondre » d'une ligne du fil, au mot près : contour, rayon,
  // rembourrage. Deux grammaires de bouton dans un même fil, c'est déjà une
  // de trop.
  pill: {
    borderWidth: 1,
    borderColor: paper.outline,
    borderRadius: ps(9),
    paddingVertical: ps(6),
    paddingHorizontal: ps(16),
  },
  pillText: {
    fontFamily: paperFonts.bodyStrong,
    fontSize: ps(15),
    color: paper.ink,
  },
  receipt: {
    fontFamily: paperFonts.bodyStrong,
    fontSize: ps(19),
    lineHeight: ps(28),
    color: paper.inkSoft,
  },
});
