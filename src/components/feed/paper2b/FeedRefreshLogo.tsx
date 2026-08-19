import React, { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ps } from '../../../theme/paper2b';

/**
 * 🧪 L'actualisation du fil « 2B — Gouttière ».
 *
 * Le logo apparaît sous le doigt pendant qu'on TIRE : il grandit et tourne en
 * proportion de la traction, puis tourne librement le temps de la requête.
 *
 * ── Pourquoi c'est piloté par le DOIGT et pas par le temps ──────────────
 * L'actualisation du fil dure quelques dizaines de millisecondes. Toute
 * animation jouée APRÈS le relâchement est donc invisible : une barre qui se
 * remplit, une roue qui fait trois tours, personne ne les verra jamais. Le
 * seul moment qui dure, c'est la traction elle-même — parce que c'est la main
 * qui en décide la durée.
 *
 * L'animation est donc une fonction de la DISTANCE tirée, pas du temps écoulé.
 * On tire lentement, elle tourne lentement ; on relâche à mi-chemin, elle
 * revient en arrière. C'est ce qui donne la sensation que l'écran répond au
 * geste au lieu de jouer un clip par-dessus.
 *
 * ── La rotation libre ne sert qu'aux requêtes lentes ────────────────────
 * Elle prend le relais au relâchement, pour le cas où le réseau traîne. Sur
 * une actualisation normale elle ne fait pas un quart de tour, et c'est très
 * bien : elle est là pour le mauvais jour, pas pour le bon.
 *
 * ⚠️ Le worklet ne fait QUE du calcul — aucune fonction JS n'y est appelée.
 * Une fonction JS ordinaire appelée depuis un worklet tue l'app sans journal.
 *
 * ── Limite connue : Android ─────────────────────────────────────────────
 * Cette animation lit le dépassement de défilement (`contentOffset.y` négatif)
 * de la liste. C'est un comportement de REBOND, qui n'existe que sur iOS :
 * sur Android la liste ne dépasse pas, `SwipeRefreshLayout` intercepte la
 * traction et ne dit à personne où en est le doigt. `FeedGutterScreen` y garde
 * donc l'indicateur natif, remis aux couleurs du fil. Aller plus loin
 * demanderait de remplacer tout le pull-to-refresh par un `Pan` maison.
 */

interface FeedRefreshLogoProps {
  /**
   * Dépassement courant de la liste, en points, positif vers le bas.
   * Écrit par le gestionnaire de défilement de l'écran, sur le thread UI.
   */
  pull: SharedValue<number>;
  /** Vrai pendant la requête d'actualisation. */
  active: boolean;
}

/**
 * Traction à partir de laquelle le logo est à pleine taille — et à partir de
 * laquelle le relâchement déclenche l'actualisation.
 *
 * Exporté : sur iOS, c'est l'ÉCRAN qui déclenche (voir `FeedGutterScreen`),
 * et les deux doivent parler de la même distance. Un logo plein qui ne
 * déclenche pas, ou l'inverse, se lit comme un bouton qui ment.
 */
export const PULL_THRESHOLD = ps(78);
const THRESHOLD = PULL_THRESHOLD;

/** Le logo ne descend jamais plus bas, même si on tire jusqu'en bas de l'écran. */
const MAX_DROP = ps(52);

const LOGO = ps(46);

/** Tour complet de la rotation libre. */
const SPIN_MS = 780;

/** Hauteur à laquelle le logo se tient pendant une requête qui dure. */
const HOLD_DROP = ps(34);

