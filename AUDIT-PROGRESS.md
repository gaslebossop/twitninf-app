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
`TweetRowGutter` : `tweet.author` jamais comparé).

**Déjà couvert, rien à signaler** (ne pas relire) :
- Les 9 fournisseurs de `src/contexts/` : toutes les valeurs de contexte sont
  mémoïsées. Vérifié un par un.
- `TweetsScreen.tsx` : `rowContext` (useMemo), `handleRowAction` (useCallback +
  `tweetsRef`), `renderTweet` et `keyExtractor` (useCallback). Sain.
- `MessagesScreen.tsx` : `renderConversation` mémoïsé, dépendances stables.
  Seul reste mineur : `keyExtractor` inline (à traiter en F3).
- `TweetRowGutter` : comparateur complet sur ses 11 props, exclusion de
  `stats.views` documentée et justifiée. Sain.

**Pistes vérifiées, constats restant à RÉDIGER :**
1. `src/screens/ConversationThreadScreen.tsx:1291` — pas de composant
   `MessageBubble` mémoïsé ; `renderItem` dépend de `messages` et
   `expandedMessageId`, donc toute nouvelle bulle re-rend toutes les bulles
   montées. ← PROCHAIN CONSTAT À RÉDIGER, à re-vérifier dans le code d'abord.

**Note de chemin** : `TweetRowGutter.tsx` est dans
`src/components/feed/paper2b/`, pas `src/components/feed/`.

**Pistes NON encore explorées pour F2 :**
- Les renderItem inline restants : `SendCoinsModal:236`,
  `ImageViewerPaper:334`, `FollowRequestsScreen:136`, `MyPassesScreen:358`,
  `EconomyManagementScreen:268/318`, `UserConnectionsScreen:140`,
  `CommunityCurrenciesScreen:103`, `LivesScreen:171`, `twitninfvideo:545`,
  `GoLiveScreen:455`.
- « État placé trop haut » : `SearchScreen`, `CreateTweetScreen`,
  `ForgeScreen`, `WalletScreen`, `TradingScreen` non examinés.
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
