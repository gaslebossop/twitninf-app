# AUDIT F4 — FLUIDITÉ : animations et thread UI

Section **EN COURS**. Les constats sont ajoutés un par un, chacun poussé dès
qu'il est vérifié. Ordre du fichier = ordre de gain décroissant.

---

## F4-1 — `VerifiedBadge` : jusqu'à 5 boucles infinies par badge, et le garde-fou n'a été posé que sur le fil — MAJEUR

`src/components/VerifiedBadge.tsx:35`, `:67-240` — usages dans tout le dépôt

### Le mécanisme

`VerifiedBadge` démarre des boucles d'animation infinies selon le style de
certification, chacune dans son `useEffect`, chacune conditionnée au style :

| `verificationStyle` | Boucles démarrées | Total |
|---|---|---|
| `default` | aucune (sortie anticipée `:68`) | **0** |
| `gray` | pulsation de base + glow | **2** |
| `gold` | pulsation de base + sparkle + glow | **3** |
| `rose` | pulsation de base + shimmer + glow + rotation (20 s) + anneau | **5** |

Toutes sont des `Animated.loop(...)` en `useNativeDriver: true`, et **toutes
tournent tant que le composant est monté** — elles ne s'arrêtent que dans la
fonction de nettoyage du `useEffect`, c'est-à-dire au démontage. Un badge
`rose` monté quelque part, c'est cinq boucles natives qui ne s'interrompent
jamais, y compris quand la ligne est sortie de l'écran mais reste dans la
fenêtre de virtualisation.

### Le problème a déjà été diagnostiqué — et le correctif n'a été appliqué qu'à un seul endroit

La valeur par défaut de la prop est `animated = true` (`:35`). Le fil, lui,
passe explicitement `animated={false}`, avec un commentaire qui nomme le
problème (`src/components/feed/TweetRow.tsx:471-472`) :

> « `animated={false}` dans le fil : chaque badge animé lançait 3 à 4 boucles
> infinies qui ne s'arrêtaient jamais. »

Et le fichier lui-même porte la trace d'un premier correctif
(`VerifiedBadge.tsx:62-66`) :

> « […] un simple `<Ionicons>` statique, donc démarrer cette boucle pour lui
> faisait tourner une animation en continu pour rien — **multiplié par chaque
> badge visible dans un fil, c'était la première cause de saccades signalée**,
> bien avant le poids propre du style rose. »

Le garde-fou `animated={false}` est présent à **quatre endroits** :
`TweetRow.tsx:476` et `:608`, `TweetRowGutter.tsx:601`,
`TweetDetailScreen.tsx:1325`.

**Il manque partout ailleurs**, y compris dans des listes :

| Fichier | Ligne | Valeur | Contexte |
|---|---|---|---|
| `TweetCard.tsx` | `:411` | **`animated={true}`** | lignes de tweet de `ProfileScreen` | 
| `LiveViewerScreen.tsx` | `:129` | **`animated`** | **ligne de chat du live** |
| `MessagesScreen.tsx` | `:339` | **`animated`** | ligne de la liste des conversations |
| `NotificationsScreen.tsx` | `:181` | défaut = `true` | ligne de notification |
| `UserConnectionsScreen.tsx` | `:158` | défaut = `true` | ligne d'abonné |
| `FollowRequestsScreen.tsx` | `:168` | défaut = `true` | ligne de demande |
| `UserSuggestions.tsx` | `:129` | défaut = `true` | suggestion de compte |
| `PromotedAccountCard.tsx` | `:85` | défaut = `true` | carte sponsorisée du fil |
| `ExploreImmersive.tsx` | `:229` | défaut = `true` | mur Explorer |
| `AdTweetCard.tsx` | `:169` | **`animated={true}`** | publicité du fil |

**`TweetCard.tsx:411` est le cas le plus grave** : `TweetCard` est le composant
qui rend les tweets de `ProfileScreen` (`ProfileScreen.tsx:304`), dans une
`FlatList`. C'est exactement le même usage que `TweetRow` dans le fil
d'accueil — celui pour lequel le correctif a été écrit — et il passe
explicitement `animated={true}`, soit l'inverse.

`AdTweetCard.tsx:169` et `PromotedAccountCard.tsx:85` sont dans le **fil
d'accueil lui-même** : le correctif a été posé sur la ligne de tweet ordinaire
et oublié sur les deux entrées publicitaires qui défilent au milieu.

### Effet concret pour l'utilisateur

Sur un profil dont les tweets sont rendus par `TweetCard`, chaque ligne d'un
auteur certifié `rose` fait tourner **cinq boucles natives permanentes**. Dix
lignes montées, c'est jusqu'à cinquante animations infinies simultanées —
pendant qu'on essaie de faire défiler la liste.

