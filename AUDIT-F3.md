# AUDIT F3 — FLUIDITÉ : listes

Section **EN COURS**. Les constats sont ajoutés un par un, chacun poussé dès
qu'il est vérifié. Ordre du fichier = ordre de gain décroissant.

**Rappel des valeurs par défaut de React Native** (`VirtualizedList`), qui
servent de référence à toute cette section — ce sont celles qui s'appliquent
dès qu'une liste ne règle rien :

| Prop | Défaut RN | Signification |
|---|---|---|
| `initialNumToRender` | `10` | éléments montés au premier rendu |
| `maxToRenderPerBatch` | `10` | éléments montés par lot pendant le défilement |
| `windowSize` | `21` | **en hauteurs d'écran** : 10 au-dessus + 1 visible + 10 en dessous |
| `updateCellsBatchingPeriod` | `50` ms | délai entre deux lots |
| `removeClippedSubviews` | `false` | les vues hors écran restent attachées |

Ce dépôt tourne sur React Native `0.81.5` / Expo `~54.0.10` (`package.json:43`,
`:73`).

---

## F3-1 — Fil vidéo : ~10 lecteurs vidéo instanciés d'un coup à l'ouverture de l'onglet — CRITIQUE

`src/screens/twitninfvideo.tsx:533-558`

Cette `FlatList` est un fil vidéo vertical plein écran, en pagination. Elle ne
règle **aucune** des cinq props de virtualisation — vérifié par recherche sur
tout le fichier : ni `initialNumToRender`, ni `windowSize`, ni
`maxToRenderPerBatch`, ni `removeClippedSubviews`, ni `getItemLayout`.

```tsx
<FlatList
  data={videos}
  keyExtractor={item => item.id}
  pagingEnabled
  snapToInterval={cardHeight}        // ← un élément = une hauteur d'écran
  snapToAlignment="start"
  decelerationRate="fast"
  …
  // aucune prop de virtualisation, aucun getItemLayout
/>
```

### Ce qui ne va pas

Les valeurs par défaut de React Native sont calibrées pour des lignes de liste
ordinaires — une trentaine par écran. Ici, **un élément occupe exactement une
hauteur d'écran**. Les défauts prennent alors un sens tout autre :

- `initialNumToRender: 10` → **10 cartes plein écran montées au premier
  rendu**, alors qu'une seule est visible ;
- `windowSize: 21` → jusqu'à ~21 cartes montées simultanément en défilement.

Et une carte n'est pas une vue légère. Vérifié en F2-8 : `VideoCard`
(`:105`) porte 9 `useState`, un `<LinearGradient>` plein écran, une `<Image>`
de miniature — et surtout un **`<Video>` expo-av monté en permanence** dès que
`videoUrl` existe (`:272`). Seul `shouldPlay={isActive}` distingue la carte
active des autres : les autres ne jouent pas, mais **elles existent**, avec
leur surface de décodage et leur session média native.

Autrement dit, à l'ouverture de l'onglet Vidéos, l'application demande au
système d'instancier une dizaine de lecteurs vidéo pour afficher une vidéo.

`removeClippedSubviews` restant à `false`, les cartes hors écran gardent en
plus leurs vues natives attachées à la hiérarchie.

### Effet concret pour l'utilisateur

Trois symptômes, tous cohérents avec ce réglage :

1. **L'onglet Vidéos est long à s'ouvrir**, et d'autant plus que la connexion
   est lente : dix lecteurs s'initialisent et commencent à réclamer leurs
   segments réseau en concurrence avec celui de la vidéo qu'on veut
   effectivement regarder. La première vidéo démarre donc *plus tard* à cause
   des neuf autres.
2. **La consommation de données explose.** Chaque lecteur monté met en tampon,
   même sans jouer. L'utilisateur paie du forfait mobile pour neuf vidéos qu'il
   ne verra peut-être jamais — c'est le reproche le plus concret qu'on puisse
   faire à un fil vidéo.
3. **Sur un appareil modeste, ça se dégrade franchement.** Le nombre de
   décodeurs matériels est limité (souvent 2 à 4 flux simultanés selon les
   puces). Au-delà, le système bascule sur du décodage logiciel ou refuse la
   session : la vidéo saccade, ou reste noire sur une miniature qui ne part
   jamais. C'est l'hypothèse la plus probable derrière un rapport du type
   « les vidéos ne se lancent pas sur mon téléphone » qui ne se reproduit pas
   sur un appareil récent.

### Correctif

