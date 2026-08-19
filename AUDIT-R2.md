# AUDIT R2 — RAPIDITÉ : réseau

Section **EN COURS**. Les constats sont ajoutés un par un, chacun poussé dès
qu'il est vérifié. Ordre du fichier = ordre de gain décroissant.

---

## R2-1 — Le badge « messages non lus » retélécharge toute la liste des conversations, toutes les 30 secondes, sur tous les écrans — CRITIQUE

`src/services/unreadService.ts:22-45` et
`src/navigation/BottomTabNavigator.tsx:88-97`

### Ce qui se passe

La barre d'onglets est montée en permanence, au-dessus de **tous** les écrans
(`position: absolute`, voir `CLAUDE.md`). Elle rafraîchit ses deux badges
toutes les 30 secondes :

```tsx
const refreshCounts = React.useCallback(async () => {
  const [notifCount, msgCount] = await Promise.all([
    unreadService.getNotificationsUnreadCount(),
    unreadService.getMessagesUnreadCount(),
  ]);
  …
}, []);

useForegroundInterval(refreshCounts, 30000);        // :97
```

Les deux compteurs partent bien **en parallèle** (`Promise.all`) — c'est
correct. Le problème est **ce que fait chacun**, et le contraste entre les deux
est saisissant :

```ts
// unreadService.ts:48-56 — LE BON MODÈLE
async function getNotificationsUnreadCount(): Promise<number> {
  const res = await apiService.getUnreadNotificationsCount();   // ← endpoint dédié
  return Number(res.data?.unread_count ?? 0) || 0;              // ← le serveur compte
}

// unreadService.ts:22-45 — LE MAUVAIS
async function getMessagesUnreadCount(): Promise<number> {
  const res  = await apiService.get('/api/messages/conversations');  // ← TOUTE la liste
  const list = res?.success ? res.conversations || [] : [];
  const me   = await apiService.getCurrentUser();                    // ← EN SÉRIE, et déjà connu
  const meId = me?.id ? String(me.id) : null;

  return list.reduce((count, conv) => { /* … comptage côté client … */ }, 0);
}
```

**Le compteur de notifications demande un nombre au serveur. Le compteur de
messages télécharge toute la base de conversations et compte lui-même.** Les
deux alimentent le même bandeau, à la même seconde, dans le même fichier.

### Trois défauts cumulés

1. **Sur-récupération massive.** `/api/messages/conversations` renvoie la
   **totalité** des conversations — établi en F3-3 : cette route est appelée
   sans `limit` ni `offset` nulle part dans le dépôt. Chaque entrée porte ses
   participants, son dernier message, ses horodatages de lecture. Tout cela
   est téléchargé, parsé — **pour produire un seul entier**.

2. **Un second aller-retour, en série, pour une donnée déjà en mémoire.**
   `await apiService.getCurrentUser()` (`:24`) ne sert qu'à obtenir `me.id`,
   afin d'exclure les messages que l'utilisateur a lui-même envoyés. Or
   l'identifiant de l'utilisateur courant est **déjà** dans `AuthContext`, dont
   la barre d'onglets est un descendant. C'est un aller-retour réseau complet,
   toutes les 30 secondes, pour une valeur disponible localement — et il ne
   peut même pas partir en parallèle du premier puisqu'il est écrit après un
   `await`.

3. **La fréquence multiplie tout.** 30 secondes, c'est **120 fois par heure**,
   sur tous les écrans, tant que l'application est au premier plan.

En comptant le troisième sondage de la barre — `liveService.getLives()`, lui
aussi à 30 s (`BottomTabNavigator.tsx:70-81`) — **la barre d'onglets émet à
elle seule 4 requêtes toutes les 30 secondes**, dont deux entièrement
évitables.

### Effet concret pour l'utilisateur

