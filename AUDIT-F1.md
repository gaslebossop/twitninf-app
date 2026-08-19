# AUDIT F1 — FLUIDITÉ : poids réel des images

Branche auditée : `audit/rapport` (créée depuis `origin/main`, commit `0b8b20b`).
Méthode : `file` sur chaque fichier binaire d'`assets/` et de `src/assets/`,
`stat -c%s` pour le poids exact, puis `grep` de chaque `require(...)` pour
retrouver la taille d'affichage réelle dans les styles.

Les tailles d'écran sont exprimées en **points** (unité RN) et, entre
parenthèses, en **pixels physiques à @3x** (iPhone récent, densité la plus
courante et la plus exigeante). Les poids décodés sont calculés en RGBA 8 bits :
`largeur × hauteur × 4 octets`.

---

## Inventaire mesuré

### `assets/` — 1 360 234 o au total

| Fichier | Définition | Mpx | Poids fichier | Décodé RGBA |
|---|---|---|---|---|
| `assets/icon.png` | 1920 × 1920 | 3,69 | 126 428 o | 14 745 600 o (14,1 Mio) |
| `assets/adaptive-icon.png` | 1920 × 1920 | 3,69 | 126 428 o | 14 745 600 o |
| `assets/splash-icon.png` | 1920 × 1920 | 3,69 | 126 428 o | 14 745 600 o |
| `assets/casino/reel-strip-blur.png` | 256 × 4096 | 1,05 | 423 300 o | 4 194 304 o |
| `assets/casino/reel-strip.png` | 256 × 4096 | 1,05 | 194 872 o | 4 194 304 o |
| `assets/refresh-mark.png` | 144 × 144 | 0,02 | 6 200 o | 82 944 o |
| `assets/favicon.png` | 48 × 48 | 0,002 | 1 466 o | — (web only) |
| `assets/fonts/*.otf` (×3) | — | — | 355 112 o | — |

Les trois PNG 1920 × 1920 sont **octet pour octet identiques** (md5
`fdb2c0c1590affadea7b99545bd7ff73`).

### `src/assets/images/` — 8 963 481 o au total

