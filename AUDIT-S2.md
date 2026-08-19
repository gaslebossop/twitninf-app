# AUDIT S2 — SÉCURITÉ : ce qui part en clair dans le bundle

⚠️ **Ce fichier est poussé sur un dépôt PUBLIC.** Il ne contient donc, par
consigne, que le **décompte, la catégorie et la gravité** des constats. Le
détail — quelle variable, quelle valeur, quelle restriction manque, quelle
vérification faire — est remis au propriétaire du dépôt par un autre canal.

---

## Le point de départ, qu'il faut énoncer clairement

Tout ce qui porte le préfixe `EXPO_PUBLIC_` est **inliné par Metro dans le
bundle JavaScript au moment du build**. La valeur se lit en clair dans l'APK ou
l'IPA avec des outils élémentaires. **Le fait qu'elle vienne d'un secret GitHub
Actions n'y change rien** : le secret protège le dépôt et les journaux de CI,
pas l'application livrée. Une variable `EXPO_PUBLIC_*` est donc **publique par
construction**, et sa seule protection possible est une **restriction posée
côté fournisseur**.

Ce n'est pas un défaut d'Expo ni de ce dépôt : c'est la nature d'une
application cliente. Tout ce qu'elle doit savoir pour fonctionner, son
utilisateur peut le lire. La bonne question n'est donc jamais « comment
cacher ceci » mais « la divulgation de ceci est-elle acceptable, et qu'est-ce
qui empêche un tiers de s'en servir ».

## Résultat de la section

**6 variables `EXPO_PUBLIC_*`** sont réellement lues par le code. Chacune a été
recensée et jugée individuellement.

| Gravité | Nombre | Catégorie |
|---|---|---|
| Critique | **0** | — |
| Majeur | **0** | — |
| Modéré | **1** | un identifiant de fournisseur inliné dont la protection repose **entièrement** sur une restriction côté fournisseur que le dépôt ne permet pas de vérifier — et qui pourrait de surcroît être **devenu inutile** (lien direct avec **R3-1**) |
| Mineur | **1** | une variable lue par le code mais **absente du fichier d'exemple**, et qui **contourne l'assainisseur d'URL du dépôt** — donc sans la garantie HTTPS que toutes les autres reçoivent |
| Informatif | **1** | les adresses de serveurs sont publiées en clair : inévitable pour un client mobile, mais le modèle de menace doit être posé explicitement |

Aucun secret d'authentification véritable (jeton, mot de passe, clé privée) ne
part dans le bundle. Le constat modéré porte sur un identifiant de service dont
l'usage abusif se paie en **quota facturé au propriétaire**, pas en accès aux
données des utilisateurs.

## Ce que j'ai vérifié et trouvé SAIN — et c'est la vraie nouvelle de la section

Cette section devait chercher de la négligence. Elle a surtout trouvé une
posture **délibérée, documentée et testée automatiquement**. C'est assez rare
pour être détaillé, d'autant que ces points-là peuvent être écrits publiquement
sans risque — ce sont des forces, pas des faiblesses.

- **L'adresse du serveur a été retirée du code exprès, en prévision du passage
  en public.** `src/config/api.ts` porte le raisonnement en commentaire : « Le
  dépôt est destiné à devenir public : y laisser le domaine réel revient à le
  publier en clair, ce qu'un simple `git grep` suffit à retrouver. » La
  décision a donc été prise en connaissance de cause, pas subie.
- **Un assainisseur d'URL central, `resolveServerUrl`**, applique trois règles
  aux adresses de serveurs : normalisation, **rejet de tout ce qui n'est pas
  HTTPS**, et **rejet des identifiants intégrés à l'URL** (la forme
  `https://utilisateur:motdepasse@hôte`). Les deux rejets lèvent une exception,
  ils n'avertissent pas.
- **En l'absence de configuration, l'application démarre en mode hors ligne
  plutôt que de planter** — et cela aussi est couvert par un test.
- **`tests/security-config.test.js` existe et vérifie automatiquement les
  invariants de durcissement** : trafic en clair interdit, sauvegarde système
  désactivée, permissions Android au plus juste, permissions larges
  explicitement retirées de la fusion du manifeste, et les trois règles de
  `resolveServerUrl` ci-dessus. Le test **relit le manifeste Android généré**,
  pas seulement la configuration : il vérifie le résultat, pas l'intention.
  Le fichier explique en outre pourquoi il cherche `tools:node="remove"` plutôt
  que l'absence du nom de permission — subtilité que la plupart des projets
  ratent.
- **Le durcissement Android est complet** : `usesCleartextTraffic: false`,
  `allowBackup: false`, `blockedPermissions` pour les permissions larges que
  les bibliothèques tierces fusionnent d'elles-mêmes.
- **La chaîne de CI manipule correctement la valeur sensible** : elle vit dans
  les secrets du dépôt, elle est écrite dans un fichier d'environnement au
  moment du build, et son absence produit un **avertissement explicite** dans
  la sortie de build au lieu d'un échec silencieux. Le seul reproche possible
  est le préfixe `EXPO_PUBLIC_` lui-même, qui est imposé par le besoin
  fonctionnel — pas par une erreur de manipulation.
- **Le fichier d'exemple ne contient que des valeurs de substitution**
  (déjà établi en S1).

En résumé : sur les six variables publiées, cinq le sont **à bon escient** et
la sixième pose une question de restriction, pas de fuite.

## Limites de la couverture S2

- **Je ne peux pas vérifier depuis le dépôt si la restriction côté fournisseur
  est effectivement en place**, ni sur quoi elle porte. C'est une vérification
  à faire dans la console du fournisseur, et c'est le point le plus important
  de cette section. Elle est décrite précisément au propriétaire.
- Je n'ai pas analysé un bundle réellement construit (`npx expo export`) pour
  confirmer ce qui y figure : le raisonnement porte sur le code source et sur
  le comportement documenté de Metro. Un export réel lèverait le dernier doute
  et est recommandé.
- Ce que le **serveur** renvoie au client (champs sur-exposés dans une réponse
  d'API, par exemple) n'entre pas dans cette section : le code serveur n'est
  pas dans ce dépôt. C'est une limite structurelle de l'audit, pas un oubli.
