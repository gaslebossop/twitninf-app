# Exigences de design — twitninf

Ce document est la référence visuelle de l'app. Il est écrit pour être lu
**avant** d'ouvrir un fichier, par quelqu'un — humain ou agent — qui n'a aucun
contexte des sessions précédentes.

Il ne décrit pas des goûts. Chaque règle vient d'un rejet ou d'un bug réel, et
la raison est donnée à chaque fois : une règle dont on ignore la cause finit
toujours par être « simplifiée ».

---

## 1. La barre de qualité

Elle vient d'un rejet : « tu crois que qui va acheter ça ». Trois tests qu'un
visuel payant doit passer.

1. **Animé en continu.** Un motif figé n'a aucune valeur perçue.
2. **Il habille, il ne se superpose pas.** Un thème colore TOUT le fond de la
   page, derrière la bannière. Un voile teinté par-dessus une photo = refusé.
3. **Il arrive proprement.** Jamais d'état intermédiaire : tant que la donnée
   n'est pas chargée on n'habille rien, puis tout entre en fondu.

Attentes récurrentes : **un seul** anneau autour d'une photo (pas un anneau
coloré plus un liseré sombre empilés), du glow sur les dégradés, et des
dégradés francs plutôt que timides.

---

## 2. La matière — la signature de l'app

L'identité visuelle ne repose pas sur une palette, elle repose sur une
**matière** commune : lumière, profondeur, reflets. La référence est
`src/components/profile/AvatarMaterial.tsx`, transposée à la page dans
`ThemeMaterial.tsx`.

Cinq couches, chacune pour une raison physique :

| Couche | Ce qu'elle fait | Sans elle |
|---|---|---|
| **Bloom** | la lumière déposée autour | l'objet est découpé au cutter sur le fond |
| **Corps irisé** | la teinte passe par du presque-blanc au point de lumière | ça reste du plastique |
| **Spéculaire** | une bande vive et courte qui balaie plus vite | rien ne dit « c'est poli » |
| **Rim / source FIXE** | un repère immobile | tout tourne ensemble : un moulin, pas du relief |
| **Occlusion** | le liseré sombre entre l'objet et son support | l'objet flotte au lieu d'être posé |

### La règle la plus importante : la dose dépend de l'ÉCHELLE

`towardWhite(couleur, keep)` — `keep` est la part de couleur gardée
(1 = intacte, 0 = blanc).

| Surface | `keep` |
|---|---|
| Anneau de parure (~5 px) | 0,25 |
| Particule d'ambiance (3–20 px) | 0,16 à 0,62 |
| Point de lumière d'une nappe de texte | 0,42 |
| Cœur d'un néon | 0,22 en sombre / 0,9 en clair |
| Fond de page (780 px) | 0,7 |

Sur un anneau, le presque-blanc fait le métal. **Le même réglage étalé sur une
page désature tout** — la première version du fond de profil était du « lait
rose », et c'était exactement cette erreur.

### Deuxième variable : le THÈME

Tout ce qui s'appuie sur du blanc ou du noir pur doit passer par
`isDarkTheme()`. Trois régressions livrées viennent de là et d'aucune autre
cause :

- un plancher d'occlusion en `#000` : invisible en sombre, **bande grise sale**
  en clair ;
- un cœur de néon blanc : sur une page blanche, il n'y a rien à voir ;
- une nappe spéculaire réglée pour le clair, donc bridée en sombre où elle
  aurait brillé.

---

## 3. Les pièges qui coûtent une session

### 3.1 `withAlpha` ne compose pas avec n'importe quoi

`withAlpha(c, a)` commence par `if (c[0] !== '#') return c;` — le
laisser-passer sert aux couleurs déjà en `rgba()`. Il rend donc la couleur
**PLEINE, sans le moindre avertissement**, dès qu'on lui passe autre chose que
du hex.

