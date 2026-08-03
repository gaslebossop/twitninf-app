import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type EasingFunction,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { decorationColors, type ProfileCustomization } from '../services/profileCustomizationService';

/* ════════════════════════════════════════════════════════════════════════
   ARRIVÉE SUR UN PROFIL PREMIUM — la mise en scène (mobile)
   ════════════════════════════════════════════════════════════════════════
   Pendant de `premium-entrance` côté Windows (twitninf-windows,
   src/instagram.css) : le thème inonde la page, la bannière se déplie,
   l'avatar atterrit dans un halo, le nom s'allume, puis le texte cascade.
   Les deux apps doivent raconter la même arrivée — un profil payant ne peut
   pas être spectaculaire d'un côté et plat de l'autre.

   Ce qui la garde FLUIDE :
   • `useNativeDriver: true` PARTOUT. La valeur est copiée une fois vers le
     thread UI, qui interpole tout seul : la scène continue même si le JS est
     occupé à parser la réponse des tweets — et c'est exactement ce qui se
     passe à l'ouverture d'un profil ;
   • du coup, seuls `opacity` et `transform` sont animés : ce sont les seules
     propriétés que le driver natif accepte, et ce sont aussi les seules qui
     ne coûtent ni layout ni re-rendu ;
   • course courte, durée longue. Un grand déplacement rapide se lit comme un
     saut même parfaitement interpolé ; c'est souvent ça, « pas fluide ».
   • les compteurs sont le SEUL élément piloté en JS, et ils vivent dans leur
     propre composant : leurs 40 rendus par seconde ne touchent qu'un `Text`,
     jamais l'écran de profil (1 300 lignes de JSX) qui les contient.
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Durée totale de la scène. Sert à démonter les décors éphémères (le halo) :
 * un peu plus longue que le dernier plan, qui est déjà invisible à ce moment.
 */
export const PROFILE_ENTRANCE_MS = 2000;

/** Expo-out : part vite, se pose sans rebond. La courbe de toute la scène. */
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
/**
 * Léger dépassement, réservé à ce qui « atterrit » (avatar, bouton d'action).
 * Volontairement discret : plus haut, le retour se lit comme un à-coup et non
 * comme de l'inertie.
 */
const EASE_BACK = Easing.bezier(0.2, 1.16, 0.32, 1);

/*
 * Le réglage système est lu UNE fois au chargement du module, pas à chaque
 * montage : `isReduceMotionEnabled` est asynchrone, et le consulter au moment
 * où l'écran s'ouvre laisserait la scène démarrer avant d'avoir la réponse.
 * L'écran de profil s'ouvre toujours bien après le démarrage de l'app, donc la
 * valeur est déjà là quand on en a besoin.
 */
let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((enabled) => { reduceMotion = enabled; })
  .catch(() => undefined);
AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => { reduceMotion = enabled; });

/**
 * Une piste de la scène : 0 au départ, 1 à l'arrivée.
 *
 * ⚠ Deux précautions contre le « flash d'état final », que la charte interdit
 * (rien ne doit apparaître habillé puis sauter) :
 * 1. la valeur est créée à 1 quand on ne joue PAS — sinon un profil nu, ou un
 *    utilisateur en mouvement réduit, resterait invisible jusqu'au premier
 *    effet ;
 * 2. la remise à 0 passe par `useLayoutEffect`, donc elle est appliquée dans
 *    le même commit que le rendu qui déclenche la scène. En `useEffect`, le
 *    profil aurait le temps d'apparaître entièrement posé pendant une frame
 *    avant de repartir de zéro.
 */
