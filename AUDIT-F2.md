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

---

## F2-6 — Recherche : chaque frappe re-rend les 40 résultats, tous montés d'un coup — MAJEUR

`src/screens/SearchScreen.tsx:46`, `:760`, `:846`, `:979-1043`

Le même défaut que F2-1, dans une forme plus aiguë : ici il n'y a même pas de
liste virtualisée pour limiter la casse.

```tsx
const [searchQuery, setSearchQuery] = useState('');           // :46  — MÊME composant

const renderUserItem  = (user: User, index: number) => ( … );  // :760 — fonction nue
const renderTweetItem = (tweet: Tweet, index: number) => { … };// :846 — fonction nue

<TextInput value={searchQuery} onChangeText={…} />             // :920-925

<ScrollView …>                                                 // :979
  {searchResults.users.map(renderUserItem)}                    // :1033
  {searchResults.tweets.map(renderTweetItem)}                  // :1043
</ScrollView>
```

### Ce qui ne va pas — quatre défauts empilés

1. **`searchQuery` vit dans le composant qui rend les résultats** (`:46`). Une
   frappe = un rendu de `SearchScreen` = un ré-appel de `renderUserItem` et
   `renderTweetItem` pour **chaque** résultat.

2. **Aucune virtualisation.** Ce sont des `.map()` dans un `ScrollView`
   (`:979`), pas une `FlatList`. Tous les résultats sont donc montés en même
   temps, et tous re-rendus. Avec `limit: 20` par type (`:333`, `:343`,
   `:353`), le filtre « tout » monte jusqu'à **40 lignes simultanées** —
   chacune avec son `Avatar`, son `PremiumDisplayName` et son badge. Le
   pendant `FlatList` de ce point revient en F3 ; ici seul compte le fait
   qu'aucune cellule n'est jamais démontée.

3. **`renderUserItem` et `renderTweetItem` sont des fonctions nues, pas des
   composants.** Ce ne sont pas des éléments React distincts que React
   pourrait comparer : leur JSX est reconstruit et réconcilié à chaque rendu du
   parent. Aucun `React.memo` n'est possible tant qu'ils restent des fonctions
   appelées par `.map()` — il faut d'abord en faire de vrais composants.

4. **`renderTweetItem` fabrique un objet neuf à chaque appel** (`:848-855`) :
   ```tsx
   const tweetWithInteractions = { ...tweet, user_interaction: { … } };
   ```
   Deux objets neufs par tweet et par frappe. Si ce tweet est ensuite passé à
   un composant mémoïsé, la nouvelle référence annule la mémoïsation ; et dans
   tous les cas c'est de la pression inutile sur le ramasse-miettes.

À quoi s'ajoute un cinquième point, purement gratuit celui-là :

5. **Chaque ligne est enveloppée dans une `Animated.View` qui n'anime rien.**
   `fadeAnim` vaut `1` et `slideAnim` vaut `0` (`:102-103`), et — vérifié par
   recherche sur tout le fichier — il n'existe **aucun** `Animated.timing`,
   `Animated.parallel` ni `Animated.spring` dans `SearchScreen.tsx`. Ces deux
   valeurs ne sont jamais animées. Chaque résultat paie donc un nœud
   `Animated.View` et un `transform: [{ translateY: 0 }]` — donc une couche de
   composition côté natif — pour une opacité de 1 et un décalage de 0. C'est du
   coût pur, sans le moindre effet visuel. Même chose aux lignes `:912` et
   `:943` pour l'en-tête et la barre de filtres.

### Effet concret pour l'utilisateur

Après une première recherche, l'utilisateur affine sa requête — c'est le geste
normal : on tape « mar », on regarde, on complète en « marie ». À partir de là,
**chaque caractère ajouté ou effacé** reconstruit les 40 lignes de résultats
déjà à l'écran. Le champ de saisie retarde, et le retard est proportionnel au
nombre de résultats trouvés : plus la recherche a réussi, plus corriger la
requête devient pénible.

La correction d'une faute de frappe est le pire cas : effacer trois caractères
puis en retaper trois, c'est six reconstructions complètes de la liste.

### Correctif

Par ordre de gain sur effort :

1. **Supprimer les cinq `Animated.View` inertes** (`:761`, `:863`, `:911`,
   `:942`) et les remplacer par des `View`. Suppression de code mort, aucun
   changement visuel possible puisque les valeurs sont constantes. Le geste le
   moins risqué du rapport.

2. **Isoler le champ de saisie.** Extraire la barre de recherche dans un
   `SearchBar` qui détient `searchQuery` et ne remonte au parent que la
   requête validée (`onSubmit`). La frappe cesse alors de re-rendre les
   résultats — c'est ce qui supprime le symptôme, et ça ne demande de toucher
   ni aux lignes ni aux données. La recherche partant déjà sur
   `onSubmitEditing` (`:926`) et non à la frappe, aucun comportement réseau ne
   change.

3. **Faire de `renderUserItem` et `renderTweetItem` de vrais composants
   mémoïsés** (`const UserResultRow = memo(({ user, onPress }) => …)`), avec
   des handlers stables, et calculer `tweetWithInteractions` dans un `useMemo`
   au niveau des données plutôt qu'au rendu.

