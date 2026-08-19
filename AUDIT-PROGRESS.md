# AUDIT twitninf-app — suivi d'avancement

Routine automatisée. Elle reprend TOUJOURS à la première section qui n'est pas
`TERMINÉE` — donc à une section `EN COURS` s'il y en a une, en repartant du
point noté dans « Reprendre à ». Ne pas réordonner les lignes : l'ordre est
l'ordre de priorité imposé (fluidité > rapidité > sécurité).

| Code | Section | État | Rapport |
|---|---|---|---|
| F1 | FLUIDITÉ — poids réel des images | **TERMINÉE** | `AUDIT-F1.md` |
| F2 | FLUIDITÉ — rendus inutiles | **TERMINÉE** | `AUDIT-F2.md` |
| F3 | FLUIDITÉ — listes | **TERMINÉE** | `AUDIT-F3.md` |
| F4 | FLUIDITÉ — animations et thread UI | **TERMINÉE** | `AUDIT-F4.md` |
| R1 | RAPIDITÉ — démarrage | **TERMINÉE** | `AUDIT-R1.md` |
| R2 | RAPIDITÉ — réseau | **EN COURS** | `AUDIT-R2.md` |
| R3 | RAPIDITÉ — poids du bundle | À FAIRE | — |
| S1 | SÉCURITÉ — secrets dans l'historique git | À FAIRE | — |
| S2 | SÉCURITÉ — ce qui part en clair dans le bundle | À FAIRE | — |
| S3 | SÉCURITÉ — appareil et chaîne de build | À FAIRE | — |

---

## F2 — TERMINÉE

10 constats (`AUDIT-F2.md`) : 2 critiques, 7 majeurs, le reste modéré/mineur.
Synthèse et liste du « vérifié SAIN » en fin de `AUDIT-F2.md` — **la lire avant
de rouvrir quoi que ce soit sur F2**, elle borne précisément ce qui a été
couvert et ce qui ne l'a pas été.

Recommandation transverse issue de F2, à reprendre dans la conclusion générale :
le dépôt n'a **aucune configuration ESLint**, donc pas de
`react-hooks/exhaustive-deps`.

---

## F3 — TERMINÉE

4 constats (`AUDIT-F3.md`), dont 2 CRITIQUES (`twitninfvideo`,
`ConversationThreadScreen`). Synthèse et « vérifié SAIN » en fin de fichier —
**la lire avant de rouvrir quoi que ce soit sur F3**.

Fil rouge dégagé, à reprendre en R2 : **quatre listes chargent sans aucune
pagination** — messages d'une conversation, liste des conversations,
commentaires (plafond brut de 100), stories. Le sujet est côté API.

**Addendum ajouté après coup** : `ExploreWall.tsx:190` est une 3e liste non
virtualisée, mais c'est une décision ASSUMÉE et documentée dans le fichier —
pas un constat. Elle livre au passage le SEUL chiffre de volume réel du dépôt :
**~977 tweets vivants en production**. Ce chiffre pondère les constats qui
dépendent du volume de données (StoriesTray, UserConnections) mais PAS ceux qui
dépendent d'une constante de code. Règle de priorisation à garder pour tout le
reste de l'audit.

---

## F4 — TERMINÉE

2 constats (`AUDIT-F4.md`) : F4-1 MAJEUR (`VerifiedBadge`), F4-2 trois points
mineurs groupés. **C'est la section la plus saine des quatre** : les 5 défauts
d'animation les plus graves cherchés par le brief sont ABSENTS (worklet sans
`runOnJS`, `springify()`, `entering` sur ligne recyclée,
`scrollEventThrottle={16}`, mélange Reanimated/`Animated` RN). Détail des
balayages dans la synthèse de `AUDIT-F4.md` — ne pas les refaire.

