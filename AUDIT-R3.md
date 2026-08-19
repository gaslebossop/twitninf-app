# AUDIT R3 — RAPIDITÉ : poids du bundle

Section **EN COURS**. Constats ajoutés un par un, chacun poussé dès qu'il est
vérifié. Ordre du fichier = ordre de gain décroissant.

**Avertissement de méthode, valable pour toute la section** : `node_modules/`
n'est **pas installé** sur la machine d'audit, et le brief interdit de
l'explorer. Je n'ai donc **mesuré aucun poids de dépendance moi-même**. Partout
où je donne un ordre de grandeur, il vient de la taille publiée du paquet et
non d'une mesure locale : c'est signalé à chaque fois. Ce qui est vérifié dans
le code — quel paquet est importé, par quel fichier, et si ce fichier est
lui-même atteint — l'est intégralement.

---

## R3-1 — Six dépendances déclarées, zéro utilisée — dont une qui alourdit vraiment l'APK — MAJEUR

`package.json`, `src/store/index.ts`, `src/components/AdvancedChart.tsx`

### Ce qui est vérifié

Balayage de tout le dépôt hors `node_modules/`, `android/`, `ios/` sur les
formes d'import (`from '<paquet>'`, `require('<paquet>')`, `from '<paquet>/…'`) :

| Dépendance | Fichiers qui l'importent | Verdict |
|---|---|---|
| `react-native-maps` | **0** — le nom n'apparaît plus que dans des **commentaires** (`NfMapScreen`, `NfMapCanvas`, `mapPinUrl`) et dans `app.config.js` | mort au niveau JS, **vivant au niveau natif** |
| `axios` | **0**, nulle part | mort |
| `react-native-snap-carousel` (+ `@types/react-native-snap-carousel`) | **0** | mort |
| `@reduxjs/toolkit` | 1 : `src/store/index.ts` — mais **ce fichier n'est importé par personne** | mort |
| `react-native-chart-kit` | 1 : `src/components/AdvancedChart.tsx` — mais **ce composant n'est importé par personne** | mort |
| `hasown` | **0** (dépendance transitive remontée en dépendance directe) | mort |

Deux vérifications qui verrouillent le verdict :

```
grep -rn "src/store|from '../store'|Provider store" src/ App.tsx index.ts  →  aucun résultat
grep -rn "AdvancedChart" src/  (hors sa propre définition)                 →  aucun résultat
```

`src/store/index.ts` est de surcroît un magasin Redux **vide** — son
`reducer: { /* Add reducers here */ }` n'a jamais été rempli. C'est le
squelette de départ, jamais branché, jamais retiré.

Quant à la carte : elle a migré vers une page web servie par l'API et affichée
dans une `WebView` (`NfMapCanvas.tsx:445`, `source={{ uri: viewUrl() }}`).
La migration est propre et bien commentée — mais la dépendance native qu'elle
remplace est restée dans `package.json`.

### L'effet concret — et il faut être précis, sinon le constat est faux

**Cinq de ces six dépendances ne pèsent RIEN dans le bundle JavaScript.** Metro
construit le graphe à partir du point d'entrée : un module qu'aucun chemin
d'import n'atteint n'est tout simplement pas empaqueté. `axios`,
`@reduxjs/toolkit`, `react-native-chart-kit`, `react-native-snap-carousel` et
`hasown` ne coûtent donc **pas un octet** à l'utilisateur final. Leur coût est
réel mais il est ailleurs : durée d'installation et de CI, volume de
`node_modules`, `package-lock.json` gonflé, et surtout **surface de sécurité** —
six paquets qui reçoivent des mises à jour, peuvent être compromis en amont, et
que personne ne surveille puisque personne ne s'en sert. `react-native-chart-kit`
et `react-native-snap-carousel` sont par ailleurs deux paquets notoirement peu
maintenus.

**`react-native-maps` est le seul cas différent, et c'est celui qui compte.**
C'est un module **natif** : l'autolinking d'Expo le lie au binaire dès qu'il est
présent dans `package.json`, **indépendamment de tout import JavaScript**.
Vérifié : aucune exclusion d'autolinking dans `package.json` ni dans
`app.config.js` (`grep autolinking|exclude` → aucun résultat). Le SDK Google
Maps pour Android est donc embarqué dans chaque APK téléchargé par chaque
utilisateur, pour du code que plus rien n'appelle. Je n'ai pas pu mesurer le
delta ici (pas de `node_modules`, pas de build) ; l'ordre de grandeur usuel
pour Google Play Services Maps se compte en **méga-octets**, pas en kilo-octets.
C'est, à ma connaissance, le plus gros gain de poids disponible dans tout le
dépôt pour un risque quasi nul.

### Le correctif

```bash
npm uninstall react-native-maps axios react-native-snap-carousel \
              @types/react-native-snap-carousel @reduxjs/toolkit \
              react-native-chart-kit hasown
git rm src/store/index.ts src/components/AdvancedChart.tsx
```
puis un `npx expo prebuild --clean` pour que le natif soit régénéré sans le SDK
Maps, et une vérification de la taille de l'APK avant/après — c'est la mesure
que je n'ai pas pu faire et qui chiffrera le gain.