Le pilote natif épargne le thread JS (c'est ce qui fait que le symptôme est
diffus plutôt que brutal), mais chaque boucle reste un nœud d'animation que le
moteur natif évalue à chaque image. Le résultat est un défilement qui n'est
jamais franchement cassé mais jamais tout à fait net, et une batterie qui
descend plus vite sur les écrans de profil et de messagerie que sur le fil —
alors que le fil, lui, est protégé.

Le cas du **chat de live** (`LiveViewerScreen.tsx:129`) est le plus mal placé :
`animated` y est explicitement demandé, sur des lignes de liste, **pendant la
lecture d'un flux vidéo**. C'est le moment où il reste le moins de marge.

### Correctif

**Le bon geste n'est pas d'ajouter `animated={false}` à dix endroits** — c'est
précisément ainsi qu'on se retrouve avec quatre appels corrigés sur quatorze.
**Inverser la valeur par défaut** :

```tsx
// VerifiedBadge.tsx:35
animated = false,          // au lieu de `animated = true`
```

Puis passer `animated` explicitement **uniquement** là où le badge est seul à
l'écran et mérite son effet : l'en-tête de profil
(`UserProfileScreen.tsx:661`), le détail d'un tweet (`TweetDetailScreen:157`,
`:956`). Ce sont des instances uniques, jamais des lignes de liste.

Ce changement va dans le sens de la sécurité : un oubli donne alors un badge
statique — un défaut cosmétique invisible pour la plupart des styles — au lieu
de cinq boucles infinies. Aujourd'hui l'oubli coûte cher et ne se voit pas.

**Second geste, complémentaire** : les boucles de même période devraient
partager une horloge, exactement comme `src/utils/litPulse.ts` le fait déjà
pour la pulsation « allumée ». Le dépôt a inventé ce motif — singleton de
module, pilote natif, une seule boucle pour toute l'application, phase commune
par construction — et l'a documenté comme la solution à ce problème précis.
Les boucles `glow` (1 500 ms) de `gray`, `gold` et `rose` ont la même période
et pourraient toutes s'y brancher. C'est le même travail de propagation que
pour le reste.

### Réserve honnête

Je ne sais pas quelle proportion des comptes certifiés utilise `rose` ou
`gold` plutôt que `default`. Si la quasi-totalité est en `default`, le coût
réel est proche de zéro et ce constat est surdimensionné — la sortie anticipée
de `:68` couvre alors tout. Ce qui est certain et vérifiable : **la valeur par
défaut de la prop expose au pire cas**, et le seul endroit du dépôt qui s'en
protège est le fil d'accueil, sur la foi d'un problème réellement observé
(« la première cause de saccades signalée »). Inverser le défaut coûte une
ligne et supprime la catégorie entière.

### Vérifié au passage

- Les `useEffect` de `VerifiedBadge` retournent **tous** une fonction de
  nettoyage qui appelle `.stop()` sur leurs boucles (`:121`, `:164`, etc.) :
  il n'y a pas de fuite au démontage. Le problème est le nombre de boucles
  vivantes simultanément, pas leur survie après démontage.
- Toutes ces boucles sont en `useNativeDriver: true`. Aucune ne charge le
  thread JS.
- `VerifiedBadge` est bien mémoïsé (`:721`) et reçoit des props primitives :
  il n'est pas re-rendu inutilement. Le coût est celui des boucles, pas celui
  des rendus.

---

## F4-2 — Trois constats mineurs, groupés

Aucun des trois ne justifie un chantier. Ils sont écrits parce qu'ils se
corrigent en quelques lignes et qu'un balayage exhaustif doit dire ce qu'il a
trouvé, y compris quand c'est petit.

### a) `NewConversationScreen` — un indicateur d'onglet animé sur le thread JS

`src/screens/NewConversationScreen.tsx:100`, `:272-275`

```tsx
Animated.spring(tabAnim, { toValue: idx, useNativeDriver: false, tension: 80, friction: 18 }).start();
…
const tabIndicatorLeft = tabAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [4, …, …] });
```

`useNativeDriver: false` est **obligatoire ici** — la valeur pilote la
propriété `left`, que le pilote natif ne sait pas animer. Le ressort tourne
donc sur le thread JS, à côté du reste.

**Le correctif est le changement de propriété, pas le pilote** : `left` →
`transform: [{ translateX }]`, ce qui rend `useNativeDriver: true` possible.
Les valeurs de sortie sont déjà des décalages absolus depuis la gauche, la
conversion est directe.

