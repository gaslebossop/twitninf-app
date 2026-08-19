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
| S3 | SÉCURITÉ — appareil et chaîne de build | **EN COURS** | `AUDIT-S3.md` |

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

## Reprendre à — S3 (EN COURS)

**Aucun constat écrit pour l'instant.** `AUDIT-S3.md` reste à créer.
**Dernière section de l'audit.**

⚠️ Dépôt PUBLIC : décompte et gravité seulement dans `AUDIT-S3.md`.

### Matériel DÉJÀ VÉRIFIÉ à router vers S3 — ne pas le redécouvrir

- **`src/config/adminConfig.ts` (121 l.) — PISTE PRINCIPALE, déjà à moitié
  instruite.** Le fichier expose `ADMIN_CONFIG.TEST_MODE: true`,
  `DEFAULT_ROLE: 'admin'` et une liste `GRANTED_PERMISSIONS` accordant à
  *tout* utilisateur `manage_users`, `ban_users`, `delete_content`, etc.
  **MAIS** : `grep ADMIN_CONFIG|adminConfig|hasTestPermission|getTestRole` sur
  tout `src/` (hors le fichier lui-même) ne renvoie **AUCUN** résultat —
  le fichier est **importé par personne**. Ce n'est donc **pas** une faille
  active : c'est une mine dormante + du code mort (à ajouter à R3-1).
  **Ne PAS le présenter comme une vulnérabilité exploitable** — ce serait un
  faux positif, et le brief insiste : un faux positif fait perdre la confiance
  dans tout le rapport.
- **La vraie logique de permissions** est `src/hooks/useAdminPermissions.ts`
  (lit `user.role` via `AuthContext`) + `api.ts:584` (`hasPermission`) et
  `api.ts:596` (`isAdmin`). **RESTE À INSTRUIRE** : ces contrôles ne gardent-ils
  que l'affichage (légitime) ou servent-ils de seule barrière (à revérifier
  côté serveur) ? C'est le cœur du point « contrôles côté client » du brief.
- **Durcissement Android : déjà vérifié SAIN en S2** (`usesCleartextTraffic:
  false`, `allowBackup: false`, `blockedPermissions`, ProGuard + shrinkResources
  en R3) et **couvert par `tests/security-config.test.js`**. Ne pas refaire.
- **Journaux : déjà répondu en R3.** `babel.config.js` retire les `console.*`
  en production sauf `warn`/`error`. Le point routé depuis R2-5 est clos.
- **Magasin de clés : déjà vérifié SAIN en S1** (magasin de débogage universel
  du SDK Android, aucun magasin de release versionné).
- **Manipulation des secrets par la CI : déjà vérifiée SAIN en S2.**

### Plan S3 — ce qui reste vraiment à faire

1. **Stockage sur l'appareil** : `src/services/tokenStore.ts` (repéré en S1),
   `expo-secure-store` *est* dans les dépendances — vérifier si le jeton y va
   ou dans `AsyncStorage` (non chiffré). Puis : quelles données personnelles
   sont mises en cache, et **l'effacement à la déconnexion est-il réel** (toutes
   les clés, ou seulement le jeton) ?
2. **Contrôles côté client** : voir `useAdminPermissions` ci-dessus.
3. **Workflows GitHub Actions sur dépôt public** — 5 fichiers :
   `agent-task-trigger.yml`, `android-build.yml`, `android-publish.yml`,
   `check-api.yml`, `ios-build.yml`. Chercher : déclencheur exploitable
   (`pull_request_target`, `issue_comment`, `workflow_run`), **injection dans
   un bloc `run:`** via `${{ github.event.* }}` non échappé, fuite de secret
   dans les journaux. `agent-task-trigger.yml` est déclenché par « La Forge »
   (voir `CLAUDE.md`) — **c'est le candidat n°1** : entrée utilisateur qui
   atteint un workflow.
4. Puis : **synthèse S3**, écrire `AUDIT TERMINÉ` en première ligne de ce
   fichier, pousser, et signaler que la routine peut être désactivée.

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
