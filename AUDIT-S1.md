# AUDIT S1 — SÉCURITÉ : secrets dans l'historique git

⚠️ **Ce fichier est poussé sur un dépôt PUBLIC.** Il ne contient donc, par
consigne, que le **décompte, la catégorie et la gravité** des constats. Aucun
secret, aucun chemin exact, aucun identifiant, aucune méthode d'exploitation.
Le détail complet est remis au propriétaire du dépôt par un autre canal.

---

## Résultat de la section

**Aucun secret d'authentification n'a été trouvé dans l'historique.**

C'est le résultat qui comptait, et il est bon. Le dépôt est passé de privé à
public : tout jeton, clé ou mot de passe ayant **existé** dans l'historique
serait compromis de façon irréversible, y compris supprimé depuis. Ce cas ne
s'est pas produit.

| Gravité | Nombre | Catégorie |
|---|---|---|
| Critique | **0** | — |
| Majeur | **0** | — |
| Mineur | **3** | divulgation d'infrastructure et d'identifiants non secrets |

Les 3 constats mineurs relèvent tous de la même famille : des éléments
**publiés volontairement ou sans conséquence directe**, mais qui décrivent
l'infrastructure de production plus précisément que nécessaire, et qui restent
présents dans l'arbre courant. Aucun ne permet, seul, d'obtenir un accès. Ils
sont détaillés au propriétaire.

## Étendue réelle de la vérification

L'historique est **petit et intégralement auditable** : **225 commits**,
**2 603 objets**, **1 396 blobs distincts**, sur une période allant du
**3 août 2026** au **19 août 2026**. Toutes les branches distantes ont été
récupérées avant analyse (`git fetch --all`), et l'analyse porte sur
**l'ensemble des objets du dépôt**, pas seulement sur les branches vivantes ni
sur l'arbre courant.

Chacun des 1 396 blobs a été extrait et examiné individuellement, ce qui
couvre les fichiers ajoutés puis supprimés — le cas classique du secret
« retiré » qui reste dans l'historique.

Motifs recherchés dans chaque blob :

- clés d'API des fournisseurs courants (Google, Stripe, GitHub, Slack, AWS,
  SendGrid) ;
- clés privées au format PEM (`-----BEGIN … PRIVATE KEY-----`), ce qui couvre
  aussi les comptes de service Google au format JSON ;
- jetons JWT ;
- toute chaîne hexadécimale de 32 caractères ou plus (jetons génériques,
  empreintes, clés symétriques) ;
- affectations de la forme `api_key` / `secret` / `password` / `token` /
  `private_key` suivies d'une valeur d'au moins 12 caractères ;
- l'ensemble des noms d'hôtes et adresses IP apparaissant dans l'historique,
  recensés et classés un par un ;
- l'ensemble des adresses de courriel apparaissant dans l'historique.

Ont également été passés en revue : la liste complète des fichiers **ajoutés**
puis celle des fichiers **supprimés** au cours de l'historique, filtrées sur
les extensions et noms sensibles (`.env*`, `*.keystore`, `*.jks`, `*.p8`,
`*.p12`, `*.pem`, `google-services.json`, `serviceAccount*.json`).

## Ce que j'ai vérifié et trouvé SAIN

- **Aucun fichier `.env` réel n'a jamais été versionné.** Le seul fichier de
  cette famille présent dans l'historique est `.env.example`, et son contenu
  est **exclusivement** constitué de valeurs de substitution et de champs
  laissés vides. C'est exactement l'usage attendu.
- **La règle `.gitignore` correspondante est correcte et son motif est
  documenté** : le fichier explique dans un commentaire que le motif précédent
  ne couvrait pas `.env.production`, et que `.env*` (avec `!.env.example`)
  couvre désormais toutes les variantes qu'Expo sait charger. C'est une
  correction qui a été **comprise**, pas seulement appliquée.
- **Le seul magasin de clés présent est le magasin de débogage standard
  d'Android.** Vérifié par empreinte : c'est le fichier universel livré avec le
  SDK Android, identique sur toutes les machines de développement du monde,
  dont le mot de passe est public et documenté par Google. Ce n'est pas un
  secret et sa présence n'est pas un défaut. **Aucun magasin de signature de
  release n'a jamais été versionné** — c'eût été le constat critique de cette
  section.
- **Aucune clé privée, aucun compte de service, aucun certificat** dans
  l'historique.
- **Aucun jeton JWT**, aucune clé d'API de fournisseur.
- **Aucune adresse de courriel personnelle** : les deux seules trouvées sont
  une adresse de CI en domaine local factice et une adresse d'auteur provenant
  d'un fichier de dépendance tierce.
- **Aucun fichier sensible supprimé de l'historique** : la liste des
  suppressions ne contient que du code source et un fichier de configuration
  Android.

## Limites de la couverture S1

- L'analyse porte sur les **objets présents dans le dépôt cloné**. Un objet
  qui aurait été supprimé côté GitHub par une réécriture d'historique (`filter-repo`,
  `force-push`) **avant** ce clone ne peut pas être vu d'ici. Rien n'indique
  qu'une telle réécriture ait eu lieu, mais je ne peux pas le prouver depuis le
  clone seul. Le propriétaire peut le vérifier côté GitHub.
- Les blobs de plus de 400 Ko (essentiellement des images) ont été exclus du
  balayage de motifs textuels. Un secret dissimulé dans une image binaire
  n'aurait pas été vu ; c'est un scénario très improbable et sans rapport avec
  le risque réel visé par cette section.
- **Ce que cette section ne couvre pas, et qui reste à faire** : ce qui est
  publié **volontairement** dans le bundle via le préfixe `EXPO_PUBLIC_` —
  c'est l'objet de **S2**, et c'est là que se trouve la vraie question de
  divulgation pour ce dépôt. La conclusion de S1 (« rien n'a fuité par
  accident ») ne dit **rien** de ce qui est publié à dessein.
