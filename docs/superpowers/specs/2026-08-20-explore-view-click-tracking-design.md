# Suivi vues/clics du mur Explorer + monétisation au clic

Repos concernés : `twitninfbeta` (mobile) et `api` (backend). Fait suite à
[2026-08-18-explore-refonte-design.md](2026-08-18-explore-refonte-design.md),
qui a livré le mur masonry sans aucun tracking de vues.

## Contexte

`ExploreWall.tsx` (mur masonry 2 colonnes, `ScrollView` non virtualisé) ne
fait remonter aucune vue aujourd'hui : ni `view_count`, ni analytics, ni
algo. Le fil principal (`TweetsScreen.tsx`) a déjà tout l'outillage —
`useOptimizedViewTracking` (debounce + batch) branché sur
`onViewableItemsChanged` d'une `FlatList` — mais Explorer n'a pas de
`FlatList` et donc pas de mécanisme de visibilité natif.

Côté paie, `tweetMonetizationService.js` lit directement `tweet.view_count`
— un compteur global unique, partagé par toutes les surfaces (fil, Explorer,
profil...). Aucune distinction par source n'existe.

## Objectifs

1. Détecter la visibilité réelle des cartes dans le mur Explorer (au premier
   rendu ET pendant le scroll) et envoyer les vues par batch, sur le même
   modèle que le fil.
2. À l'ouverture d'un tweet depuis Explorer (clic), garantir l'envoi d'une
   vue ET d'un clic, même si la carte n'a pas eu le temps de déclencher la
   détection passive.
3. Faire payer les créateurs, pour la part de trafic venant d'Explorer, au
   nombre de clics plutôt qu'au nombre de vues — sans changer les stats et
   le classement algo affichés au créateur, qui continuent de compter
   `view_count` normalement.

## Non-objectifs

- Pas de changement du tarif de paie pour le fil principal ou toute autre
  surface — seule la part Explorer est reformulée.
- Pas de virtualisation du mur (`FlatList`/`VirtualizedList`) — hors sujet,
  déjà tranché comme limite acceptée dans le spec du 2026-08-18.
- Pas de nouvelle UI visible pour l'utilisateur — travail invisible.

## Approche retenue : position mesurée (`onLayout`), pas estimée

Deux options existaient pour savoir si une carte est dans le viewport :

- **Retenue — mesure réelle.** Chaque `cell` capture sa position via
  `onLayout` ; le conteneur `columns` aussi. Position absolue = offset du
  conteneur + offset de la carte dans sa colonne. Comparée à
  `scrollOffsetRef`/`layoutHeightRef` (déjà suivis dans `ExploreWall` pour la
  pagination), avec un seuil de 50 % de la carte visible — même règle que le
  fil (`itemVisiblePercentThreshold: 50`).
- **Écartée — position estimée.** `cardFormat.ts`/`wallLayout.ts` calculent
  déjà une hauteur par carte pour équilibrer les colonnes ; on aurait pu
  cumuler ces hauteurs pour dériver un offset sans `onLayout`. Rejetée : ces
  hauteurs sont documentées dans le code comme des estimations pour
  l'équilibrage, pas pour la précision pixel — l'erreur grandirait avec le
  défilement (texte qui wrap différemment de l'estimation, hauteur variable
  de la bannière « N nouveaux depuis... », `ListHeaderComponent`) et
  fausserait la détection sur les tweets bas de page.

## Design — mobile (`twitninfbeta`)

### Détection de visibilité (`ExploreWall.tsx`)

- `onLayout` sur chaque `cell` (capture `y`, `height` relatifs à `column`) et
  sur le conteneur `columns` (capture son offset dans le contenu scrollable,
  après `ListHeaderComponent` et la bannière « nouveaux »). Position absolue
  d'une carte = offset du conteneur `columns` + offset cumulé de la carte.
- Recalcul déclenché : au montage, à chaque page de plus (`onEndReached`),
  et pendant le scroll — throttlé à ~250 ms dans le handler de scroll
  existant (`handleScrollFrame`) pour éviter de comparer N cartes à chaque
  frame (`scrollEventThrottle={1}` aujourd'hui).
- Une carte franchissant le seuil de 50 % visible pour la première fois est
  poussée dans le tracker existant. Un `Set` d'ids déjà vus (même pattern que
  `entranceSeen`/`feedImpressionsRef`) garantit une impression par tweet par
  session — pas de re-comptage si la carte ressort puis rerentre du
  viewport.