4. Passer à une `FlatList` (traité en F3), ce qui rend le point 2 moins
   critique sans le remplacer.

Les points 1 et 2 pris ensemble suffisent à faire disparaître la saccade
ressentie, pour un changement local et sans risque.

### Ce que j'ai vérifié et trouvé SAIN

- **La recherche n'est pas relancée à chaque frappe.** `onChangeText` ne fait
  que `setSearchQuery` (`:925`) ; l'appel réseau part sur `onSubmitEditing`
  (`:926`) ou sur un changement de filtre. Le problème est donc bien un
  problème de rendu, pas de réseau — l'un des deux soupçons naturels est écarté.
- **Le `console.log` par tweet rendu (`:856-860`) ne coûte rien en release.**
  `babel.config.js` applique `transform-remove-console` quand
  `NODE_ENV === 'production'`, avec `exclude: ['warn', 'error']`. Les 323
  `console.log` du dossier `src/` disparaissent donc du bundle publié. C'est un
  vrai point fort du dépôt et il mérite d'être dit : sans lui, ce fichier
  émettrait une trace sérialisée par tweet et par frappe. *Réserve* : la
  protection tient à ce que `NODE_ENV=production` soit bien positionné au
  moment du build EAS — non vérifié ici, à confirmer en R3.

---

## F2-7 — Composer un tweet : chaque caractère lance une animation de 200 ms et re-rend un écran de 2 140 lignes — MAJEUR

`src/screens/CreateTweetScreen.tsx:317-334`

```tsx
const handleContentChange = (text: string) => {
  setContent(text);
  setCharCount(text.length);          // ← état dérivé, redondant avec `content`

  // Animation lors de la saisie
  Animated.sequence([                 // ← relancée à CHAQUE caractère
    Animated.timing(inputScaleAnim, { toValue: 1.005, duration: 100, useNativeDriver: true }),
    Animated.timing(inputScaleAnim, { toValue: 1,     duration: 100, useNativeDriver: true }),
  ]).start();
};
```

### Ce qui ne va pas

1. **Une séquence d'animation de 200 ms est lancée par caractère tapé, et
   jamais arrêtée.** À un rythme de frappe ordinaire — 5 à 8 caractères par
   seconde sur mobile — chaque séquence est écrasée par la suivante bien avant
   d'être arrivée à son terme. On n'obtient donc jamais l'effet visé (une
   pulsation qui va à 1,005 puis revient à 1) : on obtient une file de
   séquences qui se coupent l'une l'autre. Chaque `.start()` alloue deux
   `Animated.timing`, une `Animated.sequence`, et envoie une configuration au
   pilote natif.

   L'amplitude est de **0,5 %** — invisible à l'œil sur un champ de saisie.
   Autrement dit, tout ce coût est payé pour un effet que personne ne peut
   percevoir, et qui de toute façon n'a pas le temps de se produire.

2. **`charCount` duplique `content.length`.** Deux états là où un suffit
   (`:88` et `:106`). React 18 regroupe bien les deux `setState` en un seul
   rendu, donc ce n'est pas un rendu de plus — mais c'est un état à maintenir
   synchronisé à la main, avec le risque de désynchronisation que ça implique
   (le commentaire `:1619-1621` montre qu'il a déjà fallu router un autre
   chemin d'écriture par `handleContentChange` exprès pour ne pas laisser le
   compteur en arrière).

3. **Tout ce que la frappe entraîne derrière.** L'écran est un composant
   **unique de 2 140 lignes portant 31 `useState`**. Il n'est découpé en aucun
   sous-composant : le champ de saisie, la grille d'images (`:1202`), le
   panneau Spotify et ses résultats (`:1464`), l'aperçu de citation, la barre
   d'outils et le compteur vivent tous dans le même rendu. Un caractère tapé
   les repasse tous.

### Effet concret pour l'utilisateur

Écrire un tweet est l'action fondatrice de l'application, et c'est là que la
frappe est la plus lourde de tout le dépôt. Le retard se voit surtout :

- **quand des images sont jointes** — la grille d'aperçus (`:1202`) est
  reconstruite à chaque caractère, en plus de l'animation ;
- **sur un appareil modeste**, où 200 ms d'animation par caractère à 6
  caractères/seconde signifient qu'il y a en permanence une animation en vol ;
- **en fin de tweet long**, quand le champ multiligne a grandi.

Le symptôme rapporté est en général « le clavier rame » ou « les lettres
arrivent en retard », et l'utilisateur l'attribue au clavier, pas à
l'application.

### Correctif

1. **Supprimer purement et simplement l'`Animated.sequence` de
   `handleContentChange`** (`:321-333`). C'est une ligne de gain net : l'effet
   est invisible (0,5 %), il ne s'achève jamais, et il coûte à chaque
   caractère. `handleContentChange` se réduit alors à `setContent(text)`.

2. **Supprimer l'état `charCount`** et le remplacer par `content.length` au
   point d'usage (`:1074`, `:1116` et suivants). Un état de moins à
   synchroniser.