Le dépôt a déjà un réglage maison, appliqué à ses quatre listes de contenu
(`TweetsScreen:2131-2135`, `ProfileScreen:537-540`,
`NotificationsScreen:522-526`, `UserProfileScreen:700-703`) :

```tsx
initialNumToRender={6}
maxToRenderPerBatch={5}
updateCellsBatchingPeriod={50}
windowSize={7}
removeClippedSubviews={Platform.OS === 'android'}
```

Il ne se recopie **pas tel quel** ici : ce réglage vise des lignes de fil, pas
des pages plein écran. Pour un fil vidéo paginé, viser le strict nécessaire —
la carte active et une voisine de chaque côté :

```tsx
initialNumToRender={2}
maxToRenderPerBatch={2}
windowSize={3}                       // 1 avant + 1 visible + 1 après
removeClippedSubviews={Platform.OS === 'android'}
getItemLayout={(_, i) => ({ length: cardHeight, offset: cardHeight * i, index: i })}
```

`getItemLayout` est ici **gratuit et exact** : toutes les cartes font
`cardHeight`, la valeur est déjà calculée et passée à `snapToInterval`
(`:539`). Il évite à la liste de mesurer les cellules à la volée et fiabilise
le calage de la pagination.

**Gain attendu : d'environ 10 lecteurs vidéo instanciés à l'ouverture à 2.**
C'est, à mon sens, le correctif au meilleur rapport gain/risque de tout
l'audit : cinq lignes de props, aucune logique touchée.

Le complément naturel — ne monter le `<Video>` que pour la carte active et ses
voisines immédiates, et afficher la miniature ailleurs — devient largement
superflu une fois `windowSize={3}` posé, puisque la fenêtre ne garde plus que
ces cartes-là. Autant commencer par les props.

### Réserve honnête

`windowSize={3}` réduit le préchargement : la vidéo suivante a moins d'avance
pour se mettre en tampon, et un glissé très rapide pourrait tomber sur une
carte non encore prête. C'est l'arbitrage à mesurer sur appareil. Si le
démarrage de la vidéo suivante paraît en retrait, `windowSize={5}` (2 de chaque
côté) reste très loin des 21 actuels. Je ne recommande pas de descendre
en dessous de 3.

*Ce constat porte sur le réglage de la liste. Le fait que toutes les cartes
montées se re-rendent à chaque glissé est un défaut distinct et cumulatif,
traité en F2-8 — les deux se corrigent indépendamment et se complètent.*

---

## F3-2 — Conversation : tout l'historique est chargé d'un coup, puis parcouru en défilement animé jusqu'en bas — CRITIQUE

`src/screens/ConversationThreadScreen.tsx:729-732`, `:759`, `:1281-1283`,
`:1601-1613`

Trois choix qui, pris séparément, seraient discutables, et qui combinés
produisent l'un des pires chemins d'ouverture d'écran de l'application.

**1. Aucune pagination.** La requête ne porte ni `limit`, ni `before`, ni
`page` — vérifié, c'est l'URL nue :

```tsx
const res = await apiService.get(`/api/messages/conversations/${conversationId}/messages`);
const list = res?.success ? res.messages || [] : [];
…
setMessages(dedupeMessagesById(normalizedList));          // :729-732
```

Il n'y a pas non plus d'`onEndReached` sur la liste — recherche faite sur tout
le fichier, aucune occurrence. **L'intégralité de l'historique** d'une
conversation est donc téléchargée, normalisée, dédupliquée et placée en état à
chaque ouverture.

**2. La liste n'est pas `inverted`.** Aucune occurrence non plus. L'élément
d'index 0 est donc le message le **plus ancien**, et le message le plus récent
— le seul qu'on veut voir — se trouve tout en bas.

**3. On rattrape le 2 par un défilement animé.** Deux fois :

```tsx
const timer = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);  // :759

const isAtBottomRef = useRef(true);                                    // :1272 — vrai au montage
const handleContentSizeChange = useCallback(() => {
  if (!isAtBottomRef.current) return;
  flatListRef.current?.scrollToEnd({ animated: true });                // :1283
}, []);
```

### Ce qui ne va pas

La liste tourne sur les défauts RN (`initialNumToRender: 10`) : à l'ouverture,
seuls ~10 messages sont montés — **les 10 plus anciens**. La hauteur de contenu
mesurée par la liste ne correspond donc qu'à ces 10 messages, très loin de la
hauteur réelle de l'historique. Et il n'y a pas de `getItemLayout` — impossible
d'en poser un ici, les bulles ont une hauteur variable, c'est légitime.

