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
