# Reprise — refonte de l'onglet Explorer

**Écrit le 2026-08-18, session interrompue faute de budget.**
Tout ce qu'il faut pour continuer sans rien relire d'autre que ce document,
le spec et le plan.

---

## 1. Où en est le travail

Dépôt : `C:\Users\nouno\OneDrive\Bureau\IAFILTRE\twitninfbeta`
Branche : **`explore-refonte`** (partie de `main` au commit `13a5ec0`)
État : `npm run typecheck` propre, `npm test` 96/96, arbre de travail propre.

| Tâche | État |
|---|---|
| 0 — essayer le pager immersif sur appareil | **reportée** — exige un téléphone, décidé avec l'utilisateur |
| 1 — `cardFormat.ts` + tokens couleur | ✅ livrée, relue, propre |
| 2 — `wallLayout.ts` | ✅ livrée, relue, propre |
| 3 — `ExploreCard.tsx` | ✅ livrée, 1 tour de correctif, **re-relue et approuvée** |
| 4 — `ExploreHero.tsx` | ⚠️ livrée + correctif appliqué, **le correctif N'A PAS été re-relu** |
| 5 — `ExploreActionSheet.tsx` | ❌ non commencée |
| 6 — `ExploreWall.tsx` | ❌ non commencée |
| 7 — `ExploreGrid.tsx` (assembleur) | ❌ non commencée |
| 8 — câblage `TweetsScreen.tsx` | ❌ non commencée |
| 9 — vérification sur appareil | **reportée** — exige un téléphone |

**Première chose à faire en reprenant :** re-relire le correctif de la Task 4
(`git diff b147f2d 75f3d5c -- src/components/feed/explore/ExploreHero.tsx`).
C'est le seul travail livré qui n'a pas passé sa porte de revue.

---

## 2. Les documents

| Fichier | Rôle |
|---|---|
| `docs/superpowers/specs/2026-08-18-explore-refonte-design.md` | le **spec** validé : le pourquoi, les chiffres mesurés en prod, les arbitrages |
| `docs/superpowers/plans/2026-08-18-explore-refonte.md` | le **plan** en 10 tâches, avec le code complet de chacune |
| `.superpowers/sdd/progress.md` | le **registre** de progression (non versionné) |
| `.superpowers/sdd/task-N-brief.md` | le cahier des charges extrait d'une tâche |
| `.superpowers/sdd/task-N-report.md` | le rapport de l'implémenteur de la tâche N |

⚠️ **Le plan a été corrigé six fois pendant l'exécution.** Il est à jour et les
tâches 5 à 8 intègrent déjà les correctifs découverts sur les tâches 1 à 4.
Prends-le tel qu'il est, ne repars pas d'une version mémorisée.

---

## 3. La méthode à reprendre

Le travail est mené avec le skill **`superpowers:subagent-driven-development`** :
un sous-agent implémenteur neuf par tâche, puis un sous-agent relecteur, puis
un sous-agent correcteur si la revue trouve quelque chose, puis re-revue.

```bash
# Extraire le cahier des charges de la tâche N
bash "C:/Users/nouno/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/subagent-driven-development/scripts/task-brief" \
  docs/superpowers/plans/2026-08-18-explore-refonte.md 5
```

```bash
# Fabriquer le paquet de revue entre deux commits
bash "C:/Users/nouno/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/subagent-driven-development/scripts/review-package" BASE HEAD
```

Les sous-agents tournent très bien sur **sonnet** : le plan contient le code,
leur travail est de la transcription plus de la vérification. Ils ont trouvé
**cinq vrais défauts** que le plan contenait — c'est le cœur de la valeur du
procédé, pas un accident. Dis-leur explicitement de s'arrêter et de renvoyer
`NEEDS_CONTEXT` plutôt que de deviner.

---

## 4. Ce que l'exécution a appris — À NE PAS REDÉCOUVRIR

Ces cinq points ont coûté un tour de correctif chacun. Ils sont déjà intégrés
au plan, mais rappelle-les dans chaque dispatch.

### 4.1 ⚠️ Deux moteurs d'animation, deux sources de courbes

**C'est le piège le plus coûteux.** Reanimated 4.1.1 exige que la fonction
d'easing soit un **worklet** (`assertEasingIsWorklet`, `timing.ts:81`).
`src/theme/motion.ts` importe son `Easing` de **`react-native`** : ses courbes
n'ont pas de `__workletHash`.