`scrollToEnd` vise alors la fin du contenu **tel que mesuré à cet instant**,
c'est-à-dire pas la vraie fin. Le défilement déclenche le rendu du lot suivant,
la hauteur de contenu augmente, `onContentSizeChange` se déclenche,
`isAtBottomRef` est encore vrai, donc `scrollToEnd` repart — et ainsi de suite,
lot par lot, jusqu'au bas réel. L'écran **parcourt l'historique** au lieu de
s'ouvrir dessus.

À quoi s'ajoute F2-4 : chacun de ces rendus de lot re-rend toutes les bulles
déjà montées, puisque `renderItem` dépend de `messages`.

### Effet concret pour l'utilisateur

Ouvrir une conversation ancienne — une conversation *importante*, donc, celles
qu'on rouvre le plus :

- **l'attente réseau est proportionnelle à l'historique complet**, pas aux
  quelques messages qu'on vient lire ; sur une conversation de plusieurs
  milliers de messages, c'est une réponse volumineuse à télécharger, parser et
  normaliser avant le moindre affichage ;
- **puis l'écran défile visiblement à travers l'historique** avant de se poser
  en bas, par à-coups successifs, au lieu d'apparaître directement sur le
  dernier message ;
- **la position finale est incertaine** : si un lot arrive en retard, le
  défilement se relance après que l'utilisateur a commencé à lire, et lui
  arrache l'écran des mains.

C'est le comportement typique décrit comme « la messagerie met du temps à
s'ouvrir et ça saute ». Il empire à mesure que la conversation compte — c'est
exactement l'inverse de ce qu'on veut : plus une conversation est nourrie, plus
elle doit être agréable à rouvrir.

### Correctif

**Le geste central : passer la liste en `inverted` et paginer.** Les deux vont
ensemble et se renforcent.

```tsx
<FlatList
  inverted                                    // le plus récent à l'offset 0
  data={messagesDesc}                         // tri décroissant (plus récent d'abord)
  onEndReached={loadOlderMessages}            // « fin » = les plus anciens
  onEndReachedThreshold={0.5}
  initialNumToRender={15}
  maxToRenderPerBatch={10}
  updateCellsBatchingPeriod={50}
  windowSize={11}
  removeClippedSubviews={Platform.OS === 'android'}
  …
/>
```

Ce que ça change :

- **Plus aucun `scrollToEnd`.** Avec `inverted`, le dernier message est déjà en
  haut de la pile de rendu, à l'offset 0 : l'écran s'ouvre dessus
  immédiatement. Les deux appels (`:759` et `:1283`) et la ref
  `isAtBottomRef` disparaissent, ainsi que toute la cascade décrite plus haut.
  Un nouveau message arrivant s'insère à l'offset 0 sans qu'on ait à défiler.
- **Le chargement initial devient constant** — une vingtaine de messages —
  quelle que soit la taille de l'historique. Les plus anciens arrivent par
  `onEndReached` quand on remonte, ce qui est le geste naturel.
- `windowSize={11}` est plus généreux que le 7 maison : une bulle est bien plus
  courte qu'une ligne de fil, et remonter dans une conversation est un geste
  rapide.

**Ce correctif suppose que l'API accepte une pagination** sur
`/api/messages/conversations/:id/messages` (`before`/`limit` ou équivalent). Je
n'ai pas pu le vérifier : le serveur n'est pas dans ce dépôt, et `API_SPEC.md`
ne documente pas cette route. **C'est le point à confirmer en premier** — si la
route ne pagine pas côté serveur, c'est là que le travail commence, et le
constat devient un sujet serveur avant d'être un sujet mobile.

*Repli si la pagination serveur n'existe pas encore* : passer `inverted` seul.
Ça supprime déjà toute la cascade de défilement et l'ouverture sur le bon
message — c'est-à-dire le symptôme le plus visible — sans rien attendre du
serveur. La lourdeur du chargement complet resterait, mais elle est
silencieuse ; la cascade, elle, se voit.

### Réserve honnête

Le mécanisme de cascade (`scrollToEnd` sur une hauteur de contenu sous-estimée,
qui se relance à chaque lot) est déduit du code et du fonctionnement documenté
de `VirtualizedList`, **pas mesuré sur appareil**. Les trois faits qui le
fondent sont, eux, vérifiés directement dans le fichier : absence de
pagination et d'`onEndReached`, absence d'`inverted`, et les deux `scrollToEnd`
avec `isAtBottomRef` initialisé à `true`. Un enregistrement d'écran à
l'ouverture d'une longue conversation tranchera en quelques secondes.

