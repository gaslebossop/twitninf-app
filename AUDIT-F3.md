# AUDIT F3 — FLUIDITÉ : listes

Section **EN COURS**. Les constats sont ajoutés un par un, chacun poussé dès
qu'il est vérifié. Ordre du fichier = ordre de gain décroissant.

**Rappel des valeurs par défaut de React Native** (`VirtualizedList`), qui
servent de référence à toute cette section — ce sont celles qui s'appliquent
dès qu'une liste ne règle rien :

| Prop | Défaut RN | Signification |
|---|---|---|
| `initialNumToRender` | `10` | éléments montés au premier rendu |
| `maxToRenderPerBatch` | `10` | éléments montés par lot pendant le défilement |
| `windowSize` | `21` | **en hauteurs d'écran** : 10 au-dessus + 1 visible + 10 en dessous |
| `updateCellsBatchingPeriod` | `50` ms | délai entre deux lots |
| `removeClippedSubviews` | `false` | les vues hors écran restent attachées |

Ce dépôt tourne sur React Native `0.81.5` / Expo `~54.0.10` (`package.json:43`,
`:73`).

---

## F3-1 — Fil vidéo : ~10 lecteurs vidéo instanciés d'un coup à l'ouverture de l'onglet — CRITIQUE

`src/screens/twitninfvideo.tsx:533-558`

Cette `FlatList` est un fil vidéo vertical plein écran, en pagination. Elle ne
règle **aucune** des cinq props de virtualisation — vérifié par recherche sur
tout le fichier : ni `initialNumToRender`, ni `windowSize`, ni
`maxToRenderPerBatch`, ni `removeClippedSubviews`, ni `getItemLayout`.

```tsx
<FlatList
  data={videos}
  keyExtractor={item => item.id}
  pagingEnabled
  snapToInterval={cardHeight}        // ← un élément = une hauteur d'écran
  snapToAlignment="start"
  decelerationRate="fast"
  …
  // aucune prop de virtualisation, aucun getItemLayout
/>
```

### Ce qui ne va pas

Les valeurs par défaut de React Native sont calibrées pour des lignes de liste
ordinaires — une trentaine par écran. Ici, **un élément occupe exactement une
hauteur d'écran**. Les défauts prennent alors un sens tout autre :

- `initialNumToRender: 10` → **10 cartes plein écran montées au premier
  rendu**, alors qu'une seule est visible ;
- `windowSize: 21` → jusqu'à ~21 cartes montées simultanément en défilement.

Et une carte n'est pas une vue légère. Vérifié en F2-8 : `VideoCard`
(`:105`) porte 9 `useState`, un `<LinearGradient>` plein écran, une `<Image>`
de miniature — et surtout un **`<Video>` expo-av monté en permanence** dès que
`videoUrl` existe (`:272`). Seul `shouldPlay={isActive}` distingue la carte
active des autres : les autres ne jouent pas, mais **elles existent**, avec
leur surface de décodage et leur session média native.

Autrement dit, à l'ouverture de l'onglet Vidéos, l'application demande au
système d'instancier une dizaine de lecteurs vidéo pour afficher une vidéo.

`removeClippedSubviews` restant à `false`, les cartes hors écran gardent en
plus leurs vues natives attachées à la hiérarchie.

### Effet concret pour l'utilisateur

Trois symptômes, tous cohérents avec ce réglage :

1. **L'onglet Vidéos est long à s'ouvrir**, et d'autant plus que la connexion
   est lente : dix lecteurs s'initialisent et commencent à réclamer leurs
   segments réseau en concurrence avec celui de la vidéo qu'on veut
   effectivement regarder. La première vidéo démarre donc *plus tard* à cause
   des neuf autres.
2. **La consommation de données explose.** Chaque lecteur monté met en tampon,
   même sans jouer. L'utilisateur paie du forfait mobile pour neuf vidéos qu'il
   ne verra peut-être jamais — c'est le reproche le plus concret qu'on puisse
   faire à un fil vidéo.
3. **Sur un appareil modeste, ça se dégrade franchement.** Le nombre de
   décodeurs matériels est limité (souvent 2 à 4 flux simultanés selon les
   puces). Au-delà, le système bascule sur du décodage logiciel ou refuse la
   session : la vidéo saccade, ou reste noire sur une miniature qui ne part
   jamais. C'est l'hypothèse la plus probable derrière un rapport du type
   « les vidéos ne se lancent pas sur mon téléphone » qui ne se reproduit pas
   sur un appareil récent.

### Correctif

Le dépôt a déjà un réglage maison, appliqué à ses quatre listes de contenu
(`TweetsScreen:2131-2135`, `ProfileScreen:537-540`,
`NotificationsScreen:522-526`, `UserProfileScreen:700-703`) :

```tsx
initialNumToRender={6}
maxToRenderPerBatch={5}
updateCellsBatchingPeriod={50}
windowSize={7}
removeClippedSubviews={Platform.OS === 'android'}
```

Il ne se recopie **pas tel quel** ici : ce réglage vise des lignes de fil, pas
des pages plein écran. Pour un fil vidéo paginé, viser le strict nécessaire —
la carte active et une voisine de chaque côté :

```tsx
initialNumToRender={2}
maxToRenderPerBatch={2}
windowSize={3}                       // 1 avant + 1 visible + 1 après
removeClippedSubviews={Platform.OS === 'android'}
getItemLayout={(_, i) => ({ length: cardHeight, offset: cardHeight * i, index: i })}
```

`getItemLayout` est ici **gratuit et exact** : toutes les cartes font
`cardHeight`, la valeur est déjà calculée et passée à `snapToInterval`
(`:539`). Il évite à la liste de mesurer les cellules à la volée et fiabilise
le calage de la pagination.

**Gain attendu : d'environ 10 lecteurs vidéo instanciés à l'ouverture à 2.**
C'est, à mon sens, le correctif au meilleur rapport gain/risque de tout
l'audit : cinq lignes de props, aucune logique touchée.

Le complément naturel — ne monter le `<Video>` que pour la carte active et ses
voisines immédiates, et afficher la miniature ailleurs — devient largement
superflu une fois `windowSize={3}` posé, puisque la fenêtre ne garde plus que
ces cartes-là. Autant commencer par les props.

### Réserve honnête

`windowSize={3}` réduit le préchargement : la vidéo suivante a moins d'avance
pour se mettre en tampon, et un glissé très rapide pourrait tomber sur une
carte non encore prête. C'est l'arbitrage à mesurer sur appareil. Si le
démarrage de la vidéo suivante paraît en retrait, `windowSize={5}` (2 de chaque
côté) reste très loin des 21 actuels. Je ne recommande pas de descendre
en dessous de 3.

*Ce constat porte sur le réglage de la liste. Le fait que toutes les cartes
montées se re-rendent à chaque glissé est un défaut distinct et cumulatif,
traité en F2-8 — les deux se corrigent indépendamment et se complètent.*
