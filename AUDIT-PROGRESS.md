# AUDIT twitninf-app — suivi d'avancement

Routine automatisée. Elle reprend TOUJOURS à la première section marquée
`À FAIRE`. Ne pas réordonner les lignes : l'ordre est l'ordre de priorité
imposé (fluidité > rapidité > sécurité).

| Code | Section | État | Rapport |
|---|---|---|---|
| F1 | FLUIDITÉ — poids réel des images | **TERMINÉE** | `AUDIT-F1.md` |
| F2 | FLUIDITÉ — rendus inutiles | À FAIRE | — |
| F3 | FLUIDITÉ — listes | À FAIRE | — |
| F4 | FLUIDITÉ — animations et thread UI | À FAIRE | — |
| R1 | RAPIDITÉ — démarrage | À FAIRE | — |
| R2 | RAPIDITÉ — réseau | À FAIRE | — |
| R3 | RAPIDITÉ — poids du bundle | À FAIRE | — |
| S1 | SÉCURITÉ — secrets dans l'historique git | À FAIRE | — |
| S2 | SÉCURITÉ — ce qui part en clair dans le bundle | À FAIRE | — |
| S3 | SÉCURITÉ — appareil et chaîne de build | À FAIRE | — |

## Rappels pour la prochaine exécution

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
