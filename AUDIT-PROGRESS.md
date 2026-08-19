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
| R2 | RAPIDITÉ — réseau | **TERMINÉE** | `AUDIT-R2.md` |
| R3 | RAPIDITÉ — poids du bundle | **EN COURS** | `AUDIT-R3.md` |
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

## R2 — TERMINÉE

5 constats (`AUDIT-R2.md`) : 1 CRITIQUE (R2-1), 3 MAJEURS (R2-2, R2-3, R2-4),
1 mineur latent (R2-5). Synthèse, « vérifié SAIN » et **limites de couverture**
en fin de `AUDIT-R2.md` — **la lire avant de rouvrir quoi que ce soit sur R2**.

Fil rouge : 3 constats sur 5 sont le même défaut — le client redemande ce qu'il
a déjà. **Une** brique manquante (déduplication des `GET` en vol dans
`makeRequest`) éteint l'essentiel de R2-1 et R2-3.

Le **fil d'accueil est SAIN** côté réseau (le mieux orchestré du dépôt) — ne
pas le rouvrir.

---

## RAPIDITÉ (R1-R2) — priorité n°2 du brief couverte pour le démarrage et le réseau.

---

## Reprendre à — R3 (EN COURS)

**Constats écrits et poussés :** R3-5 (doublon vidéo : `expo-av` 11 fichiers
*et* `react-native-video` 2 fichiers, ce dernier pour la seule prop `filter`
d'un seul écran — et cette prop est **iOS-seule**, sans garde `Platform.OS` :
sur Android l'aperçu de filtre est inerte alors que le rendu serveur, lui,
filtre bien), R3-4 (**191** fichiers importent
`@expo/vector-icons` par le **baril**, 3 par le chemin direct — correctif `sed`
mécanique ; gain en TEMPS d'évaluation, PAS en poids d'APK), addendum R3-2
(`inlineRequires: true` est activé dans `metro.config.js` — bon réglage, mais
il ne sort pas `CasinoScreen` du chemin de démarrage car la référence est
consommée dans le JSX du navigateur ; `React.lazy`/`getComponent` reste le seul
correctif), R3-3 (20 fichiers de police embarqués, dont
17 pour une option cosmétique + 2 paquets `@expo-google-fonts` — `inter` et
`plus-jakarta-sans` — jamais importés, à ajouter à R3-1. **SAIN et notable** :
`fonts.ts` importe chaque graisse individuellement, défaut de tree-shaking
déjà évité sciemment), R3-2 (83 imports d'écrans **statiques** dans
`MainNavigator`, **aucun `React.lazy`/`Suspense` dans tout le dépôt** ;
`three`+`expo-three`+`expo-gl` évalués au démarrage pour le seul
`SlotReel3D.tsx` — piège du correctif : l'export nommé `cellForSymbol` doit
être déplacé), R3-1 (6 dépendances déclarées et jamais
importées ; seule `react-native-maps` coûte vraiment — module natif autolinké
dans l'APK. Les 5 autres ne pèsent rien dans le bundle : Metro n'empaquette pas
ce qu'aucun import n'atteint — **ce point de précision est important, ne pas le
perdre**).

**Avertissement de méthode noté en tête de `AUDIT-R3.md`** : `node_modules/`
n'est PAS installé sur la machine d'audit → aucun poids de dépendance n'a pu
être mesuré. Ne pas prétendre le contraire dans les constats suivants.

### Matériel DÉJÀ VÉRIFIÉ dans les passes précédentes — ne pas le redécouvrir

Code mort / doublons recensés au fil de F2, F4, R2 :

- `src/components/TopNavbar.tsx` — importé NULLE PART.
- `src/components/PremiumUsernameGlow.tsx` — importé NULLE PART (2 boucles).
- `src/components/PremiumBadges.tsx` — importé NULLE PART (3 boucles).
- **CINQ** barres de navigation basse coexistent : `navigation/BottomTabNavigator`
  (la vraie), `components/BottomTabNavigator`, `components/ModernBottomNavbar`,
  `components/UnifiedBottomNavbar`, `components/EnhancedBottomTabNavigator`.
