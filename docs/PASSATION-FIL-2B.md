# Passation — audit du fil 2B (branche `feat/fil-2b-audit`)

> ⚠️ **Ce document n'a pas été écrit par l'agent qui a fait le travail.** L'agent APP2B a été coupé
> par épuisement de contexte avant d'écrire sa passation. Ce fichier a été **reconstitué après coup**
> à partir de `git log`, `git diff` et d'une relecture du code, par la session suivante (2026-08-21).
>
> Les **preuves ci-dessous ont été relancées et vérifiées** par le rédacteur.

---

## 1. État de la branche

- Branche : `feat/fil-2b-audit`, partant de `main` (`ae34925`).
- **10 commits**, `+910 / −102` sur 13 fichiers (dont 2 fichiers de tests neufs).
- **Rien n'a été poussé** (la branche n'existe pas sur `origin`), **rien n'a été fusionné dans
  `main`**, **rien n'a été déployé**.

### Les modifications préexistantes sont intactes
Les 7 fichiers modifiés non commités **antérieurs** au chantier (refonte Messages 2B) sont
toujours là, non touchés par l'agent :
`EmojiPickerSheet.tsx`, `ui/ScreenSkeleton.tsx`, `navigation/MainNavigator.tsx`,
`ConversationThreadScreen2B.tsx`, `MessagesScreen2B.tsx`, `SearchScreen.tsx`, `theme/fonts.ts`.
Plus les deux fichiers non suivis : `docs/superpowers/plans/2026-08-20-messages-2b-implementation.md`
et `src/screens/TweetDetailGutterScreen.tsx`. **Ne pas les jeter, ne pas les attribuer à l'agent.**

## 2. Preuves — relancées le 2026-08-21

| Commande | Résultat |
|---|---|
| `npx tsc --noEmit` | **exit 0** — aucune erreur |
| `node --test tests` | **176 passed ; 0 failed** (dont les 2 suites neuves) |

Suites ajoutées par le chantier : `tests/tweet-renderable.test.js` (112 l.),
`tests/neuralrank-scores.test.js` (83 l.).

### Parité avec `TweetsScreen.tsx` — vérifiée mécaniquement
Chaque correctif a été appliqué **aux deux écrans** : `TweetsScreen.tsx` et `FeedGutterScreen.tsx`
reçoivent exactement `+213` lignes chacun. Un diff des deux diffs, normalisé, ne laisse que
**4 écarts, tous inoffensifs** :

- deux listes de dépendances `useCallback` qui portent en plus `entranceGeneration`, `entranceSeen`,
  `gutterAnchor`, `algoAnchor` — de l'état **déjà propre au 2B**, antérieur au chantier ;
- une virgule de copie (« Noté — tu en verras plus. » vs « Noté. Tu en verras plus. ») ;
- un commentaire reformulé.

**Aucune divergence de logique de données** : le test A/B reste valide, il ne porte bien que sur la
présentation.

## 3. Les commits, du plus récent au plus ancien

| Commit | Objet |
|---|---|
| `f93c648` | **score/confiance** — `withRecommendationScores` recolle score et confiance ; le déclencheur de la question peut enfin s'armer (⚠️ voir §5) |
| `a6d7300` | **revert** — le rang ne remonte plus du client : le moteur le connaît mieux (offset compris) |
| `741f6ce` | **pagination** — le curseur avançait de ce qu'on **gardait**, pas de ce que le serveur **servait** |
| `9c61951` | **menu « … »** — proposait « Bloquer » à quelqu'un sur ses **propres** tweets |
| `8c05a79` | **payant** — « Rendre gratuit » était un bouton mort : confirmation dessinée derrière une `<Modal>` |
| `701eb31` | **docs** — un commentaire décrivait un correctif jamais posé ; deux imports morts retirés |
| `a3bab8e` | **question algo** — le reçu ne s'affichait jamais, et une question ignorée bloquait toutes les suivantes |
| `6b059e4` | **onglet Abonnements** — like/repost n'atteignaient jamais le moteur (enfermés dans `if (activeTab === 'forYou')`) |
| `7c018a9` | **impression** — partait sans `author_id` et avec un dwell **inventé** en dur (500 ms) |
| `dd0bf3b` | **affichage** — retweets, images seules et comptes promus n'arrivaient jamais à l'écran |

### Les deux trouvailles les plus coûteuses

**`dd0bf3b`** — les deux fils filtraient sur `tweet.content` truthy. Or `content` est vide pour un
retweet pur, un tweet en image/vidéo seule, et un compte promu. Trois familles **jetées en silence**
entre la réponse du recommandeur et la liste. Le coût dépasse l'affichage : le moteur convertit en
exemple **négatif** toute impression restée sans interaction au bout de 30 min. Le modèle de clic a
donc appris que « les retweets et les images seules ne s'engagent pas » — sur des impressions que
**personne n'a jamais vues** — et l'auto-réglage des poids repartait de là.

**`6b059e4`** — un onglet entier de signal positif perdu, alors que profil de goût, affinité
d'auteur, co-occurrence et modèle de clic sont tous **globaux au lecteur**.

