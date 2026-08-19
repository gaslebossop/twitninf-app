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