3. **Extraire un `TweetComposer`** qui détient `content` et n'informe le parent
   qu'à la publication — même geste que pour `CommentSheet` (F2-1) et
   `SearchScreen` (F2-6). C'est le correctif de fond : il sort la grille
   d'images, le panneau Spotify et l'aperçu de citation du chemin de la frappe.
   Plus gros chantier, à faire une fois les points 1 et 2 acquis.

Les points 1 et 2 sont des suppressions de code, applicables immédiatement et
sans risque de régression visuelle.

### Ce que j'ai vérifié et trouvé SAIN sur cet écran

- **Les ressorts de focus/blur sont correctement amortis.**
  `Animated.spring(inputScaleAnim, { tension: 50, friction: 14 })` (`:1086`,
  `:1094`) : l'amortissement critique tombe à `2 × √50 ≈ 14,14` pour une masse
  de 1. Avec `friction: 14`, le ressort est à un cheveu du critique — il
  n'oscille pas. C'est exactement ce que `CLAUDE.md` demande, et l'opposé du
  `springify().damping(14)` explicitement rejeté. **Rien à corriger ici** : ces
  deux ressorts ne se déclenchent qu'au focus et au blur, pas à la frappe.
- `Animated` est bien celui de `react-native` (`:3-18`), pas Reanimated
  renommé : le piège de nommage signalé dans `CLAUDE.md` pour `TweetsScreen`
  n'existe pas dans ce fichier.
- Toutes les animations de l'écran utilisent `useNativeDriver: true`.
- L'aperçu du tweet cité passe par `<TweetCard tweet={quotedTweet} compact />`
  (`:1108`), et `TweetCard` est un `memo` avec comparateur
  (`src/components/TweetCard.tsx:743`). `quotedTweet` étant un état stable et
  `compact` un littéral, la carte citée est **épargnée** par la frappe. Bon
  point : c'est le sous-arbre le plus lourd de l'écran, et c'est le seul qui
  soit protégé.

---

## F2-3 bis — Complément décisif : le correctif existe déjà dans le dépôt, il n'a pas été reporté

`src/components/TweetCard.tsx:715-739`

Découvert en vérifiant `ProfileScreen`, qui rend ses tweets avec `TweetCard` et
non `TweetRow`. Le comparateur de `TweetCard` est celui-ci :

```tsx
    // L'accès au contenu payant change l'affichage du verrou.
    (a as any).paid_content?.has_access === (b as any).paid_content?.has_access &&
    // L'auteur peut changer d'habillage sans que le tweet change d'identité.
    a.author?.id === b.author?.id &&
    a.author?.username === b.author?.username &&
    a.author?.full_name === b.author?.full_name &&
    a.author?.avatar === b.author?.avatar &&
    a.author?.verified === b.author?.verified &&
    (a.author as any)?.verification_style === (b.author as any)?.verification_style &&
    (a.author as any)?.profile_customization === (b.author as any)?.profile_customization
```

**F2-3 n'est donc pas une hypothèse : c'est une régression déjà rencontrée,
déjà diagnostiquée et déjà corrigée — à un seul endroit sur trois.** Le
commentaire « L'auteur peut changer d'habillage sans que le tweet change
d'identité » décrit mot pour mot le mécanisme décrit en F2-3. Quelqu'un a buté
dessus, l'a compris, l'a réparé dans `TweetCard`, et `TweetRow` /
`TweetRowGutter` sont passés au travers.

Deux conséquences pratiques :

1. **Le correctif proposé en F2-3 n'est pas à inventer : il est à copier.** La
   forme retenue ici (comparaison champ par champ, référence directe sur
   `profile_customization`) est exactement celle que je proposais, ce qui lève
   le doute que j'y exprimais sur la maison. À reporter tel quel dans les deux
   comparateurs du fil.
2. **La ligne `paid_content?.has_access` confirme la réserve de F2-3.** Elle est
   présente ici et absente des deux autres. Ce n'était donc pas un faux
   problème : il a bien fallu l'ajouter au moins une fois.

### Mais `TweetCard` a lui aussi un trou — sur les deux champs les plus sensibles

Le report a été fait sur sept champs d'auteur. Il en manque **deux**, et
`TweetCard` les rend pourtant (`:393-394`) :

```tsx
isPremium={!!tweet.author?.premium}
subscriptionTierRaw={(tweet.author as any)?.subscription_tier}
```

Ni `premium` ni `subscription_tier` ne figurent dans le comparateur.

**Effet concret** : un utilisateur achète un premium, revient sur son profil —
c'est le premier endroit où il va vérifier ce qu'il vient de payer — et ses
tweets affichent toujours le nom sans habillage premium. Il faut quitter
l'écran et y revenir pour voir la différence. C'est le pire moment possible
pour un doute sur « est-ce que mon paiement est passé ? ».

Le même trou existe dans `TweetRow` et `TweetRowGutter`, où `premium` (`:460`,
`:586`) et `subscription_tier` (`:461`, `:587`) sont rendus aussi.

### Correctif

Ajouter les deux lignes manquantes **aux trois** comparateurs, et non au seul
`TweetCard` :

