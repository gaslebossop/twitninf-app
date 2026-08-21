# Fil 2B — coût de rendu d'une ligne

Chantier « RENDU » du 2026-08-21. Périmètre : ce qu'une ligne du fil 2B coûte à
monter et à re-rendre. La configuration de la `FlatList` et l'écran
(`FeedGutterScreen.tsx`) sont le périmètre de l'agent SCROLL — ce qui les
concerne est rassemblé en § 4.

Contrat de props de `TweetRowGutter` : **inchangé**. Aucune modification de
`FeedGutterScreen.tsx` n'est nécessaire pour que ce travail s'applique.

---

## 1. Ce que dit la doc

### 1.1 Skills Software Mansion

| Source | Règle retenue |
|---|---|
| `skills:react-native-best-practices` (index) | **`runOnJS` est supprimé en Reanimated 4** : tout retour vers le thread JS depuis un worklet passe par `scheduleOnRN` de `react-native-worklets`. Vérifié : aucun worklet écrit dans mon périmètre n'appelle de fonction JS. `ImageViewerPaper` utilise encore `runOnJS` (déprécié mais fonctionnel, il délègue à `scheduleOnRN`) — hors sujet fluidité, laissé tel quel. |
| `references/animations/animations-performance.md` | **Limite pratique d'animations simultanées : ~500 composants sur iOS, ~100 sur Android d'entrée de gamme.** C'est le chiffre qui condamne l'éclat de réaction monté au repos (voir § 2.1). |
| idem | **« Memoize Callbacks and Gesture Objects »** — les descripteurs d'animation recréés à chaque rendu sont un coût réel. D'où `ROW_LAYOUT` hissé au niveau du module. |
| idem | **« Worklet Closure Optimization »** — extraire la valeur précise plutôt que capturer l'objet entier dans un worklet. Vérifié : les `useAnimatedStyle` de la ligne ne capturent que des `SharedValue`, rien d'autre. |
| idem | **« Prefer Non-Layout Properties »** — n'animer que `transform` / `opacity` / `backgroundColor`. Vérifié : c'est déjà le cas partout dans 2B (`ReactionBurst` le documente lui-même). |
| `references/animations/animation-functions.md` | **Ne jamais lire `sv.value` pendant le rendu React** (synchronisation bloquante UI→JS). Vérifié : aucune lecture de `.value` hors worklet dans la ligne. |
| idem | **« Keep static styles in `StyleSheet.create()`. Only put dynamic parts in `useAnimatedStyle` »** — appliqué aux hôtes d'éclat, dont l'objet de style variable est désormais mémoïsé. |
| `references/animations/layout-animations.md` | **« Performance: Define animation builders outside of components or wrap with `useMemo` »** — appliqué à `LinearTransition.duration(180)`, qui était construit à chaque rendu de chaque ligne. |
| idem | Pour animer la mise en page d'items de liste, la voie prévue est `itemLayoutAnimation` sur `Animated.FlatList`, **pas** un `layout=` par ligne. Noté en § 4 pour l'agent SCROLL. |
| `react-native-ui` | **« Jamais `entering=` sur une ligne de `FlatList` sans garde-fou : le recyclage rejoue l'animation. »** Aucune animation d'entrée ajoutée. `FeedItemEntrance` en porte déjà les deux garde-fous ; il est hors de mon périmètre. |
| idem | **« Chiffres alignés »**, **plancher de 13 px**, grille de 4 — aucune valeur typographique ni d'espacement n'a été touchée, donc rien à re-arbitrer. |

### 1.2 Context7 — documentation à jour

