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

---

## Reprendre à — F4 (EN COURS)

**Aucun constat encore rédigé.** `AUDIT-F4.md` reste à créer.

### Matériel DÉJÀ VÉRIFIÉ pendant F2/F3 — ne pas re-chercher

**Pistes à creuser, vérifiées comme existantes :**
- `CasinoScreen.tsx:212` — `CONFETTI.map()`, pièces animées simultanément.
- `SearchScreen.tsx:102-103`, `:761`, `:863`, `:911`, `:942` — 5
  `Animated.View` dont les valeurs (`fadeAnim`=1, `slideAnim`=0) ne sont
  JAMAIS animées : aucun `Animated.timing/spring/parallel` dans le fichier.
  Déjà écrit en F2-6, à ne PAS redoubler en F4 — juste citer.
- `CreateTweetScreen.tsx:317-334` — `Animated.sequence` par caractère
  (écrit en F2-7, ne pas redoubler).
- `src/theme/motion.ts` — contient les bonnes valeurs maison
  (`duration.fast/base`, `easing.out`, `spring`) : à utiliser comme référence
  pour juger les autres animations.
- `scrollEventThrottle` : à recenser (le brief cible la valeur 16 sur écran
  120 Hz). `ConversationThreadScreen:1608` est à 160.
- `onScroll` en JS vs `useAnimatedScrollHandler` : à recenser.
- Appels d'une fonction JS ordinaire depuis un worklet SANS `runOnJS` : à
  chercher (tue l'app sans journal). `ImageViewerPaper` fait ça correctement,
  c'est la bonne référence.

**DÉJÀ VÉRIFIÉ SAIN pour F4, ne pas relire :**
- `src/utils/litPulse.ts` — horloge singleton de module, pilote natif, UNE
  seule `Animated.loop` pour toute l'app. Excellent.
- `AnimatedNameFill` (`ProfileDecoration.tsx:619`) — `useDrift` coupé quand
  l'effet est `none` : pas de boucle par ligne de fil.
- `ConversationThreadScreen:1341-1345` — `entering={FadeInDown}` gardé par
  `justArrivedIdsRef` (Set purgé à 700 ms). Garde-fou CLAUDE.md respecté.
- `CreateTweetScreen:1086`, `:1094` — ressorts focus/blur tension 50 /
  friction 14 = amortissement quasi critique. CONFORME.
- `twitninfvideo:543-544` — `onViewableItemsChanged`/`viewabilityConfig` en
  `ref` (RN lève une exception sinon). Correct.
- `ImageViewerPaper` — `runOnJS` systématique, `applyZoom` appelé aux bornes
  du geste seulement, pas par image.

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
