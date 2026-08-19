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

---

## R2-3 — Aucun cache, aucune déduplication : la messagerie télécharge trois fois la même liste — MAJEUR

`src/services/api.ts:314-341` (le socle) et
`unreadService.ts:24` / `MessagesScreen.tsx:109` /
`ConversationThreadScreen.tsx:699` (les conséquences)

### Le socle : `apiService` n'a ni cache ni déduplication

Recherche faite sur l'intégralité de `src/services/api.ts` (2 904 lignes) pour
`cache`, `dedup`, `inFlight`, `pending`, `AbortController` :

- **aucun cache de réponse**, à aucun niveau ;
- **aucune déduplication des requêtes en vol** — deux appels identiques lancés
  à une seconde d'intervalle partent deux fois ;
- **aucune annulation pilotée par l'appelant**. L'unique `AbortController`
  (`:325-328`) est créé par requête et n'est branché qu'au **timeout**, avec
  un commentaire qui explique clairement ce rôle :
  > « `AbortController` plutôt que `Promise.race` : sans lui, la requête
  > continuait en arrière-plan après le timeout et alimentait pour rien les
  > compteurs de cadence côté anti-fraude. »

  C'est juste, et c'est un bon réflexe — mais `makeRequest` (`:341`) n'accepte
  pas de `signal` de l'appelant. **Quitter un écran n'annule donc rien** : les
  requêtes en vol vont jusqu'au bout, et leurs `setState` retombent sur des
  composants démontés.

Chaque appel part donc au réseau, à chaque fois, sans exception.

### La conséquence la plus visible : `/api/messages/conversations`

Cette route — qui renvoie **toutes** les conversations, sans pagination
(établi en F3-3) — est appelée depuis **trois endroits distincts** :

| Appelant | Ce qu'il en veut | Fréquence |
|---|---|---|
| `unreadService.ts:24` | un compteur (R2-1) | **toutes les 30 s** |
| `MessagesScreen.tsx:109` | la liste elle-même — **usage légitime** | à chaque ouverture de l'onglet |
| `ConversationThreadScreen.tsx:699` | **uniquement les participants d'UNE conversation** | à chaque ouverture d'une conversation |

Le parcours le plus banal de la messagerie — ouvrir l'onglet Messages, puis
toucher une conversation — déclenche donc **le téléchargement complet de la
liste des conversations deux fois en l'espace de quelques secondes**, plus une
troisième fois si le sondage de 30 s tombe entre les deux. Rien ne les
mutualise.

Le troisième appel est le plus discutable. `ConversationThreadScreen` charge
tout l'annuaire des conversations pour y **retrouver** celle qu'il vient
d'ouvrir et en extraire les participants :

```tsx
const convRes = await apiService.get('/api/messages/conversations');       // :699
if (convRes?.success && Array.isArray(convRes?.conversations)) {
  const conv = convRes.conversations.find((c) => c?.id === conversationId); // ← un seul élément retenu
  …
}
// … puis SEULEMENT après :
const res = await apiService.get(`/api/messages/conversations/${conversationId}/messages`);  // :729
```

**Et les deux appels sont en série.** Le second n'attend pourtant rien du
premier : l'identifiant de conversation est connu depuis la navigation. Ce sont
donc deux allers-retours réseau consécutifs avant que le premier message ne
puisse s'afficher, dont le premier est une liste complète dont on ne garde
qu'une entrée.

### Effet concret pour l'utilisateur

Ouvrir une conversation est lent, et d'autant plus lent qu'on a de
conversations — alors que le nombre de conversations n'a aucun rapport avec
celle qu'on ouvre. C'est cumulatif avec **F3-2** (l'historique complet chargé
sans pagination, puis parcouru en défilement) : ces deux constats décrivent le
même écran, et leurs coûts s'additionnent sur le même chemin.

S'y ajoute la consommation de données : la liste des conversations est
retéléchargée à chaque navigation dans la messagerie, plus 120 fois par heure
pour le badge.

### Correctif