Ce n'est pas une hypothèse : **le fil a fait exactement cette migration**, et
l'a documentée (`TweetsScreen.tsx:322` : « Indicateur d'onglet — thread UI
(auparavant `useNativeDriver: false`) »). C'est le même geste, sur un écran
resté en arrière. Quatrième occurrence dans cet audit du motif « corrigé une
fois, jamais propagé ».

*Réserve* : `NewConversationScreen` est un écran secondaire, ouvert
brièvement. Le ressort est par ailleurs correctement amorti
(`tension: 80 / friction: 18` ; l'amortissement critique est à `2 × √80 ≈ 17,9`).
Gain réel faible.

### b) `TweetCard` — `elevation: 8` sur chaque ligne pendant un événement

`src/components/TweetCard.tsx:329-338`

```tsx
hasActiveEvent && eventTheme && {
  …
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 8,
},
```

Pendant un événement actif, **chaque ligne de tweet** rendue par `TweetCard`
(donc toute la liste de `ProfileScreen`) reçoit une ombre portée. Sur Android,
`elevation` sur les lignes d'une liste qui défile est l'un des coûts de
composition les plus classiques : le système recalcule une ombre par ligne et
par image.

**Effet concret** : le profil défile moins bien pendant un événement que le
reste du temps — une dégradation qui n'apparaît que par intermittence, donc
difficile à relier à sa cause quand elle est signalée.

**Correctif** : préférer une bordure teintée (déjà présente juste au-dessus :
`borderColor` + `borderWidth: 1`) et laisser tomber l'ombre, ou la réserver à
iOS où elle est moins coûteuse. La bordure suffit largement à marquer le thème
événementiel.

*Réserve honnête* : je ne sais pas à quelle fréquence un événement est actif.
Si c'est rare, l'impact est proportionnellement rare.

### c) Code mort porteur d'animations infinies

Trois composants contiennent des `Animated.loop` infinies et **ne sont importés
nulle part** :

| Composant | Boucles |
|---|---|
| `src/components/PremiumUsernameGlow.tsx` | 2 |
| `src/components/PremiumBadges.tsx` | 3 |
| `src/components/TopNavbar.tsx` | — (mais 3 `BlurView`, dégradé multi-stops, couleurs hex en dur d'avant Pulse) |

Sans effet sur la fluidité **puisqu'ils ne sont jamais montés** — c'est pourquoi
ce n'est pas un vrai constat F4. Mais ils pèsent dans le bundle et, plus
gênant, ils constituent des modèles à recopier qui contredisent le design
system actuel. **Renvoyé à R3** avec le reste du code mort recensé.

---

# F4 — SYNTHÈSE DE SECTION

## Le résultat principal : cette section est la plus saine des trois

C'est le constat le plus important de F4, et il mérite d'être dit clairement
plutôt que noyé : **les quatre défauts d'animation les plus graves que cette
section devait chercher sont absents de ce dépôt.**

| Défaut cherché | Résultat |
|---|---|
| Fonction JS appelée depuis un worklet sans `runOnJS` (tue l'app sans journal) | **0 occurrence** — 12 fichiers à gestes vérifiés un par un |
| Ressort sous-amorti / `springify()` (défaut n°1 de `CLAUDE.md`) | **0 occurrence** |
| Animation d'entrée sur une ligne recyclée (défaut n°2) | **0 occurrence** — les 16 `entering=` sont sur des bannières, états vides et onboarding |
| `scrollEventThrottle={16}` plafonnant à 60 Hz | **0 occurrence** — les 3 valeurs présentes sont `{1}`, `{100}`, `{160}` |
| Reanimated importé sous le nom `Animated` **et** `new Animated.Value` dans le même fichier | **0 occurrence** |

Le détail de chaque balayage est dans `AUDIT-PROGRESS.md`, section F4, pour
qu'une passe ultérieure n'ait pas à les refaire.

## Les constats

| # | Où | Défaut | Gravité |
|---|---|---|---|
| F4-1 | `VerifiedBadge` + 10 usages | jusqu'à 5 boucles infinies par badge ; `animated` vaut `true` par défaut et le garde-fou n'est posé que sur 4 usages sur 14 | **MAJEUR** |
| F4-2a | `NewConversationScreen:100` | indicateur d'onglet animé sur le thread JS (`left` au lieu de `translateX`) | mineur |
| F4-2b | `TweetCard:337` | `elevation: 8` par ligne pendant un événement | mineur |
| F4-2c | 3 composants morts | boucles infinies dans du code jamais monté → R3 | — |

## Ce qu'il faut en retenir

**Le seul vrai constat de la section est, encore une fois, un problème de
propagation.** Le coût des boucles de `VerifiedBadge` a été mesuré, compris et
documenté (« la première cause de saccades signalée ») ; le garde-fou
`animated={false}` a été posé sur le fil d'accueil — et nulle part ailleurs,
alors que la valeur par défaut de la prop expose au pire cas. `TweetCard`, qui
rend les mêmes lignes sur les profils, passe même `animated={true}`.

C'est la quatrième fois que cet audit rencontre ce schéma exact :

| Section | Correctif trouvé une fois | Non propagé à |
|---|---|---|
| F2-3 | comparateur d'auteur dans `TweetCard` | `TweetRow`, `TweetRowGutter` |
| F3-3 | réglage de virtualisation dans 5 listes | les 15 autres |
| F4-1 | `animated={false}` sur `TweetRow` | 10 autres usages |
| F4-2a | indicateur d'onglet natif dans `TweetsScreen` | `NewConversationScreen` |

**La conclusion transverse de l'audit se dessine ici** : ce dépôt ne souffre
pas d'un manque de compétence — les diagnostics sont justes, les correctifs
sont bons, les commentaires qui les accompagnent sont excellents. Il souffre
d'un défaut de **diffusion** : chaque correctif reste là où le problème a été
observé. Les remèdes structurels — inverser un défaut dangereux, extraire une
constante partagée, activer un linter — valent mieux que dix corrections
ponctuelles, parce qu'ils suppriment la catégorie au lieu d'une occurrence.

## Ce que j'ai vérifié et trouvé SAIN

- **`src/utils/gesture.ts`** — helpers partagés (`clamp`, `rubberBand`,
  `projectDecay`) tous marqués `'worklet'`. C'est ce qui rend les gestes du fil
  sûrs. Modèle à suivre.
- **`src/utils/litPulse.ts`** — horloge singleton de module, pilote natif, une
  seule boucle pour toute l'application. Déjà signalé en F2 ; c'est aussi la
  réponse au problème de F4-1, déjà écrite dans le dépôt.
- **La barre d'onglets ne floute que sur iOS**
  (`navigation/BottomTabNavigator.tsx:224-232`) : matériau natif
  `systemChromeMaterial` sur iOS, `View` pleine sur Android. C'est exactement
  le bon arbitrage — le flou d'`expo-blur` est coûteux sur Android, natif et
  quasi gratuit sur iOS.
- **`LockedText.tsx:93-105`** — le commentaire explique pourquoi
  `experimentalBlurMethod` est écarté sur Android (plantage
  `RSIllegalArgumentException` observé). Décision documentée, pas un oubli.
- **`CasinoScreen.tsx:193-230`** — les 18 particules de confetti sont pilotées
  par **une seule `Animated.Value`**, avec le commentaire qui le revendique :
  « une seule animation native, quel que soit le nombre de particules ». C'est
  la bonne façon de faire une gerbe de particules ; rien à redire.
- **`ExploreImmersive.tsx:552-620`** — `'worklet'` sur chaque callback, y
  compris dans les callbacks de fin de `withTiming`, et `runOnJS` sur chaque
  retour vers React. Impeccable.
- **`ProfileThemeBackdrop` / `AvatarDecorationLayer`** (`ProfileDecoration`) et
  leurs matières animées (`profile/ThemeMaterial`, `profile/AvatarMaterial`,
  4 `withRepeat` chacune) ne sont montés **qu'une fois par écran de profil**,
  jamais par ligne de liste. Vérifié : leurs seuls appelants sont
  `UserProfileScreen` et `ProfileCustomizationScreen`. Pas un problème.
- **`VerifiedBadge`** : tous ses `useEffect` nettoient leurs boucles au
  démontage. Pas de fuite — le problème de F4-1 est le nombre de boucles
  vivantes, pas leur survie.

## Limites de cette section

- Aucune mesure sur appareil, aucun profilage. Les balayages sont exhaustifs
  sur le **texte du code** ; ils ne disent rien des coûts réels par image.
- La gravité de F4-1 dépend de la répartition réelle des styles de
  certification (`default` / `gray` / `gold` / `rose`) parmi les comptes
  certifiés, que je ne peux pas connaître depuis le dépôt. Le raisonnement est
  bâti sur le pire cas, et la réserve est écrite dans le constat.
- Les 147 déclarations de `shadowRadius`/`elevation` n'ont pas été auditées une
  par une : j'ai vérifié celles des trois composants de ligne de fil
  (`TweetRow`, `TweetRowGutter`, `TweetCard`) — seul `TweetCard` en a une, et
  elle est conditionnelle (F4-2b). Les autres sont sur des écrans hors
  défilement rapide.
