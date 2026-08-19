# AUDIT F2 — FLUIDITÉ : rendus inutiles

Section **EN COURS**. Les constats sont ajoutés un par un, chacun poussé dès
qu'il est vérifié. Ordre du fichier = ordre de gain décroissant ; il est
réordonné à chaque ajout.

---

## F2-1 — `CommentSheet` : chaque frappe re-rend tous les commentaires et remonte tous les séparateurs — CRITIQUE

`src/components/CommentSheet.tsx:669-693`

```tsx
const [inputText, setInputText] = useState('');   // ligne 325 — MÊME composant

<FlatList
  data={comments}
  keyExtractor={item => item.id}                              // ← recréé à chaque rendu
  renderItem={({ item }) => (                                 // ← recréé à chaque rendu
    <CommentRow
      comment={item}
      onLike={() => handleLikeComment(item.id)}               // ← 4 closures neuves
      onReplyLike={(replyId) => handleLikeReply(item.id, replyId)}
      onReplyPress={(username) => handleReplyPress(username, item.id)}
      onToggleReplies={() => handleToggleReplies(item.id)}
    />
  )}
  ItemSeparatorComponent={() => <View style={sheetStyles.separator} />}   // ← type neuf
  ListEmptyComponent={() => ( ... )}                                      // ← type neuf
/>
```

`CommentRow` (`src/components/CommentSheet.tsx:199`) est une fonction fléchée
nue : **aucun `React.memo`**, contrairement à `TweetRow` et `TweetRowGutter`
qui, eux, ont un comparateur soigné.

### Ce qui ne va pas — quatre défauts cumulés sur la même liste

1. **`renderItem` est une fonction anonyme recréée à chaque rendu.** Le
   `CellRenderer` interne de `VirtualizedList` est une `PureComponent` : quand
   `renderItem` change d'identité, **toutes** les cellules montées se
   re-rendent. C'est le mécanisme que `TweetsScreen.tsx:1553` et
   `ConversationThreadScreen.tsx:1291` neutralisent explicitement avec un
   `useCallback` — le commentaire de ce dernier le dit mot pour mot :
   « une closure recréée à chaque rendu invalide la mémoïsation interne de la
   FlatList, si bien que toutes les bulles montées se re-rendaient à chaque
   frappe dans le compositeur ». Ici la leçon n'a pas été appliquée.

2. **Quatre closures neuves par ligne et par rendu** (`onLike`, `onReplyLike`,
   `onReplyPress`, `onToggleReplies`). Même si l'on ajoutait `React.memo` à
   `CommentRow`, ces props le rendraient **totalement inopérant** : les quatre
   références diffèrent systématiquement. C'est précisément pour éviter ça que
   `TweetRow` n'expose **qu'un seul** handler, documenté
   `src/components/feed/TweetRow.tsx:76` : « Handler unique et stable : évite N
   closures par ligne et par rendu ».

3. **`ItemSeparatorComponent` et `ListEmptyComponent` sont des fonctions
   fléchées inline — c'est le plus coûteux des quatre.** React compare les
   **types** de composants par identité. Une flèche anonyme donne un type
   différent à chaque rendu, donc React ne fait pas une mise à jour : il
   **démonte puis remonte** chaque séparateur. Sur une liste de 15
   commentaires visibles, c'est 15 démontages + 15 montages de vue native par
   frappe, au lieu de zéro.

4. **`inputText` vit dans le même composant que la liste**
   (`CommentSheet.tsx:325`). C'est le déclencheur : chaque caractère tapé
   provoque un rendu de `CommentSheet`, qui déclenche les trois points
   ci-dessus.

### Effet concret pour l'utilisateur

Écrire un commentaire est saccadé, et de plus en plus à mesure que le fil de
commentaires est long. Concrètement, à chaque caractère tapé :

- ~15 `CommentRow` montés se re-rendent intégralement — avec, pour chacun, son
  `MiniAvatar`, son `useAnimatedStyle` de cœur, et la boucle
  `comment.replies.map(...)` si les réponses sont dépliées
  (`CommentSheet.tsx:274`) ;
- ~15 séparateurs sont démontés et remontés côté natif ;
- le curseur retarde sur la frappe, et les caractères arrivent par paquets.

