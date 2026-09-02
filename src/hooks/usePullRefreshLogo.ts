import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  useAnimatedScrollHandler,
  useAnimatedRef,
  useSharedValue,
} from 'react-native-reanimated';
// `scheduleOnRN` et non `runOnJS` : depuis Reanimated 4, `runOnJS` n'est plus
// qu'un ré-export DÉPRÉCIÉ de `react-native-worklets`
// (`react-native-reanimated/src/workletFunctions.ts` : « Please import
// `runOnJS` directly from `react-native-worklets` »). Les deux font
// exactement la même chose — `scheduleOnRN(fn, ...args)` appelle
// `runOnJS(fn)(...args)` (`react-native-worklets/src/threads.ts`) — mais la
// forme non curryfiée est la seule qui reste documentée.
import { scheduleOnRN } from 'react-native-worklets';
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
   * Position de défilement, en pixels, écrite depuis le MÊME worklet que
   * `pull` — donc sur le thread UI, à la cadence de la vue native.
   *
   * Elle sert aux en-têtes qui se replient (`ProfileTopBar`). Passer par
   * `onScrollFrame` aurait marché, mais ce chemin repasse par le thread JS
   * via `scheduleOnRN` : un en-tête piloté par là retarde d'une frame ou deux
   * dès que la liste virtualise, et ça se voit exactement au moment où on
   * regarde l'en-tête. Une valeur partagée de plus coûte une écriture par
   * événement, et rien d'autre.
   */
  const scrollY = useSharedValue(0);

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
   * JS ordinaires, que le worklet appelle par `scheduleOnRN`. Une fonction
   * passée à `scheduleOnRN` reste côté JS avec sa fermeture intacte — seule
   * une poignée vers elle traverse. La ref peut donc être réécrite librement.
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
   * ── ⚠️ LE DIAGNOSTIC QUI VIVAIT ICI ÉTAIT FAUX — ne pas le refaire ──────
   * Ce bloc affirmait que sur une `FlatList`, « Reanimated ne reçoit plus son
   * objet-gestionnaire mais une fonction JS ordinaire et retombe sur le
   * THREAD JS », et proposait de réécrire `pull` via
   * `useScrollViewOffset(listRef)` — un chantier annoncé comme touchant cinq
   * écrans. La lecture des sources de Reanimated 4.1 tranche : c'est faux, et
   * le remède proposé n'aurait rien changé.
   *
   * 1. `useAnimatedScrollHandler` ne rend PAS une fonction : il rend
   *    `{ workletEventHandler }` (`hook/useEvent.ts`).
   * 2. `createAnimatedComponent` reconnaît cet objet et enregistre le worklet
   *    en NATIF, sur la vue défilante :
   *    `NativeEventsManager.getEventViewTag()` appelle `getScrollableNode()`,
   *    que `FlatList` expose (`Libraries/Lists/FlatList.js`), puis
   *    `WorkletEventHandler.registerForEvents()` appelle `registerEventHandler`.
   * 3. `PropsFilter` remplace la prop transmise à la `FlatList` par un
   *    `dummyListener` : le worklet ne traverse jamais la composition
   *    d'`onScroll` de `VirtualizedList`.
   *
   * Le worklet tourne donc bien sur le thread UI, `FlatList` ou pas — la
   * documentation le dit d'ailleurs sans réserve (« These callbacks are
   * automatically workletized and ran on the UI thread »).
   *
   * Et `useScrollOffset` n'y aurait rien changé : sa version native est bâtie
   * sur le MÊME `useEvent`, sur les mêmes noms d'événements natifs
   * (`hook/useScrollOffset.ts`). Même chemin, même cadence.
   *
   * ── Ce qui coûte réellement, et qui n'est pas de Reanimated ─────────────
   * `VirtualizedList._onScroll` tourne, lui, sur le thread JS à chaque
   * événement reçu (fenêtrage, visibilité, `onEndReached`). C'est le prix de
   * la `FlatList`, et il se paie que Reanimated soit là ou non.
   *
   * `listRef` reste exposée : elle sert de `ref` normale aux appelants.
   */
  const listRef = useAnimatedRef<any>();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const over = -e.contentOffset.y;
      pull.value = over > 0 ? over : 0;
      scrollY.value = e.contentOffset.y;

      // Une seule secousse par franchissement : sans ce verrou, `onScroll`
      // en tirerait une par image tant que le doigt reste au-delà du seuil.
      // Le désarmement se fait un peu SOUS le seuil (hystérésis) : pile à la
      // limite, le tremblement naturel du doigt ferait crépiter la secousse.
      if (!armed.value && over >= PULL_REFRESH_THRESHOLD) {
        armed.value = true;
        scheduleOnRN(notifyThreshold);
      } else if (armed.value && over < PULL_REFRESH_THRESHOLD - 12) {
        armed.value = false;
      }

      if (hasScrollFrame) {
        scheduleOnRN(forwardScrollFrame, e.contentOffset.y, e.contentSize.height, e.layoutMeasurement.height);
      }
    },
    onEndDrag: (e) => {
      const over = -e.contentOffset.y;
      armed.value = false;
      if (over < PULL_REFRESH_THRESHOLD) return;
      scheduleOnRN(trigger);
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

  return { pull, scrollY, scrollHandler, logoKey, listRef };
}

export { PULL_REFRESH_THRESHOLD };
