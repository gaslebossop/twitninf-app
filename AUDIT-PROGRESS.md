# AUDIT twitninf-app — suivi d'avancement

Routine automatisée. Elle reprend TOUJOURS à la première section qui n'est pas
`TERMINÉE` — donc à une section `EN COURS` s'il y en a une, en repartant du
point noté dans « Reprendre à ». Ne pas réordonner les lignes : l'ordre est
l'ordre de priorité imposé (fluidité > rapidité > sécurité).

| Code | Section | État | Rapport |
|---|---|---|---|
| F1 | FLUIDITÉ — poids réel des images | **TERMINÉE** | `AUDIT-F1.md` |
| F2 | FLUIDITÉ — rendus inutiles | **TERMINÉE** | `AUDIT-F2.md` |
| F3 | FLUIDITÉ — listes | **EN COURS** | `AUDIT-F3.md` |
| F4 | FLUIDITÉ — animations et thread UI | À FAIRE | — |
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

## Reprendre à — F3 (EN COURS)

**Constats écrits et poussés :** F3-1 (`twitninfvideo` : aucune prop de
virtualisation, ~10 lecteurs vidéo instanciés à l'ouverture — CRITIQUE),
F3-2 (`ConversationThreadScreen` : historique entier sans pagination, liste non
`inverted`, cascade de `scrollToEnd` à l'ouverture — CRITIQUE), F3-3
(recensement exhaustif : 5 listes réglées sur 20 ; `MessagesScreen`,
`CommentSheet` et les 2 chats de live à traiter).

**Recensement FAIT et rédigé (F3-3)** — 5 listes réglées sur 20. ATTENTION :
chercher `<FlatList` seul est INSUFFISANT, `FeedGutterScreen` écrit
`<Animated.FlatList`. Utiliser :
`grep -rlE "<(Animated\.)?(FlatList|SectionList|VirtualizedList)|<FlashList" src/`

**Prochains constats F3 à rédiger, par priorité :**
1. **`ScrollView` montant des listes entières** — constat à rédiger (F3-4).
   Déjà vérifié, prêt : `SearchScreen:979-1043` (~40 résultats, F2-6) et
   `StoriesTray.tsx:216-278` (`ScrollView horizontal` + `feed.groups.map()`,
   tous les `StoryRing` montés — en haut du fil d'accueil, donc chemin chaud).
   Candidats restants à examiner : `UserStatsTab` (26 `.map`), `CasinoScreen`
   (17), `ProfileCustomizationScreen` (11), `PredictiveAnalyticsScreen` (10).
   Commande utilisée pour les trouver (ScrollView SANS FlatList dans le
   fichier, triés par nombre de `.map(`) — la relancer si besoin.
2. Puis : synthèse de section F3 et passage à F4.

**ÉCARTÉ après vérification, ne pas y revenir (2)** : `TweetDetailScreen` —
`replies.map()` dans un `ScrollView`, MAIS `getTweetReplies` est plafonné à
`limit: 20` (`:504`) et `ReplyItem` est un `React.memo` (`:236`). Pas un
constat F3. En revanche les réponses sont **plafonnées à 20 sans aucun moyen
d'en charger plus** (`offset: 0` en dur, aucun `loadMore`) → à signaler en R2
comme manque fonctionnel. Le `Promise.all` de `:502` est un BON point pour R2.
`NewConversationScreen` / `GroupMembersScreen` : listes bornées (30-35). SAIN.

**ÉCARTÉ après vérification, ne pas y revenir** : `ImageViewerPaper` — pages
plein écran et aucune prop de fenêtre, MAIS une galerie est plafonnée à 4
images (`MAX_TWEET_IMAGES = 4`, `CreateTweetScreen.tsx:62`), donc les défauts
RN n'ont aucun effet. Documenté en fin de `AUDIT-F3.md` comme SAIN.

### Matériel DÉJÀ VÉRIFIÉ pendant F2 — ne pas re-chercher

- `SearchScreen.tsx:979-1043` — `ScrollView` + `.map()` pour jusqu'à 40
  résultats (`limit: 20` par type), aucune virtualisation. Vérifié en F2-6.
- `MessagesScreen.tsx` + `ConversationThreadScreen.tsx` — `keyExtractor` inline
  (mineur, signalé en F2-9).

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
