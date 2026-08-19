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
| R1 | RAPIDITÉ — démarrage | **EN COURS** | `AUDIT-R1.md` |
| R2 | RAPIDITÉ — réseau | À FAIRE | — |
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

## Reprendre à — R1 (EN COURS)

**Constats écrits et poussés :** R1-1 (20 polices chargées AVANT le premier
écran, dont 17 pour une option cosmétique — CRITIQUE).

### `App.tsx` A ÉTÉ LU EN ENTIER (215 l.) — ne pas le relire, voici tout

**Chemin de démarrage** : `useFonts(fontAssets)` (`:56`) → si pas prêt, rend
`<AppLoadingScreen/>` et RIEN d'autre (`:127-135`) → filet `forceReady` à 4 s
(`:59`). Donc bloquant 0-4 s. → C'est R1-1.

**PISTES R1 RESTANTES, toutes vues dans `App.tsx`, à instruire :**

1. **13 fournisseurs imbriqués** montés d'un coup (`:138-200`) : Toast,
   Confirm, ActionSheet, Prompt, Reward, Auth, FeatureFlag, Offline,
   ReadingLanguage, StartupPopup, Events, Event, EventTheme, FunctionalEvent.
   → QUESTION À INSTRUIRE : combien font un appel réseau ou une lecture
   AsyncStorage à leur montage ? C'est LE constat R1 suivant le plus probable.
   Note : `EventsProvider` est la source de vérité et les 3 suivants ne sont
   plus que des adaptateurs « qui n'interrogent plus le réseau » (commentaire
   `:190-193`) — donc ce point a DÉJÀ été travaillé une fois. Vérifier.

2. **8 « gates » montés à la racine** (`:181-199`) : `ReadingLanguageGate`,
   `ProfileCompletionGate`, `ConsentGate`, `SleepGate`,
   `FollowOnboardingGate`, `UpdateAvailableGate`, `PatchNotesModal`.
   → Chacun peut déclencher un appel réseau au montage, EN MÊME TEMPS que le
   fil charge. À vérifier un par un. `StartupPopupContext` gère une file
   d'attente d'affichage — mais ordonne-t-il les REQUÊTES ou seulement
   l'affichage ?

3. **Notifications push au démarrage** (`:64-126`) : `registerForPushNotifications`
   PUIS `await setupFranceDailyLocalNotifications()` en SÉRIE, puis une boucle
   `tryRegisterDevice` qui sonde `apiService.token` toutes les secondes
   jusqu'à 10 fois (`:111-118`). Ce sondage par `setTimeout` au lieu d'attendre
   un événement d'auth est un motif fragile ET du travail au démarrage.

4. `AppLoadingScreen` anime `icon.png` en 1920×1920 → **DÉJÀ ÉCRIT en F1-1**,
   cross-référencé dans R1-1. NE PAS LE RECOMPTER.

**Autres éléments déjà connus, utiles pour R1 :**
- Les 9 fournisseurs de `src/contexts/` ont tous une valeur mémoïsée (vérifié
  en F2) — mais leur coût de MONTAGE n'a pas été regardé.
- `ScreenSkeleton` / `TweetSkeleton` existent et sont utilisés (bon pour la
  perception du démarrage).

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
