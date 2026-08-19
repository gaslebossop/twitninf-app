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
