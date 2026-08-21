# Passation — audit du fil 2B (branche `feat/fil-2b-audit`)

> ⚠️ **Ce document n'a pas été écrit par l'agent qui a fait le travail.** L'agent APP2B a été coupé
> par épuisement de contexte avant d'écrire sa passation. Ce fichier a été **reconstitué après coup**
> à partir de `git log`, `git diff` et d'une relecture du code, par la session suivante (2026-08-21).
>
> Les **preuves ci-dessous ont été relancées et vérifiées** par le rédacteur.
>
> ⚠️ **Trois points listés comme « non traités » dans la première version de ce document se sont
> révélés déjà en place** à la vérification (adjacence, perf de liste, cohérence visuelle). Corrigé
> au §4.

---

## 1. État de la branche

- Branche : `feat/fil-2b-audit`, partant de `main` (`ae34925`).
- **12 commits** (10 de l'agent + 2 de la session suivante), `+910 / −102` sur 13 fichiers
  pour la part de l'agent (dont 2 fichiers de tests neufs).
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
| 5 | Adjacence parent/réponse | ✅ **déjà en place** — `withoutOrphanReplies` appliqué dans **les deux** fils au même endroit (`FeedGutterScreen.tsx:1580`, `TweetsScreen.tsx:1490`), avec deux suites de tests (`feed-orphan-replies`, `feed-thread-depth`). `threadDepthAt` n'est que dans le 2B : c'est le rail de gouttière, de la présentation, donc la parité tient |
| 6 | Performance de liste | ✅ **déjà en place** — `TweetRowGutter` est `memo(..., areEqual)` avec un comparateur sur mesure, `keyExtractor` est un `useCallback` stable, et la `FlatList` est réglée (`initialNumToRender=6`, `maxToRenderPerBatch=5`, `windowSize=7`, `removeClippedSubviews` sur Android). Pas de `getItemLayout` — normal, les lignes sont de hauteur variable |
| 7 | Pièges connus du projet | ✅ **un piège trouvé et corrigé** : le toast invisible sous `<Modal>` (`8c05a79`) |
| 8 | Cohérence visuelle 2B | ✅ **vérifié** — aucune fuite de « Pulse » : les six composants de `feed/paper2b/` importent tous la palette `paper2b`, et aucun n'importe `theme/colors` |

## 5. Ce qui reste à faire — par impact décroissant

### ✅ ~~Bloquant : l'API Node ne relaie pas `scores`~~ — **posé le 2026-08-21**
Le maillon manquait au milieu, dans le dépôt `api`, hors du périmètre des deux agents. Il est écrit
sur `api` branche **`feat/relais-scores-reco`**, commit `26b4ae7` (non poussé, non déployé).

La chaîne est désormais complète : moteur `scores` → API `data.scores` → app
`response.data.scores` → `withRecommendationScores` (`FeedGutterScreen.tsx:869`,
`TweetsScreen.tsx:783`). `HESITATION_CEILING = 0.45` peut enfin s'armer.

⚠️ **Vérifié statiquement seulement** : syntaxe, lint, et la correspondance des trois contrats par
relecture. Le chemin n'a **jamais été exécuté** — il demande Postgres, Redis et le moteur Rust
vivants. À confirmer sur un environnement réel.

### ✅ ~~`TweetDetailGutterScreen.tsx` non versionné~~ — **versé le 2026-08-21** (`395f48c`)
Le fichier existait sur le disque, complet (2597 l.) et déjà câblé dans `MainNavigator`, mais n'avait
jamais été ajouté à l'index : un `git clean` ou un changement de branche l'effaçait sans trace.

Le câblage dans `MainNavigator` n'est **pas** de ce commit : il fait partie des modifications non
commitées antérieures au chantier, laissées intactes.

⚠️ Le `.gitignore` exclut `*.js` et `*.md` — mais pas `*.tsx`. Pour les documents, dont **ce
fichier**, il faut `git add -f`.

### ❌ Trois points de la checklist étaient en fait **déjà traités**
Vérifié le 2026-08-21, contrairement à ce que laissait croire l'absence de ces fichiers dans le diff
du chantier : **adjacence** (#5), **performance de liste** (#6) et **cohérence visuelle 2B** (#8)
sont en place. Voir le tableau du §4 pour le détail et les preuves.

La leçon vaut pour la suite : *ne pas apparaître dans le diff d'un chantier* ne veut pas dire
*ne pas exister* — ces trois-là étaient simplement déjà bons avant.

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