- **Consommation de données continue et invisible.** Un compte avec beaucoup
  de conversations retélécharge sa liste complète 120 fois par heure. Sur un
  forfait mobile, c'est le genre de fuite qu'on ne peut pas attribuer à un
  geste : l'application consomme « en restant ouverte ».
- **Batterie.** Quatre réveils radio toutes les 30 secondes empêchent le modem
  de se rendormir. C'est l'un des postes de consommation les plus coûteux sur
  mobile, bien avant le rendu.
- **Concurrence avec ce que l'utilisateur regarde.** Ces requêtes partent
  pendant qu'il fait défiler le fil ou lit une conversation. Sur un réseau
  contraint, elles disputent la bande passante au contenu attendu.
- **Le symptôme grossit avec l'usage.** Plus l'utilisateur est actif, plus il a
  de conversations, plus le badge coûte cher. Encore une fois le mauvais sens :
  ce sont les comptes les plus engagés qui paient le plus.

### Correctif

**1. Un endpoint dédié — le geste principal.** Le modèle existe déjà dans le
même fichier, dix lignes plus bas :

```ts
async function getMessagesUnreadCount(): Promise<number> {
  const res = await apiService.getUnreadMessagesCount();   // GET /api/messages/unread-count
  return Number(res.data?.unread_count ?? 0) || 0;
}
```

Le calcul actuel (`:29-42`) est de toute façon plus juste côté serveur : il
compare `last_message.created_at` à `last_read_at`, deux champs que le serveur
possède et peut agréger en une requête SQL. **Cela demande une route côté API**
— c'est le seul travail réel de ce constat, et il est petit : la route jumelle
pour les notifications existe déjà et sert de patron.

**2. En attendant la route, deux correctifs immédiats, purement côté mobile :**

- **Supprimer le `getCurrentUser()`.** Passer l'identifiant depuis
  `AuthContext` :
  ```ts
  async function getMessagesUnreadCount(meId: string | null): Promise<number> { … }
  // appelé depuis la navbar, qui a déjà `user` par useAuth()
  ```
  Un aller-retour réseau sur deux disparaît, sans rien attendre du serveur.

- **Espacer le sondage.** 30 secondes pour un badge de messages est très
  serré, d'autant que **le rafraîchissement immédiat existe déjà** :
  `unreadService.subscribe(refreshCounts)` (`BottomTabNavigator.tsx:100`)
  permet à un écran de forcer la mise à jour après une lecture, et
  l'en-tête du fichier le revendique explicitement (« au lieu d'attendre le
  prochain polling »). Le sondage n'est donc qu'un filet : 2 à 5 minutes
  suffisent. **Passer de 30 s à 3 min divise le coût par six**, en une ligne.

**3. Le meilleur : ne plus sonder du tout pour les messages.** Le dépôt a déjà
une connexion socket pour la messagerie (`ConversationThreadScreen:820`,
événements `read:update`, arrivée de messages). Un événement serveur sur
« nouveau message » suffirait à tenir le badge à jour sans aucun sondage. C'est
le plus gros chantier des trois, et de loin le plus propre.

### Ordre recommandé

Supprimer le `getCurrentUser()` et passer l'intervalle à 3 minutes (deux
lignes, aucun risque, gain immédiat d'un facteur ~12 sur ce chemin), puis
ouvrir la route dédiée, puis envisager le socket.

### Ce que j'ai vérifié et trouvé SAIN