- `useOptimizedViewTracking({ minViewTime: 0, debounceMs: 600, batchSize: 20 })`
  — mêmes réglages que le fil. `minViewTime: 0` : contrairement au fil, rien
  ici ne fait déjà un filtre de dwell-time en amont (pas de `FlatList`), donc
  une carte visible au tout premier rendu (les deux premières lignes, à
  l'ouverture ou après un `reload`) part immédiatement dans le batch —
  couvre nativement le point 1 des objectifs sans code séparé pour « premier
  rendu » vs « scroll » : c'est la même détection, évaluée à des moments
  différents.

### Clic = vue garantie + clic distinct

- `onOpenTweet` reçu par `ExploreWall` est enveloppé localement. Avant
  d'appeler la prop (qui déclenche la navigation vers `TweetDetail`), le
  wrapper :
  1. Appelle `trackView(id, true)` — idempotent si la carte avait déjà été
     comptée passivement ; garantit une vue même si le clic arrive avant que
     la détection de visibilité n'ait eu le temps de qualifier la carte
     (ouverture quasi immédiate après montage, par exemple).
  2. Appelle un nouveau `trackClick(id)`, dédié, jamais déclenché par le
     scroll — uniquement par ce chemin.
- `trackClick` : nouvelle fonction, envoi immédiat (pas de debounce/batch —
  un clic est un événement isolé, pas un flux à regrouper), vers le nouvel
  endpoint backend `POST /api/tweets/clicks/increment`.
- `useBehaviorTracking.ts` : ajouter `'click'` à l'union
  `interactionType` de `trackTweetInteraction`, journalisé comme
  `action_type: 'tweet_click'` dans `user_behavior_data` — pour l'analytics
  uniquement (pas la source de vérité de la paie, voir plus bas).

## Design — backend (`api`)

### Migration

Deux colonnes sur `tweets`, entiers, défaut `0` :

- `explore_view_count`
- `explore_click_count`

Compteurs dénormalisés plutôt qu'un `COUNT(*)` sur `user_behavior_data` à
chaque calcul de paie : même raisonnement que l'audit R2 récent sur ce
fichier (`userStatsRoutes.js`) — éviter une requête corrélée coûteuse
répétée par tweet à chaque cycle de paie.

### `POST /api/tweets/views/increment`

- Nouveau champ optionnel dans le body : `source` (`'explore'` ou absent).
- Si `source === 'explore'` : la même requête `UPDATE` incrémente `view_count`
  ET `explore_view_count` pour les tweets du batch, en un seul aller-retour.
  Sans `source`, comportement strictement inchangé (rétrocompatible avec le
  fil, qui n'a pas besoin de le passer).
- Le reste de la route (vérification tweets publics, mise à jour
  `realtimeQueueService`) ne change pas.

### `POST /api/tweets/clicks/increment` (nouveau)

- Même forme que `views/increment` : `{ tweetIds: string[] }` (1 à 50,
  chaque id validé `isUUID`), `authenticateToken`.
- `UPDATE tweets SET explore_click_count = explore_click_count + 1 WHERE id IN (...)`.
- Pas de mise à jour de `realtimeQueueService` — le clic n'a pas vocation à
  peser sur le classement temps réel de l'algo, seulement sur la paie.

### Monétisation — `tweetMonetizationService.js`

Trois sites lisent aujourd'hui `tweet.view_count` directement :
`calculateTweetEligibility`, `previewEarnings`, `processEligibleTweets`.
Remplacer, aux trois endroits, par :

```js
const rawViews = tweet.view_count || 0;
const exploreViews = tweet.explore_view_count || 0;
const exploreClicks = tweet.explore_click_count || 0;
// Un clic Explorer compte double une vue normale — signal plus fort qu'un
// simple passage dans le mur.
const views = Math.max(0, rawViews - exploreViews) + exploreClicks * 2;
```

Le taux appliqué reste inchangé (`STANDARD_RATES.VIEWS` = 0,01 TWC,
`VIDEO_BOOSTED_RATES.VIEWS` = 0,005 TWC selon `getRatesForTweet`) — seul le
compte en entrée de la multiplication change. Il faut aussi ajouter
`explore_view_count`/`explore_click_count` aux `attributes` (ou `SELECT`)
partout où `view_count` est déjà lu dans ces trois fonctions, sinon les
nouvelles colonnes reviennent `undefined` et la formule se comporte comme
avant (silencieusement faux, pas d'erreur).

`Math.max(0, ...)` : garde contre un `explore_view_count` qui dépasserait
`view_count` par une course entre deux requêtes concurrentes sur le même
tweet (l'update explore et un autre chemin de vue) — improbable mais gratuit
à écarter.

## Ce qui NE change PAS

- `view_count` continue d'être incrémenté par toute vue, Explorer compris —
  stats créateur et classement algo inchangés.
- Le fil principal, les profils, et toute autre surface : aucun changement
  de comportement ni de tarif.
- `realtimeQueueService` (classement temps réel) : n'entend jamais parler des
  clics Explorer.

## Tests

- Mobile : vérifier sur appareil (jamais testé, comme noté dans le spec du
  2026-08-18) que les deux premières lignes envoient bien un batch au
  premier rendu, qu'un scroll lent ET un fling rapide déclenchent la suite
  sans doublon, et qu'un tap sur une carte jamais entrée dans le viewport
  (ouverture très rapide) envoie quand même vue + clic.
- Backend : test manuel (comme `scripts/simulateNfFraudLoad.js` sert de
  précédent pour tester en lecture/écriture ciblée) — appeler les deux
  routes sur un tweet de test, vérifier les trois colonnes en base, puis
  `calculateTweetEligibility` sur ce tweet pour confirmer la formule.
- Pas de test automatisé existant sur `tweetMonetizationService.js` à ce
  jour (à vérifier en implémentation) — si un test manque pour la fonction
  touchée, en écrire un couvrant au moins : vue seule (fil), clic seul
  (Explorer), mélange des deux, `Math.max(0, ...)` en cas de compteurs
  incohérents.

## Rollout

- Migration d'abord (colonnes à `0`, aucun effet tant que rien ne les
  incrémente).
- Backend ensuite (nouvel endpoint clics + `source` optionnel sur
  l'endpoint vues + formule de paie) — rétrocompatible, ne change rien tant
  que le mobile n'envoie pas encore `source: 'explore'` ni de clics.
- Mobile en dernier — à partir de là, Explorer commence à faire remonter
  vues taguées et clics, et la paie en tient compte au cycle suivant.