| Bibliothèque | Requête | Règle retenue |
|---|---|---|
| `/react/react-native-website` — `docs/optimizing-flatlist-configuration.md` | memo, getItemLayout, coût par item | `React.memo` avec comparateur explicite sur l'item ; `getItemLayout` « removes the need for your FlatList to manage async layout calculations » ; réduire le nombre et la complexité des vues par item. |
| `/expo/expo` (branche `sdk-54`) — `packages/expo-image/src/Image.types.ts` | recyclingKey, cachePolicy, allowDownscaling | Citation exacte de `recyclingKey` : *« Changing this prop resets the image view content to blank or a placeholder before loading and rendering the final image. This is especially useful for any kinds of recycling views […] to prevent showing the previous source before the new one fully loads. »* — c'est précisément le défaut décrit dans le brief. |
| idem — `ExpoImageViewWrapper.kt` (Android) | implémentation | `recyclingKey` positionne `clearViewBeforeChangingSource`, et `allowDownscaling` n'agit **que** si `contentFit` n'est ni `fill` ni `none` : `cover` et `contain` en bénéficient donc, ce sont les deux que 2B utilise. |
| idem — `ImageView.swift` (iOS) | implémentation | `recyclingKey` remet `image` et `placeholderImage` à nil au recyclage ; `enforceEarlyResizing` force le décodage à la taille du conteneur. |
| `/software-mansion/react-native-reanimated` v4.1.5 — `src/mappers.native.ts` | coût de `useAnimatedStyle` | **« Each `useAnimatedStyle` registers its own listener on every shared value […] N animated styles sharing one shared value results in N entries in that shared value's listener map. »** Et `updateMappersOrder()` retrie l'ensemble des mappers dès que leur nombre change — donc à chaque montage/démontage de cellule. C'est le chiffrage exact du § 2.1. |
| idem — `packages/react-native-worklets/src/threads.native.ts` | runOnJS | `runOnJS` est `@deprecated`, il délègue à `scheduleOnRN`. |

### 1.3 Pages officielles (WebFetch)

| URL | Règle retenue |
|---|---|
| <https://reactnative.dev/docs/optimizing-flatlist-configuration> | *« The more complex your components are, the slower they will render. Try to avoid a lot of logic and nesting in your list items. »* — *« The heavier your components are, the slower they render. »* — *« Use cached optimized images »* : la doc renvoie explicitement à un composant image communautaire plutôt qu'au `Image` du cœur. |
| <https://reactnative.dev/docs/performance> | *« If the JavaScript thread is unresponsive for a frame, it will be considered a dropped frame »* : un `setState` sur un sous-arbre coûteux « might take 200ms and result in 12 frames being dropped ». C'est le raisonnement derrière le découpage du § 3.2 (un like ne doit plus toucher le sous-arbre média). |
| <https://docs.expo.dev/versions/latest/sdk/image/> | `cachePolicy` vaut **`'disk'` par défaut**, pas `'memory-disk'` : le cache mémoire doit être demandé explicitement. `contentFit: 'cover'` est l'équivalent de `resizeMode: 'cover'`, `'contain'` de `'contain'` — la bascule est donc visuellement neutre. `transition` est un fondu **rejoué à chaque changement de source**. |

### 1.4 Ce que la doc a servi à *écarter*

- **`getItemLayout`** : la doc le donne comme l'optimisation la plus rentable, mais elle exige une hauteur d'item connue. Une ligne 2B a une hauteur variable (texte 1→∞ lignes, images, citation, vidéo). → § 4, non applicable en l'état.
- **`removeClippedSubviews`** : déjà activé sur Android par l'écran.
- **Bundle Mode / worklets** (`references/enable-worklets-bundle-mode`) : sans objet, aucun import dans un worklet ici.
- **Skia** : la doc le propose pour « des centaines d'éléments animés », mais c'est une dépendance native et le projet l'a déjà écartée (voir `FeedItemEntrance`). Le bon correctif était de ne pas monter ces centaines d'éléments du tout.

---

## 2. Diagnostic — ce qui coûtait cher, par impact

Numéros de ligne dans la version **avant** chantier (`git show HEAD:…`).

### 2.1 ⭐ L'éclat de réaction monté sur chaque ligne, en permanence

`TweetRowGutter.tsx:496`, `:497`, `:528` — trois `<ReactionBurst>` par ligne,
rendus inconditionnellement.

`ReactionBurst.tsx` s'ancre sur une vue de 0 × 0 et dessine tout en absolu.
Décompte par ligne, **au repos, tout à opacité 0** :

| Éclat | `Animated.View` | `useAnimatedStyle` (mappers) |
|---|---|---|
| cœur (8 particules) | 11 | 13 |
| Super Cœur (`halo`, 16 particules) | 22 | 21 |
| repost (8 particules) | 11 | 13 |
| **total** | **44** | **47** |

Plus le cœur plein écran du double-tap (`:470`) : une vue en recouvrement
total portant un glyphe Ionicons de 90 px, invisible en dehors d'un double-tap.

Avec `windowSize={7}` et `initialNumToRender={6}`, cela fait de l'ordre de
**450 à 900 vues animées montées** pour un fil au repos. La doc Software
Mansion donne ~100 comme limite pratique sur un Android d'entrée de gamme, et
la source de Reanimated confirme que chaque mapper s'inscrit comme auditeur sur
la `SharedValue` qu'il lit et que le registre est **retrié à chaque
montage/démontage** — c'est-à-dire à chaque cellule qui entre ou sort de la
fenêtre de virtualisation, donc en plein défilement.