*Constat voisin, hors F3* : `loadMessages` récupère **toute la liste des
conversations** (`:725`, `/api/messages/conversations`) uniquement pour y
retrouver les participants de celle qu'on ouvre, et le fait **avant** de
demander les messages, en série. Deux allers-retours réseau séquentiels avant
le premier message affiché. Renvoyé à R2.

---

## Vérifié et trouvé SAIN — `ImageViewerPaper`

`src/components/feed/paper2b/ImageViewerPaper.tsx:322-342`

La visionneuse plein écran ne règle ni `windowSize`, ni `initialNumToRender`,
ni `removeClippedSubviews`, et ses pages font une largeur d'écran — le profil
exact de F3-1. **Ce n'en est pourtant pas un**, et il vaut la peine de dire
pourquoi plutôt que de le laisser dans la liste des listes non réglées :

une galerie de tweet est plafonnée à **4 images** (`MAX_TWEET_IMAGES = 4`,
`CreateTweetScreen.tsx:62`). Avec au plus 4 éléments, `initialNumToRender: 10`
et `windowSize: 21` n'ont aucun effet observable : la liste monte les 4 pages
dans tous les cas. Régler la fenêtre ici ne changerait rien, et monter les 4
pages est même souhaitable pour que le glissé d'une photo à l'autre soit
instantané.

Le fichier fait par ailleurs deux choses justes :
- `getItemLayout` est fourni (`:331`) et exact — toutes les pages font `width` ;
- `initialScrollIndex` (`:330`) ouvre directement sur l'image touchée, sans
  défilement de rattrapage. C'est précisément ce qui manque à
  `ConversationThreadScreen` en F3-2.

---

## F3-3 — Recensement complet : 15 listes sur 20 tournent sur les défauts RN — MAJEUR (cumulé)

Recensement exhaustif des composants de liste virtualisée du dépôt
(`<FlatList>`, `<Animated.FlatList>`, `<SectionList>`, `<VirtualizedList>`,
`<FlashList>`) et de leur réglage de virtualisation.

**5 listes sur 20 sont réglées. 15 ne le sont pas.**

### Les 5 réglées — le réglage maison

| Fichier | `initialNumToRender` | `maxToRenderPerBatch` | `windowSize` | `removeClippedSubviews` |
|---|---|---|---|---|
| `TweetsScreen.tsx:2131` | 6 | 5 | 7 | `Platform.OS === 'android'` |
| `FeedGutterScreen.tsx:2276` | 6 | 5 | 7 | `Platform.OS === 'android'` |
| `ProfileScreen.tsx:537` | 6 | 5 | 7 | `false` (justifié en commentaire, `:521`) |
| `UserProfileScreen.tsx:700` | 6 | 5 | 7 | `false` |
| `NotificationsScreen.tsx:522` | 8 | 6 | 7 | `Platform.OS === 'android'` |

Toutes portent aussi `updateCellsBatchingPeriod={50}`. Le réglage est cohérent,
délibéré, et `ProfileScreen:521` explique même pourquoi il y déroge sur
`removeClippedSubviews`. **Il y a donc bien une norme maison** — c'est encore
une fois le constat de F2 : elle existe, elle est bonne, elle n'a jamais quitté
le fil d'accueil et les profils.

### Les 15 non réglées

Classées par ce qui détermine réellement le coût : la **taille maximale que
peut atteindre la liste**.

| Fichier | Plafond de la liste | Verdict |
|---|---|---|
| `twitninfvideo.tsx` | illimitée, éléments plein écran | **F3-1, CRITIQUE** |
| `ConversationThreadScreen.tsx` | **aucune pagination** — historique entier | **F3-2, CRITIQUE** |
| `MessagesScreen.tsx` | **aucune pagination** (`:109`, `/api/messages/conversations` nue) | **MAJEUR** |
| `CommentSheet.tsx` | `limit: 100` commentaires, **réponses imbriquées incluses** (`:397`) | **MAJEUR** |
| `UserConnectionsScreen.tsx` | infinie par pages de 30 (`PAGE_SIZE`, `:33`, `:48`) | **MODÉRÉ** |
| `LiveViewerScreen.tsx` | croît avec la durée du live | MODÉRÉ |
| `GoLiveScreen.tsx` | croît avec la durée du live | MODÉRÉ |
| `LivesScreen.tsx` | nombre de lives en cours | mineur |
| `MyPassesScreen.tsx` | passes de l'utilisateur | mineur |
| `FollowRequestsScreen.tsx` | demandes en attente | mineur |
| `CommunityCurrenciesScreen.tsx` | monnaies existantes | mineur |
| `EconomyManagementScreen.tsx` | écran admin | mineur |
| `CreateAdvertisementScreen.tsx` | formulaire | mineur |
| `SendCoinsModal.tsx` | contacts | mineur |
| `ImageViewerPaper.tsx` | **4 max** (`MAX_TWEET_IMAGES`) | **sain, voir plus bas** |