**CONCLUSION TRANSVERSE qui se dégage (à reprendre en fin d'audit)** : le dépôt
ne manque pas de compétence — les diagnostics sont justes et les commentaires
excellents. Il manque de **diffusion** : 4 fois sur 4, un correctif juste est
resté là où le bug avait été observé (F2-3, F3-3, F4-1, F4-2a). Privilégier les
remèdes structurels (inverser un défaut dangereux, extraire une constante
partagée, activer ESLint) aux corrections ponctuelles.

## FLUIDITÉ (F1-F4) — TERMINÉE. Priorité n°1 du brief entièrement couverte.

---

## R1 — TERMINÉE

3 constats (`AUDIT-R1.md`) : 2 CRITIQUES (R1-1 polices, R1-2 polices+auth en
série), 1 modéré (R1-3 push). `App.tsx` a été lu EN ENTIER — tout ce qui compte
est dans le rapport, ne pas le relire.

**Le démarrage est une chaîne séquentielle de 5 maillons** :
20 polices → 3 lectures de stockage → 1 à 3 appels réseau d'auth → montage du
navigateur → 1er appel du fil. Trois pourraient avancer ensemble.

SAIN et à ne pas rouvrir : les 8 « gates » (délai de décantation + `if visible`
+ file `StartupPopupContext`), les 4 fournisseurs d'événements (consolidés),
`PatchNotesModal` (AsyncStorage seul).

---

## Reprendre à — R2 (EN COURS)

**Constats écrits et poussés :** R2-4 (pagination : 4 listes sans bornes +
`TweetDetailScreen:504` `offset: 0` en dur, la 21e réponse est inatteignable —
MAJEUR), R2-1 (badge messages : toute la liste des
conversations + `getCurrentUser()` en série, toutes les 30 s, sur tous les
écrans — CRITIQUE), R2-2 (sur-récupération : `limit: 500` de profils complets
pour un Set d'ids, + `getCurrentUser()` sur 16 sites), R2-3 (ni cache ni
déduplication dans `api.ts` ; `/api/messages/conversations` téléchargée 3 fois ;
+ `TradingScreen` qui sonde hors focus).

### `api.ts` (2 904 l.) — INSTRUIT, résultat clé

Recherche faite sur `cache|dedup|inFlight|pending|AbortController` :
**il n'y a NI cache, NI déduplication de requêtes en vol, NI annulation
pilotée par l'appelant.** L'unique `AbortController` (`:322-328`) sert
uniquement au **timeout**, jamais à annuler quand on quitte un écran.
`makeRequest` (`:341`) va droit au réseau à chaque appel. → C'est le socle du
constat groupé R2-x « ni cache ni déduplication » qui reste à rédiger.

### PREUVES DÉJÀ RÉUNIES pour les constats R2 suivants — ne pas re-chercher

**A. Même donnée demandée plusieurs fois :**
- `/api/messages/conversations` appelé depuis **3 endroits** :
  `unreadService.ts:24` (badge), `MessagesScreen.tsx:109` (la liste),
  `ConversationThreadScreen.tsx:699` (juste pour les participants d'UNE
  conversation). Route **sans pagination**. Ouvrir Messages puis une
  conversation = la liste complète téléchargée 2 fois en quelques secondes.
- `getCurrentUser()` : **16 sites d'appel** (5 dans `AuthContext`, puis
  `GroupMembersScreen` ×2, `NewConversationScreen`, `MessagesScreen`,
  `ConversationThreadScreen`, `CommentSheet`) — alors que `AuthContext` tient
  déjà `user`. Chaque appel est un aller-retour pour une donnée locale.

**B. Requêtes en série parallélisables :**
- `ConversationThreadScreen:699` puis `:729` — toute la liste des
  conversations PUIS les messages, en série. 2 allers-retours avant le 1er
  message affiché.
- `unreadService.ts:23` puis `:24` — liste PUIS `getCurrentUser()`, en série.
- `App.tsx:80` puis `:83` (push) — déjà écrit en R1-3, ne pas redoubler.

**C. Pagination absente** (établi en F3-3) : messages d'une conversation,
liste des conversations, commentaires (`CommentSheet:397`, plafond brut 100),
stories (`storiesService.ts:99`).

**D. Manque fonctionnel** : `TweetDetailScreen:504` — réponses plafonnées à
`limit: 20` avec `offset: 0` EN DUR et aucun « charger plus ». Impossible de
lire la 21e réponse d'un tweet.

**E. Sondages périodiques recensés :**
- `BottomTabNavigator:97` — badges, 30 s (R2-1).
- `BottomTabNavigator:70-81` — `liveService.getLives()`, 30 s.
- `TradingScreen:72-78` — 30 s, **non suspendu quand l'écran perd le focus**.
- `useForegroundInterval` existe et suspend en arrière-plan : BON outil, déjà
  utilisé par la navbar. `TradingScreen` ne s'en sert pas → constat facile.

**F. BON point à citer** : `TweetDetailScreen:502` — `Promise.all` pour
paralléliser tweet + réponses. Et `getNotificationsUnreadCount`
(`unreadService.ts:48`) — endpoint dédié, le serveur compte. Patron à recopier.

### FIL D'ACCUEIL — INSTRUIT, et c'est SAIN. Ne pas rouvrir.