Le même chemin est emprunté à chaque `setState` de la feuille : envoi d'un
commentaire, dépliage des réponses, like. La liste des commentaires est ouverte
depuis le fil, l'écran le plus fréquenté de l'application.

### Correctif

Quatre gestes, dans cet ordre de gain :

1. Sortir les deux composants inline **hors** du corps du composant, au niveau
   du module :
   ```tsx
   const Separator = () => <View style={sheetStyles.separator} />;
   const EmptyComments = () => ( ... );
   // puis : ItemSeparatorComponent={Separator}  ListEmptyComponent={EmptyComments}
   ```
   Gain immédiat, sans rien changer d'autre : plus aucun démontage/remontage.

2. Passer à un **handler unique et stable**, sur le modèle de `TweetRow` :
   `onAction={handleCommentAction}` avec un `useCallback` dont les
   dépendances passent par une `ref` (comme `tweetsRef` en
   `TweetsScreen.tsx:1223`), et une action discriminée
   `{ type: 'like' | 'replyLike' | 'reply' | 'toggleReplies', commentId, ... }`.

3. `renderItem` et `keyExtractor` en `useCallback`.

4. `export default memo(CommentRow, areEqual)` avec un comparateur sur
   `comment.id`, `comment.likes`, `comment.is_liked`,
   `comment.repliesExpanded`, `comment.replies.length` et `onAction` — c'est
   exactement la forme de `TweetRow.tsx:748-770`.

Les points 1 et 3 sont mécaniques et sans risque. Le point 2 conditionne
l'efficacité du point 4 : appliquer 4 sans 2 ne changerait rien.

*Variante moins invasive si l'on ne veut pas refondre les handlers* : déplacer
l'état `inputText` dans un sous-composant `CommentComposer` dédié. La frappe
cesse alors de re-rendre `CommentSheet`, ce qui supprime le déclencheur
principal sans toucher aux props des lignes. Les rendus provoqués par un like
ou un dépliage resteraient, eux, non optimisés.

---

## F2-2 — Chat du live : chaque message reçu re-rend tout le chat — MAJEUR

`src/screens/LiveViewerScreen.tsx:396-401` et `:100-134`

```tsx
function ChatRow({ item }: { item: ChatMessage }) {   // ligne 101 — PAS de React.memo
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;
  useEffect(() => { Animated.parallel([...]).start(); }, []);
  return (
    <Animated.View style={[styles.chatRow, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Avatar size={26} ... />
      ...
      <VerifiedBadge verificationStyle={item.verification_style || 'default'} size={12} animated />
    </Animated.View>
  );
}

<FlatList
  data={messages}
  keyExtractor={item => item.id}                        // ← recréé à chaque rendu
  renderItem={({ item }) => <ChatRow item={item} />}    // ← recréé à chaque rendu
  inverted
/>
```

### Ce qui ne va pas

`ChatRow` n'est pas mémoïsé **et** `renderItem` est une flèche anonyme. Les
deux défauts se renforcent : même en ajoutant `React.memo` à `ChatRow`, il
recevrait un élément neuf à chaque rendu de l'écran, et même avec un
`renderItem` stable, `ChatRow` sans mémo se re-rendrait quand même. Il faut
les deux corrections, pas une.

Le déclencheur est ici bien plus fréquent qu'un `setState` d'interface : c'est
**l'arrivée d'un message**. Sur un live actif, plusieurs messages par seconde.
Chaque `setMessages` re-rend `LiveViewerScreen`, donne une identité neuve à
`renderItem`, et le `CellRenderer` (`PureComponent`) de `VirtualizedList`
propage le re-rendu à **toutes** les lignes montées.

Chaque re-rendu de ligne reconstruit un `Avatar`, un `<Text>` de pseudo, un
`<Text>` de message et un `VerifiedBadge`. Ce dernier est bien mémoïsé
(`src/components/VerifiedBadge.tsx:721`), mais il reçoit des props primitives
égales, donc il est correctement épargné — c'est le seul frein en place.

### Effet concret pour l'utilisateur

Pendant un live animé, le chat saccade au moment précis où il devrait défiler
le plus finement : à chaque message, ~10 à 15 lignes montées repassent par le
rendu React et la réconciliation, en concurrence directe avec la lecture du
flux vidéo et avec l'animation d'entrée du nouveau message
(`LiveViewerScreen.tsx:105-110`). Plus le chat est vivant, plus il rame — le
comportement exactement inverse de celui attendu.

