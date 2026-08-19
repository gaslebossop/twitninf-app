AUDIT TERMINÉ — les 10 sections sont TERMINÉES. La routine peut être désactivée.

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
| S1 | SÉCURITÉ — secrets dans l'historique git | **TERMINÉE** | `AUDIT-S1.md` |
| S2 | SÉCURITÉ — ce qui part en clair dans le bundle | **TERMINÉE** | `AUDIT-S2.md` |
| S3 | SÉCURITÉ — appareil et chaîne de build | **TERMINÉE** | `AUDIT-S3.md` |

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

## S1 — TERMINÉE

**Aucun secret d'authentification dans l'historique.** 0 critique, 0 majeur,
3 mineurs (divulgation d'infrastructure). Décompte et étendue de la
vérification dans `AUDIT-S1.md` ; **le détail va au propriétaire, pas ici**.

Historique **intégralement** couvert et petit : 225 commits, 2 603 objets,
1 396 blobs examinés un par un, du 2026-08-03 au 2026-08-19, toutes branches
distantes récupérées. **Ne pas refaire ce balayage** — l'étendue exacte et les
motifs recherchés sont listés dans `AUDIT-S1.md`.

---

## S2 — TERMINÉE

**6 variables `EXPO_PUBLIC_*`** recensées et jugées une par une. 0 critique,
0 majeur, 1 modéré, 1 mineur, 1 informatif. `AUDIT-S2.md` — **détail au
propriétaire, pas ici**.

La section a surtout trouvé une posture **délibérée et testée** :
`resolveServerUrl` (HTTPS obligatoire + rejet des identifiants dans l'URL),
`tests/security-config.test.js` qui relit le **manifeste généré**, durcissement
Android complet. Tout est listé en SAIN dans `AUDIT-S2.md` — **ne pas le
rouvrir**.

---

## S3 — TERMINÉE

0 critique, 0 majeur, 3 mineurs (rémanence après déconnexion · code mort
dangereux · durcissement CI). `AUDIT-S3.md` — **détail au propriétaire**.

**SAIN et remarquable** : les jetons vivent dans le keystore (`expo-secure-store`)
avec migration et **refus délibéré du repli sur AsyncStorage** ; aucun
déclencheur GitHub Actions exploitable par un tiers (pas de
`pull_request_target`/`issue_comment`/`workflow_run`) ; aucune injection dans un
bloc `run:`.

**LIMITE LA PLUS IMPORTANTE DE TOUT L'AUDIT** : le code serveur n'est pas dans
ce dépôt. La question « les routes d'administration revérifient-elles le rôle
côté serveur ? » ne peut PAS être tranchée d'ici. **C'est la vérification n°1
à faire après cet audit**, dans le dépôt de l'API.

---

# CONCLUSION GÉNÉRALE — les 10 sections sont TERMINÉES

**24 constats** au total sur les 10 sections.

| Priorité du brief | Sections | Constats | Les plus graves |
|---|---|---|---|
| **1 — FLUIDITÉ** | F1-F4 | 17+ | 2 listes non virtualisées (F3), `VerifiedBadge` (F4-1) |
| **2 — RAPIDITÉ** | R1-R3 | 13 | démarrage en chaîne (R1-1/2), badge messages toutes les 30 s (R2-1) |
| **3 — SÉCURITÉ** | S1-S3 | 6 mineurs, **0 critique, 0 majeur** | aucun secret dans l'historique (S1) |

## Le constat central, qui traverse les 10 sections

**Sept fois** au cours de cet audit, le même schéma est revenu : *le bon
réflexe existe déjà dans le dépôt, écrit une fois, souvent avec la raison
expliquée en commentaire — et il n'a été propagé nulle part ailleurs.*

F2-3, F3-3, F4-1, F4-2a, R2-5, R3-4, S3-3. Sept occurrences ne sont pas une
coïncidence : c'est **le** problème du dépôt.

Et le corollaire compte autant : **ce dépôt ne manque pas de compétence.** Les
diagnostics y sont justes, les commentaires excellents et souvent supérieurs à
ce qu'on lit dans des projets professionnels — `fonts.ts` explique pourquoi il
importe par graisse, `tokenStore.ts` explique pourquoi il refuse un repli,
`security-config.test.js` explique pourquoi il cherche `tools:node="remove"`.
Ce qui manque n'est pas le savoir : c'est le **mécanisme de diffusion**.

**D'où la recommandation n°1 de tout l'audit, qui n'est aucun des 24 constats :
installer ESLint.** Le dépôt n'a **aucune** configuration ESLint — ni
`.eslintrc*`, ni `eslint.config.*`, ni script `lint`. Avec
`react-hooks/exhaustive-deps` et `no-restricted-imports`, une bonne partie des
constats de F2, F4 et R3 serait devenue **impossible à écrire**. Corriger 191
imports une fois ne sert à rien si le 192e peut encore être écrit demain.

## Les 5 actions à plus fort rendement, tous domaines confondus

1. **Vérifier côté serveur** que chaque route d'administration revérifie le
   rôle (S3 — la seule chose que cet audit ne pouvait pas faire).
2. **Installer ESLint** (transverse — voir ci-dessus).
3. **Dédupliquer les `GET` en vol** dans le client HTTP (R2 — éteint à lui seul
   l'essentiel de R2-1 et R2-3, sans risque de données périmées).
4. **Paralléliser le démarrage** (R1-1/R1-2 — trois maillons d'une chaîne de
   cinq peuvent avancer ensemble).
5. **Retirer les dépendances mortes et différer `three`** (R3-1, R3-2 — après
   une mesure d'APK avant/après).

## Ce que cet audit n'a PAS pu faire — à lire avant de le prolonger

- **Aucune mesure.** Pas de profilage de fluidité, pas de chronométrage de
  démarrage, pas de latence réseau, pas de poids d'APK, pas d'analyse de
  bundle. `node_modules/` n'était pas installé sur la machine d'audit. **Tout
  classement par gain est un raisonnement, pas une mesure** — et c'est dit
  explicitement à chaque endroit où ça compte.
- **Le code serveur** n'est pas dans ce dépôt (limite de S3, et de R2 pour la
  pagination).
- **`android/` et `ios/`** non explorés (interdit par le brief).
- **Une seule donnée de volume réel existe dans tout le dépôt** : ~977 tweets
  vivants en production. Toute priorisation dépendant du volume est une
  estimation prudente.

Chaque fichier `AUDIT-*.md` se termine par sa propre section « limites de la
couverture » : **les lire avant de rouvrir une section**, elles bornent
précisément ce qui a été instruit et ce qui ne l'a pas été.

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