```
withTiming(x, { easing: easing.out })  // easing de theme/motion
→ ReanimatedError: The easing function is not a worklet
```

- **Reanimated** (`withTiming`, `withSpring`) → `import { ease, timing, springs } from '../../../utils/gesture'`
  (`timing.instant/fast/base/slow/exit`, `springs.settle/snappy`)
- **`Animated` du cœur RN** → `src/theme/motion.ts`

Les béziers sont identiques des deux côtés, seul le moteur change.
`src/utils/gesture.ts` est déjà utilisé par `Tappable`, `Toast`, `CommentSheet`,
`StoryViewer` et quatre autres.

### 4.2 `measureInWindow` rend son résultat par callback ASYNCHRONE

Lire la variable juste après l'appel renvoie **toujours `null`**. Deux formes
correctes selon le cas :

- **S'il y a une course à gérer** (le tap différé de 260 ms, qu'un double-tap
  doit pouvoir annuler) : écrire dans un `useRef` depuis le callback, lancer le
  `setTimeout` **de façon synchrone**, et lire le ref à l'échéance. Créer le
  timer depuis le callback casserait l'annulation du double-tap.
- **S'il n'y a pas de course** (appui long) : appeler directement depuis le
  callback de `measureInWindow`.

### 4.3 `Tappable` fait déjà la composition de gestes

`src/components/ui/Tappable.tsx` expose `onLongPress` et compose en interne
`Gesture.Exclusive(long, tap)`. **Ne jamais emboîter un `GestureDetector`
par-dessus** : ça rouvre la question, jamais éprouvée dans ce dépôt, de la
relation entre deux détecteurs imbriqués.

Conséquence assumée : le délai d'appui long est celui de RNGH, **500 ms** (et
non 350), parce que `Tappable` ne fixe pas de `minDuration`. 500 ms est la
valeur standard iOS et Android. À confirmer au toucher en Task 9.

### 4.4 Aucun `Gesture.Pan` dans les composants d'Explorer

`TweetsScreen.tsx:411` enveloppe **tout le fil**, Explorer compris, dans un
`Gesture.Pan` horizontal (`activeOffsetX([-24, 24])`) qui change d'onglet. Un
Pan imbriqué sans relation déclarée laisse les deux s'activer : on changerait
d'onglet **et** de contenu. Ce geste est le code le plus délicat de l'écran et
n'a jamais été essayé à la main.

C'est pour ça que la bande d'entrée **n'a pas** d'avance manuelle au glissé.
Arbitré avec l'utilisateur le 2026-08-18 — ne pas la « rajouter par gentillesse ».

### 4.5 `borderCurve: 'continuous'` n'existe pas en RN 0.81.5

`tsc` le rejette. Retiré partout. Ne pas le réintroduire, ne pas le forcer par
un cast.

### 4.6 Divers, moins coûteux

- `displayNameFonts` s'importe depuis `src/theme/fonts`, **pas** depuis le
  barrel `src/theme` qui ne le réexporte pas.
- Aucune couleur hex en dur : `colors.black` et `colors.white` existent dans les
  deux palettes.
- La hauteur de la tab bar se **lit** via `useContext(BottomTabBarHeightContext)`,
  jamais un nombre en dur. `useContext` rend `undefined` hors tab navigator ;
  `useBottomTabBarHeight` lève une erreur.

---

## 5. Pièges du dépôt (source : `CLAUDE.md` à la racine)

- **`.gitignore` avale `*.md` et `*.js` en silence.** `git add` ne renvoie
  aucune erreur, le fichier est juste absent du commit. Toujours `git add -f`
  sur un `.md` ou `.js` nouveau, puis vérifier avec `git show --stat HEAD`.
  *(Exceptions déjà en place : `!tests/*.test.js`, `!docs/**/*.md` — ajoutée
  par cette session —, `CLAUDE.md`, `App.tsx`, `plugins/*.js`, les configs.)*
- **`Alert.alert` a été retiré du dépôt (392 → 0).** Remplaçants : `useToast`,
  `useConfirm`, `useActionSheet`, `usePrompt`, `useReward`. Ces hôtes ne
  s'affichent **pas** sous une `<Modal>` React Native.