function FeedRefreshLogo({ pull, active }: FeedRefreshLogoProps) {
  const spin = useSharedValue(0);
  /**
   * Plancher de visibilité pendant la requête.
   *
   * Sans lui, le logo disparaîtrait à l'instant du relâchement : la liste
   * revient à zéro, donc la traction aussi, et l'écran n'aurait plus aucun
   * indicateur pendant que le réseau travaille. Il ne se voit que si la
   * requête dure — sur une actualisation normale, la sortie est immédiate.
   */
  const hold = useSharedValue(0);

  useEffect(() => {
    // À l'aller, sans transition : la requête part à cet instant précis, et
    // un fondu de plus retarderait le seul indicateur de l'écran.
    if (active) hold.value = 1;
    else hold.value = withTiming(0, { duration: 180 });
  }, [active, hold]);

  useEffect(() => {
    if (active) {
      spin.value = 0;
      spin.value = withRepeat(
        withTiming(1, { duration: SPIN_MS, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      // Sans annulation, la boucle continue de tourner sur le thread UI une
      // fois le logo invisible.
      cancelAnimation(spin);
      spin.value = 0;
    }
  }, [active, spin]);

  const style = useAnimatedStyle(() => {
    const raw = pull.value / THRESHOLD;
    const pulled = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    // Le plancher de la requête l'emporte quand le doigt est déjà parti.
    const p = pulled > hold.value ? pulled : hold.value;
    const rawDrop = pull.value * 0.5;
    const capped = rawDrop > MAX_DROP ? MAX_DROP : rawDrop;
    const drop = capped > hold.value * HOLD_DROP ? capped : hold.value * HOLD_DROP;

    return {
      opacity: p,
      transform: [
        { translateY: drop },
        // Il ne part pas de zéro : un logo qui naît en poussière est illisible
        // pendant la moitié du geste.
        { scale: 0.72 + 0.28 * p },
        /**
         * UN TOUR COMPLET sur la course du doigt — pas trois quarts.
         *
         * C'est la différence entre « ça tourne » et « c'est de travers ». Une
         * fraction de tour laisse le logo FIGÉ en biais dès que le doigt
         * s'arrête, et un logo penché ne se lit pas comme une animation : il
         * se lit comme un défaut d'alignement. À 360°, la position de repos —
         * traction pleine, juste avant de relâcher, celle qu'on regarde le
         * plus longtemps — est exactement la position droite.
         *
         * La rotation libre enchaîne ensuite sans saut, en tours entiers eux
         * aussi : le logo ne s'arrête jamais ailleurs qu'à l'endroit.
         */
        { rotate: `${(p * 360 + spin.value * 360) % 360}deg` },
      // `as const` : sans lui, TypeScript élargit chaque entrée en une union
      // où toutes les autres clés valent `undefined`, et le tableau ne
      // correspond plus au type des transformations (même astuce que dans
      // `useReactionAnimation`).
      ] as const,
    };
  });

  return (
    <Animated.View
      style={[S.host, style]}
      pointerEvents="none"
      /**
       * Le logo est gravé UNE FOIS en texture, puis la rotation et l'échelle
       * ne sont plus qu'une composition GPU. Sans ça, chaque image redemande
       * un rééchantillonnage du bitmap, et l'animation saccade.
       *
       * L'échelle ne dépasse jamais 1 (voir `style`), donc la texture n'est
       * jamais agrandie au-delà de sa définition : pas de flou.
       */
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
    >
      <Image
        /**
         * ⚠️ PAS `assets/icon.png` — celui-là fait 1920 × 1920 (l'icône de
         * l'app). Affiché en 46 pt et retransformé à chaque image, c'était
         * 3,7 mégapixels retravaillés par frame, et l'animation ne tenait pas
         * la cadence. Celui-ci est le même dessin, gravé à sa taille d'écran.
         *
         * L'en-tête du fil, lui, garde `icon.png` : il ne l'anime jamais.
         */
        source={require('../../../../assets/refresh-mark.png')}
        style={S.logo}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

export default React.memo(FeedRefreshLogo);

const S = StyleSheet.create({
  // Hors du flux : l'indicateur ne doit jamais pousser le premier tweet vers
  // le bas. `alignSelf` le centre sans conteneur supplémentaire.
  host: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: LOGO,
    height: LOGO,
    zIndex: 5,
  },
  logo: {
    width: LOGO,
    height: LOGO,
  },
});