- **`useForegroundInterval` suspend bien les sondages quand l'application
  passe en arrière-plan** (le commentaire `BottomTabNavigator.tsx:69` le
  revendique, et le nom du hook l'indique). Sans cela le constat serait bien
  plus grave : le sondage ne tourne pas en poche.
- Les deux compteurs partent en `Promise.all` (`:89-92`) : ils ne s'attendent
  pas l'un l'autre.
- `getNotificationsUnreadCount` (`:48-56`) est **exemplaire** : un endpoint
  dédié, un entier, le comptage fait par le serveur. C'est le patron à
  recopier.
- `unreadService` est bien une **source unique de vérité** avec un mécanisme
  d'abonnement pour le rafraîchissement immédiat après lecture. L'architecture
  est bonne ; c'est une seule de ses deux implémentations qui ne l'est pas.
- Les deux fonctions avalent leurs erreurs et renvoient `0` : une panne réseau
  ne fait pas tomber la barre d'onglets.

---

## R2-2 — Sur-récupération : 500 profils complets téléchargés pour construire une liste d'identifiants — MAJEUR

`src/screens/TweetsScreen.tsx:902-913` (et `src/services/api.ts:2239-2246`)

### Ce qui se passe

Au premier affichage du fil d'accueil — l'écran le plus regardé de
l'application :

```tsx
const fetchFollowing = async () => {
  if (!user?.id) return;
  const res = await apiService.getUserFollowing(user.id, { limit: 500 });   // :905
  if (res?.success && Array.isArray(res.data.following)) {
    const ids = new Set<string>();
    ids.add(user.id);
    for (const u of res.data.following) { if (u && u.id) ids.add(u.id); }   // ← on ne garde QUE l'id
    setFollowingIds(ids);
  }
};
```

La signature de la route est explicite (`api.ts:2242-2246`) : elle renvoie
`following: User[]`, c'est-à-dire des **objets utilisateur complets**. Le fil
en demande **500**, puis **jette tout sauf `u.id`**.

### Ce qui ne va pas

Un `User` de ce dépôt porte au minimum `id`, `username`, `full_name`,
`avatar`, `verified`, `verification_style`, `premium`, `subscription_tier` et
`profile_customization` — ce sont les champs que les comparateurs du fil
énumèrent (voir F2-3). En comptant large, **entre 150 et 400 Ko de JSON** sont
téléchargés et parsés pour produire un ensemble d'identifiants qui, lui,
pèserait quelques kilo-octets.

Et c'est bien un ensemble d'identifiants qui est utilisé, rien d'autre :
`followingIds` ne sert qu'à trois choses (`:1884`, `:1907`, `:2003`), toutes
des tests d'appartenance `followingIds.has(authorId)` pour savoir s'il faut
proposer « suivre » dans la vue Explorer immersive.

**Le plafond de 500 est en outre un plafond silencieux** : un compte qui suit
plus de 500 personnes verra le bouton « suivre » proposé pour des comptes
qu'il suit déjà, au-delà du 500e. Aucune pagination ne compense — c'est un
appel unique.

### Effet concret pour l'utilisateur

Au premier affichage du fil, une requête volumineuse part **en parallèle** de
celle des tweets (c'est bien fait, voir plus bas) — mais elle occupe la bande
passante et le temps d'analyse JSON au moment exact où l'utilisateur attend ses
tweets. Sur un réseau mobile, deux requêtes concurrentes dont l'une est
inutilement dix fois trop grosse, cela retarde la première image.

L'effet grandit avec l'engagement du compte : plus on suit de monde, plus le
fil est long à s'afficher. **Encore le mauvais sens.**

### Correctif

Par ordre de préférence :

1. **Le serveur devrait le dire dans le tweet.** L'information « est-ce que je
   suis cet auteur ? » appartient au tweet, comme `user_interaction.is_liked`
   l'est déjà. Ajouter `author.is_followed` au fil supprime **entièrement** la
   requête. C'est le correctif propre, et il s'aligne sur ce que le dépôt fait
   déjà pour les likes et les retweets.

2. **À défaut, une route légère** : `GET /api/users/:id/following/ids`
   renvoyant `{ ids: string[] }`. Même sémantique, un ou deux ordres de
   grandeur de moins sur le fil.

3. **Correctif immédiat, sans rien attendre du serveur** : si la route accepte
   déjà une sélection de champs, demander `fields=id`. Sinon, au minimum,
   **paginer** pour ne plus perdre silencieusement les abonnements au-delà du
   500e.

### Sur-récupération voisine, même famille : `getCurrentUser()` appelé 16 fois

`getCurrentUser()` compte **16 sites d'appel** dans le dépôt. Cinq sont dans
`AuthContext` — légitimes, c'est lui qui détient la session. Les autres sont
dans des écrans et composants qui sont **tous descendants d'`AuthProvider`** et
pourraient lire `user` par `useAuth()` :

| Fichier | Ce qu'il en fait |
|---|---|
| `MessagesScreen.tsx:105` | l'identifiant courant |
| `ConversationThreadScreen.tsx` (dans `loadMessages`) | l'identifiant courant |
| `CommentSheet.tsx` | l'identifiant courant |
| `NewConversationScreen.tsx` | l'identifiant courant |
| `GroupMembersScreen.tsx` (×2) | l'identifiant courant |
| `unreadService.ts:24` | l'identifiant courant — **toutes les 30 s** (R2-1) |

Chacun est un aller-retour réseau complet pour une donnée déjà en mémoire. Le
plus coûteux est celui d'`unreadService`, traité en R2-1 ; les autres se
paient à chaque ouverture de l'écran concerné.

**Correctif** : remplacer par `const { user } = useAuth()` dans les composants,
et passer l'identifiant en paramètre pour `unreadService` (qui n'est pas un
composant). Aucun changement de comportement, six allers-retours de moins.

*Nuance honnête* : `getCurrentUser()` a un second effet — il rafraîchit le
profil et détecte une session expirée. Ce n'est pas un pur doublon. Mais ce
rôle appartient à `AuthContext`, qui le fait déjà au démarrage ; le refaire à
chaque ouverture d'écran de messagerie n'y ajoute rien.

### Ce que j'ai vérifié et trouvé SAIN — et c'est beaucoup

**L'orchestration réseau du fil d'accueil est bonne, et il faut le dire
clairement** : c'était la priorité n°1 de cette section, et je n'y ai trouvé
aucun défaut de structure. Ce qui suit est vérifié dans le code :

- **Les appels indépendants partent en parallèle**, avec le raisonnement écrit
  dans le code (`TweetsScreen.tsx:955-957`) :
  > « Les deux appels sont indépendants : les enchaîner doublait pour rien le
  > temps d'attente du rafraîchissement. `allSettled` et non `all` : hors
  > ligne, l'échec de `fetchFollowing` faisait remonter une erreur ici et
  > réaffichait le bandeau que le repli sur cache venait d'effacer. »

  Le choix `allSettled` plutôt que `all` est motivé par un bug réel rencontré.
  C'est du travail de qualité.
- **Le chargement initial est lui aussi parallélisé** (`:1033-1040`), même
  commentaire : « Les abonnements et le fil sont indépendants : les lancer en
  parallèle supprime une attente en cascade au premier affichage. »
- **`fetchFollowing` est gardé** : `if (followingIds.size === 0)` (`:1036`) —
  il ne part qu'une fois par session, pas à chaque focus.
- **Chaque onglet a son propre cache** (`tabCacheRef`, `:1027-1029`) :
  basculer entre « Pour toi » et « Abonnements » affiche immédiatement le
  contenu déjà chargé et **ne relance une requête que si le cache est vide**
  (`:1010`). Le commentaire précise que les deux onglets partageaient
  auparavant un tableau unique — corrigé.
- **Un repli sur cache existe** (`servedFromCacheRef`, `:949`) et il est
  articulé avec l'affichage d'erreur pour ne pas montrer un bandeau alors que
  du contenu a pu être servi.
- L'onglet Explorer a son propre état et ne touche jamais le cache du fil
  linéaire.

Autrement dit : **la pagination, la parallélisation, le cache par onglet et le
repli hors ligne sont tous en place sur le fil.** Le seul reproche que je puisse
lui faire est le volume d'une requête, pas la façon dont elles sont
orchestrées.