### Les quatre qui méritent d'être traités

**`MessagesScreen` — la liste des conversations, sans plafond.**
`apiService.get('/api/messages/conversations')` (`:109`) est appelée sans
`limit` ni `offset`, exactement comme dans `ConversationThreadScreen` (F3-2).
Un compte actif depuis longtemps télécharge donc **toutes** ses conversations à
chaque ouverture de l'onglet Messages, et les monte dans une liste non réglée.
C'est un écran d'onglet, ouvert plusieurs fois par session.
→ `initialNumToRender={8} maxToRenderPerBatch={6} windowSize={7}
removeClippedSubviews={Platform.OS === 'android'}` (le réglage de
`NotificationsScreen`, dont les lignes ont exactement le même gabarit :
avatar + deux lignes de texte), **et** une pagination côté API.

**`CommentSheet` — 100 commentaires plus leurs réponses.**
`getTweetReplies(tweetId, { nested: true, limit: 100 })` (`:397`) : jusqu'à 100
commentaires, chacun portant son tableau de réponses imbriquées. Sur les
défauts RN, la fenêtre en garde une bonne part montée, et chaque `CommentRow`
déplié rend en plus sa boucle `comment.replies.map(...)`.
**C'est le multiplicateur de F2-1** : là où F2-1 explique que chaque frappe
re-rend toutes les lignes montées, c'est ce réglage qui décide combien il y en
a. Les deux se corrigent séparément, mais le gain de l'un dépend de l'autre.
→ `initialNumToRender={8} maxToRenderPerBatch={6} windowSize={7}`, et
pagination par pages de 20 plutôt qu'un bloc de 100.

**`LiveViewerScreen` et `GoLiveScreen` — les chats de live.**
Leur liste n'a pas de plafond : elle grandit tant que le live dure. Sur un
direct d'une heure, le tableau `messages` atteint facilement plusieurs
centaines d'entrées, toutes conservées. Aucune des deux listes ne règle quoi
que ce soit, et aucune ne purge les anciens messages.
→ En plus du réglage de fenêtre, **borner le tableau lui-même** :
`setMessages((prev) => [...prev, msg].slice(-200))`. Un chat de live n'a aucune
raison de garder l'intégralité de l'historique en mémoire — personne ne remonte
une heure en arrière dans un chat de direct.

Les huit dernières lignes du tableau (mineur) sont des listes courtes sur des
écrans peu visités : leur régler la fenêtre est correct mais sans gain
mesurable. **À ne pas traiter en priorité.**

### Recommandation

Plutôt que de recopier cinq props dans quinze fichiers — c'est précisément
ainsi qu'on se retrouve avec cinq listes réglées sur vingt —, exporter le
réglage en constante partagée :

```ts
// src/theme/listTuning.ts  (ou src/utils/)
export const LIST_TUNING = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 6,
  updateCellsBatchingPeriod: 50,
  windowSize: 7,
  removeClippedSubviews: Platform.OS === 'android',
} as const;

// usage :  <FlatList {...LIST_TUNING} … />
```

Les deux cas plein écran (`twitninfvideo`, F3-1) et les chats de live gardent
leurs valeurs propres — un objet partagé n'a de sens que pour les listes au
gabarit ordinaire, qui sont l'écrasante majorité.

### Réserve honnête

Les défauts RN ne sont pas mauvais en soi : pour une liste de 20 éléments
courts, ils ne coûtent rien de perceptible, et régler la fenêtre n'apporterait
rien. **Ce constat ne dit pas « 15 listes sont mal réglées »** — il dit que 15
listes n'ont jamais fait l'objet d'une décision, et que parmi elles quatre
portent des listes qui peuvent grandir sans limite. C'est sur ces quatre-là que
porte la recommandation ; les onze autres sont listées pour que le recensement
soit vérifiable, pas pour être corrigées.

*Erreur de méthode signalée pour mémoire* : mon premier recensement cherchait
`<FlatList` et a manqué `FeedGutterScreen`, qui écrit `<Animated.FlatList` — il
est correctement réglé. Le tableau ci-dessus est issu d'une recherche corrigée
couvrant les variantes `Animated.*`, `SectionList`, `VirtualizedList` et
`FlashList`.