Aggravant : le Super Cœur — le plus lourd des trois — était monté **même quand
le drapeau `fil.super_heart` est éteint**, c'est-à-dire pour un compte qui ne
peut physiquement pas le déclencher.

### 2.2 ⭐ Un like re-rendait toute la ligne

`TweetRowGutter.tsx:765` — le comparateur `areEqual` est **correct** : il ne
fige rien qui devrait bouger (like, compteurs, auteur, traduction) et exclut
délibérément `stats.views`. Ce n'était pas là qu'était le problème.

Le problème est en dessous : la ligne était **un seul composant**. Aimer change
`stats.likes` et `user_interaction.is_liked` — deux valeurs de la gouttière —
et reconstruisait au passage `PremiumDisplayName` (qui refait quatre `useMemo`
de style), `ClickableMentions`, `VerifiedBadge`, `TranslationReveal`, la grille
d'images, la citation et le pied de ligne.

### 2.3 ⭐ `TranslationReveal` monté à vide sur chaque ligne

`TweetRowGutter.tsx:642` — enveloppait le corps de **tous** les tweets, avec
`language={activeTranslation?.language ?? null}`.

Or `TranslationReveal.tsx` n'a rien à jouer quand `language` est nul, et coûte
quand même par ligne : deux vues imbriquées (`View overflow:hidden` +
`Animated.View` avec transform), trois `new Animated.Value`, et surtout un
`onLayout` qui appelle `setSize` — soit **un rendu React supplémentaire par
ligne, au montage**. Pour un lecteur francophone, qui n'a aucune traduction à
charger, c'était intégralement du déchet.

### 2.4 `ImageViewerPaper` monté sur chaque tweet illustré

`TweetImagesPaper.tsx` rendait la visionneuse en permanence. Elle sort bien
`null` quand `visible` est faux — mais **après** ses hooks : `useWindowDimensions`
(un abonné de plus aux changements de dimensions par ligne illustrée), six
`useSharedValue`, deux `useAnimatedStyle`, une dizaine de `useCallback`.

### 2.5 Le corps du tweet mis en forme deux fois par ligne

`TweetRowGutter.tsx:660` — pour décider s'il faut proposer « Voir plus », la
ligne rendait une **seconde** copie du texte, hors écran, et lisait
`onTextLayout`. Puis `setIsTruncated` provoquait un troisième rendu.

La mise en forme de texte est le poste le plus cher d'une ligne après les
images, et une `FlatList` remonte ses cellules à chaque passage dans la fenêtre
— ce n'est donc pas un coût « une fois », c'est un coût par apparition.

### 2.6 `Intl` appelé à chaque rendu

`TweetRowGutter.tsx:626` — `fmtDate(...)` en clair dans le JSX. Au-delà d'un
jour, il fait `new Date` deux fois puis `toLocaleDateString('fr-FR', …)`, donc
un aller-retour `Intl` : de loin l'appel le plus cher d'un rendu de ligne, refait
à chaque like, à chaque mesure de troncature, à chaque traduction reçue.

### 2.7 Travail refait et objets recréés à chaque rendu

- `:216` — `certifiedNameColors(...)` appelé **inconditionnellement**, alors
  que son résultat n'est consommé que par le badge des comptes certifiés.
- `:652` — `contextData={{ ...contextData, position: index, author_id: … }}` :
  objet littéral neuf à chaque rendu.
- `:460` — `layout={LinearTransition.duration(180)}` : descripteur d'animation
  neuf à chaque rendu de chaque ligne montée.
- `:228` — le `useMemo` du média dépendait de **`tweet`**. L'écran met le like à
  jour par étalement superficiel (`{ ...tweet, stats, user_interaction }`) :
  `tweet` change d'identité à chaque cœur, `media_urls` non. Le tableau
  `displayMediaUrls` était donc refabriqué à chaque like. **C'est le piège qui
  aurait rendu inutile tout le découpage du § 3.2.**
- Styles en objets littéraux : `[S.burstHost, { width, height }]`,
  `[S.content, { paddingLeft: … }]`, les deux `onPressIn`/`onPressOut` en
  flèches.

### 2.8 Images du fil rendues par le `Image` du cœur React Native