```tsx
(a.author as any)?.premium === (b.author as any)?.premium &&
(a.author as any)?.subscription_tier === (b.author as any)?.subscription_tier &&
```

Le geste durable : extraire un `sameAuthor()` unique et partagé (forme donnée
en F2-3), importé par les trois composants. C'est la seule façon d'éviter que
le prochain champ d'auteur ajouté à l'interface soit à nouveau oublié dans deux
comparateurs sur trois — ce qui vient de se produire deux fois de suite.

### Note d'architecture, hors constat

`ProfileScreen` rend ses tweets avec `TweetCard` (`:304`) tandis que
`UserProfileScreen` les rend avec `TweetRow` (`:500`) : deux composants
différents pour la même chose, sur deux écrans jumeaux. Ce n'est pas un défaut
de performance en soi — les deux sont mémoïsés — mais c'est la cause directe du
correctif appliqué à un seul des deux. Signalé pour information ; la
consolidation dépasse le cadre de cet audit.

### Ce que j'ai vérifié et trouvé SAIN au passage

- **`NotificationsScreen` est propre**, et c'est le meilleur exemple du dépôt :
  `NotificationItem` est un `React.memo` dont le comparateur repose sur
  l'**identité** de `notification` (`:271-277`), ce qui est ici le bon choix
  puisque `handleMarkAsRead` (`:363`) ne recrée l'objet que de la notification
  touchée et conserve les références des autres. `keyExtractor` et
  `renderNotification` sont en `useCallback` (`:446-457`), `filtered` en
  `useMemo` (`:437`), et même le tableau vide est une constante de module
  (`EMPTY_NOTIFICATIONS`, `:280`) avec le commentaire qui explique pourquoi.
  Rien à signaler.
- `ProfileScreen` (`:300-314`) et `UserProfileScreen` (`:448-510`) :
  `keyExtractor`, `renderTweetItem`, `rowContext` et `handleRowAction` sont
  tous mémoïsés avec des dépendances stables. Sains tous les deux.

---

## F2-8 — Fil vidéo : chaque glissé re-rend toutes les cartes vidéo montées — CRITIQUE

`src/screens/twitninfvideo.tsx:105` et `:533-552`

C'est le fil vidéo vertical plein écran, façon TikTok — l'écran où l'exigence de
fluidité est la plus haute de toute l'application, et le seul où la moindre
saccade est immédiatement lue comme « l'app est cassée ».

```tsx
const VideoCard: React.FC<VideoCardProps> = ({ tweet, isActive, onSheetToggle, cardHeight }) => {
  // 9 useState, un <Video> expo-av, une feuille de commentaires…
};                                        // :105 — AUCUN React.memo

<FlatList
  data={videos}
  keyExtractor={item => item.id}                       // ← recréé à chaque rendu
  pagingEnabled
  renderItem={({ item }) => (                          // ← recréé à chaque rendu
    <VideoCard
      tweet={item}
      isActive={activeVideoId === item.id && isFocused}
      onSheetToggle={(isVisible) => setIsScrollEnabled(!isVisible)}  // ← closure neuve par carte
      cardHeight={cardHeight}
    />
  )}
/>
```

### Ce qui ne va pas

Les trois défauts se cumulent exactement comme dans F2-2, mais sur un contenu
incomparablement plus lourd :

1. `VideoCard` n'est pas mémoïsé (`:105`, `React.FC` nu).
2. `renderItem` et `keyExtractor` sont des flèches anonymes (`:535`, `:545`).
3. `onSheetToggle` est une quatrième closure neuve par carte et par rendu.

**Le déclencheur est le glissé lui-même.** `activeVideoId` change à chaque
changement de vidéo (`onViewableItemsChanged`, `:543`) : l'écran se re-rend,
`renderItem` prend une identité neuve, et le `CellRenderer` (`PureComponent`)
de `VirtualizedList` propage le re-rendu à **toutes** les cartes montées.
`setIsScrollEnabled` (`:549`), déclenché à l'ouverture des commentaires, fait
la même chose.

Et une carte montée coûte cher. Chacune porte (`:105-160`, `:262-300`) :
**9 `useState`**, un `<LinearGradient>` plein écran, une `<Image>` de
miniature, un **`<Video>` expo-av**, une boucle `overlays.map(...)` avec du
texte outliné, et la barre d'actions.