**1. Le plus simple et le plus rentable — supprimer le premier appel de
`ConversationThreadScreen`.** Les participants d'une conversation devraient
venir soit avec les messages (`GET …/:id/messages` peut les joindre), soit
d'une route unitaire `GET /api/messages/conversations/:id`. Dans les deux cas
on passe de deux allers-retours en série à un seul. **C'est le gain le plus
direct sur l'ouverture d'une conversation.**

En attendant la route, un repli immédiat côté mobile : les paramètres de
navigation portent déjà de quoi afficher l'en-tête (titre, avatar) —
`MessagesScreen` les a lus juste avant. Les passer en paramètres de route
permet d'afficher l'écran tout de suite et de ne demander que les messages.

**2. Un cache court dans `apiService`.** Les trois appels visent la même URL à
quelques secondes d'intervalle. Un cache mémoire de courte durée sur les `GET`
suffirait à en supprimer deux :

```ts
const cache = new Map<string, { at: number; data: any }>();
const inFlight = new Map<string, Promise<any>>();

async function cachedGet(endpoint: string, ttlMs = 10_000) {
  const hit = cache.get(endpoint);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;      // cache
  const flying = inFlight.get(endpoint);
  if (flying) return flying;                                     // déduplication
  const p = makeRequest(endpoint)
    .then((data) => { cache.set(endpoint, { at: Date.now(), data }); return data; })
    .finally(() => inFlight.delete(endpoint));
  inFlight.set(endpoint, p);
  return p;
}
```

La **déduplication des requêtes en vol** (la `Map` `inFlight`) est la moitié la
plus précieuse : elle ne périme jamais rien, ne peut pas servir de donnée
obsolète, et supprime à elle seule les doublons simultanés. Elle peut être
adoptée sans le cache, et **c'est ce que je recommanderais en premier** — un
cache mal réglé sur une messagerie afficherait des messages périmés, la
déduplication ne le peut pas.

*Précaution* : n'appliquer cache et déduplication qu'aux `GET`, jamais aux
écritures.

**3. Accepter un `signal` dans `makeRequest`**, pour que les écrans puissent
annuler à la sortie :

```ts
private async makeRequest(endpoint, options: { …; signal?: AbortSignal } = {}) { … }
// combiné au signal du timeout via AbortSignal.any([timeoutSignal, options.signal])
```

Côté écran : `useEffect(() => { const ac = new AbortController(); load(ac.signal); return () => ac.abort(); }, [...])`.
Bénéfice double — la bande passante est rendue à l'écran suivant, et les
`setState` sur composant démonté disparaissent.

### Constat voisin, petit et immédiat : un sondage qui ne se suspend pas

`src/screens/TradingScreen.tsx:72-78`

```tsx
const interval = setInterval(() => { loadMarketData(true); }, 30000);
return () => clearInterval(interval);
```

Le nettoyage au démontage est correct, mais l'écran reste **monté** tant qu'il
est dans la pile de navigation : le sondage continue donc à tourner toutes les
30 secondes alors que l'utilisateur est parti ailleurs, et même quand
l'application passe en arrière-plan.

Le dépôt a exactement l'outil qu'il faut, déjà écrit et déjà utilisé par la
barre d'onglets : **`useForegroundInterval`**, qui suspend le sondage hors
premier plan. Le correctif est un remplacement d'une ligne :

```tsx
useForegroundInterval(React.useCallback(() => { loadMarketData(true); }, [timeframe]), 30000);
```

Idéalement combiné à `useIsFocused()` pour suspendre aussi quand l'écran est
seulement masqué par un autre. **Cinquième occurrence du schéma « l'outil
existe, il n'a pas été propagé ».**

### Ce que j'ai vérifié et trouvé SAIN

- L'`AbortController` du timeout (`api.ts:325-328`) est un vrai bon réflexe,
  motivé par un problème réel côté anti-fraude. Le manque n'est pas
  l'annulation en soi, c'est qu'elle ne soit pas exposée à l'appelant.
- `MessagesScreen.tsx:109` est un usage **parfaitement légitime** de la route :
  c'est l'écran qui affiche cette liste. Il n'est cité que comme l'un des
  trois appelants, pas comme un défaut.