## 4. La checklist §7 — où en est-on

| # | Point | État |
|---|---|---|
| 1 | Parité avec `TweetsScreen` | ✅ **vérifiée mécaniquement** (§2) |
| 2 | Le fil s'affiche-t-il vraiment ? | ✅ **corrigé** (`dd0bf3b`) — c'était le gros trou |
| 3 | Communication avec l'algo | ✅ **largement corrigé** (`7c018a9`, `6b059e4`, `f93c648`) |
| 4 | Pagination & déduplication | ✅ **corrigé** (`741f6ce`) |
| 5 | Adjacence parent/réponse | ❓ **non traité visiblement** — `withoutOrphanReplies` / `threadDepthAt` non touchés |
| 6 | Performance de liste | ❌ **non traité** — `TweetRowGutter` fait 43 ko et son coût de re-rendu n'a pas été mesuré |
| 7 | Pièges connus du projet | ✅ **un piège trouvé et corrigé** : le toast invisible sous `<Modal>` (`8c05a79`) |
| 8 | Cohérence visuelle 2B | ❌ **non traité** — aucun fichier de `theme/` ni de palette dans le diff |

## 5. Ce qui reste à faire — par impact décroissant

### 🔴 Bloquant : l'API Node ne relaie pas `scores`
C'est **le même point** que côté moteur — le maillon manquant est au milieu, dans le dépôt `api`.

Le moteur expose désormais `scores: [{tweet_id, score, confidence}]` (commit Rust `de1f0ac`), et
l'app sait le consommer (`withRecommendationScores`, `f93c648`). Mais :

- `api/src/services/rustRecommenderClient.js` → `getRecommendations()` (~l. 219) construit son objet
  de retour **sans** `result.scores` ;
- `api/src/routes/neuralRankRoutes.js` → le `producer` (~l. 552‑600) hydrate les tweets et renvoie
  `data: { recommendations, count, ... }` **sans** `scores`.

Tant que ce relais n'existe pas, `_recommendation_confidence` vaut **0 en permanence**, et
`HESITATION_CEILING = 0.45` dans `utils/algoCheck` **ne peut jamais s'armer** — l'écran retombe sur
son heuristique de silence (quatorze tweets parcourus sans rien toucher). C'est inoffensif mais
c'est du travail livré des deux côtés pour rien.

⚠️ Côté API : attacher les scores **avant** `withFeedCache`, sinon une charge cachée sortira sans eux.

### 🟠 `src/screens/TweetDetailGutterScreen.tsx` est toujours non versionné
Il l'était déjà avant le chantier. **Le `.gitignore` du dépôt exclut `*.js` et `*.md`** — mais pas
`*.tsx`, donc ici un `git add` simple suffit. (Pour les documents, dont **ce fichier**, il faut
`git add -f`.) À relire puis commiter.

### 🟠 Performance de liste (checklist #6)
Non mesurée. `TweetRowGutter` fait 43 ko : s'il re-rend à chaque scroll, le fil est mort sur
appareil modeste. À vérifier avec le recyclage, `keyExtractor`, `getItemLayout`, mémoïsation.

### 🟡 Adjacence parent/réponse (checklist #5)
Non traité. Le recommandeur émet le parent juste avant sa réponse ; chaque couche doit garantir
l'adjacence. Piège connu de double affichage. Voir `withoutOrphanReplies` et `threadDepthAt` dans
`src/utils/feed.ts`.

### 🟡 Cohérence visuelle 2B (checklist #8)
Non traité. Palette papier en clair **et** en sombre, sans fuite de « Pulse » là où ce n'est pas
assumé. Rappel : **l'onglet Explorer garde volontairement la palette Pulse** — ne pas le « corriger ».

### 🟢 Le diagnostic laissé en « à faire » par `701eb31`
`pull` est écrit par le worklet `onScroll`, qui retombe sur le thread JS dès qu'il passe par une
`FlatList`. Le correctif touche **cinq écrans** et **ne se vérifie que sur appareil**.

## 6. Rappels qui n'ont pas changé

- Le fil 2B (`FeedGutterScreen.tsx`) est un **clone** de `TweetsScreen.tsx` sous le drapeau
  `fil.refonte2b` (1 %). **Toute divergence de logique de données est un bug** — voir la vérification
  de parité du §2, à refaire après toute modification de l'un des deux.
- `AlgoCheckGutter` porte le **seul signal explicite** vers le recommandeur, et le seul qui parle
  quand quelqu'un défile sans rien toucher.
- Pièges du projet : `Alert.alert` **n'existe plus** (primitives dans `src/components/ui/`) ; un
  toast est **invisible sous une `<Modal>`** ; `expo-haptics` **n'est pas installé** ; une fonction
  JS ordinaire dans un **worklet Reanimated tue l'app sans aucun log** ; **animer les lignes d'une
  `FlatList` au montage est rejeté** (le recyclage rejoue l'animation) ; la tab bar absolue
  **recouvre le bas des écrans**.
- Si l'UI est touchée : invoquer d'abord la skill `react-native-ui`.
