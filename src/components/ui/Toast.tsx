import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, withAlpha, duration } from '../../theme';
import { clamp, ease, projectDecay, rubberBand, springFrom } from '../../utils/gesture';
import feedback from '../../utils/feedback';

/**
 * Retour d'action non bloquant.
 *
 * L'app comptait ~390 `Alert.alert` : chaque succès, chaque erreur et chaque
 * information anodine ouvrait une fenêtre système modale qu'il fallait fermer
 * à la main avant de pouvoir continuer. C'est la première cause du sentiment
 * de lourdeur — un tweet publié ne devrait jamais demander un « OK ».
 *
 * ── Parti pris visuel (DA « Pulse ») ─────────────────────────────────────
 * La première version portait un liseré de couleur à gauche, une pastille
 * pâle et une bordure fine : le vocabulaire de n'importe quelle bibliothèque
 * Material, greffé sur une app qui n'y ressemble pas.
 *
 * Ici, la grammaire de l'app : bloc noir plein, **pastille en aplat franc**
 * (pas de teinte à 16 %), titre en Jakarta gras, halo coloré porté par
 * l'ombre plutôt que par une bordure. Et une **jauge qui s'écoule** en bas du
 * bloc — c'est elle qui rend l'objet vivant : quelque chose bouge en
 * permanence pendant qu'il est là, et on voit le temps qu'il reste.
 *
 * ── Parti pris de mouvement ──────────────────────────────────────────────
 * Le bloc tombe du haut avec une décélération longue (`easing.out`) : il a du
 * poids, il se pose, il ne rebondit pas. Et il **suit le doigt** — un glissé
 * vers le haut le renvoie, avec l'élan du geste. C'est ce qui sépare une
 * notification qu'on subit d'un objet qu'on manipule.
 *
 * Limite connue : l'hôte est monté au-dessus du navigateur, donc SOUS une
 * `<Modal>` React Native (qui rend dans sa propre fenêtre native). Un toast
 * déclenché alors qu'une modale plein écran est ouverte ne sera pas visible —
 * dans ce cas, afficher le message dans la modale elle-même.
 */

export type ToastKind = 'success' | 'error' | 'info' | 'reward';

export interface ToastOptions {
  /** Ligne secondaire, optionnelle : le détail qu'on lit si on a le temps. */
  description?: string;
  /** Durée d'affichage. Par défaut 2,8 s (4,2 s pour une erreur : on la lit). */
  duration?: number;
  /** Action à droite du message (« Annuler », « Réessayer », « Voir »). */
  action?: { label: string; onPress: () => void };
  /** Coupe la vibration associée (utile en rafale). */
  silent?: boolean;
}

interface ToastEntry extends ToastOptions {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  reward: (message: string, options?: ToastOptions) => void;
  dismiss: () => void;
}

const noop = () => {};
const ToastContext = createContext<ToastContextValue>({
  show: noop,
  success: noop,
  error: noop,
  info: noop,
  reward: noop,
  dismiss: noop,
});

/**
 * Un type = une couleur pleine + un glyphe. `onTint` est la couleur du glyphe
 * POSÉ sur l'aplat : l'or est trop clair pour porter du blanc.
 */
const KIND: Record<
  ToastKind,
  { icon: keyof typeof Ionicons.glyphMap; tint: string; onTint: string; haptic: () => void }
> = {
  success: { icon: 'checkmark-sharp', tint: colors.success, onTint: colors.white, haptic: feedback.success },
  error: { icon: 'close-sharp', tint: colors.red, onTint: colors.white, haptic: feedback.error },
  info: { icon: 'information', tint: colors.accent, onTint: colors.white, haptic: () => {} },
  reward: { icon: 'diamond', tint: colors.gold, onTint: colors.black, haptic: feedback.reward },
};

/** Marge haute : sous l'encoche iOS, sous la barre d'état Android. */
const TOP_INSET = Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight ?? 24) + 8;

const CARD_WIDTH = Math.min(520, Dimensions.get('window').width * 0.94);
const ENTER_MS = duration.base;
/**
 * Au-delà de cette position PROJETÉE, le glissé renvoie le bloc au lieu de le
 * reposer. Le seuil est court, et il le reste : sur un message qu'on veut
 * chasser, l'intention est toujours nette — c'est la vitesse du geste, pas sa
 * longueur, qui la porte.
 */
const DISMISS_DISTANCE = 26;

