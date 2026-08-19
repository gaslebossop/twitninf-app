# AUDIT S3 — SÉCURITÉ : appareil et chaîne de build

⚠️ **Ce fichier est poussé sur un dépôt PUBLIC.** Il ne contient donc, par
consigne, que le **décompte, la catégorie et la gravité** des constats. Aucun
chemin exact, aucune clé, aucune méthode d'exploitation. Le détail complet —
fichiers, lignes, correctifs — est remis au propriétaire du dépôt par un autre
canal.

---

## Résultat de la section

| Gravité | Nombre | Catégorie |
|---|---|---|
| Critique | **0** | — |
| Majeur | **0** | — |
| Mineur | **3** | rémanence de données après déconnexion · code mort dangereux · durcissement de la CI |

Détail des trois catégories, sans ce qui permettrait de les exploiter :

1. **Rémanence après déconnexion.** Deux valeurs liées aux droits de
   l'utilisateur sont mises en cache **non chiffrées** sur l'appareil au moment
   de la connexion, et **ne sont effacées ni à la déconnexion, ni au changement
   de compte**. Elles décrivent le compte précédent et survivent donc à son
   départ. Portée réelle limitée — les fonctions qui les relisent ne sont plus
   appelées nulle part dans l'application (vérifié par balayage complet) —
   mais l'écriture, elle, est bien active. C'est un défaut d'hygiène sur un
   appareil partagé, pas une élévation de privilège.
2. **Code mort dangereux.** Un fichier de configuration présent dans le dépôt
   accorderait, s'il était importé, un rôle d'administrateur et un jeu complet
   de permissions de modération à **tout** utilisateur. **Il n'est importé par
   aucun fichier** — vérifié par balayage complet de l'arbre source. Ce n'est
   donc **pas** une vulnérabilité exploitable aujourd'hui, et il serait faux de
   le présenter ainsi. C'est une mine dormante : la première personne qui
   croira ce fichier utile et l'importera ouvrira la faille sans s'en rendre
   compte, puisque son nom et sa forme ne laissent rien deviner. À supprimer,
   pas à corriger. (À rattacher aussi à **R3-1**, code mort.)
3. **Durcissement de la CI.** Un des cinq workflows passe une valeur sensible
   **directement dans la ligne de commande** d'un bloc `run:` au lieu de
   l'exposer par un bloc `env:`. Les autres workflows du dépôt emploient tous
   la bonne forme. Le risque concret est faible ici — la valeur reste masquée
   dans les journaux par GitHub — mais la forme correcte est déjà présente à
   côté, ce qui rend la correction gratuite. **Septième occurrence** du schéma
   « le bon réflexe existe dans le dépôt, il n'a pas été propagé » relevé tout
   au long de cet audit.

## Ce que j'ai vérifié et trouvé SAIN

Comme en S2, l'essentiel de cette section est une bonne nouvelle, et le détail
de ces points peut être écrit publiquement sans risque : ce sont des forces.

### Stockage sur l'appareil — exemplaire

- **Les jetons d'authentification vivent dans le keystore de l'appareil**
  (`expo-secure-store`), pas dans `AsyncStorage`. Le fichier concerné documente
  la situation antérieure (jetons en clair) et la migration unique et
  silencieuse qui l'a corrigée.
- **Le repli a été refusé volontairement.** Quand le keystore est indisponible
  (émulateur sans verrou d'écran, par exemple), le code ne retombe **pas** sur
  `AsyncStorage` : un commentaire explique que « perdre la session vaut mieux
  que réintroduire des jetons en clair sur disque ». C'est le bon arbitrage, et
  il est rare de le voir écrit.
- **La limite de 2 048 octets par entrée d'`expo-secure-store` sur Android est
  connue et contournée proprement** : index de métadonnées non sensibles d'un
  côté, jetons dans le keystore de l'autre. C'est une contrainte que beaucoup
  de projets découvrent en production.
- **La déconnexion révoque la session côté serveur**, en transmettant le jeton
  de rafraîchissement pour ne révoquer *que* cette session — le multi-compte
  reste fonctionnel. Et l'échec de l'appel serveur n'empêche pas le nettoyage
  local (`finally`). Les deux détails sont justes.

### Chaîne de build GitHub Actions — solide pour un dépôt public

- **Aucun déclencheur exploitable par un tiers.** Les cinq workflows utilisent
  exclusivement `workflow_dispatch` (déclenchement manuel, réservé aux
  personnes ayant accès en écriture) ou un déclencheur conditionné à une action
  qui demande elle aussi des droits sur le dépôt. **Aucun
  `pull_request_target`, aucun `issue_comment`, aucun `workflow_run`** — les
  trois déclencheurs qui font fuiter les secrets des dépôts publics.
- **Aucune injection de commande.** Le seul paramètre libre saisi par un
  humain est transmis à son script par un bloc `env:`, jamais interpolé dans le
  corps du script. C'est précisément la protection qui manque dans les cas
  d'injection classiques.
- **Aucune donnée d'événement (`github.event.*`) n'est interpolée dans un bloc
  `run:`.** La seule utilisation est une condition `if:`, qui n'est pas un
  contexte shell.
- **Le magasin de signature de release est un secret de dépôt**, pas un fichier
  versionné — cohérent avec le résultat de **S1**.
- **L'absence d'une valeur de configuration produit un avertissement explicite
  dans la sortie de build** au lieu d'un échec silencieux. C'est ce qui évite
  de publier un binaire discrètement cassé.

### Déjà établi ailleurs dans cet audit, et valable ici

- Durcissement Android complet et **couvert par un test automatisé** qui relit
  le manifeste généré (détaillé en **S2**).
- Les `console.*` bavards sont retirés du build de production, `warn` et
  `error` conservés (détaillé en **R3**).
- Le seul magasin de clés versionné est le magasin de débogage universel du SDK
  Android — public par nature, ce n'est pas un secret (détaillé en **S1**).

## Limites de la couverture S3 — la plus importante de tout l'audit

**Le code serveur n'est pas dans ce dépôt.** Or la question centrale posée par
le brief — « des contrôles faits côté client seulement, que le serveur devrait
revérifier » — ne peut recevoir de réponse **définitive** que côté serveur.

Ce que j'ai pu établir : l'application décide de ce qu'elle **affiche** à
partir du rôle renvoyé par le serveur à la connexion. C'est légitime et
normal : masquer un bouton d'administration à qui n'est pas administrateur est
un travail d'interface, pas de sécurité.

Ce que je **ne peux pas** établir depuis ce dépôt : que chaque route sensible
(bannir, supprimer, modérer, gérer l'économie) **revérifie le rôle côté
serveur**, à partir du jeton, sans faire confiance à ce que le client affirme.
Si une seule de ces routes s'en remet au client, l'application est vulnérable —
et rien dans ce dépôt ne permettrait de le voir.

**C'est la vérification n°1 à faire après cet audit**, et elle se fait dans le
dépôt de l'API : pour chaque route d'administration ou de modération, confirmer
la présence d'un contrôle d'autorisation serveur. Un client mobile est
entièrement sous le contrôle de son utilisateur ; tout ce qu'il envoie est
modifiable.

Autres limites :

- Les dossiers `android/` et `ios/` n'ont pas été explorés (interdit par le
  brief), sauf les fichiers relus par le test de configuration de sécurité.
- Aucune analyse dynamique : pas de binaire construit, pas de trafic observé,
  pas de test sur appareil rooté.
- Les dépendances n'ont pas été auditées pour des vulnérabilités connues
  (`npm audit`) — `node_modules/` n'était pas installé sur la machine d'audit.
  À lancer, c'est immédiat.