`TweetImagesPaper.tsx`, `ImageViewerPaper.tsx`, `SpotlightBand.tsx` — alors
qu'`expo-image` est installé et déjà utilisé par `Avatar.tsx` dans ce même
dépôt. Conséquences : pas de cache mémoire+disque (redécodage à chaque
réapparition), pas de `recyclingKey` (une cellule réutilisée peut montrer la
photo précédente), pas de sous-échantillonnage à la taille du conteneur.

### 2.9 Ce qui a été vérifié et jugé sain

- **`areEqual`** : correct, ni trop laxiste ni trop strict (voir § 2.2). Deux
  trous mineurs comblés en § 3.7.
- **Les contextes** : `FeatureFlagContext` mémoïse sa valeur
  (`FeatureFlagContext.tsx:124`) ; `ReadingLanguageContext` aussi (`:270`), et
  le cache de traductions vit dans une **ref** avec un `useSyncExternalStore`
  par tweet — le commentaire du fichier explique que c'était justement un bug
  corrigé. Aucun contexte ne re-rend le fil entier.
- **`ClickableMentions`** : son découpage regex est déjà `useMemo`ïsé avec une
  sortie rapide sur `indexOf('@')` / `indexOf('#')`.
- **`VerifiedBadge`** : `animated={false}` est déjà passé, et c'est déjà le
  défaut du composant.
- **`ReactionBurst`** : ses animations sont propres (`opacity`/`transform`
  uniquement, aucune propriété de layout). Le problème n'était pas ce qu'il
  anime, c'est qu'il soit monté.
- **Aucun `BlurView`, aucune ombre, aucun `Svg`** dans la ligne 2B.

---

## 3. Ce qui a été changé

Aucun changement de logique de données. Aucun changement de hauteur,
d'espacement, de couleur ni de typographie.

### 3.1 ⭐ L'éclat de réaction est monté à la demande

`TweetRowGutter.tsx` — nouvel état local `burstArmed`, faux au montage.

- Armé sur **`onPressIn`** du cœur et du repost : le montage a toute la durée
  de l'appui, et l'éclat lui-même ne démarre qu'après `withDelay(30)`.
- Armé aussi au **premier** appui d'un éventuel double-tap dans
  `handleRowPress` : un double-tap laisse jusqu'à 280 ms entre les deux appuis.
- Le cœur plein écran du double-tap suit le même drapeau. Son animation part de
  l'opacité 0 et n'atteint 0,95 qu'à ~108 ms : un montage une image plus tard
  est invisible.
- L'éclat du Super Cœur n'est de plus monté que si `superHeartEnabled`.

Le ressort de l'icône (`like.iconStyle`, `retweet.iconStyle`) n'a **pas** été
conditionné : il doit rester instantané, et il ne coûte qu'un mapper.

**Gain attendu**, par ligne au repos : ~45 vues animées → **4**, et ~52 mappers
Reanimated → **5**. Sur une fenêtre de 10 lignes montées : ~450 vues animées
en moins, et surtout un registre de mappers qui ne se fait plus retrier à
chaque cellule qui entre ou sort pendant le défilement.

**Rendu visuel inchangé** : `ReactionBurst` est en position absolue sur une
ancre de 0 × 0, le monter ou non ne déplace pas un pixel ; et il est
intégralement à opacité 0 tant que sa progression vaut 0.

### 3.2 ⭐ La colonne de contenu est un composant mémoïsé

`TweetRowGutter.tsx` — nouveau `RowContent`, `memo` par défaut, qui reprend
**verbatim** tout ce qui était sous `<View style={S.content}>`. L'état de
troncature et d'expansion descend avec lui, puisqu'il ne concerne que cette
colonne.

Pour que ce `memo` serve réellement à quelque chose, toutes ses propriétés ont
été rendues stables :

- `mentionContext` : `useMemo` au lieu d'un objet littéral ;
- `timeLabel`, `displayBadgeTint`, `paperCustomization` : `useMemo` ;
- `handleProfilePress`, `handleVideoDuration`, `handleUnlocked`,
  `handleOpenContest`, `handleOpenQuote` : `useCallback` au lieu de flèches JSX ;
- `onSelectTranslation` : le `setActive` du hook de traduction est une flèche
  recréée à chaque rendu — il passe par une ref, et seule une enveloppe stable
  est exposée ;
- **le `useMemo` du média dépend désormais de `media_urls`, plus de `tweet`**
  (§ 2.7) — sans ça, rien de ce qui précède n'aurait servi.

**Gain attendu** : aimer ou reposter ne re-rend plus que la gouttière. L'en-tête
d'auteur, le corps, la grille d'images, la vidéo, le message vocal, la carte
musique, la citation et le pied de ligne ne sont plus reconstruits.

