# Refonte de l'onglet Explorer — design validé

Date : 2026-08-18
Périmètre : concept + grille + lecture (carte blanche)
Statut : design approuvé, plan d'implémentation à écrire

---

## 1. Diagnostic

Sept passes d'itération sont déjà passées sur cet onglet (voir l'historique dans
`ExploreGrid.tsx` et `ExploreImmersive.tsx`) sans lever l'impression rapportée :
« pas assez addictive, pas assez jolie, pas assez pro ».

Quatre mesures prises en prod le 2026-08-18 (VPS, base `twitninf`)
expliquent pourquoi :

| Mesure | Valeur |
|---|---|
| Tweets vivants portant une image | **5 sur 977** (0,5 %) — **0** sur les 9 derniers jours |
| Drapeau `tweet.images` | **26 %**, montée automatique, 100 % le **2026-08-24** |
| Tweets courts (≤ 46 caractères) | **305 sur 553** publiés en 3 semaines (moyenne : 66 caractères) |
| Concentration des auteurs | `dieupetoune` 217, `policiercongo` 153, `gas` 95 = **88 %** du volume |
| Likes par tweet | 350 tweets ≥ 1 like, **21 ≥ 5 likes, 3 ≥ 10** (maximum : 14) |
| Vues par tweet | moyenne **8**, maximum 124 |

**Cause racine.** Le masonry actuel est une forme *conçue pour l'image*.
Nourrie à 99 % de texte, elle produit un mur de boîtes grises : la mise en page
promet des photos et livre des rectangles. Les passes précédentes ont poli les
cartes sans toucher à ce décalage.

**Cause racine secondaire.** Avec 3 comptes pour 88 % du volume, une ligne
d'auteur sur chaque carte affiche les mêmes trois visages en boucle — ce qui
lit « désert » quelle que soit la qualité graphique. Et un compteur de likes
sur chaque carte affiche « 1 » et « 2 » : le signal le plus sûr d'un produit
vide.

**Le drapeau `tweet.images` ne sauve pas la situation.** Il ouvre la
*publication* d'images à tous le 2026-08-24, mais le stock de 977 tweets
existants restera du texte. Explorer doit être beau **avec le contenu réel**,
pas avec le contenu espéré.

---

## 2. Décisions arbitrées

| Question | Arbitrage |
|---|---|
| Périmètre | Tout : concept, grille, lecture |
| Références visuelles | Instagram Explore / Reels, TikTok Découvrir, Pinterest — **pas** le modèle éditorial de X |
| Matière | **Mur typographique**, conçu pour absorber les images sans re-refonte le 24/08 |
| Ce qui manque en « addiction » | Les quatre : entrée immédiate, rythme dans le mur, action sans quitter la page, raison de revenir |
| Structure | Masonry rythmé (approche A) — pas un pager plein écran seul, pas des sections empilées |
| Animations | Fluides et interruptibles, jamais « génériques » — voir §5 |

**Approches écartées et pourquoi :**

- *Explorer devient la lecture plein écran seule.* Perte du survol et du plaisir
  de balayer ; avec ~25 publications par jour, un tweet par écran épuise le
  vivier en deux minutes.
- *Sections empilées façon TikTok Découvrir.* Avec 3 auteurs et ~530 tweets sur
  3 semaines, chaque section afficherait 3–4 items. Des sections à moitié vides
  lisent « produit mort » — c'est le risque le plus direct pour le critère
  « pro ». À rouvrir quand le volume aura décollé.
- *Fabriquer un fond généré par tweet (dégradé/motif dérivé du contenu).* C'est
  exactement le motif « une couleur par élément » rejeté sur `SettingsScreen`
  comme « look généré par IA ».

---

## 3. Le système de cartes

### 3.1 Cinq formats, attribués par une règle qui encode une propriété vraie

La forme n'est **jamais tirée au sort** : elle découle du tweet lui-même. C'est
ce qui sépare « designé » de « généré ».

```
formatOf(tweet):
  si splitTweetMedia(tweet).hasVisual        → 'photo'
  sinon, len = displayContentOf(tweet).length
    len ≤ 46                                 → 'declaration'
    len ≤ 100                                → 'citation'
    sinon                                    → 'bloc'
```

| Format | Part attendue | Traitement |
|---|---|---|
| **Déclaration** | ~55 % | Anton, 28–36 px, interlignage 0,95, **bloc plein pleine carte** |
| **Citation** | ~18 % | Playfair Display 700, filet de marque, surface sombre |
| **Bloc** | ~26 % | TwitNinf Sans, 14,5 px, dense, filet vertical à gauche |
| **Photo** | ~1 % aujourd'hui, majoritaire après le 24/08 | image pleine carte, légende dessous |
| **Rupture** | 1 carte sur 7 | l'un des formats ci-dessus, **sur les deux colonnes** |

