# Fluidité du défilement — fil 2B (`FeedGutterScreen`)

> Chantier **SCROLL** du 2026-08-21. Périmètre : le défilement et ce qui le perturbe.
> La ligne elle-même (`src/components/feed/paper2b/**`, `src/theme/paper2b.ts`) appartient
> à l'agent **RENDU** : elle n'a pas été touchée ici — voir §5 pour ce qui lui revient.
>
> **Rien n'a été commité.** Tout est laissé dans l'arbre de travail.

---

## 1. Ce que dit la doc

Le travail a commencé par un tour de documentation, et **chaque décision ci-dessous cite sa
source**. Trois familles de sources, par ordre d'autorité pour ce chantier : le **code des
bibliothèques installées** (c'est lui qui tranche, pas la mémoire), la doc officielle, les
skills.

### 1.1 Skills

| Source | Ce que j'en ai retiré |
|---|---|
| `skills:react-native-best-practices` | Point d'entrée. Renvoie vers `animations`, `gestures`, `multithreading`. |
| `…/references/animations/SKILL.md` | **Règle critique** : `runOnJS` est déprécié en Reanimated 4, utiliser `scheduleOnRN(fn, ...args)` de `react-native-worklets`. Vérifié dans `node_modules` : `react-native-reanimated/src/workletFunctions.ts` porte bien `@deprecated Please import runOnJS directly from react-native-worklets`. → **appliqué** (§3.5). |
| `…/animations/scroll-and-events.md` | `useAnimatedScrollHandler` **doit** être posé sur un composant `Animated.*`. `useScrollOffset` est l'alternative « offset seul » et « works with ScrollView, FlatList and FlashList ». → a servi à trancher le §2.1. |
| `…/animations/animations-performance.md` | Trois règles retenues : (a) **limite pratique ≈ 100 composants animés sur un Android d'entrée de gamme** avant dégradation ; (b) « Avoid reading shared values on the JS thread » ; (c) « Memoize callbacks and gesture objects ». → (a) motive directement §3.2 et §3.4. |
| `…/gestures/SKILL.md` | « Never call JS-thread functions directly from gesture callbacks » — tout appel non-worklet depuis un callback de geste plante. `useMemo` obligatoire sur chaque geste en v2. → audit §2.6, résultat : le code est **conforme**. |
| `…/gestures/gesture-composition.md` | Pour un pan horizontal dans un scroll vertical : `activeOffsetX` + `failOffsetY`, éventuellement `simultaneousWithExternalGesture(Gesture.Native())`. → §2.6 et §7. |
| `…/multithreading/SKILL.md` + `threading-api.md` | `scheduleOnRN` est la voie unique du worklet vers le runtime RN ; la fonction cible doit être définie côté RN. Confirmé dans `react-native-worklets/src/threads.ts` : `scheduleOnRN(fun, ...args)` fait littéralement `runOnJS(fun)(...args)` → **migration sans risque**. |
| `expo:expo-animation` | « Never `setState` from a gesture or scroll handler » ; « Never schedule back to the RN runtime inside `onUpdate` or a scroll handler » ; « `entering` on a virtualized list row → animate the container instead » ; « Judging feel in Expo Go or the simulator » ne compte pas. → cadre §2.3, §2.7 et la prudence générale du §7. |

### 1.2 Context7 / doc officielle

| Source | Règle concrète |
|---|---|
| Context7 `/react/react-native-website` — *Optimizing FlatList Configuration* | Défauts : `removeClippedSubviews` = `true` sur Android / `false` ailleurs ; `maxToRenderPerBatch` = 10 ; `updateCellsBatchingPeriod` = 50 ms ; `initialNumToRender` = 10 ; `windowSize` = 21 (10 écrans au-dessus + 1 + 10 en dessous). Compromis explicite : plus grand = moins de blanc, plus de mémoire et de temps JS. `removeClippedSubviews` : « may have bugs (missing content), especially on iOS ». |
| idem — *List items* | `memo()` avec comparateur ; `keyExtractor` ; **`renderItem` hors du JSX, dans un `useCallback`** ; composants de ligne « basic, light, minimal nesting ». |
| idem — `getItemLayout` | Optimisation réservée aux listes **à hauteur connue à l'avance**. Rien d'équivalent à `estimatedItemSize` dans la `FlatList` du cœur (c'est une prop de FlashList, hors sujet ici : pas de nouvelle dépendance native). |
| Context7 `/websites/swmansion_react-native-reanimated` — `useAnimatedScrollHandler` | « These callbacks are automatically workletized and **ran on the UI thread** ». Le handler rendu **doit être passé à `onScroll`**, sur un conteneur `Animated`. Aucune réserve, aucune exception pour `FlatList`. |
| idem — `useAnimatedStyle` | « The callback runs first on the JavaScript thread and then on the UI thread » → un `useAnimatedStyle` par ligne, c'est aussi un passage JS par montage de ligne. |
| `reactnative.dev/docs/performance` (WebFetch) | Modèle deux threads : le **défilement lui-même** tourne sur le thread UI et reste fluide même thread JS bloqué ; ce qui casse, c'est tout ce que le thread JS doit faire *pendant*. Pour du travail lourd concomitant : `requestIdleCallback`, différer, sortir du chemin chaud. |
| `reactnative.dev/docs/optimizing-flatlist-configuration` (WebFetch) | Confirme les défauts et compromis ci-dessus. |

### 1.3 Le code des bibliothèques installées — c'est lui qui a tranché

Versions réellement installées : `react-native@0.81.5`, `react-native-reanimated@4.1.2`,
`react-native-worklets@0.5.1`, `react-native-gesture-handler@2.28.x`, `expo@~54`.

| Fichier lu | Ce qu'il prouve |
|---|---|
| `react-native-reanimated/src/hook/useEvent.ts` | `useAnimatedScrollHandler` ne rend **pas** une fonction : il rend `{ workletEventHandler: WorkletEventHandler }`. |
| `…/createAnimatedComponent/NativeEventsManager.ts` | `getEventViewTag()` appelle **`componentRef.getScrollableNode()`** puis enregistre le handler sur ce tag natif. |
| `…/createAnimatedComponent/PropsFilter.tsx` | Quand une prop porte un `workletEventHandler`, la prop transmise au composant sous-jacent est remplacée par **`dummyListener`**. |
| `…/WorkletEventHandler.ts` | `registerForEvents()` appelle `registerEventHandler(worklet, eventName, viewTag)` — **enregistrement natif**. |
| `react-native/Libraries/Lists/FlatList.js:410` | `FlatList` **expose bien `getScrollableNode()`**. |
| `…/@react-native/virtualized-lists/Lists/VirtualizedList.js:1100` | `scrollEventThrottle: this.props.scrollEventThrottle ?? 0.0001` — **la `FlatList` demande déjà les événements à chaque image par défaut**. |
| `…/VirtualizedList.js:1689-1760` (`_onScroll`) | Appelle, **sur le thread JS et à chaque événement** : `props.onScroll`, `_updateViewableItems` (→ `onViewableItemsChanged`), `_maybeCallOnEdgeReached`, `_computeBlankness`, `_scheduleCellsToRenderUpdate`. |
| `react-native/Libraries/Components/ScrollView/ScrollView.js:569-575` | Doc de `scrollEventThrottle` : **« Values <= `16` will disable throttling, regardless of the refresh rate of the device »**. |
| `react-native-reanimated/src/component/FlatList.tsx` | `Animated.FlatList` **impose son propre `CellRendererComponent`**, qui est une `AnimatedView` — donc **un composant animé par cellule montée**. |
| `react-native-reanimated/src/hook/useScrollOffset.ts` | La version native est bâtie sur **le même `useEvent`**, sur les mêmes noms d'événements natifs. |
| `react-native-worklets/src/threads.ts:332` | `scheduleOnRN(fun, ...args)` ≡ `runOnJS(fun)(...args)`. |

---

## 2. Diagnostic

Classé par impact décroissant. Les numéros de ligne sont ceux **avant** ce chantier.

### 2.1 ⚖️ TRANCHÉ — le gestionnaire de défilement tourne BIEN sur le thread UI

**Réponse : oui, sur le thread UI. Le diagnostic inverse laissé dans le code était faux.**

Deux commentaires du dépôt se contredisaient :

* `FeedGutterScreen.tsx:~2665` : « Sur le thread UI » ;
* `src/hooks/usePullRefreshLogo.ts:~120` : « Sur une `FlatList`, non : […] Reanimated ne reçoit
  plus son objet-gestionnaire mais **une fonction JS ordinaire et retombe sur le THREAD JS** »,
  avec un « À FAIRE » annonçant un correctif touchant **cinq écrans**.
  Repris tel quel par `docs/PASSATION-FIL-2B.md` §5 (« 🟢 Le diagnostic laissé en à faire »).

**Preuve que c'est faux**, entièrement par lecture des sources installées (§1.3) :

1. `useAnimatedScrollHandler` → `useEvent` rend `{ workletEventHandler }`, pas une fonction.
2. `createAnimatedComponent` détecte cet objet et l'enregistre **en natif** :
   `NativeEventsManager.getEventViewTag()` → `getScrollableNode()`, que `FlatList` expose
   (`FlatList.js:410`) → `WorkletEventHandler.registerForEvents()` → `registerEventHandler`.
3. `PropsFilter` remplace la prop transmise à la `FlatList` par un **`dummyListener`**.
   Le worklet **ne traverse jamais** la composition d'`onScroll` de `VirtualizedList`.
4. La doc Reanimated ne pose aucune réserve : « automatically workletized and ran on the UI thread ».

**Et le remède proposé n'aurait rien changé** : `useScrollOffset` (version native) est bâti sur
le même `useEvent`, sur les mêmes événements natifs. Même chemin, même cadence. Ce « À FAIRE »
sur cinq écrans est donc **annulé**, pas reporté.

**Ce qui est vrai en revanche, et qui a été confondu avec ça** : `VirtualizedList._onScroll`
tourne, lui, **sur le thread JS à chaque événement**, et y fait le fenêtrage, la visibilité,
`onEndReached` et le calcul de blanc. C'est le prix de la `FlatList`, pas celui de Reanimated,
et il se paie que le worklet soit là ou non. C'est ce coût-là que le reste de ce chantier
s'emploie à ne pas alourdir.

**Corollaire, également faux dans le code** : le commentaire de `scrollEventThrottle`
prétendait que `16` « plafonne les événements à ~60 par seconde » et que `1` était nécessaire
en 120 Hz. RN 0.81 dit exactement l'inverse : **« Values <= 16 will disable throttling,
regardless of the refresh rate »**. `1` et `16` sont **rigoureusement équivalents**.

### 2.2 🔴 IMPACT FORT — un composant animé par cellule, pour rien

Deux couches empilaient une vue animée par ligne montée, sur les **~40 cellules** que
`windowSize={7}` tient en vie :

* **`Animated.FlatList`** impose son `CellRendererComponent`, qui est une `AnimatedView`
  (`react-native-reanimated/src/component/FlatList.tsx`). Chaque cellule devient un
  `AnimatedComponent` complet — filtrage de props, `NativeEventsManager`, `JSPropsUpdater` —
  là où un `FlatList` nu n'enveloppe la cellule dans rien.
* **`FeedItemEntrance`** (`FeedGutterScreen.tsx:~2040`) était monté sur **chaque** ligne, alors
  qu'il plafonne déjà son mouvement aux 6 premières : au-delà, `progress` vaut 1 pour toujours
  et son `useAnimatedStyle` se réduit à un `translateY: 0` constant. Une `Animated.View` de
  plus, un mapper de style de plus sur le thread UI, et un aplatissement de vue en moins — sur
  précisément les lignes qu'on traverse en défilant, et jamais sur celles qui s'animent.

Reanimated documente la limite : **≈ 100 composants animés sur un Android d'entrée de gamme**.
Le fil en consommait 80 (40 cellules × 2) avant même de compter ce que la ligne monte
elle-même.

### 2.3 🔴 IMPACT FORT — une rafale de requêtes réseau **dans** l'image de défilement

`onViewableItemsChanged` n'est pas appelé « quelque part » : **`VirtualizedList._onScroll`
l'appelle lui-même**, sur le thread JS, pendant le défilement. Or, pour **chaque** tweet qui
entre dans le viewport, `FeedGutterScreen.tsx:~1914` déclenchait :

* `trackingService.trackView(...)` → `apiService.post('/api/track')` **immédiat** ;
* et, à la sortie du viewport, `useDwellTracking` → `neuralRankService.trackInteraction({interactionType:'view'})`
  → `apiService.request('/api/neural-rank/track')` **immédiat**.

Un défilement rapide qui traverse vingt tweets lançait donc **jusqu'à quarante requêtes
simultanées**, chacune ouvrant sa propre chaîne : `buildClientHeaders()` — qui contient un
**`Intl.DateTimeFormat()` par requête** (`services/clientIdentity.ts`, `resolveDeviceTimeZone`) —,
`JSON.stringify`, `fetch`, puis l'analyse de la réponse. Tout cela sur le thread qui doit, dans
la même image, faire tourner `_updateCellsToRender` et rendre les lignes.

`behaviorTracker`, lui, regroupait déjà (file + flush 20 s) : ce n'est pas lui le problème.

### 2.4 🟠 IMPACT MOYEN — `runOnJS` déprécié dans trois worklets

`FeedGutterScreen.tsx:~580` (`runOnJS(switchTab)`), `TweetsScreen.tsx:~494` (idem),
`usePullRefreshLogo.ts` (trois appels). Fonctionnellement corrects — mais `runOnJS` n'est plus
qu'un ré-export déprécié depuis Reanimated 4.

### 2.5 ✅ DÉJÀ RÉSOLU — le `setInterval(500 ms)` + `measureInWindow`

Le §2.2 de la commande évoquait « une instance par ligne + `setInterval(500 ms)` avec
`measureInWindow` ». **C'est déjà mort** : `grep measureInWindow src/` ne le trouve plus que dans
`components/feed/explore/ExploreCard.tsx` (mesure ponctuelle d'ouverture, pas périodique).
Le fil utilise désormais un **traqueur unique** (`useOptimizedViewTracking`,
`FeedGutterScreen.tsx:~608`, `minViewTime: 0, debounceMs: 600, batchSize: 20`) alimenté par
`onViewableItemsChanged` + `viewabilityConfig` (`itemVisiblePercentThreshold: 50`,
**`minimumViewTime: 500`**). La qualification à 500 ms est donc faite par la liste, pas par une
mesure native périodique. Rien à faire.

### 2.6 ✅ CONFORME — audit des worklets (le « piège mortel » du projet)

Audit de **tous** les worklets touchés par le défilement, à la recherche d'une fonction JS
ordinaire appelée depuis le thread UI (qui tue l'app sans aucun log) :

| Worklet | Verdict |
|---|---|
| `usePullRefreshLogo` `onScroll` / `onEndDrag` | ✅ tous les appels JS passaient par `runOnJS` → migrés en `scheduleOnRN`. |
| `feedSwipe.onBegin` | ✅ `cancelAnimation` + écritures de shared values uniquement. |
| `feedSwipe.onUpdate` | ✅ appelle `rubberBand` — **vérifié : `src/utils/gesture.ts` marque `'worklet'` sur `projectDecay`, `rubberBand`, `clamp`, `springFrom`**. |
| `feedSwipe.onEnd` | ✅ `projectDecay`, `clamp`, `springFrom` (worklets) + `runOnJS(switchTab)` → `scheduleOnRN`. |
| `tabIndicatorStyle` (`useAnimatedStyle`) | ✅ `clamp` (worklet) + `interpolate`. |
| `FeedItemEntrance` `useAnimatedStyle` | ✅ arithmétique pure. |

**Aucun piège trouvé.** Le geste est aussi conforme à la doc Gesture Handler pour un pan
horizontal dans un scroll vertical (`activeOffsetX([-24,24])` + `failOffsetY([-16,16])`), et il
est bien `useMemo`ïsé.

### 2.7 ✅ CONFORME — stabilité des props de ligne (l'interface avec l'agent RENDU)

C'était annoncé comme « probablement le gain le plus important » : vérifié ligne à ligne, **il
est déjà acquis**, et le `memo(TweetRowGutter, areEqual)` de l'agent RENDU peut donc travailler.

| Prop | Stabilité |
|---|---|
| `onAction={handleRowAction}` | `useCallback` sur `[handleLike, handleSuperLike, handleRetweet, navigation, activeTab, trackProfileInteraction]` — **aucune ne change pendant un défilement** (`handleLike`/`handleRetweet` dépendent de `activeTab, currentAlgorithm, trackTweetInteraction, offlineEnabled, online, queueAction`). |
| `contextData={rowContext}` | `useMemo` sur `[activeTab, currentAlgorithm]`. |
| `storyUserIds` / `unseenStoryUserIds` | `Set` en state, identité stable entre deux rendus. |
| `keyExtractor` | `useCallback` à dépendances vides. |
| `renderItem` | `useCallback` ; ses dépendances (`visibleTweets`, `askAtId`, `entranceGeneration`…) ne bougent qu'à une pagination, une actualisation ou une question de réglage — **jamais par image**. |
| `ListHeaderComponent` / `Footer` / `Empty` | tous `useMemo`. |
| Verrous de like/retweet/superlike | en **ref**, pas en state (déjà corrigé avant ce chantier). |

Aucun `setState` n'est déclenché **par image** de défilement dans cet écran. Le seul `setState`
du chemin de visibilité est `setAskAtId`, plafonné à **deux fois par session**
(`utils/algoCheck.ts`). Rien à corriger.

### 2.8 ✅ CONFORME — réglages de fenêtrage, confrontés à la doc

| Prop | Valeur | Défaut RN | Verdict |
|---|---|---|---|
| `initialNumToRender` | 6 | 10 | ✅ conservé. Les lignes sont hautes ; 6 couvre largement l'écran. Descendre plus bas accélérerait le premier rendu mais risquerait du blanc — **non mesurable sans appareil**. |
| `maxToRenderPerBatch` | 5 | 10 | ✅ conservé. Doc : un lot plus gros = moins de blanc mais « longer JavaScript execution periods ». 5 lignes lourdes est le bon côté du compromis. |
| `updateCellsBatchingPeriod` | 50 | 50 | ✅ = défaut. |
| `windowSize` | 7 | 21 | ✅ conservé (3 écrans de chaque côté). Le baisser à 5 réduirait encore le nombre de cellules montées, mais au prix de blanc en défilement rapide — **arbitrage qui exige un appareil**. |
| `removeClippedSubviews` | Android seul | `true` Android / `false` ailleurs | ✅ = défaut exact. La doc met en garde : « may have bugs (missing content), especially on iOS ». Ne pas l'activer sur iOS. |
| `onEndReachedThreshold` | 0.6 | 0.5 | ✅ conservé. |
| `getItemLayout` | absent | — | ✅ correct : hauteurs variables. Aucun équivalent `estimatedItemSize` dans la `FlatList` du cœur (c'est FlashList — **nouvelle dépendance native, exclue**). |
| `maintainVisibleContentPosition` | absent | — | ✅ correct : la pagination **ajoute en queue**, elle n'insère jamais en tête. `mVCP` ne sert que contre l'insertion en préfixe ; l'ajouter ici ne réparerait rien et interférerait avec le rebond de traction sur iOS. |

---

## 3. Ce qui a été changé

### 3.1 `src/utils/trackQueue.ts` — **nouveau** — file d'envoi différée

`DeferredDispatcher<Payload>` : une file FIFO qui (a) ne lance **jamais** un envoi de façon
synchrone — le drainage part au tour de boucle suivant, donc **après** que l'événement de
défilement a rendu la main — et (b) plafonne le nombre de requêtes simultanées.

Elle ne perd rien, ne transforme rien, ne réordonne rien : **même route, même corps, même
ordre**. Un `send` qui échoue (ou qui jette de façon synchrone) ne bloque pas la file derrière
lui. `schedule` est injectable, ce qui rend le composant **testable sans appareil**.

→ `tests/track-queue.test.js` (6 cas) : rien de synchrone à l'`enqueue`, respect de
`maxInFlight`, ordre FIFO, tolérance à l'échec async, tolérance à l'échec synchrone,
ordonnanceur par défaut hors du tour de boucle courant.

### 3.2 `src/services/trackingService.ts` — les impressions passent par la file

`trackAction` a été scindé : `bodyFor()` (corps identique au précédent, champ pour champ) +
`postTrack()`. Une seule action y est routée vers la file (`maxInFlight: 3`) : **`view`**.

**Pourquoi seulement `view`** : c'est le seul signal qui parte en rafale pendant le défilement.
Un geste délibéré — like, repost, signalement, skip, favori, partage, `profile_view` — est rare,
n'arrive jamais en rafale, et **peut bloquer un écran qui l'attend** (`handleSkip` fait
`await trackingService.trackSkip(...)` avant de retirer la ligne). Ceux-là partent toujours
immédiatement.

**Pourquoi ça ne casse pas le signal vers le moteur** : la charge utile est inchangée
(`tweet_id`, `action`, `dwell_ms`, `author_id`, `experiment_id`, `variant_id`, `dwell_media`,
`content_chars`, `video_duration_ms`), l'ordre est préservé, et **aucune impression n'est
abandonnée**. Le rang, lui, n'a jamais été envoyé d'ici et ne l'est toujours pas — c'est le
moteur qui l'inscrit (cf. le commentaire d'en-tête du service). La règle des 30 minutes
(« une impression sans interaction devient un exemple négatif ») reste intacte : le retard
introduit se compte en dizaines de millisecondes.

`trackView` ne rend plus de promesse — délibérément : personne n'attend une impression, et en
rendre une inviterait un appelant à s'y accrocher depuis le chemin chaud. Les quatre appelants
existants (`FeedGutterScreen`, `TweetsScreen`, `TweetCard`, `TweetViewTracker`) sont tous en
« tire et oublie » ; `npx tsc --noEmit` le confirme.

### 3.3 `src/services/neuralRankService.ts` — le temps de lecture passe par la file

`trackInteraction` route `interactionType === 'view'` (le dwell émis par `useDwellTracking`,
donc le second signal de masse) vers une file d'instance identique ; tout le reste — `like`,
`interested`, `not_interested`, … — part immédiatement par `sendInteraction`, méthode extraite
sans en changer une ligne. Le contrat de `dwell.rs` (média, longueur, durée vidéo, auteur) est
transporté tel quel.

### 3.4 `FeedGutterScreen.tsx` — une seule vue animée par ligne… quand elle sert

**(a) `FeedList`** — module scope :
`const FeedList = (Platform.OS === 'ios' ? Animated.FlatList : FlatList) as typeof Animated.FlatList;`
Sur **Android**, plus d'`Animated.FlatList` : donc **plus d'`AnimatedView` par cellule**
(~40 composants animés en moins), et `onScroll={undefined}` — donc plus de worklet exécuté à
chaque image. C'est sans perte, parce que **le seul consommateur du gestionnaire est le logo de
traction, qui n'existe pas sur Android** : `pull` se nourrit d'un `contentOffset.y` négatif que
seul le rebond iOS produit, `PullRefreshLogo` n'est monté que sur iOS, et
`usePullRefreshLogo.trigger` fait `if (Platform.OS !== 'ios') return`. Android garde son
`RefreshControl` natif, inchangé.
`Platform.OS` est constant : le composant ne change jamais entre deux rendus, la liste ne se
remonte pas.

**(b) `FeedItemEntrance` conditionnel** — `renderTweet` n'enveloppe désormais la ligne que si
`index < MAX_ANIMATED_INDEX` (6, exporté depuis `FeedItemEntrance.tsx`). Au-delà, le contenu est
rendu nu. **~34 `Animated.View` + mappers de style en moins** sur une fenêtre pleine, sans
changer d'un pixel le comportement des 6 premières lignes — c'est la seule chose que ce
composant sait faire, et le plafond était déjà le sien.

**(c) commentaires corrigés** — le bloc `onScroll` et le bloc `scrollEventThrottle` portaient
deux affirmations fausses (§2.1). Elles sont remplacées par le raisonnement et ses sources.
`scrollEventThrottle={1}` est **conservé** : puisqu'il équivaut à `16` et au défaut de
`VirtualizedList` (`?? 0.0001`), le changer ne gagnerait rien ; le faire vraiment baisser
demanderait `> 16`, ce qui ralentirait le fenêtrage et `onEndReached` — pari non tenable sans
appareil.

### 3.5 `runOnJS` → `scheduleOnRN` (5 sites)

`usePullRefreshLogo.ts` (3), `FeedGutterScreen.tsx` (1), `TweetsScreen.tsx` (1). Strictement
équivalent (`react-native-worklets/src/threads.ts:332`), et c'est la forme documentée en
Reanimated 4.

### 3.6 `usePullRefreshLogo.ts` — le faux diagnostic remplacé par le vrai

Le bloc « À FAIRE » qui annonçait un chantier sur cinq écrans est remplacé par la démonstration
du §2.1 et par le rappel de ce qui coûte réellement (`VirtualizedList._onScroll`). **C'est un
chantier annulé, pas reporté.**

### Ce qui n'a PAS été touché

Aucune ligne de logique de données : pagination, curseur, déduplication, `keyExtractor`,
`withoutOrphanReplies` / `threadDepthAt`, adjacence parent/réponse, `signalsFor`,
`shouldAskAt`/`afterSilentView`, `viewabilityConfig`, `useDwellTracking`. `src/utils/feed.ts`
est **inchangé**. Aucune animation d'entrée ajoutée (l'existante a été *retirée* de 34 lignes
sur 40). Aucun en-tête repliable. Aucune nouvelle dépendance.

---

## 4. Parité `FeedGutterScreen` ↔ `TweetsScreen`

Méthode : diff des deux diffs, normalisé.

```
for f in FeedGutterScreen TweetsScreen; do
  git diff -U0 -- src/screens/$f.tsx | grep -E "^[+-]" | grep -vE "^(\+\+\+|---)" \
    | sed 's/[[:space:]]\+$//' > /tmp/$f.diff
done
diff /tmp/TweetsScreen.diff /tmp/FeedGutterScreen.diff
```

**Résultat : le diff de `TweetsScreen` est un SOUS-ENSEMBLE STRICT de celui de
`FeedGutterScreen`.** `diff` ne produit que des lignes `>` (ajouts côté 2B) — **aucune ligne
`<` ni `|`** : pas une seule ligne du diff 2A qui manque ou diffère côté 2B.

Diff intégral de `TweetsScreen.tsx` (3 lignes de code utiles, le reste est un commentaire) :

```
-  runOnJS,
+// `scheduleOnRN` et non `runOnJS` : …
+import { scheduleOnRN } from 'react-native-worklets';
-   * bascule ne partirait jamais. En passant par `runOnJS(switchTab)`, la
+   * bascule ne partirait jamais. En passant par `scheduleOnRN(switchTab, …)`,
-            runOnJS(switchTab)(TAB_ORDER[target]);
+            scheduleOnRN(switchTab, TAB_ORDER[target]);
```

### Les écarts restants, et pourquoi chacun est inoffensif

| Écart (2B seul) | Pourquoi c'est sans danger pour le test A/B |
|---|---|
| `const FeedList = …` + `onScroll={Platform.OS === 'ios' ? … : undefined}` | **2A n'a jamais eu ni `Animated.FlatList` ni `onScroll`** : `TweetsScreen.tsx:2426` monte un `FlatList` nu. Sur Android, 2B **converge** donc vers 2A. Sur iOS, la divergence est le logo de traction, qui est une différence de **présentation antérieure au chantier** — 2A n'a pas de `usePullRefreshLogo`. Zéro impact données. |
| `FeedItemEntrance` conditionnel | **2A n'importe pas `FeedItemEntrance`** — l'arrivée des lignes est une invention 2B. Purement présentationnel, et ne change rien pour les 6 lignes concernées. |
| Commentaires `onScroll` / `scrollEventThrottle` | Du texte, sur des props qui n'existent pas en 2A. |

**Toutes les corrections de logique de données de ce chantier sont hors des deux écrans** :
elles vivent dans `trackingService.ts` et `neuralRankService.ts`, **partagés par les deux
fils**, donc appliquées aux deux par construction — impossible de les désynchroniser. C'est le
meilleur endroit possible pour ce genre de correctif dans un dispositif A/B.

---

## 5. À faire côté ligne (agent RENDU — `paper2b/**`)

Constats faits en **lecture seule**, aucun fichier `paper2b/` n'a été modifié.

1. **`TweetRowGutter.areEqual` ne compare pas `gutterRef`.** Sans conséquence aujourd'hui (seul
   `index === 0` la reçoit et c'est une ref stable), mais si l'ancre de visite guidée devait un
   jour se déplacer, le changement serait avalé en silence. À documenter, sinon à ajouter.
2. **Inventaire des `useAnimatedStyle` par ligne.** Avec §3.4, chaque ligne du fil ne porte plus
   d'`Animated.View` imposée de l'extérieur : le budget « ≈ 100 composants animés sur Android
   d'entrée de gamme » (doc Reanimated) est désormais **entièrement** consommé par ce que la
   ligne monte elle-même. Chaque `useAnimatedStyle`/`Animated.View` de `TweetRowGutter` se paie
   donc ×40. Ceux qui ne servent qu'à un appui (échelle de cœur, retour tactile) gagneraient à
   n'exister qu'au moment de l'appui, ou à passer en **transition CSS Reanimated**
   (`transitionProperty`), qui n'installe pas de mapper permanent — c'est explicitement la
   recommandation d'`expo-animation` : « Using a worklet for a two-state toggle is the mobile
   equivalent of installing a motion library for a fade. »
3. **`LinearTransition` dans la ligne.** Une transition de mise en page enregistrée par ligne
   coûte à chaque commit du shadow tree. Vérifier qu'elle n'est posée que sur ce qui change
   réellement de taille (le bloc de traduction), pas sur le conteneur de la ligne.
4. **`TweetImagesPaper` : réserver la hauteur avant chargement ?** La doc RN fait de
   `getItemLayout` l'optimisation n°1 des listes, impossible ici tant que les hauteurs varient.
   Si la ligne pouvait calculer la hauteur de l'image depuis son ratio **avant** le chargement,
   on supprimerait les sauts de mise en page en défilement — et on ouvrirait, à terme, la voie à
   une hauteur estimable.
5. **`ContestCardPaper` monte un `setInterval` (ligne ~72).** S'il tourne dans une ligne recyclée,
   il faut qu'il s'arrête au démontage **et** hors focus, sinon N compte-à-rebours tournent en
   parallèle sur le thread JS pendant le défilement.
6. **Aucune animation d'entrée dans la ligne**, jamais (`entering=`) : le recyclage la rejoue.
   Rappel de la contrainte utilisateur, déjà respectée.

---

## 6. Preuves

Lancées après le dernier changement, dans le dépôt.

```
$ cd "C:/Users/nouno/OneDrive/Bureau/IAFILTRE/twitninfbeta"
$ npx tsc --noEmit
exit code: 0
```

```
$ node --test tests
1..197
# tests 197
# suites 0
# pass 197
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2004.793
```

Référence d'avant chantier : `tsc` exit 0, **176 passed / 0 failed**. L'écart (197) se
décompose ainsi : **+6** de `tests/track-queue.test.js` (ce chantier) et **+15** venus de
l'agent RENDU, qui travaille en parallèle dans le même arbre (`tests/tweet-row-text.test.js`,
et des cas ajoutés à `tests/neuralrank-scores.test.js`). **0 échec, aucune régression.**

Fichiers modifiés par ce chantier :

```
src/components/feed/FeedItemEntrance.tsx |  14 ++-      (export du plafond, additif)
src/hooks/usePullRefreshLogo.ts          |  77 ++++---
src/screens/FeedGutterScreen.tsx         | 167 +++++++++-----
src/screens/TweetsScreen.tsx             |  13 ++-
src/services/neuralRankService.ts        |  32 ++++
src/services/trackingService.ts          |  82 +++++++--
src/utils/trackQueue.ts                  | (nouveau)
tests/track-queue.test.js                | (nouveau)
```

Les 7 fichiers modifiés **préexistants** (`EmojiPickerSheet`, `ui/ScreenSkeleton`,
`MainNavigator`, `ConversationThreadScreen2B`, `MessagesScreen2B`, `SearchScreen`,
`theme/fonts`) sont **intacts**. Aucun fichier `paper2b/**` ni `theme/paper2b.ts` n'a été
touché. Aucun commit, aucun `git add`, aucun push.

---

## 7. Non fait / risques

### Écarté volontairement

| Piste | Pourquoi non |
|---|---|
| **Baisser `scrollEventThrottle`** | `1` ≡ `16` sur RN 0.81 (« Values <= 16 will disable throttling »). Une vraie baisse demanderait `> 16`, ce qui ralentirait `_updateViewableItems` et `onEndReached` d'autant. **Arbitrage qui exige une mesure sur appareil.** |
| **Réécrire `pull` via `useScrollOffset`** | Le « À FAIRE » du dépôt reposait sur un diagnostic faux (§2.1), et `useScrollOffset` passe par le **même** `useEvent` et les mêmes événements natifs. Gain nul, risque réel sur cinq écrans. |
| **`windowSize` 7 → 5, `initialNumToRender` 6 → 4** | Doc RN : moins de mémoire et de travail JS, mais **plus de blanc en défilement rapide**. Le compromis ne se juge que sur appareil. À tester en priorité si le fil reste lourd. |
| **`getItemLayout` / `estimatedItemSize`** | Hauteurs variables. `estimatedItemSize` n'existe pas sur la `FlatList` du cœur — c'est FlashList, donc une **dépendance native** (rebuild) : exclu par la commande. Cela dit, sur des lignes lourdes de hauteur variable, FlashList est *l'*outil qui changerait la donne : si la fluidité reste insuffisante après ce chantier, c'est le prochain arbitrage à poser, avec son coût de rebuild natif. |
| **`maintainVisibleContentPosition`** | La pagination ajoute en queue ; rien n'est inséré en préfixe. Aucune position à maintenir, et interférence probable avec le rebond de traction iOS. |
| **`Gesture.Native()` + `simultaneousWithExternalGesture` sur le geste d'onglet** | La doc le propose pour un pan **dans** un ScrollView ; ici le pan **enveloppe** la liste et se désamorce déjà par `failOffsetY`. Changer la composition modifie qui gagne la course tactile — **invérifiable sans appareil**, et le geste actuel est documenté comme fonctionnel. |
| **Mémoïser `resolveDeviceTimeZone()`** dans `services/clientIdentity.ts` | Un `Intl.DateTimeFormat()` par requête HTTP, ce n'est pas rien (§2.3) — mais le commentaire du fichier dit que le fuseau doit « suivre l'utilisateur en voyage ». Un cache changerait ce comportement, dans un fichier hors périmètre. **Recommandation** : cache à TTL court (60 s), à décider par la session principale. |
| **`InteractionManager.runAfterInteractions` pour les impressions** | Rejeté au profit de la file : pendant un défilement continu, rien ne garantit qu'une « interaction » se termine, et les signaux pourraient s'accumuler indéfiniment. La file, elle, part au tour de boucle suivant, toujours. |
| **Animations d'entrée de ligne** | Rejetées par l'utilisateur (« ça fait IA »). Ce chantier en **retire**, il n'en ajoute pas. |
| **En-tête repliable** | Hors sujet, et déjà retiré après deux bugs de rendu. |

### Risques et points à vérifier sur appareil

1. **Android : le passage à `FlatList` nu.** Démontré par lecture de source, mais **jamais lancé**.
   À vérifier : le fil défile normalement, le `RefreshControl` Android fonctionne toujours,
   aucune régression visuelle de cellule. C'est le changement le plus structurel du lot.
2. **Une ligne qui traverse le seuil `index < 6`** (uniquement après un réordonnancement des
   données) change de type d'élément — fragment ↔ `FeedItemEntrance` — et **remonte**. En
   pratique cela n'arrive qu'à l'actualisation, où `markNewBatch()` vide `entranceSeen` et
   rejoue l'arrivée du haut de liste de toute façon. Théorique, mais à l'œil lors du premier
   essai.
3. **La file d'impressions et une app tuée brutalement.** Ce qui attend son tour est perdu — mais
   c'était déjà le cas des requêtes en vol. Le retard introduit est de l'ordre du tour de boucle
   plus la sérialisation à 3 en parallèle. Si l'on voulait un filet, ce serait un flush sur
   `AppState → background` : **pas posé**, parce qu'il faudrait décider quoi faire des envois
   inachevés et que ça déborde du périmètre.
4. **Le gain se mesure en build de release, jamais dans Expo Go** (`expo-animation` :
   « Expo Go is not a performance environment »). Le protocole : Perf Monitor, thread JS,
   défilement rapide sur trois pages, sur le plus lent des Android disponibles.
5. **Deux drapeaux Reanimated non posés**, à envisager si le défilement scintille encore
   (doc `animations-performance.md`) : `DISABLE_COMMIT_PAUSING_MECHANISM` (scintillement pendant
   le défilement, RN ≥ 0.81) et `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS` (chute de FPS avec
   beaucoup de composants animés visibles, **Reanimated ≥ 4.2.0** — le projet est en 4.1.2,
   donc indisponible en l'état).
