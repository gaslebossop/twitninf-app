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