`towardWhite` renvoie du hex précisément pour cette raison. Vérifie toujours
qu'une couleur est du hex avant `withAlpha`. En SVG, préfère `stopOpacity` —
un nombre ne peut pas être silencieusement ignoré.

### 3.2 Un dégradé ne doit JAMAIS atteindre le bord de sa forme

Une lueur dont l'opacité est encore non nulle au bord de son cadre produit une
**arête franche**. C'est le défaut le plus signalé de cette app, sous trois
formes différentes : un fond de profil coupé net en bas, une braise sortie en
rectangle derrière un titre, un bloom de particule tranché par un
`overflow: hidden`.

Deux remèdes :

- **une ellipse plutôt qu'une bande** — une ellipse s'éteint dans toutes les
  directions et ne peut structurellement pas faire de bord ;
- **une boîte beaucoup plus grande que la lueur** — et vérifier le calcul :
  centre ± rayon doit rester largement à l'intérieur, dans les deux axes.

### 3.3 Les easings ne sont pas interchangeables

`src/theme/motion.ts` expose des `Easing.bezier` du **cœur de React Native**,
donc des fonctions JS ordinaires. Les passer à `withTiming` de **Reanimated**
les fait appeler depuis le thread UI : **l'app meurt sans laisser une ligne de
log.**

Utilise `src/utils/gesture` (`ease`, `timing`, `springs`), ou l'`Easing` de
Reanimated. Règle générale : **jamais de fonction JS ordinaire dans un
worklet**. Et `runOnJS` n'existe plus en Reanimated 4 — c'est `scheduleOnRN`
de `react-native-worklets`.

### 3.4 Les identifiants de dégradé SVG sont globaux au document

Deux vues à l'écran avec le même id, et la seconde repeint la première. Sale
par instance.

### 3.5 Un hook ne s'appelle pas dans un `.map` de longueur variable

Si le nombre d'éléments dépend d'un réglage que l'utilisateur change à chaud,
le nombre de hooks varie entre deux rendus et l'app plante. Un composant par
élément, avec une clé qui contient le réglage.

### 3.6 `StyleSheet.create` s'évalue à l'IMPORT

N'y appelle pas `isDarkTheme()`. Utilise un jeton du thème — il porte déjà la
bonne valeur par thème.

---

## 4. Le mouvement

- **Rien ne s'anime au montage.** Un écran qui se dévoile en fondu est un écran
  qu'on attend. Ce qui bouge, c'est ce qui répond à un geste. Seules exceptions
  assumées : les boucles décoratives permanentes des visuels premium.
- **120 à 280 ms.** Au-delà on regarde l'animation au lieu du contenu.
- **Ça se pose, ça ne rebondit pas.** Amortissement critique ; un ressort qui
  oscille se lit comme un défaut, pas comme du soin.
- **Ne jamais animer les lignes d'une `FlatList` au montage** — déjà rejeté
  (« ça fait IA ») : le recyclage rejoue l'animation sur des lignes déjà vues.