### 3.2 Typographie

Deux familles d'affichage, pas plus : **Anton** (grotesque condensé) pour
Déclaration, **Playfair Display 700** (didone) pour Citation, et la police de
marque TwitNinf Sans pour tout le reste. Appariement éditorial classique ; à
trois familles ou plus, ça bascule dans le patchwork.

Les deux sont **déjà chargées au démarrage** (`src/theme/fonts.ts`, ajoutées
pour la personnalisation du nom de profil) : aucun asset à ajouter, aucun coût
de chargement supplémentaire.

### 3.3 La couleur suit une cadence, pas un hasard

Le fond plein ne concerne **que le format Déclaration**. Les autres formats
restent sur `colors.surface` / `colors.surfaceAlt`.

Les cartes Déclaration cyclent sur un motif fixe **indexé sur leur rang parmi
les déclarations du tirage** :

```
[surface, surface, accent, surface, paper]
```

- `accent` = magenta `#FE2C55`, texte blanc
- `paper` = blanc cassé, texte `colors.bg` (nouveau token à ajouter à la palette,
  en sombre **et** en clair)

Conséquence chiffrée : le magenta touche 1 déclaration sur 5, soit **~11 % de
toutes les cartes**. Jamais deux magentas collés, jamais une page qui en manque.
Le magenta ponctue ; il n'habille pas.

Le cyan reste réservé au marqueur « nouveau » (§4.4), conformément au système de
design.

### 3.4 Deux suppressions

Ce sont elles qui portent l'essentiel du gain « pro ».

1. **L'avatar et le `@pseudo` disparaissent du mur** sur Déclaration et
   Citation. Le tweet est l'objet ; l'auteur revient en grand dans la lecture
   plein écran, là où il compte. Bénéfice secondaire : ça supprime le pied à
   hauteur fixe, donc le bug des ~34 px de vide sous l'avatar corrigé à moitié
   en 7ᵉ passe. Photo et Bloc gardent une signature textuelle discrète, sans
   avatar.
2. **Aucun compteur affiché en dessous de 5.** Au-dessus, ce n'est plus une
   statistique mais une distinction rare (~2 % des cartes) : un marqueur
   « en feu ». Un produit sérieux n'affiche jamais un nombre qui le fait
   paraître vide.

---

## 4. La page

### 4.1 L'entrée — une bande qui joue toute seule

Bande pleine largeur en haut du mur, ~38 % de la hauteur d'écran, **sans titre
et sans chrome** : un tweet à la fois dans le traitement Déclaration poussé au
maximum, enchaînement automatique toutes les **4,5 s**.

- Barre de progression segmentée en 5.
- Au toucher : l'auto-défilement se met en pause, et reprend là où il en était.
- Au tap : ouvre la lecture plein écran sur ce tweet.

**Pas d'avance manuelle au glissé** (arbitré le 2026-08-18, à l'écriture du
plan). `TweetsScreen.tsx:411` enveloppe tout le fil — Explorer compris — dans
un `Gesture.Pan` horizontal qui change d'onglet. Un Pan imbriqué sans relation
déclarée laisse les deux gestes s'activer : on changerait d'onglet **et** de
tweet. Ce geste d'onglet est le code le plus délicat de l'écran et n'a jamais
été essayé à la main ; on ne le met pas en risque pour un balayage qui n'est
qu'un bonus. La bande avance toute seule — c'est précisément sa promesse.

**Elle consomme les 5 premiers tweets du tirage ; le mur commence à l'index 5.**
Ce n'est pas décoratif : la 6ᵉ passe fait déjà échantillonner les 6 premières
cartes à basse température (0,35) dans le haut du classement. Le meilleur
contenu est donc déjà en positions 1–6 — la bande l'expose au lieu de le laisser
se noyer dans le mur.

### 4.2 Le rythme — des blocs, pas un mur continu

Le mur devient une **suite de blocs** :

```
[7 cartes équilibrées sur 2 colonnes] → [rupture pleine largeur] → [7 cartes] → …
```

Choix du tweet promu en rupture, dans chaque groupe de 7 : le **premier dont le
format est `declaration` ou `photo`** ; à défaut, le premier du groupe. Le flux
étant déjà classé par `trending`, le premier est le plus fort — la règle est
donc déterministe, sans score à recalculer.

Effet de bord recherché : **l'équilibrage glouton devient local à chaque bloc**
au lieu d'être global. Aujourd'hui les deux colonnes dérivent sur toute la
longueur et le bas de page est en dents de scie ; par blocs de 7, elles se
resynchronisent toutes les sept cartes.

La rupture reçoit une marge verticale supérieure à l'écart de grille — c'est la
respiration.