Point aggravant vérifié : le `<Video>` est **monté en permanence** dès que
`videoUrl` existe (`:272`). Seul `shouldPlay={isActive}` varie. Il n'y a donc
pas une carte vidéo montée, mais autant que la fenêtre de virtualisation en
garde — et cette `FlatList` ne règle **ni `windowSize`, ni
`initialNumToRender`, ni `maxToRenderPerBatch`, ni `removeClippedSubviews`**
(vérifié : aucun de ces quatre attributs n'est présent). Elle tourne donc sur
les valeurs par défaut de React Native : `initialNumToRender: 10` et
`windowSize: 21`. Chaque carte faisant une hauteur d'écran, cela signifie
**jusqu'à ~10 lecteurs vidéo instanciés dès l'ouverture de l'onglet**, et
jusqu'à ~21 montés en défilement. *Le réglage de la fenêtre relève de F3 ; il
est mentionné ici parce que c'est lui qui fixe le multiplicateur du présent
constat.*

### Effet concret pour l'utilisateur

À chaque glissé vers la vidéo suivante — le geste le plus répété de cet écran,
plusieurs fois par minute — l'ensemble des cartes montées repasse par le rendu
React et la réconciliation, **pendant** que le lecteur enchaîne sur la vidéo
suivante et que l'animation de défilement paginé est en cours. Les trois se
disputent le même thread JS au même instant.

Le symptôme : le glissé « accroche » juste au moment du calage sur la vidéo
suivante, et la première demi-seconde de lecture est hachée. C'est exactement
le défaut qui distingue une application vidéo qui paraît finie d'une qui ne le
paraît pas — et l'utilisateur n'a rien d'autre à faire sur cet écran que ce
geste-là.

### Correctif

```tsx
const VideoCard = React.memo(function VideoCard({ tweet, isActive, onSheetToggle, cardHeight }) {
  …
});

// dans l'écran :
const handleSheetToggle = useCallback((isVisible: boolean) => setIsScrollEnabled(!isVisible), []);
const videoKeyExtractor = useCallback((item: Tweet) => item.id, []);
const renderVideo = useCallback(
  ({ item }: { item: Tweet }) => (
    <VideoCard
      tweet={item}
      isActive={activeVideoId === item.id && isFocused}
      onSheetToggle={handleSheetToggle}
      cardHeight={cardHeight}
    />
  ),
  [activeVideoId, isFocused, handleSheetToggle, cardHeight],
);
```

`renderItem` garde forcément `activeVideoId` en dépendance — c'est
`React.memo` sur `VideoCard` qui fait le tri derrière : seules **les deux**
cartes dont `isActive` bascule réellement se re-rendent, au lieu de toutes.
On passe d'une dizaine de rendus de carte vidéo par glissé à **2**.

Le gain suivant, complémentaire, est de ne monter le `<Video>` que pour la
carte active et ses voisines immédiates (`{isActive || isNeighbour ? <Video…/> : <Image thumb/>}`)
— mais c'est un changement de comportement de préchargement, à mesurer avant
d'être adopté, et il relève plutôt de F3/R3. Le correctif ci-dessus, lui, est
purement mécanique.

### Ce que j'ai vérifié et trouvé SAIN sur cet écran

- **`onViewableItemsChanged` et `viewabilityConfig` sont passés via des `ref`**
  (`:543-544`, `onViewableItemsChanged.current` / `viewabilityConfig.current`).
  C'est exactement ce qu'il faut faire : React Native **lève une exception** si
  l'une de ces deux props change d'identité après le montage. Le réflexe est
  bon et mérite d'être noté, d'autant qu'il montre que le piège des références
  instables était connu de l'auteur — il n'a simplement pas été appliqué à
  `renderItem`, juste au-dessus.
- `snapToInterval={cardHeight}` utilise bien la hauteur responsive et non
  `Dimensions.get('window').height` brut, avec le commentaire qui l'explique
  (`:538`). Correct.

---

## F2-9 — Les sept `renderItem` inline restants — balayage groupé

Recensement de tous les `renderItem` / `keyExtractor` inline encore présents
dans le dépôt après les constats précédents. Le défaut technique est le même
partout (flèche anonyme → identité neuve à chaque rendu → le `CellRenderer`
`PureComponent` re-rend toutes les cellules montées) ; **ce qui change d'un
écran à l'autre, c'est la fréquence du déclencheur.** Ils sont donc groupés,
et classés par gain réel.

| Écran | Lignes | Déclencheur de re-rendu | Gravité |
|---|---|---|---|
| `GoLiveScreen.tsx` | `:450`, `:455` | frappe du diffuseur **et** message reçu | **MAJEUR** |
| `SendCoinsModal.tsx` | `:232`, `:236` | frappe dans la recherche de destinataire | **MODÉRÉ** |
| `ImageViewerPaper.tsx` | `:332`, `:334` | glissé entre images, début/fin de zoom | **MODÉRÉ** |
| `LivesScreen.tsx` | `:162`, `:171` | rafraîchissement de la liste des lives | mineur |
| `UserConnectionsScreen.tsx` | `:139`, `:140` | suivre / ne plus suivre | mineur |
| `MyPassesScreen.tsx` | `:357`, `:358` | rafraîchissement | mineur |
| `FollowRequestsScreen.tsx` | `:126`, `:136` | accepter / refuser | mineur |
| `CommunityCurrenciesScreen.tsx` | `:95`, `:103` | rafraîchissement | mineur |
| `EconomyManagementScreen.tsx` | 2 listes | rafraîchissement (écran admin) | mineur |
| `CreateAdvertisementScreen.tsx` | `:—` | saisie du formulaire | mineur |

Les six derniers sont des listes courtes sur des écrans peu visités, dont
l'état ne change que sur une action explicite de l'utilisateur : le correctif
est le même `useCallback` mécanique, mais le gain est théorique. **Ils sont
listés pour exhaustivité, pas pour être traités en priorité.** Les deux
premiers, en revanche, méritent chacun un mot.

### `GoLiveScreen` — le jumeau de F2-2, côté diffuseur, et en pire

`src/screens/GoLiveScreen.tsx:98-99` et `:447-465`

```tsx
const [messages, setMessages] = useState<LiveChatMessage[]>([]);   // :98
const [draft, setDraft]       = useState('');                      // :99   ← MÊME composant

<FlatList
  data={messages}
  keyExtractor={(item) => item.id}            // :450  ← recréé à chaque rendu
  renderItem={({ item }) => (                 // :455  ← recréé à chaque rendu
    <View style={styles.chatRow}>
      <Avatar size={26} uri={item.avatar} username={item.user} … />
      …
    </View>
  )}
/>
…
<TextInput value={draft} onChangeText={setDraft} … />               // :471-472
```

F2-2 décrivait ce défaut sur `LiveViewerScreen`, côté **spectateur**. Il est ici
identique côté **diffuseur**, avec deux aggravations :

1. **Deux déclencheurs au lieu d'un.** Chez le spectateur, seule l'arrivée d'un
   message re-rend le chat. Ici s'ajoute la frappe : `draft` (`:99`) vit dans le
   même composant que la liste, donc chaque caractère tapé par le diffuseur
   re-rend tout le chat en plus.
2. **Le contexte est le pire possible.** Le diffuseur est en train de
   **capturer, encoder et téléverser un flux vidéo**. Le thread JS qu'on
   encombre à chaque frappe et à chaque message est celui-là même qui pilote la
   diffusion. Une saccade chez un spectateur gêne un spectateur ; une saccade
   chez le diffuseur dégrade le flux pour **tout le monde**.

En pratique : le diffuseur répond à son public — l'usage même de ce champ — et
chaque caractère reconstruit les lignes de chat visibles, pendant que les
messages continuent d'arriver et de faire la même chose.

**Correctif** : le même que F2-2, plus l'extraction du composeur.

```tsx
const ChatRow = React.memo(function ChatRow({ item }: { item: LiveChatMessage }) { … });
const renderChatRow    = useCallback(({ item }) => <ChatRow item={item} />, []);
const chatKeyExtractor = useCallback((item: LiveChatMessage) => item.id, []);
```

et sortir `draft` dans un `<LiveComposer onSend={sendMessage} />` qui détient
son propre état. Ce dernier geste est le plus rentable des deux ici, puisqu'il
supprime le déclencheur le plus fréquent — et il est purement local.

*Note* : `onContentSizeChange={() => chatListRef.current?.scrollToEnd(…)}`
(`:454`) est aussi une flèche recréée à chaque rendu. C'est sans conséquence
(la prop n'est pas comparée par le `CellRenderer`), mais elle se stabilise
gratuitement dans le même geste.

### `SendCoinsModal` — la frappe re-rend la liste des destinataires

`src/components/SendCoinsModal.tsx:208`, `:232-236`

`query` (`:208`, `onChangeText={setQuery}`) vit dans le même composant que la
`FlatList` des destinataires, dont `renderItem` et `keyExtractor` sont inline.
Même mécanique que `SearchScreen` (F2-6), sur une liste plus courte.

**Effet concret** : chercher à qui envoyer des NF devient poussif à mesure que
la liste de contacts est longue. C'est un écran d'**envoi d'argent** : l'à-coup
y est mal ressenti, parce que l'utilisateur y est déjà attentif et hésitant.
L'écran contient par ailleurs deux autres `TextInput` (`:310` montant, `:341`
note), qui re-rendent la liste eux aussi alors qu'elle n'est plus regardée.

**Correctif** : `useCallback` sur `renderItem`/`keyExtractor`, ligne
destinataire en `memo`, et idéalement isoler `query`, `amount` et `note` dans
leurs sous-composants respectifs.

### `ImageViewerPaper` — la visionneuse plein écran

`src/components/feed/paper2b/ImageViewerPaper.tsx:260-261`, `:332-342`

`index` et `anyZoomed` vivent dans le composant qui rend le pager. `renderItem`
et `keyExtractor` étant inline, chaque glissé d'une image à l'autre
(`setIndex`) et chaque début ou fin de zoom (`setAnyZoomed`) re-rend **toutes**
les `ZoomablePage` montées — c'est-à-dire, en pagination plein écran, plusieurs
images complètes.

**Effet concret** : le passage d'une photo à la suivante et la sortie de zoom
accrochent, dans un écran qui ne sert qu'à regarder des images en grand.

**Correctif** : `useCallback` sur `renderItem`/`keyExtractor` et
`ZoomablePage` en `memo` (ses props sont déjà toutes stables sauf
`onZoomChange`, à passer en `useCallback`).

**Vérifié et rassurant** : `applyZoom` (`:107-113`) n'est appelé que depuis les
bornes des gestes (`runOnJS(applyZoom)` aux lignes `:129`, `:133`, `:183`,
`:196`), **pas à chaque image du pincement**. Le déclencheur est donc de l'ordre
de deux fois par geste, pas soixante. Sans cela le constat serait critique.
Le fichier applique par ailleurs correctement `runOnJS` pour tout retour d'un
worklet vers React, avec un commentaire d'en-tête qui l'explique (`:32`) —
c'est précisément le piège que F4 doit traquer, et il est évité ici.

### Ce que j'ai vérifié et trouvé SAIN

- Ce tableau est **exhaustif** pour le dépôt à la date de l'audit, et il a été
  reconstruit par une recherche `renderItem={` / `keyExtractor={` sur tout
  `src/` plutôt que repris d'une liste antérieure — laquelle omettait
  `CreateAdvertisementScreen`. Tous les résultats sont désormais soit traités
  dans un constat F2-1…F2-9, soit déjà mémoïsés.
- Deux résultats de cette recherche ne sont **pas** des défauts et ne figurent
  donc pas au tableau : `MessagesScreen` et `ConversationThreadScreen` n'ont
  qu'un `keyExtractor` inline, leur `renderItem` étant correctement mémoïsé.
  L'impact d'un `keyExtractor` inline seul est négligeable — il n'entre pas
  dans la comparaison du `CellRenderer` — et se corrige en une ligne au passage.
- Les écrans les plus fréquentés — `TweetsScreen`, `NotificationsScreen`,
  `MessagesScreen`, `ProfileScreen`, `UserProfileScreen`, `FeedGutterScreen` —
  ont tous des `renderItem` et `keyExtractor` correctement mémoïsés. Le défaut
  se concentre sur les écrans secondaires et, malheureusement, sur les deux
  écrans vidéo/live (F2-8 et le présent constat), qui sont justement les plus
  sensibles.

---

# F2 — SYNTHÈSE DE SECTION

## Les constats, par gain décroissant

| # | Où | Défaut | Gravité |
|---|---|---|---|
| F2-8 | `twitninfvideo.tsx` | fil vidéo : toutes les cartes (avec leur `<Video>`) re-rendues à chaque glissé | **CRITIQUE** |
| F2-1 | `CommentSheet.tsx` | chaque frappe re-rend tous les commentaires et remonte tous les séparateurs | **CRITIQUE** |
| F2-7 | `CreateTweetScreen.tsx` | `Animated.sequence` de 200 ms relancée à chaque caractère | **MAJEUR** |
| F2-4 | `ConversationThreadScreen.tsx` | toutes les bulles re-rendues à chaque message | **MAJEUR** |
| F2-5 | `ConversationThreadScreen.tsx` | closure périmée : l'accusé « Vu » n'apparaît jamais à temps | **MAJEUR** |
| F2-3 | `TweetRow` + `TweetRowGutter` | `tweet.author` absent des comparateurs : avatar/premium/certif figés | **MAJEUR** |
| F2-3 bis | `TweetCard.tsx` | `premium` et `subscription_tier` manquent aux **trois** comparateurs | **MAJEUR** |
| F2-2 | `LiveViewerScreen.tsx` | chat du live : tout le chat re-rendu à chaque message | **MAJEUR** |
| F2-9 | `GoLiveScreen.tsx` | idem côté diffuseur, **plus** la frappe, **pendant** l'encodage vidéo | **MAJEUR** |
| F2-6 | `SearchScreen.tsx` | 40 résultats non virtualisés re-rendus à chaque frappe + 5 `Animated.View` inertes | **MAJEUR** |
| F2-9 | `SendCoinsModal`, `ImageViewerPaper` | `renderItem` inline sur un déclencheur fréquent | MODÉRÉ |
| F2-9 | 6 écrans secondaires | `renderItem` inline, déclencheur rare | mineur |

## Ce qu'il faut en retenir

**Un seul mécanisme explique la moitié du rapport.** Un `renderItem` inline
donne une identité neuve à chaque rendu ; le `CellRenderer` de
`VirtualizedList` est une `PureComponent` ; il re-rend donc toutes les cellules
montées. Ce mécanisme, à lui seul, produit F2-1, F2-2, F2-4, F2-8 et F2-9.

**Ce mécanisme est déjà parfaitement compris dans ce dépôt.** Il est nommé,
commenté et neutralisé dans `TweetsScreen`, `NotificationsScreen`,
`ProfileScreen`, `UserProfileScreen` et `ConversationThreadScreen` — ce dernier
portant même le commentaire le plus clair du dépôt sur le sujet
(`:1286-1289`). Le problème n'est pas un manque de connaissance : c'est que la
leçon n'a jamais quitté le fil d'accueil. **Elle n'a atteint aucun des quatre
écrans vidéo/live et messagerie**, qui sont pourtant les plus exigeants.

**Le même schéma se répète pour les comparateurs.** `TweetCard` compare
l'auteur, avec le commentaire qui explique pourquoi ; `TweetRow` et
`TweetRowGutter` ne le font pas. Là encore : correctif trouvé une fois, non
propagé.

**Recommandation transverse, avant les correctifs individuels.** Les trois
quarts de ces constats disparaîtraient à l'écriture avec deux garde-fous :

1. **Activer ESLint avec `react-hooks/exhaustive-deps` en erreur.** Vérifié :
   ce dépôt n'a **aucune** configuration ESLint (ni `.eslintrc*`, ni
   `eslint.config.*`, ni script `lint` dans `package.json`). F2-5 — la faute la
   plus difficile à trouver de cette section, et la seule qui produise un bug
   fonctionnel invisible en relecture — aurait été signalée automatiquement.