S'y ajoute la pression sur le ramasse-miettes : une nouvelle closure
`renderItem`, une nouvelle closure `keyExtractor` et N éléments React par
message reçu.

### Correctif

```tsx
const ChatRow = React.memo(function ChatRow({ item }: { item: ChatMessage }) { ... });

// dans le composant :
const renderChatRow = useCallback(({ item }: { item: ChatMessage }) => <ChatRow item={item} />, []);
const chatKeyExtractor = useCallback((item: ChatMessage) => item.id, []);
```

Aucune dépendance : `ChatRow` ne lit rien d'autre que `item`. Après correction,
un message reçu ne re-rend plus que la ligne ajoutée — de ~15 rendus de ligne
par message à **1**.

### Réserve honnête

L'animation d'entrée de `ChatRow` (`useEffect` à dépendances vides) ne se
rejoue pas au re-rendu, seulement au montage : ce n'est donc **pas** le
troisième défaut d'animation listé dans `CLAUDE.md`. Elle reste néanmoins
exposée au recyclage de cellule si `keyExtractor` produisait un jour des clés
non uniques — point traité en F3.

---

## F2-3 — Comparateurs du fil : `tweet.author` n'est jamais comparé — l'avatar, le pseudo et le badge restent figés — MAJEUR

`src/components/feed/TweetRow.tsx:748-770` et
`src/components/feed/paper2b/TweetRowGutter.tsx:736-758`

Les deux lignes du fil (l'actuelle et la variante « 2B — Gouttière ») ont un
comparateur `areEqual` soigné, commenté, et **incomplet au même endroit** :

```tsx
function areEqual(prev: TweetRowProps, next: TweetRowProps) {
  const a = prev.tweet;
  const b = next.tweet;
  return (
    a.id === b.id &&
    a.stats?.likes === b.stats?.likes &&
    a.stats?.retweets === b.stats?.retweets &&
    a.stats?.replies === b.stats?.replies &&
    a.stats?.views === b.stats?.views &&
    a.user_interaction?.is_liked === b.user_interaction?.is_liked &&
    a.user_interaction?.is_retweeted === b.user_interaction?.is_retweeted &&
    a.user_interaction?.is_super_liked === b.user_interaction?.is_super_liked &&
    a.content === b.content &&
    /* … puis uniquement des props de mise en page et des identités de callbacks */
  );
}
```

`a.author` n'y figure pas. Pas une seule de ses sous-propriétés.

### Ce qui ne va pas

L'auteur est pourtant l'élément le plus visible de la ligne. `TweetRow` en lit
**huit champs distincts**, tous rendus à l'écran :

| Champ lu | Ligne | Ce qu'il pilote à l'écran |
|---|---|---|
| `avatar` | `TweetRow.tsx:444`, `:448` | la photo de profil |
| `username` | `:481` | le `@pseudo` |
| `full_name` | `:458` | le nom affiché |
| `premium` | `:460` | l'habillage premium du nom |
| `subscription_tier` | `:461` | le palier d'abonnement |
| `profile_customization` | `:465` | la couleur du nom certifié |
| `verified` | `:466`, `:469` | la présence de la pastille |
| `verification_style` | `:467`, `:474` | la teinte de la pastille |

`TweetRowGutter` lit exactement les mêmes (`:568`, `:572`, `:584`, `:586`,
`:587`, `:592`, `:593`), plus `profile_customization` une deuxième fois dans un
`useMemo` (`:279-283`).

Le comparateur renvoyant `true` dès que l'identifiant, les compteurs et le
texte sont inchangés, **`React.memo` bloque le re-rendu** : la ligne continue
d'afficher les anciennes valeurs. Ce n'est pas un rendu superflu, c'est
l'inverse — un rendu manquant. C'est le premier des deux travers listés dans le
cahier des charges de cette section : « un champ en moins = interface figée ».

Vérifié : aucun garde-fou ne rattrape le coup. `TweetsScreen` et
`FeedGutterScreen` ne passent **pas** d'`extraData` à leur `FlatList`, et le
composant `Avatar` n'a aucun mécanisme de version ni de cache-busting d'URL.
Rien ne force donc le re-rendu par un autre chemin.

### Effet concret pour l'utilisateur

Le scénario le plus courant est celui de l'utilisateur qui change **sa propre**
photo de profil :

1. il ouvre `EditProfileScreen`, change son avatar, valide ;
2. il revient au fil et tire pour rafraîchir ;
3. le serveur renvoie bien le nouvel `author.avatar` ;
4. **ses tweets affichent toujours l'ancienne photo.**

Elle ne se corrigera que si la ligne quitte la fenêtre de virtualisation puis y
revient — c'est-à-dire en défilant assez loin pour que la cellule soit démontée,
puis en remontant. D'où le symptôme le plus déroutant : un défilement rapide de
va-et-vient « répare » l'affichage, ce qui rend le bug impossible à reproduire
de façon fiable pour qui le signale.

Les mêmes trois étapes valent pour :

- l'**achat d'un premium** — le nom ne prend pas son habillage, le compte vient
  pourtant de payer ; c'est la première chose qu'il va vérifier ;
- l'obtention de la **certification** — la pastille n'apparaît pas ;
- un **changement de pseudo ou de nom** — le sien comme celui d'un autre
  compte : le fil garde l'ancien pendant toute la session.

Ce sont exactement les changements qu'un utilisateur vient de payer ou de
demander, et donc ceux dont l'absence se remarque le plus.

### Correctif

Ajouter la comparaison de l'auteur aux deux comparateurs, champ par champ (pas
d'égalité de référence sur `a.author` : le fil reconstruit ses objets à chaque
réponse serveur, `a.author !== b.author` serait vrai en permanence et ferait
re-rendre toutes les lignes à chaque rafraîchissement — le travers exactement
opposé, et plus coûteux que le bug actuel).