- `VerifiedBadge.tsx:10-12` importe `BlurView`, `MaskedView`, `Svg` sans jamais
  les rendre → **imports lourds jamais utilisés, cible directe de R3**.
- `clampWorklet` dupliqué à l'identique (`ImageViewer.tsx:57`,
  `ImageViewerPaper.tsx:73`) alors que `utils/gesture.ts:66` exporte `clamp`.
- `SearchScreen` : `startAnimations = () => {}` vide, et 5 `Animated.View`
  inertes (F2-6).
- `TweetDetailScreen:344-484`, `:773`, `:1376-1400` — ~130 lignes de code mort
  (`currentAlgorithm === 'progressive'` inatteignable, aucune écriture de cette
  valeur dans tout `src/`). Détail et réserves dans R2-5.
- **Aucune configuration ESLint** dans le dépôt (ni `.eslintrc*`, ni
  `eslint.config.*`, ni script `lint`) — donc aucun garde-fou contre les
  imports morts.

### Plan R3 — ce qu'il reste à faire

1. ~~dépendances mortes~~ **FAIT (R3-1)**. ~~three/lazy~~ **FAIT (R3-2)**.
   Reste : **doublon de rôle vidéo** — `expo-av` (11 fichiers, dont
   `Video`+`Audio`) *et* `react-native-video` (2 fichiers :
   `VideoEditorScreen.tsx:18` pour son `FilterType` iOS, `videoFilters.ts:1`
   pour le type seul). **Deux piles vidéo natives dans l'APK pour une seule
   fonctionnalité d'un seul écran.** Vérifier aussi si `expo-av` est déprécié
   en SDK 54 au profit d'`expo-video`/`expo-audio` (je ne peux pas le
   confirmer hors ligne — ne pas l'affirmer sans source).
   ~~polices~~ **FAIT (R3-3)**.
2. ~~tree-shaking~~ **FAIT** : `fonts.ts` SAIN (R3-3), `@expo/vector-icons`
   → R3-4. Les `import * as X` restants sont tous des modules Expo natifs
   (`ImagePicker` ×7, `Network` ×4, `Notifications` ×3, `SecureStore`,
   `Location`, `Device`, `WebBrowser`, `ScreenOrientation`, `Linking`,
   `Battery`) : **forme normale et sans alternative** pour ces paquets, PAS un
   défaut — vérifié, ne pas le rouvrir.
   Reste éventuellement : le baril `src/components/ui/index.ts`.
3. Ressources embarquées inutilement : croiser `assets/` (déjà mesuré en F1 —
   **relire `AUDIT-F1.md` plutôt que remesurer**) avec ce qui est réellement
   `require`/importé.
4. ~~`metro.config.js`~~ **LU** : `inlineRequires: true` (bon réglage, voir
   addendum R3-2). ~~`babel.config.js`~~ **LU** : `transform-remove-console`
   actif en production avec `exclude: ['warn','error']` — **BON**, à citer en
   SAIN, et cela **répond par avance** au point « journaux » routé vers S3
   depuis R2-5. Reste : vérifier Hermes dans `app.config.js`.
5. ~~doublon vidéo~~ **FAIT (R3-5)**.
6. Reste : Hermes dans `app.config.js`, `assets/` (**déjà mesuré en F1 — relire
   `AUDIT-F1.md`, ne pas remesurer** ; noter seulement l'angle bundle : les
   618 Ko d'`assets/casino/` = 44 % de tout `assets/` (1,4 Mo) pour le SEUL
   composant qui tire aussi `three` — cf. R3-2), puis **synthèse R3** et
   passage à **S1**.

### Matériel à ROUTER vers S3 (sécurité, plus tard)

- `TweetDetailScreen` `loadProgressiveInfo` journalise les réponses réseau
  complètes en clair (`console.log`, `:356/362/366/375`). Vérifier si les
  `console.log` sont retirés en production.

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