**Aucune animation d'apparition sur les cartes.** Décision antérieure de
l'utilisateur (« IA », « pas pro ») quand le recyclage rejouait l'animation ;
la règle n°1 de `src/theme/motion.ts` dit la même chose. Le rythme vient de la
mise en page et de la bande d'entrée.

### 4.3 L'action sur place

- **Double-tap = aimer.** Existe déjà, étendu aux cinq formats. Ne jamais
  retirer un like (`apiService.likeTweet` bascule côté serveur ; le handler
  `handleExploreLike(tweet, next)` prend l'état voulu, pas une bascule).
- **Appui long = panneau d'actions ancré sur la carte** : aimer, suivre
  l'auteur, répondre, partager, « moins de ça ». **Aucune navigation** — la
  position dans le mur est conservée.
- Répondre ouvre `CommentSheet`, qui n'est pas une `<Modal>` et se superpose
  donc sans empiler de fenêtre native.
- « Moins de ça » branche `handleExploreInterest` (vocabulaire
  `interested` / `not_interested`), déjà écrit et déjà appelé ailleurs dans
  l'écran.

### 4.4 La raison de revenir

`exclude_seen` fait déjà disparaître ce qui a été vu dans les 24 h, mais
**silencieusement** : l'utilisateur ne le ressent pas. On le rend visible.

- `lastExploreVisitAt` mémorisé en stockage local, mis à jour à la sortie de
  l'onglet.
- Les tweets publiés depuis portent **un point cyan**.
- Une ligne unique sous la bande d'entrée : « N nouveaux depuis ta dernière
  visite ».
- **Si N < 5, aucune ligne n'est affichée.** Même règle que les compteurs : avec
  ~25 publications par jour, mieux vaut rien qu'une ligne annonçant
  « 2 nouveaux ».

---

## 5. Le mouvement

Les références consultées confirment le vocabulaire déjà écrit dans
`src/theme/motion.ts`. On applique, on ne réinvente pas.

**Cinq règles :**

1. **Aucun rebond.** Un ressort qui oscille est le marqueur n°1 du générique.
   Le ressort du thème est critiquement amorti (`damping: 28, stiffness: 190`,
   relation `damping ≈ 2·√(stiffness · mass)`) : il atteint sa cible sans la
   dépasser. Ne pas baisser `damping` sans recalculer.
2. **Jamais `ease-in`** sur ce qui entre — ça donne une UI molle. `easing.out`
   = `bezier(0.16, 1, 0.3, 1)` partout : départ franc, décélération longue,
   arrêt net.
3. **Tout est interruptible et piloté par le doigt.** C'est la vraie ligne de
   partage sur mobile : la bande d'entrée, le panneau d'appui long et
   l'ouverture de la lecture sont des `useSharedValue` menés par `Gesture.Pan`,
   **pas** des `withTiming` qui doivent finir. On attrape un élément en plein
   vol et on le renvoie dans l'autre sens.
4. **L'origine du mouvement est l'endroit touché.** `ExploreImmersive` le fait
   déjà (`measureInWindow` → `CardRect`) ; on l'étend au panneau d'appui long,
   qui grandit **depuis la carte**. Jamais depuis `scale(0)` : on part de 0,92.
5. **Sous 300 ms.** Rien au-delà de 340. Le double-tap, geste le plus fréquent,
   reste quasi instantané.

**Les trois seules animations réellement nouvelles :**

| Animation | Réglage |
|---|---|
| Bande d'entrée, tweet suivant | translation latérale 24 px + fondu croisé, 280 ms, `easing.out`. Barre de progression en `linear` (elle mesure du temps, elle ne doit pas patiner), coupée net au toucher et **reprise là où elle en était** |
| Panneau d'appui long | ressort critique, échelle 0,92 → 1 + opacité, origine ancrée sur la carte, ~180 ms perçus |
| Cœur du double-tap | **conservé tel quel** — déjà réglé, ne pas y toucher |

**Écart assumé avec les références :** pas de flou de 2 px sur les fondus
croisés. Le système de design bannit le `BlurView` décoratif et c'est cher au
rendu sur Android.

Références : [Reanimated — customizing animations](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/customizing-animation/),
[Emil Kowalski — 7 practical animation tips](https://emilkowal.ski/ui/7-practical-animation-tips),
[The Easing Blueprint](https://animations.dev/learn/animation-theory/the-easing-blueprint),
[NN/G — animation duration](https://www.nngroup.com/articles/animation-duration/).

---

## 6. Architecture technique

`ExploreGrid.tsx` fait 598 lignes et porte à la fois la carte, le masonry, la
pagination et les états. Il se scinde :

| Fichier | Rôle | Testable seul |
|---|---|---|
| `src/components/feed/explore/cardFormat.ts` | attribution du format, cadence de couleur, seuil des compteurs, estimation de hauteur | **oui, pur** |
| `src/components/feed/explore/wallLayout.ts` | découpage en blocs de 7, choix de la rupture, équilibrage local des colonnes | **oui, pur** |
| `src/components/feed/explore/ExploreCard.tsx` | la carte et ses cinq formats | rendu |
| `src/components/feed/explore/ExploreHero.tsx` | la bande d'entrée | rendu |
| `src/components/feed/explore/ExploreWall.tsx` | assemblage des blocs, pagination | rendu |
| `src/components/feed/explore/ExploreActionSheet.tsx` | panneau d'appui long | rendu |
| `src/components/feed/ExploreGrid.tsx` | point d'entrée, assemble, états | rendu |

**Contrat de props conservé.** `ExploreGridProps` garde ses champs actuels ;
deux ajouts seulement (`lastVisitAt`, `onInterest`). `TweetsScreen.tsx` n'a donc
pas à être réécrit.

**Invariant à ne pas casser :** la même fonction sert au **rendu et à
l'estimation du masonry** (aujourd'hui `footerHeightFor`, demain
`estimatedHeightOf` dans `cardFormat.ts`). C'est ce qui garantit que les
colonnes s'équilibrent sur les hauteurs réelles ; deux sources de vérité
divergentes remettent les colonnes en dents de scie.

**Côté serveur : rien.** `mode=trending`, `force_refresh`, `exclude_seen`, le
tirage à deux températures et le suivi du temps de lecture sont déjà écrits et
déployés sur les deux VPS. **La refonte est purement cliente — aucun
déploiement Rust ni API.**

Dans `TweetsScreen.tsx` : `lastExploreVisitAt` en stockage local, plus les deux
handlers correspondants. Tout le reste du câblage existe.

---

## 7. États, pièges, vérification

### États

Squelettes **aux formats du mur** (pas des rectangles gris uniformes), erreur,
vide, et « Nouveau tirage » en fin de vivier — ce dernier conservé tel quel,
avec son comportement d'ajout (`fetchExplore(true, true)`) plutôt que de
remplacement.

### Pièges connus à respecter

- **Pas de `Alert.alert`** — il a disparu de l'app mobile ; utiliser les
  primitives UX en place. Un toast est invisible sous une `<Modal>`.
- **`maxFontSizeMultiplier`** sur tout texte à hauteur contrainte (plafond 1.2) :
  sans lui, les grandes polices système débordent **et** décalent les colonnes.
- **`collapsable={false}`** sur toute vue mesurée par `measureInWindow`, sinon
  Android fusionne la vue avec son parent et il n'y a plus rien à mesurer.
- **La tab bar est absolue** et recouvre le bas des écrans : marge basse
  explicite obligatoire.
- **Une fonction JS ordinaire appelée dans un worklet Reanimated tue l'app sans
  aucun log.** Le pager et la bande d'entrée sont du code worklet.

### Tests

- `cardFormat.ts` : attribution des cinq formats aux bornes (46, 47, 100, 101),
  priorité de `photo` sur la longueur, cadence de couleur sur 10 déclarations
  consécutives, seuil d'affichage des compteurs (4 → rien, 5 → affiché).
- `wallLayout.ts` : découpage en blocs de 7, choix de la rupture (cas avec
  déclaration, cas avec photo, cas de repli), équilibrage local des colonnes,
  liste plus courte qu'un bloc.
- **`npm run typecheck` est obligatoire à chaque étape.** C'est précisément son
  absence qui avait livré le double-tap à moitié câblé en 5ᵉ passe
  (`onLike` jamais passé, styles manquants, `TypeError` au premier double-tap).

### Vérification sur appareil

⚠️ **Le pager gestuel de `ExploreImmersive` n'a jamais tourné sur un vrai
téléphone** (écrit en 6ᵉ passe, vérifié uniquement par `tsc` et tests
unitaires). Il faut l'essayer **avant** de construire dessus — sinon on empile
du neuf sur du non vérifié, et un défaut du pager sera attribué à la refonte.

Même remarque pour le glissé horizontal entre onglets, généralisé de 2 à N
onglets et jamais essayé à la main.

---

## 8. Hors périmètre

- Personnaliser `trending` avec le signal de dwell — le mode est impersonnel par
  construction ; c'est une décision produit à part.
- Toute modification du recommandeur Rust ou de l'API.
- Les sections empilées (« En feu », « Depuis hier » en bandes horizontales) :
  à rouvrir quand le volume de publication le permettra.
- Pousser l'image dans le composeur (incitations, import) : chantier distinct,
  même si la refonte est conçue pour en bénéficier automatiquement.
