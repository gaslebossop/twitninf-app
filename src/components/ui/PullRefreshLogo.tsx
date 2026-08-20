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

/**
 * Indicateur d'actualisation commun — remplace la roue native par le logo de
 * l'app, sur toute surface qui le veut (fil, Explorer, notifications, profil).
 *
 * Il apparaît sous le doigt pendant qu'on TIRE : il grandit et tourne en
 * proportion de la traction, puis tourne librement le temps de la requête.
 *
 * ── Pourquoi c'est piloté par le DOIGT et pas par le temps ──────────────
 * L'actualisation dure quelques dizaines de millisecondes. Toute animation
 * jouée APRÈS le relâchement est donc invisible : une barre qui se remplit,
 * une roue qui fait trois tours, personne ne les verra jamais. Le seul moment
 * qui dure, c'est la traction elle-même — parce que c'est la main qui en
 * décide la durée.
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
 * de la liste, un comportement de REBOND qui n'existe que sur iOS : sur
 * Android la liste ne dépasse pas, `SwipeRefreshLayout` intercepte la
 * traction et ne dit à personne où en est le doigt. Toute surface qui monte
 * ce composant garde donc `AppRefreshControl` (natif) sur Android — voir
 * `usePullRefreshLogo`.
 *
 * Voir `usePullRefreshLogo` pour le gestionnaire de défilement associé, qui
 * alimente `pull` et déclenche `onRefresh` au relâchement.
 */

interface PullRefreshLogoProps {
  /**
   * Dépassement courant de la liste, en points, positif vers le bas.
   * Fourni par `usePullRefreshLogo`, écrit sur le thread UI.
   */
  pull: SharedValue<number>;
  /** Vrai pendant la requête d'actualisation. */
  active: boolean;
}

/**
 * Traction à partir de laquelle le logo est à pleine taille — et à partir de
 * laquelle le relâchement déclenche l'actualisation (voir
 * `usePullRefreshLogo`, qui lit la même constante).
 */
export const PULL_REFRESH_THRESHOLD = 78;

/** Le logo ne descend jamais plus bas, même si on tire jusqu'en bas de l'écran. */
const MAX_DROP = 52;

const LOGO = 46;

/** Tour complet de la rotation libre. */
const SPIN_MS = 780;

/** Hauteur à laquelle le logo se tient pendant une requête qui dure. */
const HOLD_DROP = 34;

function PullRefreshLogo({ pull, active }: PullRefreshLogoProps) {
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
    // Au retour, `Easing.out` : la sortie part vite puis s'éteint en douceur,
    // au lieu du `inOut` par défaut qui traîne au démarrage et fait paraître
    // le logo « collant » une fois la requête finie.
    if (active) hold.value = 1;
    else hold.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [active, hold]);

  useEffect(() => {
    // `cancelAnimation` dans LES DEUX branches, pas seulement à la sortie.
    // Sans elle au démarrage, une rotation encore en cours d'arrêt (thread UI)
    // au moment où une NOUVELLE traction démarre continue d'écrire sur `spin`
    // pendant que la boucle fraîchement lancée écrit dessus aussi — les deux
    // animations se disputent la valeur, et le tour qui en résulte paraît
    // exagéré/erratique au lieu d'un seul tour propre. `cancelAnimation` est
    // idempotente : l'appeler alors que rien ne tourne ne fait rien.
    cancelAnimation(spin);
    if (active) {
      spin.value = 0;
      spin.value = withRepeat(
        withTiming(1, { duration: SPIN_MS, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      spin.value = 0;
    }
  }, [active, spin]);

  const style = useAnimatedStyle(() => {
    const raw = pull.value / PULL_REFRESH_THRESHOLD;
    const pulled = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    // Le plancher de la requête l'emporte quand le doigt est déjà parti.
    const linear = pulled > hold.value ? pulled : hold.value;

    /**
     * Course ADOUCIE (`easeOutCubic`), pas la fraction brute.
     *
     * Le rapport `pull / seuil` est linéaire : le logo n'existait donc
     * qu'à peine sur le premier tiers du geste, puis rattrapait tout d'un
     * coup — c'est ce qui donnait l'impression d'un élément qui « apparaît »
     * au lieu d'un élément qu'on tire. Avec une sortie cubique, il se révèle
     * franchement dès les premiers pixels puis ralentit en approchant du
     * seuil : le geste se sent tout du long, et l'arrivée à pleine taille est
     * douce au lieu d'être un butoir.
     */
    const p = 1 - Math.pow(1 - linear, 3);

    /**
     * Le déplacement, lui, suit le doigt À LA LETTRE (rapport constant, sans
     * adoucissement) : c'est ce qui fait que le logo reste « collé » au
     * doigt. L'adoucir désolidariserait les deux et donnerait ce flottement
     * caoutchouteux qui trahit une animation pilotée par autre chose que la
     * main.
     */
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
         * AUCUNE rotation pendant la traction — le logo reste DROIT sous le
         * doigt, et ne tourne que pendant la requête (`spin`).
         *
         * Deux mappages rotation↔traction ont été essayés avant celui-ci, et
         * tous deux rejetés comme « saccadés », pour la même raison profonde :
         * faire tourner le logo AU DOIGT exige que sa vitesse angulaire
         * corresponde, image par image, à la vitesse du geste — or la traction
         * d'une liste iOS n'est pas linéaire (résistance du rebond), et aucune
         * courbe fixe n'y colle. En courbe adoucie, l'essentiel du tour
         * s'exécutait sur le premier tiers du geste puis le logo ramenait ; en
         * linéaire, il tournait à une autre vitesse que sa propre croissance.
         * Dans les deux cas l'œil voyait un objet désynchronisé de la main :
         * c'est la saccade.
         *
         * Grandir et descendre, en revanche, se lit toujours bien — un objet
         * qui suit le doigt n'a pas besoin de tourner pour paraître vivant.
         * C'est aussi ce que font les indicateurs natifs des applications de
         * référence : rien ne tourne tant que la requête n'est pas partie.
         */
        { rotate: `${(spin.value * 360) % 360}deg` },
      // `as const` : sans lui, TypeScript élargit chaque entrée en une union
      // où toutes les autres clés valent `undefined`, et le tableau ne
      // correspond plus au type des transformations.
      ] as const,
    };
  });

  return (
    <Animated.View
      style={[S.host, style]}
      pointerEvents="none"
      // ⏳ `renderToHardwareTextureAndroid`/`shouldRasterizeIOS` RETIRÉS EN TEST :
      // le logo restait invisible en usage réel alors que `pull`/`opacity`
      // suivaient correctement le doigt (confirmé par instrumentation) — la
      // texture mise en cache par ces deux props ne semble pas se réinvalider
      // sur des changements d'opacité/transform pilotés par Reanimated sur le
      // thread UI. À rétablir seulement si le rendu est confirmé fiable ET que
      // l'animation saccade sans eux.
    >
      <Image
        source={require('../../../assets/refresh-mark.png')}
        style={S.logo}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

export default React.memo(PullRefreshLogo);

const S = StyleSheet.create({
  // Hors du flux : l'indicateur ne doit jamais pousser le premier élément
  // vers le bas. `alignSelf` le centre sans conteneur supplémentaire.
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
