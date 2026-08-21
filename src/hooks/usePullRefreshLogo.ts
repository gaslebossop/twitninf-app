import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  useAnimatedScrollHandler,
  useAnimatedRef,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
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
   * ⚠️ Ces trois fonctions DOIVENT garder la même identité d'un rendu à
   * l'autre — c'est ce qui rend `scrollHandler` stable (voir plus bas).
   *
   * ── Le bug que ça corrige ───────────────────────────────────────────────
   * Elles étaient des fermetures ordinaires, recréées à chaque rendu, ce qui
   * faisait reconstruire `useAnimatedScrollHandler` à chaque rendu — donc
   * RÉATTACHER le gestionnaire à la liste, y compris EN PLEINE TRACTION. Sur
   * une surface qui se re-rend peu, ça ne se voyait pas. Sur le fil, qui se
   * re-rend en continu pendant le défilement (suivi de visibilité, état de la
   * question de réglage…), le flux d'événements hoquetait et l'animation de
   * traction devenait saccadée — alors qu'Explorer, dont le composant est
   * `memo()`isé et ne se re-rend donc pas, restait parfaitement fluide. C'est
   * exactement l'asymétrie qui a été observée entre « Pour toi » et
   * « Explorer », deux surfaces pourtant montées dans le même écran.
   *
   * ── Pourquoi la ref ne déclenche PAS l'avertissement Worklets ───────────
   * L'avertissement « Tried to modify key `current` of an object which has
   * been already passed to a worklet » vise une ref CAPTURÉE PAR UN WORKLET
   * (donc convertie en « shareable » au premier passage). Ici `latest` n'est
   * jamais capturée par un worklet : elle n'est lue que DANS ces fonctions
   * JS ordinaires, que le worklet appelle par `runOnJS`. Une fonction passée
   * à `runOnJS` reste côté JS avec sa fermeture intacte — seule une poignée
   * vers elle traverse. La ref peut donc être réécrite librement.
   */
  const latest = useRef({ onRefresh, refreshing, onScrollFrame });
  latest.current = { onRefresh, refreshing, onScrollFrame };

  const trigger = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    if (latest.current.refreshing) return;
    latest.current.onRefresh();
  }, []);

  const forwardScrollFrame = useCallback((offsetY: number, contentHeight: number, layoutHeight: number) => {
    latest.current.onScrollFrame?.({ offsetY, contentHeight, layoutHeight });
  }, []);

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

  /**
   * `listRef` : à poser en `ref=` sur la liste animée de chaque surface.
   *
   * ── ⚠️ CE QUE CETTE REF NE FAIT PAS (encore) ────────────────────────────
   * Ce bloc a longtemps affirmé que `pull` était alimenté par
   * `useScrollViewOffset(listRef)`, donc en dehors du chemin d'événement de
   * la liste. C'ÉTAIT FAUX : le diagnostic avait été écrit, les deux hooks
   * (`useScrollViewOffset`, `useAnimatedReaction`) importés — et le code
   * jamais changé. `pull` est bel et bien écrit par le worklet `onScroll`
   * ci-dessous, comme avant. La ref, elle, ne sert aujourd'hui à rien
   * d'autre qu'à être disponible pour ce correctif.
   *
   * ── Le diagnostic, lui, reste valable ───────────────────────────────────
   * Sur un `ScrollView` nu (Explorer), Reanimated attache son gestionnaire
   * directement à la vue native et le worklet tourne sur le thread UI. Sur
   * une `FlatList`, non : `VirtualizedList` a besoin de `onScroll` pour son
   * propre travail (fenêtrage, visibilité) et COMPOSE le sien avec celui
   * qu'on lui passe ; Reanimated ne reçoit plus son objet-gestionnaire mais
   * une fonction JS ordinaire et retombe sur le THREAD JS. Le défilement
   * reste natif, donc fluide, pendant que le logo saccade — le symptôme
   * observé sur « Pour toi » et sur le profil, les deux `FlatList`, et pas
   * sur Explorer.
   *
   * ── À FAIRE ─────────────────────────────────────────────────────────────
   * Lire l'offset par `useScrollViewOffset(listRef)` et alimenter `pull`
   * depuis un `useAnimatedReaction`, en faisant lire à `onEndDrag` la MÊME
   * valeur (sinon les deux chemins peuvent se désaccorder d'une image).
   * Toutes les surfaces posent déjà `ref={listRef}`, il n'y a donc rien à
   * changer chez elles — mais le changement se voit uniquement sur appareil,
   * et il touche cinq écrans : à valider en main avant de le poser.
   */
  const listRef = useAnimatedRef<any>();

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
  }, [hasScrollFrame]);

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

  return { pull, scrollHandler, logoKey, listRef };
}

export { PULL_REFRESH_THRESHOLD };