- `TweetDetailScreen.tsx:502` fait l'inverse du défaut décrit ici : un
  `Promise.all` qui charge le tweet et ses réponses **en parallèle**. À citer
  en exemple.
- `useForegroundInterval` existe, suspend correctement en arrière-plan, et est
  utilisé aux deux endroits de la barre d'onglets.

---

## R2-4 — Quatre listes se téléchargent en entier, sans pagination — et la 21e réponse d'un tweet est physiquement inatteignable — MAJEUR

`src/screens/ConversationThreadScreen.tsx:729`,
`src/screens/MessagesScreen.tsx:109`,
`src/services/storiesService.ts:100`,
`src/components/CommentSheet.tsx:397`,
`src/screens/TweetDetailScreen.tsx:504`

### Ce qui se passe

Cinq points d'entrée réseau demandent une collection **sans aucun paramètre de
pagination**, ou avec un plafond figé en dur. Vérifié un par un dans le code :

| Appel | Ligne | Paramètres envoyés | Conséquence |
|---|---|---|---|
| Messages d'une conversation | `ConversationThreadScreen:729` | **aucun** | tout l'historique à chaque ouverture |
| Liste des conversations | `MessagesScreen:109` | **aucun** | toutes les conversations, avec leurs participants |
| Fil des stories | `storiesService.ts:100` | **aucun** | tous les groupes de stories |
| Commentaires (feuille) | `CommentSheet:397` | `{ nested: true, limit: 100 }` | plafond brut, pas de suite |
| Réponses (page détail) | `TweetDetailScreen:504` | `{ limit: 20, offset: 0 }` | **`offset` figé à 0** |

```tsx
// ConversationThreadScreen.tsx:729 — aucune borne
const res = await apiService.get(`/api/messages/conversations/${conversationId}/messages`);

// MessagesScreen.tsx:109 — aucune borne
const convRes = await apiService.get('/api/messages/conversations');

// storiesService.ts:100 — aucune borne
const res = await apiService.get('/api/stories/feed');
```

### L'effet concret

**1. La conversation.** Une conversation active de plusieurs mois se
retélécharge **intégralement** à chaque ouverture de l'écran, et à chaque
retour dessus. Sur une messagerie, c'est la collection qui grossit le plus
vite et qui ne cesse jamais de grossir : c'est le seul endroit de
l'application où la lenteur s'aggrave mécaniquement avec l'ancienneté du
compte. Un utilisateur fidèle est puni pour sa fidélité. À rapprocher de
**F3-2** (`ConversationThreadScreen`, constat CRITIQUE de la section listes) :
la même donnée non bornée est ensuite montée sans virtualisation — le défaut
réseau et le défaut de rendu se multiplient au lieu de s'additionner.

**2. La liste des conversations.** Non bornée elle aussi, et — voir **R2-1** et
**R2-3** — téléchargée depuis **trois** endroits différents, dont un sondage
toutes les 30 secondes sur tous les écrans. C'est le seul endroit du dépôt où
l'absence de pagination et la duplication d'appel se cumulent.

**3. Les commentaires.** `limit: 100` sans « charger plus » : au-delà de 100
réponses, la feuille de commentaires affiche silencieusement une vue tronquée,
sans jamais l'indiquer à l'utilisateur.

**4. La 21e réponse est inatteignable.** C'est le point le plus grave, et ce
n'est plus une question de vitesse mais un **manque fonctionnel** :
`TweetDetailScreen:504` demande `{ limit: 20, offset: 0 }`, `offset` est une
**constante littérale** ; `grep offset` sur tout le fichier ne renvoie que
trois occurrences, toutes `offset: 0` (`:371`, `:435`, `:504`), et
`grep onEndReached|loadMore|hasMore` sur le fichier ne renvoie **rien**. Il n'y
a donc aucun chemin de code, quel que soit le geste de l'utilisateur, qui
puisse demander la réponse n°21. Sur un tweet populaire, les réponses
existent, le serveur sait les servir (`getTweetReplies` accepte bien `offset`,
`api.ts:1453`), et l'application ne les demandera jamais.