L'orchestration réseau de `TweetsScreen` est bonne : `Promise.allSettled` /
`Promise.all` pour les appels indépendants (avec commentaires expliquant le
choix), cache par onglet (`tabCacheRef`), garde `if (followingIds.size === 0)`,
repli sur cache (`servedFromCacheRef`), Explorer isolé. Détaillé dans le
« SAIN » de R2-2. **Seul reproche : le volume d'UNE requête (limit 500).**

### RESTE À INSTRUIRE POUR R2

R2-4 (pagination) et R2-5 (chaîne progressive) : **ÉCRITS ET POUSSÉS**.

Reste : **synthèse R2**, passage de R2 à TERMINÉE, puis R3.

À ROUTER vers R3 depuis R2-5 : `TweetDetailScreen:344-484`, `:773`,
`:1376-1400` = ~130 lignes de code mort (`currentAlgorithm === 'progressive'`
est inatteignable — aucune écriture de cette valeur dans tout `src/`).
À ROUTER vers S3 : `loadProgressiveInfo` journalise les réponses réseau
complètes (`console.log`, `:356/362/366/375`).

Chiffre utile : **~977 tweets vivants en prod** (`ExploreWall.tsx:191`).

### Matériel déjà vérifié, à ROUTER vers R2 (réseau) — ne pas le redécouvrir

- `ConversationThreadScreen:725` — `loadMessages` récupère TOUTE la liste des
  conversations juste pour trouver les participants d'UNE conversation, EN
  SÉRIE avant de demander les messages. 2 allers-retours séquentiels avant le
  premier message.
- **4 listes sans pagination** : messages d'une conversation, liste des
  conversations (`MessagesScreen:109`), commentaires (`CommentSheet:397`,
  plafond brut de 100), stories (`storiesService.ts:99`).
- `TweetDetailScreen:504` — réponses plafonnées à `limit: 20` avec
  `offset: 0` EN DUR et aucun « charger plus » : impossible de lire la 21e
  réponse. Manque fonctionnel.
- `TweetDetailScreen:502` — `Promise.all` pour paralléliser tweet + réponses.
  BON point, à citer en exemple.
- `TradingScreen:72-78` — `setInterval` de 30 s qui n'est PAS suspendu quand
  l'écran perd le focus.
- Chiffre de volume réel : **~977 tweets vivants en prod**
  (`ExploreWall.tsx:191`). Seule donnée de volume du dépôt.

### Matériel déjà vérifié, à ROUTER vers R3 (bundle) — code mort recensé

- `src/components/TopNavbar.tsx` — importé NULLE PART.
- `src/components/PremiumUsernameGlow.tsx` — importé NULLE PART (2 boucles).
- `src/components/PremiumBadges.tsx` — importé NULLE PART (3 boucles).
- **CINQ** barres de navigation basse coexistent : `navigation/BottomTabNavigator`
  (la vraie), `components/BottomTabNavigator`, `components/ModernBottomNavbar`,
  `components/UnifiedBottomNavbar`, `components/EnhancedBottomTabNavigator`.
- `VerifiedBadge.tsx:10-12` importe `BlurView`, `MaskedView`, `Svg` sans jamais
  les rendre.
- `clampWorklet` dupliqué à l'identique (`ImageViewer.tsx:57`,
  `ImageViewerPaper.tsx:73`) alors que `utils/gesture.ts:66` exporte `clamp`.
- `SearchScreen` : `startAnimations = () => {}` vide, et 5 `Animated.View`
  inertes (F2-6).
- **Aucune configuration ESLint** dans le dépôt (ni `.eslintrc*`, ni
  `eslint.config.*`, ni script `lint`).

---

## Rappels pour la prochaine exécution

- **Pousser après CHAQUE constat**, pas en fin de section : écrire le constat
  dans `AUDIT-<CODE>.md`, mettre à jour « Reprendre à » ci-dessus, commiter,
  pousser, et seulement ensuite chercher le suivant.
- Le dépôt est **PUBLIC**. Les rapports `S1`, `S2`, `S3` poussés ici ne
  doivent contenir **que le décompte et la gravité** (ex. « 2 constats, dont
  1 critique, catégorie : secret présent dans l'historique »). Aucun secret,
  aucun chemin exact, aucune méthode d'exploitation. Le détail va dans le
  message final, lu par le seul propriétaire.
- `.gitignore` avale `*.md` sans erreur : **toujours `git add -f`** sur les
  fichiers `AUDIT-*.md`, et vérifier avec `git show --stat HEAD` avant de
  pousser.
- Ne jamais pousser sur `main`. Ne jamais ouvrir de pull request. Ne jamais
  modifier un fichier source de l'application.

## Base auditée

`origin/main` au commit `0b8b20b` (« feat(fil): test « 2B — Gouttière » sous
drapeau `fil.refonte2b` »).
