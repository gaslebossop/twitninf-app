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
| F4 | FLUIDITÉ — animations et thread UI | **EN COURS** | `AUDIT-F4.md` |
| R1 | RAPIDITÉ — démarrage | À FAIRE | — |
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

## Reprendre à — F4 (EN COURS)

**Constats écrits et poussés :** F4-1 (`VerifiedBadge` : jusqu'à 5 boucles
infinies par badge ; `animated` vaut `true` par défaut et le garde-fou
`animated={false}` n'est posé que sur 4 usages sur 14 — `TweetCard:411`,
`LiveViewerScreen:129`, `MessagesScreen:339` et 7 autres sont exposés).

**BALAYAGES F4 DÉJÀ FAITS — résultats, ne pas les refaire :**
- `useNativeDriver: false` → seulement **6 appels réels** (FuturisticCarousel
  ×3, PremiumUpsellModal, PremiumCheckoutSheet, NewConversationScreen:100),
  tous sur des écrans secondaires. 242 appels en `true`. Le fil a MIGRÉ son
  indicateur d'onglet vers Reanimated (`TweetsScreen:322`). Hygiène très bonne.
  Reste éventuellement : `NewConversationScreen:272` anime `left` (pourrait
  être un `translateX` natif) — mineur.
- `scrollEventThrottle` → 3 usages seulement : `{1}` (FeedGutterScreen, CORRECT
  car `useAnimatedScrollHandler`), `{160}` (ConversationThread), `{100}`
  (ExploreWall). **AUCUN `{16}`** — le défaut visé par le brief est ABSENT.
- `onScroll` → 3 usages, dont 1 en `useAnimatedScrollHandler`. Les 2 autres
  n'écrivent que dans des refs, aucun `setState`. SAIN.
- **worklet sans `runOnJS`** → RIEN TROUVÉ. 12 fichiers à gestes vérifiés un
  par un (Tappable, Toast, SwipeFollow, Calibration, StoryViewer, ImageViewer,
  ImageViewerPaper, ExploreImmersive, FeedGutter, ConversationThread,
  TweetsScreen, VideoEditor) : tous utilisent `runOnJS`. Les helpers partagés
  de `src/utils/gesture.ts` (`clamp`, `rubberBand`, `projectDecay`) portent
  tous `'worklet'`. SAIN.
- `springify()` → **0 occurrence** (sauf un commentaire disant qu'on l'évite).
  Défaut n°1 de CLAUDE.md ABSENT.
- `entering=` → 16 usages, **aucun sur une ligne de liste** (bannières
  d'erreur, états vides, onboarding). Défaut n°2 de CLAUDE.md ABSENT.
  `ConversationThread:1341` est gardé par `justArrivedIdsRef`.
- `BlurView` → 16 fichiers le RENDENT (3 l'importent sans l'utiliser :
  VerifiedBadge, KosporBirthdayPopup, twitninfvideo). La tab bar
  (`navigation/BottomTabNavigator:225`) ne floute QUE sur iOS (matériau natif),
  Android a une `View` pleine — BON choix. `LockedText:99` documente pourquoi
  il évite `experimentalBlurMethod` sur Android. SAIN.

**PISTES F4 RESTANTES :**
1. `withRepeat` (24) et `Animated.loop` : `ProfileDecoration` (6),
   `PremiumBadges` (3), `PremiumUsernameGlow` (2), `PremiumProfileCard` (3),
   `profile/ThemeMaterial` (4), `profile/AvatarMaterial` (4) — même question
   que F4-1 : combien tournent en même temps dans une liste ?
2. `CasinoScreen.tsx:212` — `CONFETTI.map()`.
3. `shouldRasterizeIOS` / `renderToHardwareTextureAndroid` : seulement 2
   usages dans tout le dépôt — vérifier s'il en manque sur des vues
   transformées à chaque image.
4. Ombres/opacités empilées sur ce qui défile (147 `shadowRadius`/`elevation`).

**À SIGNALER EN R3 (dead code, trouvé en F4)** :
- `src/components/TopNavbar.tsx` n'est **importé NULLE PART** (3 `BlurView`,
  dégradé multi-stops, couleurs hex en dur pré-Pulse). Mort.
- **CINQ** composants de barre de navigation basse coexistent :
  `navigation/BottomTabNavigator`, `components/BottomTabNavigator`,
  `components/ModernBottomNavbar`, `components/UnifiedBottomNavbar`,
  `components/EnhancedBottomTabNavigator`. Vérifier lesquels sont morts.
- `VerifiedBadge.tsx:10-12` importe `BlurView`, `MaskedView` et `Svg` sans
  jamais les rendre.
- `SearchScreen` : `startAnimations = () => {}` — fonction vide (F2-6).
- `clampWorklet` dupliqué à l'identique dans `ImageViewer.tsx:57` et
  `ImageViewerPaper.tsx:73`, alors que `utils/gesture.ts:66` exporte `clamp`.

### Vérifié SAIN pendant F2/F3, ne pas relire

`litPulse.ts` (horloge singleton, excellent) · `AnimatedNameFill`
(`ProfileDecoration:619`, `useDrift` coupé si effet `none`) ·
`ConversationThread:1341` (`entering` gardé par `justArrivedIdsRef`) ·
`CreateTweetScreen:1086/1094` (ressorts quasi critiques) ·
`twitninfvideo:543` (viewability en `ref`) · `ImageViewerPaper` (`runOnJS`).

Déjà écrits ailleurs, NE PAS redoubler en F4 : `SearchScreen` 5 `Animated.View`
inertes (F2-6) · `CreateTweetScreen` `Animated.sequence` par caractère (F2-7).

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