**Rendu visuel inchangé** : l'arbre JSX est identique élément pour élément, y
compris `[S.content, isReply && { paddingLeft: ps(13) * depth }]` (réécrit
`depth > 0 ? … : S.content`, avec `isReply === depth > 0`).

### 3.3 ⭐ `TranslationReveal` n'enveloppe que ce qui est vraiment traduit

`TweetRowGutter.tsx` (dans `RowContent`) — le corps n'est enveloppé que si
`activeTranslation?.language` est renseigné, et jamais pour un texte brouillé
(ce qui reproduit exactement l'ancien comportement : la révélation ne portait
que sur la branche `ClickableMentions`).

Le déclenchement de l'animation ne change pas : `TranslationReveal` joue depuis
son `useEffect` au premier rendu où `language` est non nul — qu'il soit monté
avant avec `null` ou monté directement avec la langue. Son registre `revealed`
(clé `tweetId:language`) empêche toujours le rejeu au recyclage.

**Gain attendu** : deux vues, trois `Animated.Value` et **un rendu React
supplémentaire** (le `setSize` de son `onLayout`) en moins, sur chaque ligne
d'un lecteur qui n'a pas de traduction — c'est-à-dire la quasi-totalité.

**Risque résiduel** : le conteneur supprimé portait `overflow: 'hidden'`. Le
texte est déjà borné par `numberOfLines`, donc rien ne devrait déborder, mais
c'est le point à regarder en premier sur appareil.

### 3.4 La visionneuse d'images n'est montée qu'à l'ouverture

`TweetImagesPaper.tsx` — `{viewerIndex !== null && <ImageViewerPaper … />}`.

**Comportement identique** : avant, le composant était monté mais sortait `null`
tant que `visible` était faux ; la `<Modal>` apparaissait au moment où
`viewerIndex` cessait d'être nul. C'est exactement ce que fait la version
conditionnelle — sauf que les hooks ne tournent plus au repos.

Au passage : `images` (filtre + coupe) est mémoïsé, et `onClose` est un
`useCallback` au lieu d'une flèche.

### 3.5 Les images passent à `expo-image`

`TweetImagesPaper.tsx`, `ImageViewerPaper.tsx`, `SpotlightBand.tsx` :
`cachePolicy="memory-disk"`, `recyclingKey={url}`, `transition={0}`,
`contentFit` équivalent au `resizeMode` d'avant.

- `cachePolicy="memory-disk"` (le défaut d'`expo-image` est `'disk'` seul) :
  une photo déjà vue réapparaît sans retéléchargement **ni redécodage**.
- `recyclingKey` : la vue est vidée avant de charger une nouvelle source — une
  cellule réutilisée ne montre plus, même une image, la photo précédente.
- `allowDownscaling` (actif par défaut, et effectif car `contentFit` vaut
  `cover`/`contain`) : le bitmap est décodé à la taille de la cellule.
- La visionneuse partage le cache de la grille : ouvrir une photo qu'on vient de
  voir dans le fil ne la retélécharge plus.

**Rendu visuel inchangé** : `transition={0}` laisse le fondu maison
(`alreadySeen`, au niveau du module) seul maître — celui d'`expo-image` se
rejouerait à chaque recyclage, exactement ce que ce composant existe pour
éviter. `contentFit="cover"` / `"contain"` sont les équivalents documentés de
`resizeMode`.

**Un correctif de robustesse au passage** : `onLoad` devient `onLoadEnd` dans
`TweetImagesPaper`. Avec `onLoad` seul, une image qui échoue à charger laissait
sa cellule bloquée à l'opacité 0 pour toujours.

### 3.6 Travail refait supprimé

- `fmtCount` / `fmtDate` sortis dans `src/components/feed/paper2b/tweetRowText.ts`
  (module pur, testé) ; `fmtDate` est appelé **une fois par tweet** via `useMemo`
  sur sa date. Le libellé n'était de toute façon rafraîchi que par accident,
  quand un rendu se produisait : aucune horloge ne le remet à l'heure, ni avant
  ni après.
- `certifiedNameColors` n'est calculé que pour un auteur certifié, et mémoïsé.
- `ROW_LAYOUT = LinearTransition.duration(180)` hissé au niveau du module.
- `burstHostStyle` / `burstHostSmallStyle` / `contentStyle` : `useMemo`.
- `onPressIn` / `onPressOut` de la ligne : `useCallback`.
- Nouveau `canSkipTruncationMeasure` : un texte trop court pour pouvoir tenir
  sur plus de quatre lignes se passe de la mesure hors écran **et** du rendu
  supplémentaire qu'elle provoque. Le seuil (48 caractères, au plus un saut de
  ligne) est volontairement pessimiste — se tromper ferait disparaître le bouton
  « Voir plus » d'un tweet réellement tronqué, ce qu'aucune compilation ne
  verrait. D'où les tests, dont le pire cas typographique (48 capitales larges).