### Ce qui rend le correctif facile

Le contrat est **déjà prêt côté API** : `api.ts:1453` déclare

```ts
async getTweetReplies(id, params?: { limit?; offset?; nested? })
  : Promise<ApiResponse<{ replies: Tweet[]; pagination: PaginationInfo }>>
```

Le type de retour comporte déjà `pagination: PaginationInfo`. La réponse du
serveur contient donc l'information nécessaire pour savoir s'il reste des
pages — **elle est reçue, typée, et jetée**. Il n'y a rien à négocier avec le
serveur pour les réponses : juste à lire ce qu'il renvoie déjà.

### Le correctif

**Priorité 1 — les réponses (manque fonctionnel, correctif local) :**

```tsx
const [replyOffset, setReplyOffset] = useState(0);
const [hasMoreReplies, setHasMoreReplies] = useState(false);

const loadMoreReplies = useCallback(async () => {
  const rep = await apiService.getTweetReplies(tweetId, { limit: 20, offset: replyOffset });
  setReplies(prev => [...prev, ...(rep.data?.replies ?? [])]);
  setReplyOffset(o => o + 20);
  setHasMoreReplies(!!rep.data?.pagination?.hasMore);   // déjà dans la réponse
}, [tweetId, replyOffset]);
```
branché sur `onEndReached` de la liste, avec `onEndReachedThreshold={0.5}`.
Même schéma pour `CommentSheet:397`, en descendant `limit: 100` à 20.

**Priorité 2 — les messages d'une conversation :** paginer **par le haut**
(les N derniers messages, puis remonter au défilement), pas par le bas. C'est
le sens de lecture d'une messagerie, et cela rend le premier affichage
constant quel que soit l'âge de la conversation. Demande une évolution côté
serveur (`before=<timestamp>&limit=50`) — à traiter avec F3-2, dont c'est la
moitié manquante.

**Priorité 3 — liste des conversations et fil des stories :** un `limit`
généreux (50) suffit, avec `onEndReached` pour la suite. Ces deux collections
grossissent lentement ; le gain est réel mais moindre.

### Réserve honnête sur la priorisation

Je n'ai **aucune mesure de volume** pour ces cinq collections. Le seul chiffre
de volume réel du dépôt est **~977 tweets vivants en production**
(`ExploreWall.tsx:191`) : à cette échelle, la liste des conversations et le fil
des stories ne sont probablement **pas** un problème aujourd'hui. Je maintiens
malgré tout le classement MAJEUR, pour deux raisons qui ne dépendent pas du
volume :

- la **21e réponse** est inatteignable dès aujourd'hui, quel que soit le
  nombre d'utilisateurs — c'est une constante de code, pas une question
  d'échelle ;
- l'historique d'une conversation est la seule collection qui croît **sans
  jamais décroître**, donc la seule dont le coût est certain de se dégrader.

Les points 3 (stories) et la liste des conversations relèvent de la dette
prudente, pas de l'urgence.

---

## R2-5 — Une chaîne de 4 requêtes en série, rejouée à chaque « j'aime » — mais aujourd'hui inatteignable — MINEUR (latent)

`src/screens/TweetDetailScreen.tsx:345-484`

### Ce qui se passe

`loadProgressiveInfo` enchaîne **quatre allers-retours réseau strictement en
série**, chacun attendant le précédent alors qu'aucun ne dépend de son
résultat :

```tsx
const response = await progressiveRecommendationService.getAlgorithmInfo();        // :355
if (response && response.success) {
  const userStats  = await progressiveRecommendationService.getUserInteractionStats();      // :360
  const tweetStats = await progressiveRecommendationService.getTweetViralityStats(tweet.id); // :365
  const progressiveRecommendations =
    await progressiveRecommendationService.getProgressiveRecommendations({…});              // :369
```