2. **Un `sameAuthor()` partagé**, importé par les trois composants de ligne,
   pour que le prochain champ d'auteur ajouté à l'interface ne soit pas à
   nouveau oublié dans deux comparateurs sur trois.

## Ce que j'ai vérifié et trouvé SAIN

Cette liste est aussi importante que les constats : elle borne ce qui a été
regardé, et elle évite qu'une passe suivante refasse le travail.

- **Les 9 fournisseurs de `src/contexts/`** : toutes les valeurs de contexte
  sont mémoïsées. Vérifiés un par un. C'est la première chose qu'on cherche
  dans un audit de re-rendus, et il n'y a rien.
- **`TweetsScreen`** (l'écran le plus regardé) : `rowContext` en `useMemo`,
  `handleRowAction` en `useCallback` avec `tweetsRef`, `renderTweet` et
  `keyExtractor` en `useCallback`. Sain.
- **`NotificationsScreen`** : le meilleur exemple du dépôt (détail en F2-3 bis).
- **`ProfileScreen`, `UserProfileScreen`, `MessagesScreen`** : mémoïsation
  correcte, dépendances stables.
- **`TweetRowGutter`** : comparateur complet sur ses 11 props, avec exclusion
  de `stats.views` documentée et justifiée (2B n'affiche plus les vues). Le
  seul manque est `author`, traité en F2-3.
- **`babel.config.js`** : `transform-remove-console` en production avec
  `exclude: ['warn','error']`. Les 323 `console.log` de `src/` ne pèsent donc
  rien en release — y compris celui, par tweet rendu, de `SearchScreen:856`.
- **`src/utils/litPulse.ts`** : horloge **singleton de module**, pilote natif,
  partagée par tous les noms lumineux et toutes les pastilles de certification.
  Une seule `Animated.loop` pour l'application entière, quel que soit le nombre
  d'éléments montés, et une phase commune par construction. C'est la meilleure
  pièce de code que cet audit ait rencontrée : à citer en exemple, et surtout à
  ne pas « simplifier » un jour par une boucle par composant.
- **`AnimatedNameFill`** (`ProfileDecoration.tsx:619`) : la dérive du dégradé
  est explicitement coupée quand le nom n'a pas d'effet
  (`useDrift(2600, 0, effect !== 'none')`), avec le commentaire qui précise que
  c'est justement pour ne pas lancer une boucle par ligne montée dans le fil.
  Exactement le bon réflexe, au bon endroit.
- **`ImageViewerPaper`** : `runOnJS` correctement utilisé pour tout retour d'un
  worklet vers React, et `applyZoom` appelé aux bornes du geste seulement.

### Deux réserves mineures, signalées sans être des constats

- `litPulse()` construit une nouvelle `AnimatedInterpolation` à chaque appel, y
  compris dans `AnimatedNameFill` quand `effect === 'none'` (`:651`) — donc
  pour chaque nom du fil, à chaque rendu, alors que le résultat est ensuite
  inutilisé. C'est une allocation d'objet JS, négligeable en soi ; la déplacer
  sous le `if (effect === 'none') return label;` la supprimerait gratuitement.
- La boucle de `getDriver()` (`litPulse.ts:25-33`) n'est **jamais arrêtée** :
  une fois un nom lumineux monté, elle tourne pour toute la durée de vie de
  l'application, même quand plus aucun élément lumineux n'est à l'écran. Sur
  pilote natif le thread JS n'en souffre pas — c'est le point fort du design —
  mais le driver natif continue de tourner en permanence. Impact batterie
  probablement faible ; **non mesuré**, et je ne recommande pas de toucher à ce
  fichier sur la foi d'une hypothèse : c'est à vérifier au profileur avant
  toute chose, et à ne changer que si la mesure le justifie.

## Limites de cette section

- Aucune mesure sur appareil : tout est établi par lecture du code. Les ordres
  de grandeur (« ~15 lignes », « ~10 lecteurs vidéo ») sont déduits des valeurs
  par défaut de React Native et des `limit` des appels API, pas chronométrés.
- Les gros composants non-liste `UserStatsTab` (2 379 l., 12 `useState`) et
  `NavbarOnboardingModal` (1 121 l.) n'ont fait l'objet que d'un survol : ni
  boucle d'animation ni `setInterval`, donc pas de re-rendu périodique. Leur
  découpage interne n'a pas été analysé — écrans peu fréquentés, gain attendu
  faible.
- `ForgeScreen`, `WalletScreen` et `TradingScreen` : survolés, aucun défaut du
  type « état placé trop haut » avec un déclencheur fréquent. `TradingScreen`
  a un `setInterval` de 30 s qui n'est pas suspendu quand l'écran perd le focus
  (`:72-78`) — c'est un sujet **réseau**, renvoyé à R2.
