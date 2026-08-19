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
| S2 | SÉCURITÉ — ce qui part en clair dans le bundle | **EN COURS** | `AUDIT-S2.md` |
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

## S1 — TERMINÉE

**Aucun secret d'authentification dans l'historique.** 0 critique, 0 majeur,
3 mineurs (divulgation d'infrastructure). Décompte et étendue de la
vérification dans `AUDIT-S1.md` ; **le détail va au propriétaire, pas ici**.

Historique **intégralement** couvert et petit : 225 commits, 2 603 objets,
1 396 blobs examinés un par un, du 2026-08-03 au 2026-08-19, toutes branches
distantes récupérées. **Ne pas refaire ce balayage** — l'étendue exacte et les
motifs recherchés sont listés dans `AUDIT-S1.md`.

---

## Reprendre à — S2 (EN COURS)

**Aucun constat écrit pour l'instant.** `AUDIT-S2.md` reste à créer.

⚠️ **Le dépôt est PUBLIC** : dans `AUDIT-S2.md`, décompte et gravité
uniquement. Le détail (quelles variables, quelles valeurs, quelle restriction
manque) va dans le MESSAGE FINAL.

### Matériel DÉJÀ VÉRIFIÉ pour S2 — ne pas le redécouvrir

`.env.example` a été lu intégralement en S1. Il déclare **5 variables
`EXPO_PUBLIC_*`** — donc 5 valeurs inlinées par Metro et lisibles en clair par
quiconque télécharge l'APK ou l'IPA :

1. `EXPO_PUBLIC_API_URL` — serveur API principal.
2. `EXPO_PUBLIC_STREAM_SERVER` — serveur de stream (RTMPS/HLS/chat live).
3. `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` — **le cas le plus intéressant** :
   `.env.example` dit qu'elle doit être « restreinte à l'application Android
   `com.gasleboss.TwitNin` ». Or une restriction Android se fait par
   *package + empreinte SHA-1 du certificat de signature*. **À instruire** :
   quelle empreinte est utilisée ? Si c'est celle du magasin de **débogage**
   (identifié en S1 comme le fichier universel du SDK Android, donc public),
   la restriction ne protège rien. C'est la vraie question de S2.
   Voir aussi R3-1 : la carte est devenue une `WebView`, donc **cette clé ne
   sert peut-être tout simplement plus à rien** — une clé publiée qui ne sert
   plus est un risque sans contrepartie.
4. `EXPO_PUBLIC_UPDATE_FEED_URL` — flux de mise à jour, renseigné par la CI.
5. `EXPO_PUBLIC_BUILD_VERSION`.

### Plan S2

1. Balayer tout `src/` sur `process.env.EXPO_PUBLIC_` : les 5 ci-dessus
   sont-elles les seules réellement lues ? Y en a-t-il d'autres non
   documentées dans `.env.example` ?
2. Pour chacune : juger si la divulgation est acceptable, et si une
   restriction existe **côté fournisseur** (c'est le seul vrai rempart — le
   préfixe `EXPO_PUBLIC_` rend la valeur publique par construction).
3. Vérifier `app.config.js` : d'autres valeurs y sont-elles injectées dans
   `extra` ou dans le manifeste ?
4. Vérifier `src/config/*.ts` (`adminConfig.ts`, `api.ts`,
   `featureFlagKeys.ts`, `trading.ts`) — repérés en S1 comme fichiers de
   configuration à lire.
5. `tests/security-config.test.js` existe : le lire, il documente peut-être
   déjà les invariants attendus.

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