---

## F3-4 — Les deux vraies listes rendues dans un `ScrollView` — MAJEUR

Un `ScrollView` monte **tous** ses enfants et n'en démonte **aucun**. Employé
là où il faudrait une liste virtualisée, il transforme « afficher N éléments »
en « construire N éléments avant le premier pixel, et les garder pour toujours ».

Recensement fait sur tout `src/` : les fichiers qui contiennent un
`ScrollView` **sans** aucune liste virtualisée, triés par nombre de `.map()`.
Sur les vingt premiers candidats, **deux seulement** rendent une véritable
liste de données. Les autres sont écartés plus bas, et c'est important : le
motif `.map()` dans un `ScrollView` est parfaitement légitime pour une
énumération figée.

### `SearchScreen` — jusqu'à 40 résultats, aucun démontage

`src/screens/SearchScreen.tsx:979`, `:1033`, `:1043`

```tsx
<ScrollView …>                                    // :979
  {searchResults.users.map(renderUserItem)}       // :1033 — jusqu'à 20
  {searchResults.tweets.map(renderTweetItem)}     // :1043 — jusqu'à 20
</ScrollView>
```

Le filtre « tout » demande `limit: 20` par type (`:333`, `:343`, `:353`), soit
**jusqu'à 40 lignes montées simultanément**, chacune avec son `Avatar`, son
`PremiumDisplayName` et son badge de certification — et pour les tweets, tout
le contenu de la carte.

**Effet concret** : le résultat d'une recherche met d'autant plus de temps à
s'afficher que la recherche a bien marché. Les 40 lignes sont construites avant
que la première n'apparaisse ; il n'y a pas d'affichage progressif, juste un
temps mort puis tout d'un coup. Et rien n'est jamais libéré tant qu'on reste
sur l'écran.

**Correctif** : une `FlatList` avec deux sections (ou une `SectionList`, qui
correspond exactement à la forme « utilisateurs » puis « tweets »), plus le
réglage maison :

```tsx
<SectionList
  sections={[
    { title: 'Comptes', data: searchResults.users },
    { title: 'Tweets',  data: searchResults.tweets },
  ]}
  initialNumToRender={8}
  maxToRenderPerBatch={6}
  updateCellsBatchingPeriod={50}
  windowSize={7}
  removeClippedSubviews={Platform.OS === 'android'}
  …
/>
```

C'est un remaniement de la structure de rendu de l'écran, pas un ajout de
props. **Cumulatif avec F2-6** (chaque frappe re-rend ces 40 lignes) : la
virtualisation réduit le nombre de lignes montées, l'isolation du champ de
saisie supprime le déclencheur. Les deux ensemble, l'écran devient normal ;
l'un sans l'autre, il reste à moitié lourd. Si l'on ne doit en faire qu'un,
**faire d'abord F2-6**, qui est local et sans risque.

### `StoriesTray` — la barre de stories, en haut du fil d'accueil

`src/components/StoriesTray.tsx:216-278`

```tsx
<ScrollView horizontal …>          // :216-217
  …
  {feed.groups.map((group, index) => (      // :260
    <TouchableOpacity …>
      <StoryRing size={AVATAR_SIZE} uri={…} hasStory seen={!group.has_unseen} … />
      <Text …>{group.user?.username}</Text>
    </TouchableOpacity>
  ))}
</ScrollView>
```

`storiesService.getFeed()` appelle `/api/stories/feed` **sans aucun `limit`**
(`src/services/storiesService.ts:99-107`) : le nombre de groupes est celui que
renvoie le serveur, sans plafond côté client. Chaque groupe monte un
`StoryRing` — un avatar avec son anneau — et tous restent montés, y compris
ceux qui sont hors de l'écran à droite.

**Ce qui rend ce cas plus sérieux qu'il n'en a l'air** : ce composant est en
tête du **fil d'accueil**, l'écran le plus ouvert de l'application. Son coût
est payé à chaque ouverture de l'onglet, avant le premier tweet, et par tout le
monde. Un compte qui suit beaucoup de gens actifs — c'est-à-dire précisément un
utilisateur engagé — a le plus d'anneaux à monter, donc l'ouverture la plus
lente. C'est le mauvais sens.

**Correctif** : `FlatList horizontal`. C'est un remplacement direct, la barre
n'a pas d'autre enfant que la liste des groupes et le bouton « Ajouter » (qui
devient `ListHeaderComponent`) :

