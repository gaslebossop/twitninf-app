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