| Fichier | Définition | Mpx | Poids fichier | Décodé RGBA | Référencé ? |
|---|---|---|---|---|---|
| `chibi/festif.png` | 1024 × 1536 | 1,57 | 2 790 147 o | 6 291 456 o | oui |
| `chibi/hello.png` | 1024 × 1536 | 1,57 | 2 516 835 o | 6 291 456 o | oui |
| `chibi/nrv.png` | 1024 × 1536 | 1,57 | 2 499 212 o | 6 291 456 o | oui |
| `chibi/nocontent.png` | 842 × 1264 | 1,06 | 1 027 881 o | — | **non** |
| `chibi/twit.png` | 1920 × 1920 | 3,69 | 126 428 o | — | **non** (copie exacte d'`icon.png`) |
| `default-avatar.png` | JPEG déguisé en `.png` | — | 2 978 o | — | **non** |

**Total images du dépôt : 10,0 Mo.**

---

## Constats, par gain décroissant

### F1-1 — `icon.png` (1920 × 1920) est animé sur l'écran de démarrage — CRITIQUE

`src/components/ui/AppLoadingScreen.tsx:33` (style ligne 52, animation lignes 15-23)

```tsx
<Animated.View style={{
  opacity: pulse.interpolate({ ... }),
  transform: [{ scale: pulse.interpolate({ outputRange: [0.96, 1] }) }],
}}>
  <Image source={require('../../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
</Animated.View>
// styles.logo : { width: 64, height: 64, tintColor: colors.textPrimary }
```

**Ce qui ne va pas.** Le fichier fait 1920 × 1920 px (3,69 Mpx) et il est
affiché à 64 pt (192 px à @3x). L'écart est de **30× en linéaire, 900× en
aire** en points ; **10× / 100×** même en comparant aux pixels physiques @3x.
Et il n'est pas simplement affiché : il est mis à l'échelle et en opacité en
boucle infinie (900 ms aller, 900 ms retour, jamais arrêtée tant que l'écran
est monté).

Ce dépôt a **déjà mesuré ce coût exact** et l'a documenté. Commentaire présent
dans `src/components/feed/paper2b/FeedRefreshLogo.tsx:171-177` :

> ⚠️ PAS `assets/icon.png` — celui-là fait 1920 × 1920 (l'icône de l'app).
> Affiché en 46 pt et retransformé à chaque image, c'était 3,7 mégapixels
> retravaillés par frame, et l'animation ne tenait pas la cadence.

Le correctif a été appliqué là-bas (`refresh-mark.png`, 144 × 144, 6 200 o) mais
**pas ici**, alors que le cas est plus grave : 64 pt au lieu de 46, et une boucle
permanente au lieu d'une animation ponctuelle de tirage-pour-rafraîchir.

**Effet concret.** `AppLoadingScreen` est le tout premier écran affiché
(`App.tsx:134` et `src/navigation/AppNavigator.tsx:43`), pendant le chargement
des polices et la restauration de session. C'est exactement le moment où le
thread JS et le thread natif sont le plus chargés. L'application doit décoder
126 Ko de zlib en un bitmap de 3,69 Mpx **avant** de pouvoir peindre la première
image : cette inflation-là a lieu quelle que soit la plateforme, avant tout
rééchantillonnage. Résultat pour l'utilisateur : le logo apparaît en retard sur
le fond noir, et la respiration démarre en saccadant sur les premiers cycles.

S'y ajoute `tintColor` posé sur ce même bitmap : une passe de filtre couleur sur
3,69 Mpx, appliquée à une vue qui change d'échelle à chaque image.

**Correctif.** Remplacer la source par `assets/refresh-mark.png` (144 × 144,
déjà dans le dépôt, déjà le bon dessin, 6 200 o) — 144 px couvre 64 pt jusqu'à
@2x et reste très proche du besoin @3x (192 px) ; ou graver un
`assets/loading-mark.png` à 192 × 192. Ajouter `renderToHardwareTextureAndroid`
et `shouldRasterizeIOS` sur l'`Animated.View`, comme le fait déjà
`FeedRefreshLogo.tsx:166-167`. Gain : 3,69 Mpx → 0,02 Mpx par image
composée, soit **178× moins de pixels**, et un décodage de 6 Ko au lieu de
126 Ko sur le chemin critique de démarrage.

*Réserve honnête* : la quantité de mémoire **conservée** après décodage dépend
de la plateforme (Fresco sur Android et RCTImageLoader sur iOS peuvent
rééchantillonner vers la taille de la vue). Le coût de **décodage** initial, lui,
est certain et incompressible, et la mesure faite par le dépôt lui-même sur ce
fichier précis confirme que la saccade est réelle.

---

### F1-2 — Les trois illustrations du carrousel d'accueil pèsent 7,4 Mio — MAJEUR

`src/components/FuturisticCarousel.tsx:77, 88, 99` — rendu ligne 354, style
lignes 613-616.

```tsx
image: require('../assets/images/chibi/hello.png'),   // 1024 × 1536, 2 516 835 o
image: require('../assets/images/chibi/festif.png'),  // 1024 × 1536, 2 790 147 o
image: require('../assets/images/chibi/nrv.png'),     // 1024 × 1536, 2 499 212 o

slideImage: {
  width: Math.min(width * 0.62, 260),
  height: Math.min(height * 0.3, 240),
}
```

**Ce qui ne va pas.** Avec `resizeMode="contain"` et un rapport 1024/1536 =
0,667, l'image est contrainte par la hauteur : elle s'affiche donc à **160 × 240
pt**, soit **480 × 720 px à @3x**. Le fichier fait 1024 × 1536 : **2,13× trop
grand en linéaire, 4,55× en aire**. Chaque image décodée occupe 6 291 456 o
(6,0 Mio) ; les trois sont `require`ées dans le même module, donc listées dans le
même tableau `carouselData` et candidates au décodage dès l'ouverture de l'écran.

Elles sont animées en opacité (`imageOpacity`,
`FuturisticCarousel.tsx:355`) — `useNativeDriver: true`, donc la composition est
bien sur le thread natif, ce point-là est correct. Le problème est le poids
brut : 7,4 Mio de PNG à décompresser.

**Effet concret.** `IntroScreen` (`src/screens/IntroScreen.tsx:62`, route
`Intro` déclarée en `src/navigation/AppNavigator.tsx:72`) est le **premier écran
qu'un nouvel utilisateur voit**. Le fondu d'entrée de l'illustration dure 240 ms
(`FuturisticCarousel.tsx:147`) ; décoder 2,5 Mo de PNG prend, sur un milieu de
gamme Android, plus longtemps que ça. La première diapositive s'affiche donc
avec son texte et son fond mais **sans son illustration**, qui surgit ensuite —
puis rebelote à chaque changement de diapositive, sur un chemin où l'utilisateur
tapote pour avancer.

**Correctif.** Regraver les trois PNG à 480 × 720 (la taille réellement
affichée à @3x) — cela divise l'aire par 4,55 et devrait ramener chaque fichier
sous 600 Ko, soit **~5,6 Mio économisés dans le binaire**. Un passage en WebP
(supporté nativement sur Android et sur iOS ≥ 14) diviserait encore le poids par
2 à 3 sans perte visible sur un dessin aplat. Précharger les trois via
`Asset.loadAsync` pendant l'écran de démarrage plutôt qu'à l'affichage de la
diapositive.

---

### F1-3 — `icon.png` en 1920 × 1920 dans l'en-tête du fil et cinq autres vues — MODÉRÉ

Toutes ces vues affichent le même fichier 1920 × 1920 / 3,69 Mpx / 126 428 o :

| Emplacement | Taille d'affichage | Écart linéaire vs @3x | Animé ? |
|---|---|---|---|
| `src/screens/TweetsScreen.tsx:2021` | 26 × 26 pt (78 px) | **24,6×** | non |
| `src/screens/FeedGutterScreen.tsx:2123` (`brandMark`, `ps(27)`) | ~27 pt (81 px) | **23,7×** | non |
| `src/components/PremiumCheckoutSheet.tsx:275` (`brandLogo`) | 28 × 28 pt (84 px) | **22,9×** | non |
| `src/screens/LoginScreen.tsx:252` | 80 × 80 pt (240 px) | 8× | **oui** (conteneur `Animated.View`, opacité + `translateY`) |
| `src/screens/RegisterScreen.tsx:397` | 80 × 80 pt (240 px) | 8× | **oui** (idem) |
| `src/components/PremiumCheckoutSheet.tsx:327` (`emblemLogo`) | 96 × 96 pt (288 px) | 6,7× | non |

**Ce qui ne va pas.** Les cas `TweetsScreen` / `FeedGutterScreen` /
`PremiumCheckoutSheet:275` sont les pires ratios du dépôt (jusqu'à 606× en
aire), mais ils sont **statiques** : j'ai vérifié que l'en-tête de
`TweetsScreen` est un `<View>` ordinaire (`TweetsScreen.tsx:2008-2010`), pas
un `Animated.View` piloté par le défilement. Le coût est donc payé une fois à
l'ouverture, pas par image — cohérent avec l'arbitrage déjà documenté dans
`FeedRefreshLogo.tsx:176` (« L'en-tête du fil, lui, garde `icon.png` : il ne
l'anime jamais »). Le coût réel est un décodage de 3,69 Mpx pendant le montage
de l'écran d'accueil, l'écran le plus regardé de l'application.

Les cas `LoginScreen` / `RegisterScreen` sont différents : le logo est
**dans** un `Animated.View` qui joue une entrée en opacité + translation au
montage de l'écran. C'est le même défaut que F1-1, en moins grave (animation
ponctuelle, pas en boucle, et écart de 8× seulement).

**Correctif.** Une seule marque partagée, gravée à 192 × 192 (couvre 64 pt @3x
et tous les usages ≤ 64 pt), plus une seconde à 288 × 288 pour `emblemLogo`.
Remplacer les six `require('../../assets/icon.png')` par ces deux fichiers, et
garder `assets/icon.png` **uniquement** pour `app.config.js` (icône native, où
la définition élevée est requise). Gain estimé : le décodage sur le montage de
l'accueil passe de 3,69 Mpx à 0,04 Mpx.

---

### F1-4 — 1,10 Mo d'images non référencées dans le dépôt — MINEUR

| Fichier | Poids | Statut |
|---|---|---|
| `src/assets/images/chibi/nocontent.png` (842 × 1264) | 1 027 881 o | aucun `require`, aucune mention dans `src/` |
| `src/assets/images/chibi/twit.png` (1920 × 1920) | 126 428 o | aucun `require` ; **copie exacte** d'`assets/icon.png` (md5 identique) |
| `src/assets/images/default-avatar.png` | 2 978 o | aucun `require` ; c'est en réalité un **JPEG** portant l'extension `.png` |

**Nuance importante — pas un faux positif déguisé.** Metro ne met dans le
bundle que les ressources atteintes par un `require()`. Ces trois fichiers
**n'alourdissent donc PAS l'APK ni l'IPA**. Ils alourdissent le clone du dépôt
et l'espace de travail de la routine d'agent (1,10 Mo, soit 11 % du poids total
des images). Le gain est en confort de développement et en clarté, pas en
fluidité pour l'utilisateur. Correctif : les supprimer, ou documenter pourquoi
ils restent.

`default-avatar.png` mérite une mention à part : un JPEG nommé `.png` est un
piège pour le prochain qui voudra s'en servir en pensant disposer d'un canal
alpha.

---

### F1-5 — `icon.png`, `adaptive-icon.png` et `splash-icon.png` sont le même fichier — MINEUR

`app.config.js:19, 28, 61` pointent vers trois fichiers de 126 428 o
strictement identiques (même md5).

Ce n'est pas un problème de fluidité — ce sont des ressources de configuration
native, pas des images de rendu. Mais c'est un défaut fonctionnel Android :
l'icône adaptative attend un **premier plan avec une zone de sécurité**
(le système en rogne les bords pour appliquer la forme du lanceur, cercle,
squircle ou goutte). Servir l'icône pleine cadre signifie que le lanceur en
coupera les bords. À vérifier sur un appareil Android par le propriétaire —
je ne peux pas l'observer depuis le dépôt.

---

## Ce que j'ai vérifié et trouvé SAIN

- **`assets/refresh-mark.png` (144 × 144, 6 200 o)** —
  `src/components/feed/paper2b/FeedRefreshLogo.tsx:178`. Exemplaire : image
  gravée à sa taille d'écran (46 pt), `renderToHardwareTextureAndroid` et
  `shouldRasterizeIOS` posés sur le conteneur animé (lignes 166-167), échelle
  bornée à ≤ 1 pour ne jamais agrandir la texture. C'est le modèle que les
  autres emplacements devraient suivre.

- **Les atlas du casino** (`assets/casino/reel-strip.png` et
  `reel-strip-blur.png`, 256 × 4096) — dimensions en puissances de deux,
  chargés via `loadAsync` **à l'intérieur** de l'initialisation du contexte GL
  (`src/components/casino/SlotReel3D.tsx:259-261`), donc jamais touchés hors de
  `CasinoScreen`. Anisotropie plafonnée à 8, `flipY` explicité. Aucun coût sur
  le démarrage ni sur le fil. Un atlas est exactement la bonne réponse à N
  symboles qui défilent.

- **`src/assets/glassGrain.ts`** — bruit 32 × 32 embarqué en base64 (1,3 Ko),
  répété en mosaïque via `resizeMode="repeat"`
  (`src/components/LockedText.tsx:120-124`). Choix justifié et documenté dans le
  fichier : pas de chargement asynchrone, donc aucun instant où la vitre
  s'affiche lisse. Rien à redire.

- **`src/assets/injectionArt.ts`** (27 641 o) — tracés vectoriels bruts plutôt
  que SVG complets, dégraissés de l'anticrénelage tracé pour fond blanc. Bon
  arbitrage.

- **Les trois polices OTF** (355 112 o au total) — poids normal pour trois
  graisses d'une police de marque. Leur chargement au démarrage relève de la
  section R1, pas de F1.

- **`assets/favicon.png`** (48 × 48, 1 466 o) — cible web uniquement, sans
  effet sur le mobile.

- **Aucune autre image d'`assets/` ou de `src/assets/` n'est transformée dans
  une animation** que celles listées en F1-1, F1-2 et F1-3 : j'ai recherché
  toutes les occurrences de `require('...assets...')` dans `src/`, `App.tsx`,
  `index.ts`, `components/` et `app.config.js`, et remonté chaque style associé.