**Une précaution avant de retirer `react-native-maps`** : le plugin
`plugins/withGoogleMapsApiKey.js` injecte encore la clé
`com.google.android.geo.API_KEY` dans le manifeste Android, et
`app.config.js:204-223` porte un long commentaire expliquant pourquoi ce plugin
existe *à la place* du plugin de `react-native-maps`. Or la carte est
aujourd'hui une page web distante : cette clé native n'a probablement plus
d'utilité côté application. **Probablement**, pas certainement — je n'ai pas
accès au code serveur qui sert la page. À vérifier avant de retirer le plugin ;
le retrait du paquet npm, lui, ne dépend pas de cette question. Ce point est
également à reprendre en **S2** (clé `EXPO_PUBLIC_*` exposée) : une clé qui ne
sert plus à rien mais reste publiée est un risque sans contrepartie.

### Réserve honnête

Je n'ai pas vérifié `android/` ni `ios/` (interdits par le brief). Si un fichier
natif écrit à la main y référence `react-native-maps`, le retrait casserait le
build — mais `app.config.js` documente que les deux workflows CI lancent
`expo prebuild --clean`, qui **régénère intégralement** ces dossiers : une
retouche manuelle n'y survivrait pas. Le risque est donc très faible.

---

## R3-2 — Les 83 écrans et la bibliothèque 3D sont évalués au démarrage, pour tout le monde — MAJEUR

`src/navigation/MainNavigator.tsx:64` et `:1-99`,
`src/navigation/BottomTabNavigator.tsx:19`,
`src/screens/CasinoScreen.tsx:24`,
`src/components/casino/SlotReel3D.tsx:3-5`

### Ce qui est vérifié

`MainNavigator.tsx` compte **99 lignes d'`import`, dont 83 imports d'écrans**,
tous **statiques**. Et un balayage de tout `src/` sur `React.lazy` et
`Suspense` ne renvoie **aucun résultat** : le dépôt n'utilise nulle part le
chargement paresseux de composants.

La conséquence se lit le mieux sur la chaîne du casino :

```
MainNavigator.tsx:64      import CasinoScreen from '../screens/CasinoScreen';
  CasinoScreen.tsx:24       import SlotReel3D from '../components/casino/SlotReel3D';
    SlotReel3D.tsx:3-5        import { GLView } from 'expo-gl';
                              import { Renderer, loadAsync } from 'expo-three';
                              import * as THREE from 'three';
```

`SlotReel3D.tsx` est le **seul et unique fichier du dépôt** à importer `three`,
`expo-three` et `expo-gl` — vérifié par balayage complet. Trois bibliothèques
graphiques, tirées par une machine à sous de 377 lignes.

### L'effet concret — et là encore, la précision décide de la justesse

Sur React Native il n'y a **pas** de découpage du bundle : `three` est
téléchargé avec l'application, `React.lazy` ou pas. Ce constat ne parle donc
**pas** de poids téléchargé. Il parle du **temps de démarrage**, et là la
différence est réelle : Metro n'**évalue** un module que lorsqu'un `require` le
demande. Un `import` statique en tête de `MainNavigator` déclenche cette
évaluation **au montage du navigateur**, c'est-à-dire dans le chemin critique
du premier écran. Aujourd'hui, ouvrir l'application exécute donc le corps de
module de `three` — plusieurs centaines de kilo-octets de JavaScript
(ordre de grandeur d'après la taille publiée du paquet ; **non mesuré ici**,
`node_modules/` n'étant pas installé) — pour un utilisateur qui n'ouvrira
peut-être jamais le casino.

C'est exactement le maillon que la section **R1** décrivait : le démarrage est
une chaîne séquentielle, et ceci en est un maillon de plus, invisible parce
qu'il ne fait aucun appel réseau et n'affiche rien.

Précision qui limite la portée du constat, et qu'il faut donner : les 82 autres
écrans sont pour la plupart légers, et React Navigation ne **rend** que l'écran
courant — seuls les corps de module s'exécutent, pas les composants. Le gros du
gain vient de la poignée d'écrans qui tirent une bibliothèque lourde derrière
eux : le casino avec `three`/`expo-three`/`expo-gl` est de loin le premier cas.
Je ne peux pas classer les 82 autres sans mesure.

### Le correctif

**Ciblé, et c'est celui que je recommande** — un seul écran à changer :

```tsx
// CasinoScreen.tsx
const SlotReel3D = React.lazy(() => import('../components/casino/SlotReel3D'));
// au rendu :
<Suspense fallback={<ReelPlaceholder />}><SlotReel3D … /></Suspense>
```

`three` n'est alors évalué qu'à la première ouverture du casino. Une seule
condition à respecter : `SlotReel3D` exporte aussi `cellForSymbol`
(`CasinoScreen.tsx:24` l'importe nommément) — cette fonction, purement
arithmétique, doit être déplacée dans un petit module à part, sinon l'import
nommé rappelle le module lourd et annule tout le bénéfice. C'est le seul piège
du correctif, et il est facile à manquer.

**Général, à considérer ensuite** : rendre paresseux, sur le même modèle, les
écrans peu fréquentés qui tirent du natif lourd. À faire avec une mesure du
temps de démarrage avant/après, pas à l'aveugle.

### Ce que j'ai vérifié et trouvé SAIN sur ce point

`SlotReel3D.tsx` ne fait **aucun travail lourd au niveau du module** : ses
constantes de tête (`:25-47`) sont de l'arithmétique triviale et un tableau de
16 entrées. Aucune scène, aucun `Renderer`, aucune texture n'est construit hors
composant. Le coût dénoncé ici est celui de `three` lui-même, pas celui du
fichier du dépôt — qui est, lui, correctement écrit.