- Toujours respecter « Réduire les animations » : `isReduceMotionEnabled()`
  (synchrone), `useReduceMotion()` (réactif), `motionDuration(ms)` (rend 0
  quand c'est actif — une seule branche de code, donc aucun risque qu'un état
  de fin d'animation ne soit jamais posé).
- Une boucle décorative ne doit pas avoir de reprise visible : fais plusieurs
  tours par itération, ou referme la boucle sur son point de départ avec un
  aller-retour sinusoïdal.

---

## 5. Mise en page

- La tab bar de `BottomTabNavigator` est en `position: 'absolute'`, hauteur
  83 (iOS) / 85 (Android) : elle **recouvre le bas de chaque écran**.
- Inset du haut : `useHeaderMetrics()`, jamais une constante devinée — il y a
  déjà eu un bug de double inset.
- Une `ScrollView` dans une colonne flex a besoin de `style={{flex:1}}` en plus
  de son `contentContainerStyle`, sinon elle se dimensionne sur son contenu et
  pousse hors écran ce qui la suit.
- Une `ScrollView` **horizontale** a besoin de `{ maxHeight: N, flexGrow: 0 }`
  et de `alignItems: 'center'` sur son contenu : l'axe vertical est son axe
  transverse et son défaut est `stretch`. Sans ça, la bande prend toute la
  hauteur et chaque pastille s'étire dessus. Idiome établi :
  `ContentModerationScreen`, `ModerationHistoryScreen`.
- La dernière ligne d'une liste encadrée ne porte pas de séparateur.

---

## 6. Écriture

Les mots sont de la matière de design, pas de la décoration.

- **Nomme par ce que la personne contrôle**, jamais par la façon dont c'est
  construit. Un écran d'administration expose des **choix prêts à l'emploi**,
  jamais le modèle de données du serveur : « Construite — verser », pas
  `built`.
- **Voix active.** Un bouton dit ce qui va se passer, et garde le même nom dans
  tout le parcours : « Publier » produit « Publié ».
- **Un écran vide est une invitation, pas un constat.** Une erreur explique ce
  qui s'est passé et comment s'en sortir ; elle ne s'excuse pas et ne reste pas
  vague.
- **Ne promets jamais un chiffre que personne n'a engagé.** Et n'affiche pas
  une preuve sociale à zéro : « 0 versés » argumente contre la fonctionnalité.
  Tant qu'on ne peut rien prouver, on explique ; dès qu'on peut, on montre.

---

## 7. Primitives maison — à chercher AVANT d'en écrire une

C'est la règle qui a le meilleur rendement, et celle qu'on oublie sur les
motifs qui « semblent trop simples pour mériter une recherche ». C'est
précisément là que ça casse.

| Besoin | Utiliser |
|---|---|
| Cible tactile | `Tappable` (`src/components/ui`) — geste natif, retour haptique |
| Alerte / confirmation / saisie | `toast`, `confirmAsync`, `promptAsync`, `showActionSheet` — **`Alert.alert` n'existe plus** |
| Feuille glissante | `useSheetGesture` (`src/hooks`) |
| Retour haptique | `utils/feedback` — **`expo-haptics` n'est pas installé** |
| Inset du haut | `useHeaderMetrics()` |
| Couleurs / polices | uniquement les jetons de `src/theme` |
| Fond d'écran, squelette, en-tête | `ScreenBackground`, `ScreenSkeleton`, `BackButton` |

`colors` est un objet **mutable** dont l'identité ne change jamais. Ne le
capture pas entier dans un worklet : extrais les chaînes avant.

---

## 8. Contraintes qui ne se négocient pas

- **Aucune nouvelle dépendance.** L'app tourne dans Expo Go sur iOS : un module
  natif la casse. Skia a été proposé et refusé pour cette raison. Le plafond
  qui en découle, à assumer plutôt qu'à cacher : pas de grain, pas de dégradé
  conique réel, pas de bloom gaussien.
- `npx tsc --noEmit -p tsconfig.json` doit sortir en **0**.
- **`*.md` est dans `.gitignore`.** Un document de conception doit être commité
  avec `git add -f`, sinon il n'existe pas.
- Un push sur `main` déclenche un build iOS qui **publie une version aux
  utilisateurs**. Travaille sur une branche.

---

## 9. Direction artistique

Le vocabulaire de **Discord** (parures d'avatar, effets de profil, profil
habillé), la **retenue de Telegram Premium** (peu d'effets, chacun impeccable),
la **matière d'iOS** (lumière, profondeur, reflets plutôt que couleur).

Ce qui est rejeté : le catalogue de thèmes colorés génériques.

**Dépense ta hardiesse à un seul endroit.** Un écran a un élément signature ;
tout le reste autour reste sourd et discipliné. Si tout brille, plus rien ne
brille — et l'élément signature doit être visible **au premier jour**, pas
derrière un état que personne n'a encore atteint.