function useTrack(active: boolean, delay: number, duration: number, easing: EasingFunction) {
  const ref = useRef<Animated.Value | null>(null);
  if (ref.current === null) ref.current = new Animated.Value(active ? 0 : 1);
  const value = ref.current;

  useLayoutEffect(() => {
    if (!active) { value.setValue(1); return; }
    value.setValue(0);
    const animation = Animated.timing(value, {
      toValue: 1,
      delay,
      duration,
      easing,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, delay, duration, easing, value]);

  return value;
}

const fadeUp = (value: Animated.Value, distance: number) => ({
  opacity: value,
  transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
});

export interface ProfileEntrance {
  /** La scène tourne : monter les décors éphémères (halo), lancer les compteurs. */
  staging: boolean;
  theme: any;
  banner: any;
  avatar: any;
  name: any;
  action: any;
  /** Cascade : 0 = première ligne sous le nom. Au-delà de la 6e, tout arrive ensemble. */
  line: (index: number) => any;
}

/**
 * Pilote la scène d'arrivée. `active` doit rester FAUX tant que la
 * personnalisation n'est pas connue : jouer la chorégraphie sur un profil
 * encore nu, puis le peindre après coup, ferait deux arrivées au lieu d'une.
 */
export function useProfileEntrance(active: boolean): ProfileEntrance {
  const play = active && !reduceMotion;

  const theme = useTrack(play, 0, 1100, EASE_OUT);
  const banner = useTrack(play, 90, 1150, EASE_OUT);
  const avatar = useTrack(play, 210, 1050, EASE_BACK);
  const name = useTrack(play, 360, 850, EASE_OUT);
  const action = useTrack(play, 600, 820, EASE_BACK);

  // Cascade : une piste par ligne, 50 ms d'écart. Un nombre FIXE de pistes,
  // parce qu'un hook ne peut pas vivre dans une boucle de longueur variable —
  // et le profil n'a de toute façon jamais plus de six lignes sous le nom.
  const l0 = useTrack(play, 440, 820, EASE_OUT);
  const l1 = useTrack(play, 490, 820, EASE_OUT);
  const l2 = useTrack(play, 540, 820, EASE_OUT);
  const l3 = useTrack(play, 590, 820, EASE_OUT);
  const l4 = useTrack(play, 640, 820, EASE_OUT);
  const l5 = useTrack(play, 690, 820, EASE_OUT);
  const lines = [l0, l1, l2, l3, l4, l5];

  const [staging, setStaging] = useState(false);
  useEffect(() => {
    if (!play) { setStaging(false); return; }
    setStaging(true);
    const timer = setTimeout(() => setStaging(false), PROFILE_ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, [play]);

  return {
    staging,
    // Le thème descend du bord haut : la couleur inonde la page.
    theme: {
      opacity: theme,
      transform: [{ translateY: theme.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
    },
    // La bannière se pose en reculant à peine — assez pour lire un mouvement
    // de profondeur, pas assez pour qu'on voie la photo « zoomer ».
    banner: {
      opacity: banner,
      transform: [{ scale: banner.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }],
    },
    // L'avatar tombe, tourne un peu, dépasse sa taille puis se cale.
    avatar: {
      opacity: avatar,
      transform: [
        { translateY: avatar.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
        { scale: avatar.interpolate({ inputRange: [0, 1], outputRange: [0.74, 1] }) },
        { rotate: avatar.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '0deg'] }) },
      ],
    },
    name: {
      opacity: name,
      transform: [
        { translateY: name.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
        { scale: name.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
      ],
    },
    // Le bouton d'action vient du HAUT : il est ancré près de la bannière,
    // le faire monter comme le texte le sortirait de sa ligne.
    action: {
      opacity: action,
      transform: [
        { translateY: action.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
        { scale: action.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
      ],
    },
    line: (index: number) => fadeUp(lines[Math.min(index, lines.length - 1)], 14),
  };
}

/**
 * Le halo d'atterrissage : deux anneaux qui se propagent depuis sous l'avatar.
 *
 * ⚠ L'échelle plafonne à 1,3 et ce n'est pas un choix esthétique. L'avatar est
 * collé au bord gauche de l'écran (16 px de marge + 46 px de demi-avatar) : son
 * centre n'est qu'à ~62 px du bord. Un anneau plus large se ferait trancher une
 * corde en plein cercle par le bord de l'écran — ça se lit comme un bug
 * d'affichage, pas comme une onde. À 1,3 il atteint 60 px et s'éteint juste
 * avant. Même contrainte que sur desktop, où la colonne centrale coupe à 77 px.
 */
export function ProfileEntranceHalo({
  size,
  customization,
  active,
}: {
  size: number;
  customization?: ProfileCustomization | null;
  active: boolean;
}) {
  const first = useTrack(active, 430, 900, EASE_OUT);
  const second = useTrack(active, 560, 900, EASE_OUT);
  if (!active) return null;

  const [accent, secondary] = decorationColors(customization);

  const ring = (value: Animated.Value, color: string) => (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
          opacity: value.interpolate({ inputRange: [0, 0.14, 1], outputRange: [0, 0.85, 0] }),
          transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.3] }) }],
        },
      ]}
    />
  );

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
    >
      {ring(first, accent)}
      {ring(second, secondary)}
    </View>
  );
}

/**
 * Compteur qui grimpe pendant l'arrivée.
 *
 * C'est la PROGRESSION qui est animée, pas le nombre : la valeur affichée reste
 * `total × progression`, donc un abonné gagné pendant l'animation (ou après) se
 * répercute tout de suite au lieu de relancer le décompte à zéro.
 *
 * Composant à part et non un bout de l'écran de profil : il se re-rend 40 fois
 * par seconde, et c'est la seule façon de garder ce coût sur un `Text` isolé.
 */
export function CountUp({
  value,
  active,
  format,
  style,
}: {
  value: number;
  active: boolean;
  format: (n: number) => string;
  style?: StyleProp<TextStyle>;
}) {
  const [progress, setProgress] = useState(1);

  useLayoutEffect(() => {
    if (!active) { setProgress(1); return; }
    setProgress(0);
    const start = Date.now();
    const timer = setInterval(() => {
      // Décalé sur l'entrée des compteurs, puis même courbe expo-out que la scène.
      const t = Math.min(1, (Date.now() - start - 560) / 1100);
      if (t <= 0) return;
      setProgress(1 - Math.pow(1 - t, 4));
      if (t >= 1) clearInterval(timer);
    }, 25);
    return () => clearInterval(timer);
  }, [active]);

  return (
    <Text style={style} numberOfLines={1}>
      {format(progress >= 1 ? value : Math.round(value * progress))}
    </Text>
  );
}
