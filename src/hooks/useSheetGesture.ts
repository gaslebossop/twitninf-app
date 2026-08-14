import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { clamp, ease, projectDecay, rubberBand, springFrom } from '../utils/gesture';
import { duration } from '../theme/motion';
import { useReduceMotion } from './useReduceMotion';

/**
 * Le comportement commun de toutes les feuilles de l'app.
 *
 * Une feuille (menu d'actions, confirmation, saisie) se manipule : elle suit le
 * doigt, elle résiste quand on la pousse contre sa butée, et on s'en débarrasse
 * d'un geste plutôt qu'en visant un bouton « Annuler ». C'est ce qui la
 * distingue d'une boîte de dialogue.
 *
 * ── Ce que ce hook corrige ────────────────────────────────────────────────
 * Le glissé était écrit avec `PanResponder`, dont chaque événement de
 * déplacement traverse le pont et repasse par React. Résultat : le doigt bouge,
 * la feuille suit une ou deux trames plus tard, et l'écart se creuse dès que le
 * thread JS a autre chose à faire — c'est-à-dire à l'ouverture, au moment
 * précis où on saisit la feuille. Ici tout est en worklet : la feuille est
 * collée au doigt quoi qu'il arrive par ailleurs.
 *
 * ── Les trois règles de physique appliquées ───────────────────────────────
 * 1. **On décide sur l'intention, pas sur la distance.** Au relâchement, on ne
 *    regarde pas où la feuille EST mais où elle ALLAIT (`projectDecay`). Un
 *    petit geste vif ferme ; une longue traînée molle repose la feuille. C'est
 *    la différence entre « il faut tirer assez loin » et « il suffit de jeter ».
 * 2. **La butée résiste, elle ne bloque pas** (`rubberBand`) : tirée vers le
 *    haut la feuille avance de moins en moins, sans jamais décoller du bord.
 * 3. **L'animation hérite de la vitesse du doigt** (`springFrom`) : au
 *    relâchement il n'y a aucune rupture, la feuille continue son mouvement.
 *
 * On peut la rattraper en pleine animation, d'entrée comme de sortie :
 * `cancelAnimation` au premier contact, puis reprise depuis la valeur courante.
 */

export interface SheetGestureOptions {
  /**
   * Appelé une fois la feuille sortie de l'écran — c'est là qu'on démonte le
   * contenu et qu'on joue l'action choisie, jamais avant : une action qui ouvre
   * un écran pendant que la feuille descend fait se chevaucher les deux.
   */
  onClosed: () => void;
  /** Hauteur de la course d'entrée, en px. */
  travel?: number;
  /** Distance PROJETÉE au-delà de laquelle on ferme. */
  dismissDistance?: number;
}

export function useSheetGesture({
  onClosed,
  travel = 280,
  dismissDistance = 96,
}: SheetGestureOptions) {
  /** 0 = hors champ, 1 = posée. Piloté par l'ouverture et la fermeture. */
  const progress = useSharedValue(0);
  /** Décalage ajouté par le doigt. Séparé de `progress` pour qu'un geste en
   *  pleine ouverture n'écrase pas l'animation d'entrée — les deux s'ajoutent. */
  const drag = useSharedValue(0);
  /** Position du doigt au début du geste, pour reprendre une feuille en vol. */
  const start = useSharedValue(0);
  /** Garde de réentrance : une feuille ne doit se fermer qu'une fois. */
  const closing = useSharedValue(0);

  const reduceMotion = useReduceMotion();

  /**
   * `onClosed` change à chaque rendu du parent. Le passer directement dans un
   * worklet obligerait à reconstruire geste et animations à chaque fois : on
   * capture une indirection stable.
   */
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  const finish = useCallback(() => closedRef.current(), []);

  /**
   * Sortie de la feuille.
   *
   * Marquée `'worklet'` : elle est appelée depuis le geste (thread UI) ET
   * depuis React (bouton « Annuler », retour Android). Les deux fonctionnent —
   * une fonction worklet reste une fonction JS ordinaire — et rien ici
   * n'appelle de code non-worklet, condition sans laquelle l'appel côté UI
   * ferait tomber l'app sans le moindre message.
   */
  const dismiss = useMemo(() => {
    const run = (velocity: number) => {
      'worklet';
      if (closing.value) return;
      closing.value = 1;

      if (reduceMotion) {
        progress.value = 0;
        runOnJS(finish)();
        return;
      }

      // Durée déduite de ce qui reste à parcourir ET de la vitesse acquise :
      // la feuille poursuit sa course à l'allure du doigt au lieu de repartir
      // sur une durée fixe qui, elle, se voit toujours comme une rupture.
      const remaining = Math.max(travel - drag.value, 1);
      const speed = Math.max(Math.abs(velocity), 400);
      const ms = clamp((remaining / speed) * 1000, 110, duration.base);

      progress.value = withTiming(0, { duration: ms, easing: ease.in });
      drag.value = withTiming(travel, { duration: ms, easing: ease.in }, (done) => {
        if (done) runOnJS(finish)();
      });
    };
    return run;
  }, [closing, progress, drag, travel, reduceMotion, finish]);

  const open = useCallback(() => {
    closing.value = 0;
    drag.value = 0;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: reduceMotion ? 0 : duration.base,
      easing: ease.out,
    });
  }, [closing, drag, progress, reduceMotion]);

  /** Fermeture déclenchée par un bouton, le voile ou le retour Android. */
  const close = useCallback(() => dismiss(0), [dismiss]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        /**
         * Le geste ne prend la main qu'après 8 px VERS LE BAS : au-dessus de ce
         * seuil l'intention est claire, en dessous on laisse passer le tap sur
         * un élément de la feuille et le défilement de son contenu.
         */
        .activeOffsetY(8)
        /** Un mouvement franchement horizontal n'est pas un geste de feuille. */
        .failOffsetX([-28, 28])
        .onBegin(() => {
          // Rattrape la feuille où qu'elle en soit : sans cela, saisir une
          // feuille encore en train de monter la ferait sauter sous le doigt.
          cancelAnimation(drag);
          start.value = drag.value;
        })
        .onUpdate((event) => {
          const next = start.value + event.translationY;
          // Vers le bas : suivi exact. Vers le haut : butée élastique — la
          // feuille bouge encore un peu (le geste est reçu) sans décoller.
          drag.value = next >= 0 ? next : rubberBand(next, travel, 0.55);
        })
        .onEnd((event) => {
          const projected = drag.value + projectDecay(event.velocityY);
          if (projected > dismissDistance) dismiss(event.velocityY);
          else drag.value = withSpring(0, springFrom(event.velocityY));
        }),
    [drag, start, travel, dismissDistance, dismiss],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      {
        translateY:
          interpolate(progress.value, [0, 1], [travel, 0], Extrapolation.CLAMP) + drag.value,
      },
    ],
  }));

  /**
   * Le voile s'éclaircit à mesure que la feuille s'en va. Sans cela, il reste
   * plein noir jusqu'au dernier instant puis disparaît d'un coup : on ne voit
   * plus que la feuille bouge « par-dessus » quelque chose, et le geste perd
   * son retour visuel le plus lisible.
   */
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * interpolate(drag.value, [0, travel], [1, 0], Extrapolation.CLAMP),
  }));

  useEffect(
    () => () => {
      cancelAnimation(progress);
      cancelAnimation(drag);
    },
    [progress, drag],
  );

  return { gesture, sheetStyle, scrimStyle, open, close, progress, drag };
}

export default useSheetGesture;