```tsx
function sameAuthor(a: any, b: any) {
  if (a === b) return true;                 // court-circuit du cas fréquent
  if (!a || !b) return !a === !b;
  return (
    a.id === b.id &&
    a.avatar === b.avatar &&
    a.username === b.username &&
    a.full_name === b.full_name &&
    a.premium === b.premium &&
    a.subscription_tier === b.subscription_tier &&
    a.verified === b.verified &&
    a.verification_style === b.verification_style &&
    a.profile_customization === b.profile_customization
  );
}
```

puis, dans les deux `areEqual` :

```tsx
sameAuthor(a.author, b.author) &&
sameAuthor((a as any).originalTweet?.author, (b as any).originalTweet?.author) &&
```

La deuxième ligne n'est pas facultative : sur un retweet pur, l'auteur affiché
est celui du tweet d'origine (`TweetRow.tsx:162`), pas celui de la ligne.

`profile_customization` est un objet : la comparaison par référence suffit tant
qu'il vient tel quel de la réponse et n'est pas reconstruit ligne à ligne — à
vérifier côté `apiService`. Dans le doute, comparer la ou les clés réellement
lues plutôt que la référence.

Coût : neuf comparaisons de primitives par ligne montée, soit un surcoût
négligeable devant le rendu qu'elles évitent — et devant le bug qu'elles
corrigent.

### Réserves honnêtes