function ToastCard({ entry, onDone }: { entry: ToastEntry; onDone: () => void }) {
  const { icon, tint, onTint } = KIND[entry.kind];

  // Une seule valeur pilote l'entrée : opacité, glissement et échelle ne
  // peuvent pas se désynchroniser, et tout reste sur le thread UI.
  const enter = useSharedValue(0);
  /** Décalage ajouté par le doigt, en plus de l'animation d'entrée. */
  const drag = useSharedValue(0);
  /** Progression de la jauge, indépendante : elle s'écoule linéairement. */
  const drain = useSharedValue(0);
  /** Position du doigt au début du geste, pour rattraper un bloc en vol. */
  const start = useSharedValue(0);
  const closing = useSharedValue(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const finish = useCallback(() => {
    clearTimer();
    onDone();
  }, [clearTimer, onDone]);

  /**
   * Sortie par le haut, d'où le bloc est venu.
   *
   * « Ce qui disparaît d'un côté doit être venu de ce côté » : un bloc qui
   * entre par le haut et sortirait par le bas se lit comme deux éléments
   * différents. Le sens du geste est aussi celui de l'animation.
   */
  const close = useMemo(() => {
    const run = (velocity: number) => {
      'worklet';
      if (closing.value) return;
      closing.value = 1;
      cancelAnimation(drain);

      const remaining = Math.max(90 + drag.value, 1);
      const speed = Math.max(Math.abs(velocity), 400);
      const ms = clamp((remaining / speed) * 1000, 110, duration.fast);

      enter.value = withTiming(0, { duration: ms, easing: ease.in });
      drag.value = withTiming(-90, { duration: ms, easing: ease.in }, (done) => {
        if (done) runOnJS(finish)();
      });
    };
    return run;
  }, [closing, drain, drag, enter, finish]);

  const closeFromJS = useCallback(() => close(0), [close]);

  const armTimer = useCallback(
    (ms: number) => {
      clearTimer();
      timer.current = setTimeout(closeFromJS, ms);
    },
    [clearTimer, closeFromJS],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // On ne capture qu'un geste vertical franc VERS LE HAUT : un appui
        // simple doit toujours atteindre le bouton d'action en dessous.
        .activeOffsetY(-6)
        .failOffsetX([-24, 24])
        .onBegin(() => {
          // Le doigt suspend le compte à rebours : on ne fait pas disparaître
          // sous la main de quelqu'un le message qu'il est en train de lire.
          cancelAnimation(drag);
          cancelAnimation(drain);
          start.value = drag.value;
          runOnJS(clearTimer)();
        })
        .onUpdate((event) => {
          const next = start.value + event.translationY;
          // Vers le haut : suivi au doigt. Vers le bas : butée élastique, le
          // bloc est déjà contre son bord et ne doit pas s'en décoller.
          drag.value = next <= 0 ? next : rubberBand(next, 90, 0.55);
        })
        .onEnd((event) => {
          const projected = drag.value + projectDecay(event.velocityY);
          if (projected < -DISMISS_DISTANCE) {
            close(event.velocityY);
            return;
          }
          drag.value = withSpring(0, springFrom(event.velocityY));
          // Le geste avorté rend un peu de temps de lecture.
          runOnJS(armTimer)(1600);
        }),
    [drag, drain, start, close, clearTimer, armTimer],
  );

  useEffect(() => {
    if (!entry.silent) KIND[entry.kind].haptic();

    const life = entry.duration ?? (entry.kind === 'error' ? 4200 : 2800);

    enter.value = withTiming(1, { duration: ENTER_MS, easing: ease.out });

    // Linéaire, et seulement ici : une jauge de temps qui accélère ou
    // ralentit ment sur le temps qui reste.
    drain.value = withTiming(1, { duration: life, easing: Easing.linear });

    armTimer(life);
    return clearTimer;
    // Une carte est montée une fois par toast (clé = id) : pas de re-jeu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: interpolate(enter.value, [0, 1], [-64, 0]) + drag.value },
      { scale: interpolate(enter.value, [0, 1], [0.92, 1]) },
    ] as const,
  }));

  const drainStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drain.value, [0, 1], [0, -CARD_WIDTH]) }],
  }));

  return (
    <GestureDetector gesture={pan}>
    <Animated.View
      style={[
        styles.card,
        // Le halo prend la couleur du type : c'est lui qui remplace la
        // bordure, et il décolle le bloc du contenu au lieu de l'encadrer.
        { shadowColor: tint },
        cardStyle,
      ]}
    >
      <View style={styles.row}>
        {/* Aplat franc, pas une pastille délavée : c'est la marque de la DA. */}
        <View style={[styles.badge, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={19} color={onTint} />
        </View>

        <View style={styles.body}>
          <Text style={styles.message} numberOfLines={2}>
            {entry.message}
          </Text>
          {!!entry.description && (
            <Text style={styles.description} numberOfLines={2}>
              {entry.description}
            </Text>
          )}
        </View>

        {entry.action ? (
          <Pressable
            onPress={() => {
              feedback.tap();
              entry.action?.onPress();
              closeFromJS();
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: withAlpha(tint, pressed ? 0.34 : 0.2) },
            ]}
          >
            <Text style={[styles.actionLabel, { color: tint }]} numberOfLines={1}>
              {entry.action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Jauge de vie. Pleine largeur, elle sort par la gauche : la portion
          encore visible est le temps qu'il reste. Transform seul → thread
          natif, aucun coût de rendu React pendant l'écoulement. */}
      <View style={styles.drainTrack}>
        <Animated.View style={[styles.drainFill, { backgroundColor: tint }, drainStyle]} />
      </View>
    </Animated.View>
    </GestureDetector>
  );
}

/**
 * Passerelle impérative.
 *
 * Le hook `useToast()` reste la façon normale d'afficher un message depuis un
 * composant. Mais l'app appelle aussi `Alert.alert` depuis des endroits qui ne
 * sont pas des composants (couche service, callbacks d'API, gestionnaires
 * définis hors du corps du composant) : là, aucun hook n'est disponible.
 * `toast.error(...)` y fonctionne sans rien restructurer.
 *
 * Si aucun `ToastProvider` n'est monté (test unitaire, écran isolé), l'appel
 * est simplement ignoré — jamais d'exception à cause d'un message d'interface.
 */
let hostShow: ToastContextValue['show'] | null = null;

export const toast = {
  show: (kind: ToastKind, message: string, options?: ToastOptions) =>
    hostShow?.(kind, message, options),
  success: (message: string, options?: ToastOptions) => hostShow?.('success', message, options),
  error: (message: string, options?: ToastOptions) => hostShow?.('error', message, options),
  info: (message: string, options?: ToastOptions) => hostShow?.('info', message, options),
  reward: (message: string, options?: ToastOptions) => hostShow?.('reward', message, options),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  // Un seul toast à l'écran : deux messages empilés ne se lisent pas, et le
  // second efface le premier de la tête de l'utilisateur.
  const [entry, setEntry] = useState<ToastEntry | null>(null);
  const nextId = useRef(1);

  const show = useCallback((kind: ToastKind, message: string, options?: ToastOptions) => {
    if (!message) return;
    setEntry({ id: nextId.current++, kind, message, ...options });
  }, []);

  useEffect(() => {
    hostShow = show;
    return () => {
      if (hostShow === show) hostShow = null;
    };
  }, [show]);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m, o) => show('success', m, o),
      error: (m, o) => show('error', m, o),
      info: (m, o) => show('info', m, o),
      reward: (m, o) => show('reward', m, o),
      dismiss: () => setEntry(null),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* `box-none` : la zone du toast laisse passer tout ce qui n'est pas la
          carte elle-même — on peut continuer à faire défiler dessous. */}
      <View style={styles.host} pointerEvents="box-none">
        {entry && (
          <ToastCard key={entry.id} entry={entry} onDone={() => setEntry(null)} />
        )}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: TOP_INSET,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    // La jauge est à fleur du bord bas : le bloc doit rogner ce qui dépasse.
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.34,
    shadowRadius: 22,
    elevation: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 12,
  },
  badge: {
    width: 36,
    height: 36,
    // Coin franc et large — la même géométrie que les blocs de l'app, pas
    // le cercle par défaut des bibliothèques de notification.
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: 12,
  },
  message: {
    color: colors.textPrimary,
    fontFamily: fonts.display,
    fontSize: 14.5,
    lineHeight: 19,
    letterSpacing: -0.1,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  actionBtn: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
  },
  actionLabel: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    letterSpacing: 0.2,
  },
  drainTrack: {
    height: 3,
    width: '100%',
    backgroundColor: colors.surfaceElevated,
  },
  drainFill: {
    height: 3,
    width: '100%',
  },
});

export default ToastProvider;