### 3.7 Deux trous du comparateur comblés

`areEqual` ne comparait pas :

- `originalTweet.content` — une correction du tweet d'origine ne remontait
  jamais dans le fil de ceux qui l'ont reposté ;
- `paid_content.has_access` — le verrou payant décide de **tout** le rendu de la
  colonne de contenu ; un déverrouillage non comparé laissait le cadenas
  affiché ;
- `gutterRef` — sans effet en pratique (elle suit `index`, déjà comparé), mais
  un comparateur incomplet est un bug qui attend son cas limite.

Aucun de ces ajouts ne peut provoquer de rendu supplémentaire dans le cas
nominal : ce sont trois valeurs qui ne bougent pas.

### 3.8 Composants partagés — ce qui a été touché

**Aucun.** `Avatar`, `ClickableMentions`, `VerifiedBadge`, `PremiumDisplayName`,
`TweetVideo`, `TweetVoiceMessage`, `TweetMusicCard`, `TranslationReveal`,
`LockedText`, `PaidContentLock`, `ReactionBurst` ont été **lus** et laissés
intacts. Les gains les concernant ont tous été obtenus depuis l'appelant 2B, ce
qui garantit que le fil d'origine et les autres écrans ne bougent pas d'un
pixel.

### 3.9 Hors périmètre, corrigé quand même : `tests/neuralrank-scores.test.js`

Les six essais de ce fichier échouaient **avant le chantier**, sur toute copie
de travail Windows. Son chargeur découpe le source à la recherche de la suite
« saut de ligne, `}`, saut de ligne » ; avec `core.autocrlf=true` (le réglage
de ce dépôt) le fichier est lu en CRLF, le repère ne se trouve jamais, la
tranche est vide et la fonction extraite est `undefined`.

Preuve que ce n'est pas une régression du chantier — le contenu **de HEAD**,
réécrit en CRLF, échoue à l'identique :

```
f43b8f4c4/scratchpad/nrs_head.ts -> function        (HEAD tel que git le stocke, en LF)
rc/services/neuralRankService.ts -> undefined       (le même fichier, tel que Windows le lit)
HEAD réécrit en CRLF -> undefined                   (HEAD, sans aucune modification, converti en CRLF)
```

Correctif : une normalisation des fins de ligne avant le découpage, dans le
test seul. Aucun source touché. À jeter sans hésiter si l'agent SCROLL ou la
session principale a déjà traité la question autrement.

---

## 4. À faire côté écran (`FeedGutterScreen.tsx` — agent SCROLL)

Rien de ce qui suit n'est nécessaire pour que le travail ci-dessus s'applique.
Ce sont les gains restants, qui exigent le fichier de l'autre agent.

> ⚠️ Les numéros de ligne de cette section ont été relevés pendant que l'agent
> SCROLL modifiait `FeedGutterScreen.tsx` : ils peuvent avoir bougé. Les repères
> nommés (`renderTweet`, `FeedList`) restent valides.

### 4.1 `renderTweet` se reconstruit à chaque changement de `visibleTweets`

`FeedGutterScreen.tsx`, `renderTweet` (≈ `:1977`, dépendances ≈ `:2090`).

`renderTweet` dépend de `visibleTweets`, `askAtId`, `entranceGeneration`,
`entranceSeen`, `storyUserIds`, `unseenStoryUserIds`… Ce n'est pas grave en soi
— `areEqual` filtre correctement en aval — mais deux propriétés y sont
recalculées à chaque rendu de l'écran et **ne sont pas** comparées par
`areEqual` puisqu'elles sont dérivées :

- `isThreadParent` / `isThreadChild` / `replyToName` : recalculés depuis
  `visibleTweets[index ± 1]` ; ce sont des primitives, donc `areEqual` les
  compare correctement. **Rien à faire.**
- `gutterRef={index === 0 ? gutterAnchor : undefined}` : stable. **Rien à faire.**

Conclusion : le contrat est sain, je n'ai **aucune** demande bloquante.