- **Ce n'est pas un gain de fluidité, c'est une correction de fraîcheur.** Le
  correctif *ajoute* des rendus (uniquement quand l'auteur a réellement changé).
  Il est classé ici parce que la section couvre explicitement les comparateurs
  incomplets, et parce qu'il touche l'écran le plus regardé.
- Deux autres champs manquent aussi aux deux comparateurs — `media_urls`
  (`TweetRow.tsx:190`) et `paid_content.has_access` (`:229-232`). Ils sont
  laissés hors du constat principal : les médias d'un tweet publié ne changent
  pas, et le déverrouillage d'un contenu payant ouvre le tweet en plein écran
  plutôt que de mettre la ligne à jour sur place (`:568`), ce qui contourne le
  problème. Le retour au fil après achat reste théoriquement exposé — non
  reproduit, signalé pour mémoire seulement.
- `stats.views` est présent dans `TweetRow` et volontairement absent de
  `TweetRowGutter`, avec une justification écrite (`TweetRowGutter.tsx:732` :
  2B n'affiche plus les vues). Les deux choix sont corrects : **rien à signaler
  de ce côté.**

---

## F2-4 — Conversation : chaque message reçu re-rend toutes les bulles montées — MAJEUR

`src/screens/ConversationThreadScreen.tsx:1291-1507`

Cet écran a fait **la moitié** du chemin, et c'est ce qui rend le constat
subtil. Le `renderItem` est bien mémoïsé, avec un commentaire qui nomme
précisément le piège (`:1286-1289`) :

> « Mémoïsé : une closure recréée à chaque rendu invalide la mémoïsation
> interne de la FlatList, si bien que toutes les bulles montées se re-rendaient
> à chaque frappe dans le compositeur. »

C'est exact, et **la frappe est effectivement corrigée** : taper dans le
compositeur change un état qui n'est dans aucune dépendance, `renderItem` garde
son identité, les bulles sont épargnées. Vérifié.

Mais le tableau de dépendances (`:1499-1507`) est celui-ci :

```tsx
}, [
  messages,              // ← change à CHAQUE message envoyé ou reçu
  participantMap,
  myId,
  isGroup,
  expandedMessageId,     // ← change à chaque appui sur une bulle
  openImageViewer,
  lastOutgoingMessageId, // ← change à chaque message envoyé
  sendReaction,
]);
```

### Ce qui ne va pas

`messages` est dans les dépendances — et il ne peut pas en sortir tel quel :
`renderItem` lit `messages[index - 1]` et `messages[index + 1]` (`:1296-1297`)
pour décider du groupage Instagram (coins resserrés au sein d'une salve,
séparateur d'horodatage). La mémoïsation est donc **structurellement annulée par
le seul événement qui compte** : l'arrivée d'un message.

Et il n'y a pas de deuxième ligne de défense. Le corps de la bulle est du JSX
**inline** dans `renderItem` — il n'existe aucun composant `MessageBubble`
mémoïsé. Contrairement au fil, où `TweetRow` est un `memo` avec comparateur
(qui rattraperait un `renderItem` instable), ici rien n'arrête la propagation :
`renderItem` change d'identité → le `CellRenderer` de `VirtualizedList`, qui
est une `PureComponent`, re-rend **toutes** les cellules montées.

Trois déclencheurs, tous fréquents :

| Déclencheur | Dépendance touchée | Fréquence |
|---|---|---|
| Un message arrive (socket) | `messages` | plusieurs par minute en conversation vive |
| L'utilisateur envoie | `messages` + `lastOutgoingMessageId` | à chaque envoi |
| Appui sur une bulle (horodatage) | `expandedMessageId` | à chaque appui |

Chaque bulle re-rendue reconstruit, selon son contenu : une
`Reanimated.View`, l'`Image` d'avatar de l'expéditeur (`:1389`), la bulle et son
texte, l'`Image` de pièce jointe le cas échéant (`:1417`), la boucle
`groupedReactions.map(...)` (`:1446`), et la rangée « Vu » avec ses jusqu'à
trois `Image` d'avatars (`:1481-1490`).

### Effet concret pour l'utilisateur

Le symptôme est le plus visible au pire moment : **une conversation animée**.
Quand l'interlocuteur enchaîne trois ou quatre messages, chaque arrivée fait
repasser la vingtaine de bulles montées par le rendu React et la
réconciliation. Le fil tressaute au lieu de faire glisser la nouvelle bulle, et
l'auto-scroll vers le bas (`handleContentSizeChange:1281`) part sur une liste
en cours de re-rendu — d'où le défilement qui « accroche » juste après un
message reçu.

L'appui sur une bulle pour voir son heure a le même coût : un geste qui devrait
ne toucher qu'une bulle en re-rend vingt.

À noter que le prix par bulle est ici plus élevé que dans le chat du live
(F2-2) : les bulles portent des images, des réactions et des rayons calculés,
là où une ligne de chat live est presque purement textuelle.

### Correctif

Extraire un `MessageBubble` mémoïsé et **précalculer le groupage hors du
rendu**, ce qui règle les deux problèmes d'un coup :

```tsx
// 1. Le groupage devient une donnée, calculée une fois par changement de liste.
const decorated = useMemo(
  () => messages.map((m, i) => {
    const senderId = String(m.sender_id || m?.sender?.id || '');
    const prev = messages[i - 1], next = messages[i + 1];
    return {
      msg: m,
      senderId,
      isFirstOfGroup: String(prev?.sender_id || prev?.sender?.id || '') !== senderId,
      isLastOfGroup:  String(next?.sender_id || next?.sender?.id || '') !== senderId,
      showSeparator:  /* … même calcul qu'aujourd'hui … */,
    };
  }),
  [messages],
);

// 2. renderItem ne lit plus `messages` : il n'a plus besoin des voisins.
const renderItem = useCallback(
  ({ item }: { item: Decorated }) => <MessageBubble entry={item} … />,
  [/* plus de `messages` */],
);

// 3. La bulle se défend elle-même.
const MessageBubble = memo(function MessageBubble({ entry, … }) { … });
```

`data={decorated}` remplace `data={messages}`.

Après ce changement, l'arrivée d'un message recalcule `decorated` (coût : une
passe `O(n)` sur un tableau, sans rendu), et seules les bulles dont
`isFirstOfGroup`/`isLastOfGroup` ont réellement basculé se re-rendent — en
pratique **la nouvelle bulle et sa voisine immédiate**, soit 2 rendus au lieu
de ~20.

`expandedMessageId` doit sortir des dépendances par le même geste : le passer à
la bulle sous forme de booléen `expanded` déjà résolu, calculé dans le
`renderItem` à partir d'une `ref` — ou plus simplement laisser le comparateur
de `MessageBubble` filtrer, puisque seule la bulle concernée verra son
`expanded` changer.

### Ce que j'ai vérifié et trouvé SAIN sur cet écran

- **L'animation d'entrée est correctement gardée.** `entering={FadeInDown…}`
  (`:1341-1345`) n'est appliqué que si `justArrivedIdsRef.current.has(id)`, un
  `Set` alimenté à l'arrivée du message et purgé après 700 ms (`:629-634`).
  C'est exactement le garde-fou exigé par `CLAUDE.md` contre l'animation
  rejouée au recyclage — et la lecture du `Set` pendant le rendu est pure,
  comme le commentaire le revendique. Rien à redire.
- Pas de ressort sous-amorti : `FadeInDown.duration(200).easing(Easing.out(…))`
  respecte la règle des 140–200 ms.
- Les `Image` portent toutes `cachePolicy="memory-disk"`, `transition={0}` et
  un `recyclingKey` (`:1389`, `:1417`, `:1472`, `:1484`) — le recyclage d'image
  est traité sérieusement.
- `handleListScroll` et `handleContentSizeChange` sont en `useCallback` à
  dépendances vides, avec `isAtBottomRef` en `ref` plutôt qu'en état : aucun
  rendu déclenché par le défilement. Bon réflexe.

---

## F2-5 — Conversation : l'accusé de lecture « Vu » n'apparaît jamais en temps réel — MAJEUR

`src/screens/ConversationThreadScreen.tsx:1499-1507` (dépendances) contre
`:1468-1496` (rangée « Vu »)

Constat jumeau du précédent, et **de sens inverse** : F2-4 décrit des
dépendances trop larges qui font re-rendre ce qui n'a pas bougé ; celui-ci
décrit des dépendances trop étroites qui empêchent de re-rendre ce qui a bougé.
Les deux vivent dans le même `useCallback`.

La rangée « Vu » lit six valeurs du composant :

```tsx
{isLastOutgoing && hasBeenSeen && (          // :1468   hasBeenSeen        ✗ absent des deps
  <View style={styles.seenRow}>
    {!isGroup ? (
      avatarUri ? (                          // :1471   avatarUri          ✗ absent
        <Image source={{ uri: avatarUri }} … />
      ) : (
        … String(conversationUsername …)      // :1477   conversationUsername ✗ absent
      )
    ) : (
      seenReaders.slice(0, 3).map(([uid]) => // :1481   seenReaders        ✗ absent
        … participantMap[String(uid)] …       //         participantMap     ✓ présent
      )
    )}
    <Text style={styles.seenLabel}>{seenLabel}</Text>  // :1493 seenLabel   ✗ absent
  </View>
)}
```

Cinq des six ne figurent pas dans le tableau de dépendances (`:1499-1507`).
`renderItem` les capture donc dans une **closure périmée**.

### Pourquoi ça se voit — la chaîne complète

Ce serait sans conséquence si ces valeurs ne changeaient qu'en même temps que
`messages`. Ce n'est pas le cas, et le chemin est traçable de bout en bout :

1. L'interlocuteur ouvre la conversation et lit. Le serveur émet `read:update`.
2. Le gestionnaire de socket (`:820-828`) appelle **uniquement**
   `setReadByUser(...)`. `messages` n'est pas touché — vérifié, c'est le seul
   `setState` de ce gestionnaire.
3. `seenReaders` se recalcule correctement : son `useMemo` a bien `readByUser`
   dans ses dépendances (`:1210`). `hasBeenSeen` passe à `true`, `seenLabel`
   devient « Vu 14:32 ».
4. Le composant se re-rend, donc ces trois valeurs sont à jour **dans le corps
   du composant**.
5. Mais `renderItem` n'est **pas** recréé : aucune de ses dépendances n'a
   changé. La `FlatList` reçoit la même fonction, le `CellRenderer`
   (`PureComponent`) ne re-rend rien, et les bulles continuent d'exécuter
   l'ancienne closure, dans laquelle `hasBeenSeen` vaut encore `false`.
6. **Rien ne s'affiche.**

Il n'existe aucun `extraData` sur cette `FlatList` (`:1601-1613`) — vérifié —
qui rattraperait le coup.

### Effet concret pour l'utilisateur

L'utilisateur envoie un message. L'autre le lit dans la seconde. **Aucun « Vu »
n'apparaît.** L'indicateur ne se débloque qu'au prochain changement de
`messages` : un nouveau message envoyé ou reçu — c'est-à-dire, le plus souvent,
la réponse elle-même. Autrement dit, « Vu » s'affiche systématiquement *trop
tard pour servir à quelque chose* : au moment précis où la réponse rend
l'information sans intérêt.

C'est la fonctionnalité qui répond à la question « est-ce qu'il a vu mon
message ? », et c'est exactement dans ce cas — message lu, pas encore répondu —
qu'elle reste muette. Depuis l'extérieur, ça ressemble à un accusé de lecture
qui « ne marche pas », et non à un bug de rendu.

Symptôme dérivé cohérent avec ce diagnostic : quitter puis rouvrir la
conversation affiche le « Vu » immédiatement (le montage recrée tout).

### Correctif

Il disparaît **gratuitement** si l'on applique le correctif de F2-4 : une fois
la rangée « Vu » sortie dans le composant `MessageBubble` mémoïsé, elle reçoit
`hasBeenSeen`, `seenLabel` et `seenReaders` en props ordinaires, et le
comparateur de `memo` les voit changer. C'est l'argument le plus fort pour
traiter les deux ensemble plutôt que de rafistoler les dépendances.

**Correctif minimal** si l'on ne veut pas refondre tout de suite — ajouter les
cinq valeurs manquantes aux dépendances :

```tsx
}, [
  messages, participantMap, myId, isGroup, expandedMessageId,
  openImageViewer, lastOutgoingMessageId, sendReaction,
  hasBeenSeen, seenLabel, seenReaders, avatarUri, conversationUsername,  // ← ajout
]);
```

Correct, mais à comprendre pour ce que c'est : **on échange un bug d'affichage
contre un re-rendu de toutes les bulles à chaque accusé de lecture reçu**,
c'est-à-dire qu'on aggrave F2-4. Acceptable comme rustine de court terme
uniquement, et à condition de faire suivre par l'extraction du composant.

Un `eslint-plugin-react-hooks` avec `exhaustive-deps` en **erreur** aurait
signalé les cinq omissions à l'écriture. Vaut la peine d'être vérifié à
l'échelle du dépôt — c'est le type de faute qui se reproduit.

### Réserve honnête

Je n'ai pas exécuté l'application : la chaîne est établie par lecture du code
(le gestionnaire `read:update` ne touche que `readByUser` ; `readByUser` n'est
pas une dépendance transitive de `renderItem` ; pas d'`extraData`). Chacun de
ces trois maillons est vérifié individuellement dans le fichier, mais le
symptôme lui-même n'a pas été reproduit sur appareil. À confirmer d'un coup
d'œil avant de refondre — c'est trente secondes à deux téléphones.