- **`expo-haptics` n'est pas installé** — retour tactile via `src/utils/feedback`.
- **`Tappable`, jamais `TouchableOpacity` seul** (l'opacité seule est invisible
  sur fond noir).
- **`TweetsScreen` importe Reanimated sous le nom `Animated`.** Une
  `Animated.Value` du cœur RN y échoue silencieusement.
- **`scheduleOnRN` de `react-native-worklets`, jamais `runOnJS`** dans le code
  nouveau. `runOnJS` marche encore mais est déprécié deux fois. Les 50 usages
  existants ailleurs ne sont **pas** à migrer (hors périmètre).
- Une fonction JS ordinaire appelée dans un worklet **tue l'app sans aucun log**.

---

## 6. Ce qui reste à faire, dans l'ordre

1. **Re-relire le correctif de la Task 4** (voir §1).
2. **Task 5** — `ExploreActionSheet.tsx`. ⚠️ Le brief impose de **lire d'abord
   le hook `useActionSheet()` existant** et de ne garder un composant sur mesure
   que si l'ancrage sur le rectangle de la carte l'exige. Le justifier dans le
   rapport.
3. **Task 6** — `ExploreWall.tsx`. Sa revue doit vérifier deux points reportés
   des tâches 1 et 2 :
   - que `estimatedHeightOf` est bien la **seule** source de vérité de hauteur
     (rendu **et** équilibrage des colonnes) ;
   - que la rupture est bien rendue **avant** les deux colonnes.
4. **Task 7** — `ExploreGrid.tsx` devient un assembleur. Après cette tâche,
   `npm run typecheck` **échouera sur `TweetsScreen.tsx`** tant que la Task 8
   n'est pas faite : c'est attendu, ce n'est pas une régression.
5. **Task 8** — câblage. Les noms exacts sont déjà relevés dans le plan :
   `followingIds`, `handleExploreFollow` (qui **ne sait que suivre**, jamais se
   désabonner), `handleShare(tweetId: string)`. Pas de prop `onReply` :
   `ExploreGrid` héberge `CommentSheet` lui-même.
6. **Tasks 0 et 9** — sur appareil, avec l'utilisateur. Le pager immersif
   (`ExploreImmersive.tsx`, 928 lignes) **n'a jamais tourné sur un téléphone**.

Puis : revue finale de branche, et `superpowers:finishing-a-development-branch`.

---

## 7. Remarques mineures à trancher en revue finale

Relevées par les relecteurs, non bloquantes, aucune corrigée :

- `hashId(id: string | number)` accepte plus large que `Tweet.id`, toujours `string`.
- `quoteType` renvoie `fontSize`/`lineHeight`/`lines` que `estimatedHeightOf`
  n'utilise pas (ils servent au rendu) — mérite un mot de commentaire.
- Valeurs magiques non justifiées individuellement dans `cardFormat.ts` :
  `0.52`, `56`, `8`, `26`, `MEDIA_RATIOS`.
- `splitColumns` est un glouton sans tri préalable (pas LPT/best-fit) : l'écart
  peut rester visible sur un bloc très hétérogène.
- Seuil `200` en dur dans le test d'équilibrage, origine non commentée.

---

## 8. Le fait qui justifie toute la refonte

Mesuré en prod le 2026-08-18 (`51.210.11.74`, base `twitninf`) :

| | |
|---|---|
| Tweets vivants avec une image | **5 sur 977** — et 0 sur les 9 derniers jours |
| Tweets de moins de 46 caractères | **305 sur 553** publiés en 3 semaines |
| Auteurs | 3 comptes = **88 %** du volume |
| Likes | 350 tweets ≥ 1 like, 21 ≥ 5, **3 ≥ 10** (max 14) |

Le masonry précédent est une forme **conçue pour l'image**, nourrie à 99 % de
texte : elle promettait des photos et livrait des rectangles gris. D'où le mur
typographique, la suppression de l'avatar répété, et la règle « aucun compteur
en dessous de 5 ».

Le drapeau `tweet.images` atteint 100 % le **2026-08-24** — mais le stock de
977 tweets existants restera du texte. Explorer doit être beau avec le contenu
réel, pas avec le contenu espéré.
