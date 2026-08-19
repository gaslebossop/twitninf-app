# AUDIT twitninf-app — suivi d'avancement

Routine automatisée. Elle reprend TOUJOURS à la première section qui n'est pas
`TERMINÉE` — donc à une section `EN COURS` s'il y en a une, en repartant du
point noté dans « Reprendre à ». Ne pas réordonner les lignes : l'ordre est
l'ordre de priorité imposé (fluidité > rapidité > sécurité).

| Code | Section | État | Rapport |
|---|---|---|---|
| F1 | FLUIDITÉ — poids réel des images | **TERMINÉE** | `AUDIT-F1.md` |
| F2 | FLUIDITÉ — rendus inutiles | **EN COURS** | `AUDIT-F2.md` |
| F3 | FLUIDITÉ — listes | À FAIRE | — |
| F4 | FLUIDITÉ — animations et thread UI | À FAIRE | — |
| R1 | RAPIDITÉ — démarrage | À FAIRE | — |
| R2 | RAPIDITÉ — réseau | À FAIRE | — |
| R3 | RAPIDITÉ — poids du bundle | À FAIRE | — |
| S1 | SÉCURITÉ — secrets dans l'historique git | À FAIRE | — |
| S2 | SÉCURITÉ — ce qui part en clair dans le bundle | À FAIRE | — |
| S3 | SÉCURITÉ — appareil et chaîne de build | À FAIRE | — |

---

## Reprendre à — F2

**Constats déjà écrits et poussés :** F2-1 (`CommentSheet`),
F2-2 (`LiveViewerScreen`, chat du live), F2-3 (comparateurs `TweetRow` /
`TweetRowGutter` : `tweet.author` jamais comparé), F2-4
(`ConversationThreadScreen` : `renderItem` dépend de `messages`, toutes les
bulles se re-rendent à chaque message), F2-5 (`ConversationThreadScreen` :
dépendances trop étroites, l'accusé « Vu » n'apparaît pas en temps réel),
F2-6 (`SearchScreen` : frappe re-rendant 40 résultats non virtualisés,
+ 5 `Animated.View` inertes).

**Déjà couvert, rien à signaler** (ne pas relire) :
- Les 9 fournisseurs de `src/contexts/` : toutes les valeurs de contexte sont
  mémoïsées. Vérifié un par un.
- `TweetsScreen.tsx` : `rowContext` (useMemo), `handleRowAction` (useCallback +
  `tweetsRef`), `renderTweet` et `keyExtractor` (useCallback). Sain.
- `MessagesScreen.tsx` : `renderConversation` mémoïsé, dépendances stables.
  Seul reste mineur : `keyExtractor` inline (à traiter en F3).
- `TweetRowGutter` : comparateur complet sur ses 11 props, exclusion de
  `stats.views` documentée et justifiée. Sain.

**Aucun constat en attente de rédaction.** Tout ce qui était vérifié est écrit.

**Piste F2-5 — RÉSOLUE** : il n'y a **aucune configuration ESLint** dans ce
dépôt (ni `.eslintrc*`, ni `eslint.config.*`, ni script `lint` dans
`package.json`). La règle `exhaustive-deps` ne tourne donc jamais : la classe
de bugs de F2-5 n'a aucun filet automatique. À reprendre en R3 ou en note
transverse de fin d'audit — ce n'est pas un constat F2 en soi.

**Vérifié au passage (à réutiliser, ne pas refaire)** :
- `babel.config.js` applique bien `transform-remove-console` en production
  (`exclude: ['warn','error']`). Les 323 `console.log` de `src/` ne sont donc
  PAS un problème de release. Reste à confirmer en R3 que `NODE_ENV=production`
  est bien posé au build EAS.
- `SearchScreen` n'appelle PAS le réseau à chaque frappe (`onSubmitEditing`).

**Note de chemin** : `TweetRowGutter.tsx` est dans
`src/components/feed/paper2b/`, pas `src/components/feed/`.

**Pistes NON encore explorées pour F2 :**
- « État placé trop haut » : reste `CreateTweetScreen`, `ForgeScreen`,
  `WalletScreen`, `TradingScreen`. (`SearchScreen` est fait → F2-6.)
- Les renderItem inline restants : `SendCoinsModal:236`,
  `ImageViewerPaper:334`, `FollowRequestsScreen:136`, `MyPassesScreen:358`,
  `EconomyManagementScreen:268/318`, `UserConnectionsScreen:140`,
  `CommunityCurrenciesScreen:103`, `LivesScreen:171`, `twitninfvideo:545`,
  `GoLiveScreen:455`.
- Gros composants non-liste : `UserStatsTab` (2379 l.),
  `ProfileDecoration` (1521 l.), `NavbarOnboardingModal` (1121 l.).

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