### 4.2 `getItemLayout` — non applicable en l'état

La doc RN le donne comme l'optimisation la plus rentable, mais une ligne 2B a
une hauteur variable (texte 1→∞ lignes, images en `aspectRatio`, citation,
vidéo, pied conditionnel). Le poser avec une hauteur fictive casserait le
défilement. À n'envisager qu'avec une vraie mesure mise en cache par id, ce qui
est un autre chantier.

### 4.3 `layout={ROW_LAYOUT}` par ligne — décision à prendre à deux

`TweetRowGutter.tsx` pose `layout={ROW_LAYOUT}` sur la racine de chaque ligne :
c'est le dernier reste de machinerie Reanimated portée par ligne, et les
transitions de mise en page sur cellules virtualisées sont une source de
saccade connue. Il ne sert qu'à faire glisser l'expansion « Voir plus ».

La voie documentée par Reanimated pour un item de liste est
`itemLayoutAnimation` sur `Animated.FlatList`, **mais elle n'est pas applicable
telle quelle ici** : l'agent SCROLL a fait de la liste un
`FeedList = Platform.OS === 'ios' ? Animated.FlatList : FlatList`
(`FeedGutterScreen.tsx:204`), et un `FlatList` nu n'accepte pas
`itemLayoutAnimation`. Un `itemLayoutAnimation` poserait donc une divergence
de mouvement entre iOS et Android — pire que le défaut qu'il corrige.

Deux options, à trancher avec un appareil sous la main :

1. **Retirer purement** `layout={ROW_LAYOUT}` de `TweetRowGutter.tsx` :
   l'expansion « Voir plus » saute au lieu de glisser, et chaque ligne cesse
   d'être une vue à transition de layout. C'est le gain de fluidité le plus net
   qui reste, et il est à un mot près.
2. **Le garder** tel quel (état actuel), avec le descripteur désormais construit
   une seule fois au niveau du module.

Je n'ai pas tranché unilatéralement : c'est un changement de mouvement visible,
et rien n'est vérifiable sans appareil dans cette session.

### 4.4 Drapeaux Reanimated 4 contre la saccade de défilement

