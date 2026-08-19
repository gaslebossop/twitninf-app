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
| R3 | RAPIDITÉ — poids du bundle | **TERMINÉE** | `AUDIT-R3.md` |
| S1 | SÉCURITÉ — secrets dans l'historique git | **EN COURS** | `AUDIT-S1.md` |
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

## R3 — TERMINÉE

5 constats (`AUDIT-R3.md`) : 2 MAJEURS (R3-1 dépendances mortes dont
`react-native-maps` natif ; R3-2 `three` évalué au démarrage), 3 modérés
(R3-3 polices, R3-4 baril d'icônes, R3-5 doublon vidéo). Synthèse, « vérifié
SAIN » et **limites de couverture** en fin de `AUDIT-R3.md` — **la lire avant
de rouvrir quoi que ce soit sur R3**.

Idée-force à reprendre en conclusion : **trois coûts distincts** (poids du
binaire / temps de démarrage / maintenance) ; les confondre fait dire des
choses fausses. Et **le casino est le point lourd unique** du dépôt (`three`
+ 618 Ko d'atlas = 44 % d'`assets/`).

**Mesure manquante et prioritaire** : `node_modules/` n'était pas installé →
aucun poids n'a pu être mesuré. Faire une mesure d'APK avant/après avant
d'agir sur R3-1, R3-3, R3-5.

---

## FLUIDITÉ + RAPIDITÉ (F1-F4, R1-R3) — TERMINÉES. Priorités n°1 et n°2 du brief entièrement couvertes.

---

## Reprendre à — S1 (EN COURS)

**Aucun constat écrit pour l'instant.** `AUDIT-S1.md` reste à créer.

⚠️ **RAPPEL CRITIQUE — le dépôt est PUBLIC.** Dans `AUDIT-S1.md` et dans ce
fichier : **uniquement le décompte et la gravité**. Jamais un secret, jamais un
chemin exact, jamais un commit précis, jamais une méthode. Le détail va dans le
MESSAGE FINAL, que seul le propriétaire lit.

### Plan S1 — historique git complet

Le dépôt est passé de privé à public : **tout secret ayant existé dans
l'historique est compromis**, même supprimé depuis.

1. `git log --all --oneline | wc -l` pour dimensionner.
2. `git log -S` sur les motifs usuels (`api_key`, `secret`, `token`,
   `password`, `Bearer `, `-----BEGIN`, `AIza`, `sk_`, `ghp_`, `xox`).
3. `git log --all --diff-filter=A --name-only` pour les fichiers ajoutés puis
   supprimés (`.env`, `*.keystore`, `*.p8`, `*.p12`, `google-services.json`,
   `serviceAccount*.json`).
4. `git rev-list --all` + recherche dans les objets non atteignables si le
   temps le permet.
5. Vérifier `.gitignore` et `.env.example` (ce dernier ne doit contenir que
   des valeurs factices).

**Piste déjà connue à instruire ici** : `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`
(citée dans `plugins/withGoogleMapsApiKey.js` et `.env.example`) — le préfixe
`EXPO_PUBLIC_` la publie de toute façon (→ **S2**), mais vérifier si une valeur
réelle a transité dans l'historique.

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