```tsx
<FlatList
  horizontal
  data={feed.groups}
  ListHeaderComponent={AddStoryButton}
  keyExtractor={(g, i) => String(g.user?.id ?? `group-${i}`)}
  renderItem={renderStoryGroup}          // en useCallback
  showsHorizontalScrollIndicator={false}
  initialNumToRender={6}
  maxToRenderPerBatch={6}
  windowSize={5}
  removeClippedSubviews={Platform.OS === 'android'}
  getItemLayout={(_, i) => ({ length: ITEM_W, offset: ITEM_W * i, index: i })}
/>
```

`getItemLayout` est exact ici : tous les éléments ont la même largeur
(`styles.item` + `AVATAR_SIZE` constants).

**Réserve honnête** : je n'ai pas de mesure du nombre réel de groupes en
production. Si l'API en renvoie systématiquement une dizaine, le gain est
faible et ce constat est surdimensionné. Ce qui est certain et vérifiable,
c'est qu'**aucune limite n'est posée** ni par le client ni dans l'appel : le
coût n'est donc pas borné par construction. C'est ce qui justifie de le
corriger même si la valeur courante est confortable.

### Écartés après vérification — le motif est légitime

Les autres gros consommateurs de `.map()` dans un `ScrollView` ont été
examinés et **ne sont pas des listes de données** : ce sont des énumérations
figées, dont le nombre d'éléments est écrit dans le code.

| Fichier | Ce que `.map()` rend réellement | Verdict |
|---|---|---|
| `UserStatsTab.tsx` (26 `.map`) | graduations de graphique, libellés d'axe, cartes de métriques, options de période | énumérations fixes — **sain** |
| `CasinoScreen.tsx` (17) | segments de la roue, pièces de confetti, rangées de jeu | listes constantes — **sain** |
| `ProfileCustomizationScreen.tsx` (11) | `FAMILIES`, `ACCENT_PRESETS`, `PROFILE_THEMES`, `THEME_INTENSITIES`, `PROFILE_EFFECTS` | constantes de module — **sain** |
| `TweetDetailScreen.tsx` (7) | `replies.map()` — mais plafonné à `limit: 20` (`:504`) et `ReplyItem` est un `React.memo` (`:236`) | **sain** pour F3 |
| `NewConversationScreen`, `GroupMembersScreen` | listes d'utilisateurs bornées à 30-35 par l'appel API | **sain** |

Virtualiser une énumération de huit préréglages de couleur serait une
complication pure. **Le motif `.map()` dans un `ScrollView` n'est pas un défaut
en soi** ; il ne le devient que lorsque le nombre d'éléments dépend de données
serveur non bornées. C'est le cas pour les deux constats ci-dessus, et pour eux
seuls.

`CasinoScreen.tsx:212` (`CONFETTI.map`) est en revanche à regarder en **F4** :
un ensemble de pièces animées simultanément relève des animations, pas des
listes.

---

# F3 — SYNTHÈSE DE SECTION

## Les constats, par gain décroissant

| # | Où | Défaut | Gravité |
|---|---|---|---|
| F3-1 | `twitninfvideo.tsx:533` | aucune prop de virtualisation sur un fil plein écran → ~10 lecteurs vidéo instanciés à l'ouverture | **CRITIQUE** |
| F3-2 | `ConversationThreadScreen.tsx` | historique entier sans pagination, liste non `inverted`, cascade de `scrollToEnd` | **CRITIQUE** |
| F3-4 | `SearchScreen.tsx:979` | jusqu'à 40 résultats montés dans un `ScrollView` | **MAJEUR** |
| F3-4 | `StoriesTray.tsx:216` | tous les anneaux de story montés dans un `ScrollView`, en tête du fil d'accueil | **MAJEUR** |
| F3-3 | `MessagesScreen.tsx:109` | conversations sans pagination, liste non réglée | **MAJEUR** |
| F3-3 | `CommentSheet.tsx:397` | 100 commentaires + réponses imbriquées, liste non réglée | **MAJEUR** |
| F3-3 | `LiveViewerScreen`, `GoLiveScreen` | chat de live sans plafond ni purge | MODÉRÉ |
| F3-3 | `UserConnectionsScreen.tsx` | pagination infinie par 30, liste non réglée | MODÉRÉ |
| F3-3 | 8 écrans secondaires | listes courtes non réglées | mineur |

## Ce qu'il faut en retenir