Les trois derniers ne partagent que `tweet.id`, connu d'avance : ils sont
parallélisables tels quels. C'est **l'exact inverse** du bon patron écrit
70 lignes plus bas dans le même fichier (`:502`, le `Promise.all` cité en
exemple en R2-3) — deuxième occurrence, dans un seul fichier, du schéma
« le bon réflexe existe, il n'a pas été propagé ».

### L'amplificateur : la chaîne est rejouée à chaque interaction

```tsx
useEffect(() => {
  if (currentAlgorithm === 'progressive' && tweet) loadProgressiveInfo();
}, [currentAlgorithm, tweet]);       // :480-484
```

La dépendance est l'**objet** `tweet`, pas `tweet.id`. Or `handleLike`
(`:567`) et `handleRetweet` (`:595`) construisent chacun un objet neuf en mise
à jour optimiste — et un second en cas d'échec pour revenir en arrière. Chaque
« j'aime » et chaque retweet relance donc les **4 requêtes en série** ; un
échec réseau les relance **deux fois**. Un utilisateur qui aime puis retweete
déclenche 8 allers-retours séquentiels sans avoir rien demandé.

### Pourquoi c'est classé MINEUR malgré tout — et ce que ça révèle vraiment

**Cette chaîne ne peut pas se déclencher sur une installation neuve.**
Vérifié : `currentAlgorithm` vaut `'smart'` à l'initialisation (`:265`) et
n'est jamais écrit ailleurs que depuis `AsyncStorage.getItem('selectedAlgorithm')`
(`:335`) ; or un `grep selectedAlgorithm` sur tout `src/` ne trouve que **deux
écritures**, `TweetsScreen:525` et `FeedGutterScreen:566`, qui écrivent toutes
deux la valeur `'neural_rank'`. Aucun code du dépôt n'écrit `'progressive'`.

Deux conséquences, et la seconde est la plus intéressante :

1. **Le risque résiduel est réel mais borné.** `AsyncStorage` ne s'efface pas
   à la mise à jour de l'application : un appareil sur lequel une version
   antérieure a écrit `'progressive'` porte encore cette valeur, indéfiniment,
   et il n'existe **aucune migration** qui la nettoie. Ces utilisateurs-là
   subissent la chaîne aujourd'hui. Je ne peux pas estimer combien ils sont
   depuis le code seul.
2. **Tout un pan d'interface est mort sans que rien ne le signale.** Le bloc
   `{currentAlgorithm === 'progressive' && (…)}` (`:773`), le bouton de
   rechargement (`:1376`), les quatre `setProgressiveInfo` : plus rien de tout
   cela ne peut s'afficher sur une installation courante. Ce n'est plus un
   défaut de rapidité réseau, c'est du **code mort porteur d'un piège** — le
   jour où quelqu'un réactive `'progressive'`, il hérite en même temps de la
   chaîne sérielle et du redéclenchement à chaque « j'aime ».

### Le correctif

Deux lignes, quel que soit l'avenir de la fonctionnalité :

```tsx
const [userStats, tweetStats, progressiveRecommendations] = await Promise.all([
  progressiveRecommendationService.getUserInteractionStats(),
  progressiveRecommendationService.getTweetViralityStats(tweet.id),
  progressiveRecommendationService.getProgressiveRecommendations({…}),
]);
```
et `}, [currentAlgorithm, tweet?.id]);` en dépendance de l'effet — c'est
`tweet.id` qui commande ce chargement, pas l'objet.

**Décision à prendre en amont, et c'est elle qui compte** : soit la
fonctionnalité « progressive » revient, et il faut alors un chemin qui écrive
la valeur ; soit elle est abandonnée, et il faut supprimer les ~130 lignes
(`:344-484`, `:773`, `:1376-1400`) **et** purger la clé `selectedAlgorithm`
des appareils qui la portent encore. Le laisser en l'état est le seul choix
qui garde les inconvénients des deux.

Au passage, `loadProgressiveInfo` journalise les réponses complètes en clair
(`console.log('📡 Réponse getAlgorithmInfo:', response)`, `:356`, `:362`,
`:366`, `:375`) — à revoir avec le point « journaux » de la section S3.