La doc Software Mansion (`animations-performance.md`) liste des drapeaux
explicitement destinés au défilement de `FlatList` sur la Nouvelle Architecture,
à activer **au point d'entrée de l'app** (donc `App.tsx` / `index.ts`, pas dans
mon périmètre ni dans celui de l'écran) :

- scintillement pendant le défilement (RN ≥ 0.81 — le projet est en 0.81.5) :
  `DISABLE_COMMIT_PAUSING_MECHANISM` côté Reanimated, plus
  `preventShadowTreeCommitExhaustion` côté RN ;
- chutes de FPS quand beaucoup de composants animés sont visibles (RN ≥ 0.80,
  Reanimated ≥ 4.2.0) : `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS`. **Attention :
  le projet est en `~4.1.1`, ce drapeau demanderait une montée de version** ;
- `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` (dispo depuis 4.0.0) —
  avec la réserve documentée : il peut gêner la détection du toucher sur les
  éléments animés en `transform`, et la doc recommande alors le `Pressable` de
  `react-native-gesture-handler` plutôt que celui du cœur. La ligne 2B utilise
  `AnimatedPressable` du cœur RN : à essayer sur appareil, pas à l'aveugle.

Aucun n'a été activé : ils sont globaux, non vérifiables ici, et le second
exigerait une montée de Reanimated.

---

## 5. Preuves

```
$ cd "C:/Users/nouno/OneDrive/Bureau/IAFILTRE/twitninfbeta"
$ npx tsc --noEmit; echo "tsc exit=$?"
tsc exit=0
```

```
$ node --test tests
...
1..197
# tests 197
# suites 0
# pass 197
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1991.1743
```

Décompte : 176 essais préexistants + 15 nouveaux (`tests/tweet-row-text.test.js`,
les miens) + 6 apportés par l'agent SCROLL (`tests/track-queue.test.js`) = 197.
Les 6 essais de `neuralrank-scores.test.js` passent à nouveau — voir § 3.9 pour
la cause (fins de ligne CRLF, antérieure au chantier) et la preuve.

```
$ npx eslint src/components/feed/paper2b/
✖ 3 problems (0 errors, 3 warnings)
```

Les trois avertissements sont préexistants (`import/no-named-as-default` sur
`feedback` et `apiService`) et sans rapport avec le chantier.

---

## 6. Non fait, et risques

### Écarté volontairement

- **`@shopify/flash-list`.** C'est la bonne réponse à long terme — recyclage
  réel des cellules au lieu de démontage/remontage, et `recyclingKey`
  d'`expo-image` est précisément documenté pour lui. Mais c'est une dépendance
  native, donc un rebuild, donc interdit par le brief. À proposer séparément.
- **Retirer `layout={ROW_LAYOUT}`.** Les animations de mise en page sur des
  cellules virtualisées sont une source de saccade connue, et c'est le seul
  reste de machinerie Reanimated par ligne. Mais le retirer change le
  mouvement visible (« Voir plus » sauterait au lieu de glisser) et c'est
  invérifiable sans appareil. Hissé au niveau du module seulement. Voir § 4.3.
- **Fusionner les trois `useReactionAnimation`.** Il en reste trois par ligne
  (9 `SharedValue` + 3 mappers), dont un — le Super Cœur — inutile hors palier.
  Un hook ne peut pas être appelé conditionnellement, et changer sa signature
  toucherait `ReactionBurst.tsx`, partagé avec le fil d'origine. 3 mappers par
  ligne, c'est acceptable ; 47, non.
- **Modifier `ClickableMentions` / `PremiumDisplayName`.** Tous deux sont des
  composants de fonction non mémoïsés, montés sur chaque ligne de **tous** les
  fils. Les envelopper de `React.memo` serait sans doute un gain net, mais ils
  servent aussi le fil d'origine, le détail d'un tweet et les profils : le
  risque de régression dépasse le gain d'un test A/B. À traiter comme un
  chantier propre, avec ses propres vérifications.
- **Étendre le raccourci de mesure de troncature.** Le seuil de 48 caractères
  ne dispense de la mesure que les tweets courts. Une version exacte demanderait
  la largeur réelle de la colonne et une métrique de police — c'est-à-dire
  mesurer, ce qu'on cherche à éviter.

### À vérifier sur appareil (rien n'a pu être essayé dans cette session)

1. **L'éclat de réaction part-il complet ?** C'est le seul point où j'ai troqué
   du coût de montage contre une latence d'armement. Vérifier : un appui bref
   sur le cœur, un double-tap franc sur le corps du tweet, et un appui long
   Super Cœur (avec le drapeau activé). Le ressort de l'icône, lui, ne peut
   pas être en retard : il n'est pas conditionné.
2. **Le corps d'un tweet traduit** — c'est là que `TranslationReveal` n'est plus
   monté à vide, et son conteneur supprimé portait `overflow: 'hidden'`. Vérifier
   qu'un texte non traduit n'a pas bougé d'un pixel, et qu'une traduction qui
   arrive joue toujours sa révélation.
3. **La grille d'images** — bascule `expo-image`. Vérifier le recadrage (doit
   être identique), le fondu à la première apparition, l'absence de fondu au
   retour, et surtout qu'une cellule recyclée ne montre plus brièvement la photo
   de la ligne précédente (c'est le gain attendu de `recyclingKey`).
4. **Le bouton « Voir plus »** sur un tweet d'exactement 3–5 lignes, et sur un
   tweet court contenant un saut de ligne.
5. **Un tweet à contenu payant** — le comparateur regarde désormais
   `has_access` ; vérifier qu'un déverrouillage rafraîchit bien la ligne et
   n'en re-rend pas d'autres.

---

## Arbitrage de la session principale — `layout={ROW_LAYOUT}` : **gardé**

Seule question laissée ouverte entre les deux agents (§ 4.3). Décision : **on garde**.

- Le gain restant est marginal — c'est *une* `Animated.View` déjà existante par ligne, contre les
  ~45 supprimées par l'armement à la demande de l'éclat.
- Le coût du retrait est visible : le glissement de « Voir plus » deviendrait un saut, et **rien ne
  peut être vérifié sur appareil dans cette session**. La barre de qualité visuelle du projet ne
  tolère pas un mouvement dégradé livré à l'aveugle.
- `itemLayoutAnimation` n'était de toute façon pas l'alternative : la liste est un `FlatList` nu sur
  Android depuis le chantier SCROLL, et un `FlatList` nu ne l'accepte pas.

À rouvrir seulement avec un appareil sous les yeux, et à mesurer avant de trancher.

⚠️ À vérifier à cette occasion : `layout` sur une ligne + `removeClippedSubviews` sur Android est une
combinaison connue pour produire des scintillements. Elle **préexiste** à ce chantier (ce n'est pas
une régression), mais elle n'a jamais été observée sur appareil.