**Le même diagnostic qu'en F2, sur un autre plan.** Il existe une norme maison
de virtualisation — `initialNumToRender 6-8 / maxToRenderPerBatch 5-6 /
updateCellsBatchingPeriod 50 / windowSize 7 / removeClippedSubviews` par
plateforme — appliquée avec discernement à **5 listes sur 20**, et jamais
propagée. Ce sont les cinq listes de tweets. Les quinze autres, dont les quatre
qui peuvent grandir sans limite, n'ont jamais fait l'objet d'une décision.

**Trois écrans concentrent l'essentiel du gain** : le fil vidéo (F3-1), la
conversation (F3-2) et la recherche (F3-4). Les deux premiers sont
**critiques** et se corrigent sans toucher à la logique métier — le premier ne
demande littéralement que cinq props.

**Un fil rouge, plus important que les réglages** : quatre listes chargent des
données **sans aucune pagination** — messages d'une conversation, liste des
conversations, commentaires (plafond brut de 100), stories. Aucune prop de
virtualisation ne compense un chargement non borné : la liste se protège du
rendu, pas du réseau ni de la mémoire. **Le vrai sujet est côté API**, et il
déborde de F3 vers R2.

## Ce que j'ai vérifié et trouvé SAIN

- **L'unicité des clés dans les deux fils est traitée, et remarquablement.**
  `TweetsScreen:1636-1642` et `FeedGutterScreen:1744` : les entrées
  publicitaires réutilisent le **vrai id** du tweet promu et échappent
  volontairement à la déduplication (une même campagne peut légitimement
  occuper plusieurs emplacements). Le `keyExtractor` en tient compte et renvoie
  `ad-${ad_data.id}-${index}` pour les publicités, `String(item.id)` sinon —
  avec un commentaire (`:1633-1635`) qui explique que sans cela « deux entrées
  avec la même clé React font disparaître silencieusement l'une des deux ».
  C'est exactement le défaut « clés non uniques » que cette section devait
  chercher : il a été rencontré, compris et réglé. **Rien à signaler.**
- `mergeUniqueTweets` (`FeedGutterScreen:202`, `TweetsScreen`) documente sur
  trente lignes pourquoi la déduplication se fait par id de tweet en épargnant
  les publicités, et quelle version antérieure du correctif était fausse. C'est
  le genre de commentaire qui évite une régression deux ans plus tard.
- **`ImageViewerPaper`** : `getItemLayout` exact, `initialScrollIndex` pour
  ouvrir directement sur la bonne image, galerie plafonnée à 4 (`MAX_TWEET_IMAGES`).
  Les défauts RN n'y ont aucun effet. Sain — détail plus haut.
- **`StoriesTray` est mémoïsé en `ListHeaderComponent`**
  (`TweetsScreen:1645-1652`), après avoir été écrit en JSX inline dans la prop —
  le commentaire précise qu'il était « reconstruit à chaque like, chaque page
  chargée, chaque changement d'état sans rapport ». Le défaut de re-rendu est
  donc réglé ; le constat F3-4 qui le concerne porte sur autre chose (tous ses
  enfants sont montés d'un coup), et les deux sont indépendants.
- **`TweetDetailScreen`** : `replies.map()` dans un `ScrollView`, mais plafonné
  à 20 par l'appel API et `ReplyItem` correctement mémoïsé. Sain pour F3.
- **Le motif `.map()` dans un `ScrollView` est majoritairement légitime dans ce
  dépôt** : sur les six plus gros consommateurs, quatre ne rendent que des
  énumérations figées (préréglages, graduations, segments de roue). Détail et
  tableau en F3-4.

## Limites de cette section

- Aucune mesure sur appareil. Les nombres cités (« ~10 lecteurs vidéo »,
  « 40 résultats ») sont déduits des valeurs par défaut documentées de
  `VirtualizedList` et des `limit` lus dans les appels API, pas chronométrés.
- La cascade de `scrollToEnd` décrite en F3-2 est un raisonnement sur le
  fonctionnement de `VirtualizedList`, pas une observation. Les trois faits qui
  la fondent sont, eux, vérifiés dans le fichier.
- Le nombre réel de groupes renvoyés par `/api/stories/feed` est inconnu : si
  l'API en renvoie peu, F3-4 est surdimensionné sur ce point. Ce qui est
  certain, c'est qu'aucune limite n'est posée.
- `getItemLayout` n'a pas été recensé systématiquement sur les listes à hauteur
  fixe. Il est signalé là où il manque et serait exact (F3-1, F3-4/`StoriesTray`) ;
  ailleurs, les hauteurs sont variables et il n'est pas applicable.
