import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAnimatedScrollHandler, useSharedValue, runOnJS } from 'react-native-reanimated';
import { PULL_REFRESH_THRESHOLD } from '../components/ui/PullRefreshLogo';
import feedback from '../utils/feedback';

/**
 * Piste le dépassement d'une liste et déclenche l'actualisation au
 * relâchement — iOS uniquement, par nature : `contentOffset.y` ne devient
 * négatif que grâce au REBOND, qui n'existe pas sur Android (voir
 * `PullRefreshLogo`). Sur Android, la surface qui monte ce hook garde son
 * `AppRefreshControl` natif ; ce hook ne fait rien côté Android, il est sûr de
 * le brancher partout sans condition de plateforme dans l'appelant.
 *
 * C'est ce qui permet de se passer complètement de `RefreshControl` sur iOS,
 * et donc de sa roue : `tintColor="transparent"` ne l'efface pas, elle
 * réapparaît en gris par-dessus le logo malgré tout — deux indicateurs
 * superposés valent moins que la roue seule.
 *
 * `onScroll` ET le déclenchement au relâchement (`onEndDrag`) vivent dans le
 * MÊME gestionnaire animé, sur le thread UI. Les séparer — `onScroll` en
 * worklet, relâchement en callback JS ordinaire posé en prop — a fait manquer
 * le seuil par intermittence : le second lit un `contentOffset` par un chemin
 * différent (le pont, sujet à sa charge), qui peut arriver légèrement périmé
 * par rapport à ce que `pull` affiche déjà à l'écran. Les deux lisant
 * exactement le même événement ici, ils ne peuvent plus se désaccorder.
 */
export function usePullRefreshLogo(
  onRefresh: () => void | Promise<void>,
  refreshing: boolean,
  /**
   * Pour une surface qui a déjà besoin de son PROPRE `onScroll` (ex. la
   * pagination au défilement d'`ExploreWall`, un `ScrollView` non virtualisé
   * qui n'a pas d'`onEndReached`) : reçoit chaque événement de défilement en
   * plus du suivi de traction, plutôt que de forcer l'appelant à poser un
   * second `onScroll` — un seul est jamais accepté par la vue.
   */
  onScrollFrame?: (info: { offsetY: number; contentHeight: number; layoutHeight: number }) => void,
) {
  const pull = useSharedValue(0);

  /**
   * Fermetures ORDINAIRES, pas des refs mutées à chaque rendu.
   *
   * Une ref dont le `.current` est réécrit à chaque rendu, une fois son
   * objet capturé par un worklet (ici via `runOnJS`, indirectement), déclenche
   * l'avertissement Worklets « Tried to modify key `current` of an object
   * which has been already passed to a worklet » — l'objet a été converti en
   * « shareable » au premier passage, une réécriture ultérieure côté JS ne
   * fait donc plus ce qu'on croit. Comme `scrollHandler` est de toute façon
   * recréé à chaque rendu (jamais mémoïsé, voir plus bas), ces fonctions
   * peuvent l'être aussi : elles capturent alors la valeur COURANTE sans
   * indirection.
   */
  const trigger = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    if (refreshing) return;
    onRefresh();
  }, [refreshing, onRefresh]);

  const forwardScrollFrame = useCallback((offsetY: number, contentHeight: number, layoutHeight: number) => {
    onScrollFrame?.({ offsetY, contentHeight, layoutHeight });
  }, [onScrollFrame]);

  const hasScrollFrame = !!onScrollFrame;

  /**
   * Secousse au FRANCHISSEMENT du seuil, pendant la traction.
   *
   * C'est ce que fait une vraie liste iOS, et c'est là tout l'intérêt : elle
   * dit « lâche maintenant, ça va se recharger » à l'instant où l'information
   * est encore actionnable. Jouée au relâchement, elle n'apprendrait plus rien
   * — la décision est déjà prise.
   */
  const armed = useSharedValue(false);
  const notifyThreshold = useCallback(() => {
    feedback.pullThreshold();
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const over = -e.contentOffset.y;
      pull.value = over > 0 ? over : 0;

      // Une seule secousse par franchissement : sans ce verrou, `onScroll`
      // en tirerait une par image tant que le doigt reste au-delà du seuil.
      // Le désarmement se fait un peu SOUS le seuil (hystérésis) : pile à la
      // limite, le tremblement naturel du doigt ferait crépiter la secousse.
      if (!armed.value && over >= PULL_REFRESH_THRESHOLD) {
        armed.value = true;
        runOnJS(notifyThreshold)();
      } else if (armed.value && over < PULL_REFRESH_THRESHOLD - 12) {
        armed.value = false;
      }

      if (hasScrollFrame) {
        runOnJS(forwardScrollFrame)(e.contentOffset.y, e.contentSize.height, e.layoutMeasurement.height);
      }
    },
    onEndDrag: (e) => {
      const over = -e.contentOffset.y;
      armed.value = false;
      if (over < PULL_REFRESH_THRESHOLD) return;
      runOnJS(trigger)();
    },
  });

  /**
   * `logoKey` : À POSER EN `key=` SUR `<PullRefreshLogo>`, jamais sur la liste.
   *
   * ── Le bug qu'il corrige ────────────────────────────────────────────────
   * Après un changement d'écran par la barre du bas puis un retour, le logo
   * ne se voyait plus DU TOUT, alors que tout le reste marchait : `pull.value`
   * suivait le doigt au pixel près, le seuil était franchi, `onRefresh()`
   * partait, le fil se rechargeait, et `active` passait bien true → false.
   * Tout était juste sauf le dessin.
   *
   * C'est la signature d'un `useAnimatedStyle` qui a perdu le lien vers sa
   * vue NATIVE : le mapper continue de tourner sur le thread UI et de
   * recalculer opacité et transformations, mais ne les applique plus à rien.
   * `freezeOnBlur` (actif sur ces onglets) suspend le sous-arbre pendant
   * l'absence ; à la reprise, le lien vue↔style animé ne se rétablit pas.
   *
   * ── Pourquoi la `key` va ICI et surtout pas sur la liste ────────────────
   * Remonter la LISTE la remettrait en haut à chaque retour d'onglet —
   * précisément ce que `freezeOnBlur` sert à éviter, donc une régression pire
   * que le bug. Le logo, lui, ne porte aucun état à conserver : `spin` et
   * `hold` se redéduisent de `active` par effet, et `pull` vit à l'extérieur,
   * dans ce hook. Le remonter est gratuit et lui rend une vue native fraîche,
   * donc un style animé de nouveau réellement branché.
   */
  const [logoKey, setLogoKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      // La traction peut avoir été gelée à mi-course : sans cette remise à
      // zéro le logo reviendrait « posé » à moitié, sans aucun geste.
      pull.value = 0;
      setLogoKey((n) => n + 1);
    }, [pull]),
  );

  return { pull, scrollHandler, logoKey };
}

export { PULL_REFRESH_THRESHOLD };
