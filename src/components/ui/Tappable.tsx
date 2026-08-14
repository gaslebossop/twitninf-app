import React, { useMemo, useRef } from 'react';
import { AccessibilityProps, StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ease } from '../../utils/gesture';
import feedback from '../../utils/feedback';

/**
 * Zone tapable de l'app.
 *
 * `TouchableOpacity` ne fait que baisser l'opacité : sur fond noir, le retour
 * est quasi invisible, et l'interface paraît morte sous le doigt. Ici, la
 * cible s'enfonce légèrement (échelle) ET vibre, dès l'APPUI — pas au
 * relâchement — pour que le retour précède le résultat réseau.
 *
 * ── Pourquoi Gesture Handler et non plus `Pressable` ──────────────────────
 * `Pressable` détecte l'appui côté JS : l'événement traverse le pont, React
 * rend, puis l'animation part. Tant que le thread JS est libre, ça ne se voit
 * pas. Il ne l'est jamais aux moments qui comptent — pendant le chargement
 * d'une page du fil, le décodage d'une réponse ou le montage d'un écran — et
 * c'est précisément là que les boutons paraissaient collants.
 *
 * Le geste est maintenant reconnu en natif et l'échelle animée sur le thread
 * UI : l'enfoncement part au contact du doigt, quoi que fasse React. Seule
 * l'ACTION (`onPress`) repasse par JS, via `runOnJS` — elle doit de toute
 * façon y aller.
 *
 * Effet de bord voulu : le geste est attaché à la vue STYLÉE. Avant, le
 * `Pressable` était monté à l'intérieur et ne couvrait que les enfants — le
 * `padding` porté par `style` n'était donc pas tapable. Les cibles gagnent
 * leur marge.
 *
 * L'échelle est animée en 110 ms avec `Easing.out`, sans ressort : un ressort
 * qui oscille sur un simple bouton se lit comme un défaut, pas comme du soin.
 *
 * `scaleTo` se règle selon la taille de la cible : une grande carte doit
 * s'enfoncer moins qu'une petite pastille pour parcourir la même distance
 * apparente (0.98 pour une carte pleine largeur, 0.92 pour une icône).
 */

export interface TappableProps extends AccessibilityProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Échelle atteinte à l'appui. 0.97 par défaut. */
  scaleTo?: number;
  /** Retour tactile joué à l'appui. `false` pour le couper (listes denses). */
  haptic?: false | 'tap' | 'select';
  disabled?: boolean;
  /** Marge de tolérance autour de la cible, en px. */
  hitSlop?: number;
  testID?: string;
}

const PRESS_IN_MS = 110;
const PRESS_OUT_MS = 140;
/**
 * Distance au-delà de laquelle le doigt n'appuie plus mais fait défiler.
 * Assez large pour pardonner un pouce qui roule, assez courte pour que la
 * liste sous-jacente prenne la main sans hésitation.
 */
const MAX_SLIDE = 12;
/**
 * `Gesture.Tap` abandonne au bout de 500 ms par défaut. `Pressable`, lui,
 * déclenchait même après un appui maintenu — un utilisateur qui hésite le
 * doigt posé ne doit pas voir son geste ignoré.
 */
const MAX_HOLD_MS = 60_000;

function playHaptic(kind: 'tap' | 'select') {
  if (kind === 'tap') feedback.tap();
  else feedback.select();
}

export default function Tappable({
  children,
  style,
  scaleTo = 0.97,
  haptic = 'tap',
  onPress,
  onLongPress,
  disabled,
  hitSlop,
  testID,
  ...accessibility
}: TappableProps) {
  const pressed = useSharedValue(0);

  /**
   * Les callbacks passent par une ref, pas par les dépendances du geste.
   *
   * Un objet `Gesture` reconstruit à chaque rendu se réenregistre en natif ;
   * dans une liste, cela arrive à chaque cellule et à chaque défilement. La
   * ref garde l'objet stable tout en appelant toujours la dernière version du
   * handler.
   */
  const handlers = useRef({ onPress, onLongPress });
  handlers.current = { onPress, onLongPress };

  const fire = React.useCallback(() => handlers.current.onPress?.(), []);
  const fireLong = React.useCallback(() => handlers.current.onLongPress?.(), []);

  const gesture = useMemo(() => {
    const press = () => {
      'worklet';
      pressed.value = withTiming(1, { duration: PRESS_IN_MS, easing: ease.out });
      if (haptic) runOnJS(playHaptic)(haptic);
    };
    const release = () => {
      'worklet';
      pressed.value = withTiming(0, { duration: PRESS_OUT_MS, easing: ease.out });
    };

    const tap = Gesture.Tap()
      .enabled(!disabled)
      .maxDuration(MAX_HOLD_MS)
      .maxDistance(MAX_SLIDE)
      .shouldCancelWhenOutside(true)
      .onBegin(press)
      // `onFinalize` et non `onEnd` : il court AUSSI quand le geste est annulé
      // (le doigt part en défilement). Sans lui, la cible resterait enfoncée.
      .onFinalize(release)
      .onEnd((_event, success) => {
        if (success) runOnJS(fire)();
      });

    if (hitSlop != null) tap.hitSlop(hitSlop);
    if (!onLongPress) return tap;

    const long = Gesture.LongPress()
      .enabled(!disabled)
      .onStart(() => {
        runOnJS(fireLong)();
      })
      .onFinalize(release);
    if (hitSlop != null) long.hitSlop(hitSlop);

    // `Exclusive` : le maintien l'emporte, le tap ne part que si le doigt est
    // reparti avant. Les deux ne peuvent jamais se déclencher ensemble.
    return Gesture.Exclusive(long, tap);
  }, [disabled, haptic, hitSlop, onLongPress, pressed, fire, fireLong]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        {...accessibility}
        testID={testID}
        accessible
        accessibilityRole={accessibility.accessibilityRole ?? 'button'}
        accessibilityState={{ disabled: !!disabled, ...accessibility.accessibilityState }}
        style={[style, animatedStyle]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
