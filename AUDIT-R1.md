# AUDIT R1 — RAPIDITÉ : démarrage

Section **EN COURS**. Les constats sont ajoutés un par un, chacun poussé dès
qu'il est vérifié. Ordre du fichier = ordre de gain décroissant.

Périmètre : ce qui est chargé ou exécuté **avant le premier écran utile**.

---

## R1-1 — 20 polices chargées avant le premier écran, dont 17 pour une option cosmétique — CRITIQUE

`App.tsx:56`, `:127-135` et `src/theme/fonts.ts:102-124`

### Le chemin de démarrage

```tsx
const [fontsLoaded, fontError] = useFonts(fontAssets);        // App.tsx:56
const [forceReady, setForceReady] = useState(false);
useEffect(() => {
  const t = setTimeout(() => setForceReady(true), 4000);      // :59 — filet de sécurité
  return () => clearTimeout(t);
}, []);
const fontsReady = fontsLoaded || !!fontError || forceReady;

if (!fontsReady) {                                            // :127
  return ( … <AppLoadingScreen /> … );                        // ← rien d'autre n'est monté
}
```

Tant que `fontsReady` est faux, **l'application entière n'est pas montée** :
pas de navigateur, pas de contextes, pas de premier appel réseau. L'utilisateur
regarde un écran de chargement.

Le commentaire au-dessus (`:53-55`) affirme : « Non bloquant : si le chargement
échoue ou traîne, on affiche l'app avec la police système en repli (aucun écran
figé possible). » **C'est vrai pour l'échec, pas pour la lenteur** : le repli
n'intervient qu'au bout de **4 secondes**. Entre 0 et 4 s, le chargement est
bel et bien bloquant. La garantie apportée est « aucun écran figé », pas
« aucune attente » — et c'est le second point qui compte ici.

### Ce qui est chargé

`fontAssets` (`src/theme/fonts.ts:102-124`) contient **20 entrées** :

| Groupe | Nombre | Détail | Nécessaire au premier écran ? |
|---|---|---|---|
| Polices de marque, locales | **3** | `TwitninfSans-Book/Medium/Bold` (`.otf`) | **oui** — c'est toute la typographie de l'interface |
| Polices Google du nom premium | **15** | Anton, PlayfairDisplay, Lora, SpaceMono, Oswald, Montserrat, Poppins, Raleway, Nunito, Rubik, Merriweather, Archivo, Orbitron, Caveat, Cinzel | **non** |
| Polices Google du test « 2B » | **2** | `Archivo_600SemiBold`, `SpaceMono_400Regular` | **non** |

Les 3 polices locales pèsent **355 112 octets** au total (mesuré :
118 304 + 115 788 + 121 020). Ce sont les seules dont le premier écran a
besoin — tout le thème (`src/theme/fonts.ts:42-50`) ne référence qu'elles.

Les **17 autres ne servent qu'au nom affiché personnalisé d'un compte
premium**. Elles ne sont consommées que par `PremiumDisplayName` via une prop
`fontId`, c'est-à-dire uniquement quand un compte a choisi une police
particulière pour son nom. C'est une option cosmétique, pour une fraction des
comptes — et elle retarde le démarrage de **tout le monde**.

Le fichier reconnaît d'ailleurs le problème pour les deux dernières
(`:34-37`) :

> « Deux graisses supplémentaires servant UNIQUEMENT au fil "2B — Gouttière"
> (test sous drapeau `fil.refonte2b`). Elles sont chargées ici parce que les
> polices sont chargées une seule fois au démarrage, **avant que le drapeau ne
> soit connu** ; à retirer avec le test. »

Le raisonnement est juste pour l'architecture actuelle — et c'est exactement
l'architecture qu'il faut changer : rien n'oblige à tout charger en une fois
avant le premier écran.

**Réserve honnête sur le chiffrage** : je n'ai pas mesuré le poids des 17
polices Google, les règles de cet audit m'interdisant d'explorer
`node_modules/`. Une police Google à graisse unique pèse typiquement entre 30
et 200 Ko selon la couverture de glyphes ; 17 d'entre elles représentent donc
vraisemblablement **de l'ordre du mégaoctet**, soit plusieurs fois le poids des
polices de marque. C'est une estimation, pas une mesure — **à confirmer avec
`du -sh` sur les paquets `@expo-google-fonts/*` avant de chiffrer le gain.**
Le **nombre** (17 sur 20), lui, est vérifié.

### Effet concret pour l'utilisateur

C'est le tout premier ressenti de l'application, à chaque lancement à froid :
un écran de chargement dont la durée est fixée par le maillon le plus lent des
20 polices. Sur un appareil modeste ou après une mise à jour (cache de polices
vide), l'attente peut approcher le plafond de 4 secondes — et au-delà, le repli
se déclenche et l'app s'affiche **en police système**, c'est-à-dire avec toute
sa typographie de marque absente, puis les polices apparaissent quand elles
arrivent. Le pire des deux mondes : on a attendu, et on a quand même un
affichage dégradé.

Et pendant ces secondes, rien d'autre n'avance : aucun appel réseau du fil
n'est parti, puisque `AppNavigator` n'est pas monté. **L'attente des polices et
le chargement du fil sont mis bout à bout au lieu d'être menés en parallèle.**

### Correctif

**1. Ne bloquer que sur les 3 polices de marque.** Elles sont locales
(`require`), donc résolues depuis le bundle sans réseau : leur chargement est
rapide et prévisible.

```ts
// src/theme/fonts.ts
export const coreFontAssets = {
  'TwitninfSans-Book':   require('../../assets/fonts/TwitninfSans-Book.otf'),
  'TwitninfSans-Medium': require('../../assets/fonts/TwitninfSans-Medium.otf'),
  'TwitninfSans-Bold':   require('../../assets/fonts/TwitninfSans-Bold.otf'),
};

/** Polices du nom premium — chargées APRÈS le premier écran. */
export const displayNameFontAssets = { /* les 15 familles Google */ };
```

```tsx
// App.tsx
const [fontsLoaded, fontError] = useFonts(coreFontAssets);   // ← 3 polices seulement
```

**2. Charger les 17 autres après le premier rendu**, sans bloquer :

```tsx
useEffect(() => {
  // Aucun `await` remonté : l'app est déjà affichée, ces polices arrivent en
  // arrière-plan. Un nom premium s'affiche en police système jusque-là, puis
  // prend sa police — un rattrapage, pas une attente.
  Font.loadAsync(displayNameFontAssets).catch(() => {});
}, []);
```

`expo-font` gère très bien ce cas : un `fontFamily` non encore chargé retombe
sur la police système au lieu de planter.

**3. Réduire le filet de sécurité.** Une fois qu'on ne bloque plus que sur 3
polices locales, 4 secondes n'a plus de sens : 800 ms à 1 s suffisent
largement. Le repli devient un vrai filet, pas une attente réelle.

**Gain attendu** : l'écran de chargement passe de « le temps de charger 20
polices dont 17 venant de paquets npm » à « le temps de lire 355 Ko depuis le
bundle », et surtout le montage du navigateur — donc le premier appel réseau du
fil — part immédiatement au lieu d'attendre. Sur un lancement à froid, c'est
probablement le gain de démarrage le plus important disponible dans ce dépôt.

**4. Retirer les deux polices « 2B »** en même temps que le test du drapeau
`fil.refonte2b`, comme le fichier le prévoit déjà — ou mieux, les basculer
elles aussi dans le chargement différé, ce qui règle immédiatement l'objection
du « drapeau pas encore connu ».

### Réserves honnêtes

- Un nom premium s'affichera en police système pendant la fraction de seconde
  qui suit l'ouverture, puis prendra sa police. C'est un changement visible, et
  c'est un arbitrage à assumer : **quelques centaines de millisecondes gagnées
  au démarrage pour tout le monde contre un léger rattrapage typographique sur
  une minorité de noms.** Le fil affichant déjà un squelette au chargement
  (`TweetSkeleton`), le rattrapage tombera le plus souvent avant que le
  premier nom ne soit à l'écran.
- Je n'ai pas mesuré le temps de démarrage réel, ni avant ni après. Le
  raisonnement est structurel (20 chargements en série avant le premier rendu
  contre 3), pas chronométré.

### Constat voisin, déjà écrit ailleurs — ne pas le compter deux fois

L'écran affiché pendant cette attente, `AppLoadingScreen`, **anime
`assets/icon.png`, qui fait 1920 × 1920 px** (3,69 mégapixels, 14,1 Mio une
fois décompressé en mémoire). C'est le constat **F1-1**, déjà rédigé et classé
CRITIQUE dans `AUDIT-F1.md`.

Les deux se renforcent et méritent d'être traités ensemble : R1-1 raccourcit
l'attente, F1-1 rend supportable ce qu'on voit pendant. Corriger l'un sans
l'autre laisse soit une attente longue devant une animation propre, soit une
animation qui saccade brièvement — corriger les deux supprime la question.

---

## R1-2 — Deux attentes indépendantes mises bout à bout : polices, PUIS authentification — CRITIQUE

`App.tsx:127-135` puis `src/navigation/AppNavigator.tsx:42-44`,
`src/contexts/AuthContext.tsx:285-292` et `:305-322`

`AppLoadingScreen` est affiché **deux fois de suite**, par deux gardes
différents, pour deux raisons sans aucun rapport l'une avec l'autre.

### La chaîne complète du démarrage à froid

```
┌─ PHASE 1 ── App.tsx:127 ─ `if (!fontsReady)` ──────────────────────────┐
│  chargement des 20 polices                          → jusqu'à 4 000 ms │
└────────────────────────────────────────────────────────────────────────┘
                                  ↓  (rien n'a démarré en parallèle)
                    montage des 13 fournisseurs
                                  ↓
┌─ PHASE 2 ── AppNavigator.tsx:42 ─ `if (isLoading)` ────────────────────┐
│  AuthContext.tsx:285-292, QUATRE étapes strictement en série :         │
│    1. await tokenStore.migrateLegacyStorage()      → lecture stockage  │
│    2. await migrateLegacyAccounts()                → lecture stockage  │
│    3. await loadAccounts()                         → lecture stockage  │
│    4. await checkAuthStatus()                                          │
│         ├ await tokenStore.getAccessToken()        → lecture SecureStore│
│         ├ await apiService.getCurrentUser()        → ALLER-RETOUR RÉSEAU│
│         └ si échec : refreshToken() puis getCurrentUser() à nouveau     │
│                                              → 2 ALLERS-RETOURS de plus │
└────────────────────────────────────────────────────────────────────────┘
                                  ↓
                   montage du navigateur, puis de TweetsScreen
                                  ↓
                      1er appel réseau du fil  →  1er tweet à l'écran
```

### Ce qui ne va pas

**Le défaut central : les deux phases n'ont rien à voir l'une avec l'autre, et
elles sont pourtant en série.**

Charger des fichiers de police depuis le bundle et vérifier un jeton auprès du
serveur sont deux opérations totalement indépendantes : aucune n'a besoin du
résultat de l'autre. Rien n'empêche techniquement de les mener **en même
temps**. Aujourd'hui, la seconde ne peut pas commencer avant que la première
soit finie, parce que `App.tsx:127` retourne avant même de monter
`AuthProvider`. **Le temps de démarrage est la somme des deux au lieu du plus
long des deux.**

**Trois défauts secondaires**, tous dans la phase 2 :

1. **Trois lectures de stockage en série avant la première requête réseau**
   (`AuthContext.tsx:287-289`). Les deux premières sont des **migrations de
   données héritées** — du travail qui, pour l'immense majorité des
   utilisateurs, n'a rien à faire. `migrateLegacyStorage` sort d'ailleurs
   immédiatement sur un drapeau (`tokenStore.ts:116`), mais **cette sortie
   coûte quand même une lecture AsyncStorage**, et elle bloque les trois étapes
   suivantes. Chaque lecture AsyncStorage est un aller-retour par le pont natif
   ; trois d'affilée, c'est quelques dizaines de millisecondes prises sur le
   chemin critique pour, le plus souvent, ne rien faire.

2. **Jusqu'à trois allers-retours réseau séquentiels** avant que le navigateur
   ne soit monté. Le cas nominal en fait un (`getCurrentUser`). Le cas d'un
   jeton d'accès expiré — c'est-à-dire **le cas ordinaire de quiconque n'a pas
   ouvert l'app depuis un moment**, donc précisément un lancement à froid — en
   fait trois : `getCurrentUser` échoue, `refreshToken`, puis `getCurrentUser`
   à nouveau (`:322`, `:330-333`). Sur un réseau mobile médiocre, trois
   allers-retours en série, c'est facilement plus d'une seconde pendant
   laquelle l'écran ne montre rien d'autre que le logo.

3. **Le fil ne commence à charger qu'après tout cela**, puisque `TweetsScreen`
   n'est monté que par le navigateur. La requête du fil est donc le cinquième
   maillon d'une chaîne entièrement séquentielle.

### Effet concret pour l'utilisateur

Au lancement à froid, l'utilisateur voit le logo pulser pendant :
**temps des 20 polices + 3 lectures de stockage + 1 à 3 allers-retours réseau**,
avant que la première requête du fil ne parte. Le premier tweet arrive encore
un aller-retour plus tard.

Rien de tout cela n'est visible comme une erreur : l'application « met du temps
à s'ouvrir », sans qu'aucune étape ne paraisse fautive isolément. C'est
précisément ce qui rend ce genre de chaîne difficile à attaquer sans la
dessiner — et c'est aussi ce qui fait qu'elle s'allonge tranquillement à chaque
ajout.

Le cas le plus pénalisé est le plus courant : **l'utilisateur qui rouvre
l'application après quelques heures**. Son jeton d'accès a expiré, il paie donc
les trois allers-retours, en plus des polices.

### Correctif

**1. Mener les polices et l'authentification en parallèle** — c'est le geste
principal, et il n'exige aucun changement de logique.

Il suffit de ne plus retourner avant `AuthProvider`, mais de laisser l'arbre se
monter et de n'afficher l'écran de chargement qu'en surimpression :

```tsx
// App.tsx — au lieu de `if (!fontsReady) return <AppLoadingScreen/>`
return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <ToastProvider>…<AuthProvider>      {/* monté TOUT DE SUITE : l'auth part */}
        …
        <AppNavigator />
        …
      </AuthProvider>…</ToastProvider>
      {/* Le voile ne masque que l'affichage, il n'empêche plus le travail. */}
      {!fontsReady && <AppLoadingScreen style={StyleSheet.absoluteFill} />}
    </SafeAreaProvider>
  </GestureHandlerRootView>
);
```

Le temps de démarrage devient `max(polices, auth)` au lieu de
`polices + auth`. Combiné à **R1-1** (ne bloquer que sur les 3 polices de
marque), la phase 1 devient quasi instantanée et disparaît de fait du chemin
critique.

**2. Paralléliser ce qui peut l'être dans `AuthContext`** :

```tsx
useEffect(() => {
  (async () => {
    // La migration des jetons ne conditionne pas celle des comptes :
    // les deux peuvent partir ensemble.
    await Promise.all([tokenStore.migrateLegacyStorage(), migrateLegacyAccounts()]);
    await loadAccounts();          // dépend de migrateLegacyAccounts
    await checkAuthStatus();
  })();
}, []);
```

Gain modeste — quelques dizaines de millisecondes — mais gratuit.

**3. Le vrai gain de la phase 2 : ne pas faire attendre le navigateur pour
`getCurrentUser`.** Le jeton présent en stockage suffit à savoir qu'on est
authentifié ; `getCurrentUser` ne fait que **rafraîchir le profil**. On peut
donc lever `isLoading` dès la lecture du jeton, monter le navigateur, et
laisser `getCurrentUser` se résoudre en arrière-plan :

```tsx
const token = await tokenStore.getAccessToken();
if (!token) { setUser(null); setIsAuthenticated(false); return; }

await apiService.setSessionAccessToken(token);
setIsAuthenticated(true);        // ← le navigateur peut monter MAINTENANT
setIsLoading(false);             //    le fil part en parallèle du profil

apiService.getCurrentUser().then((u) => { if (u) setUser(u); });
```

**Le chemin critique perd alors un à trois allers-retours réseau complets**, et
la requête du fil part au moment où on lit le jeton en stockage, pas après un
échange avec le serveur. C'est de loin le plus gros gain des trois.

**Précaution indispensable** : les écrans qui lisent `user` doivent tolérer un
`user` momentanément nul alors qu'`isAuthenticated` est vrai. Le gestionnaire
de session perdue est déjà en place (`AuthContext.tsx:297-300`,
`setSessionExpiredHandler`) et couvre le cas d'un jeton refusé — le repli
existe donc déjà, c'est ce qui rend ce changement raisonnable. **À vérifier
écran par écran avant d'appliquer** ; c'est le seul des trois correctifs qui
demande une revue, et c'est aussi celui qui rapporte le plus.

### Réserves honnêtes

- Aucun chronométrage. Les durées ne sont pas mesurées : ce constat décrit une
  **structure séquentielle** vérifiée dans le code, pas des millisecondes
  observées. Un profil de démarrage (Hermes / Systrace) dirait lequel des cinq
  maillons domine réellement. **Il vaut la peine de le mesurer avant
  d'appliquer le correctif 3**, qui est le plus invasif.
- Le correctif 1 (chargement en surimpression) suppose qu'aucun des 13
  fournisseurs ne lit une police à son montage. Rien de tel n'a été observé,
  mais je ne l'ai pas vérifié pour les 13.

### Ce que j'ai vérifié et trouvé SAIN sur le chemin de démarrage

- **Les 8 « gates » de démarrage sont exemplaires et ne sont PAS un problème.**
  C'est ce que je cherchais en ouvrant cette piste, et c'est l'inverse qui est
  vrai. Chacun attend un délai de décantation avant de lancer sa requête —
  `STARTUP_SETTLE_MS` vaut 250 ms dans `ConsentGate:22`, 300 ms dans
  `SleepGate:70`, 400 ms dans `UpdateAvailableGate:39` — et chacun ne charge
  ses données que `if (visible)` (`ConsentGate:68`,
  `FollowOnboardingGate:74`). Aucun ne tire sur le réseau au montage. Ils sont
  en outre coordonnés par une file d'attente dédiée
  (`StartupPopupContext` / `useStartupPopupSlot`) pour ne pas se superposer.
  **Ce mécanisme mérite d'être cité en exemple** : c'est exactement la
  discipline qui manque au chargement des polices.
- `EventsProvider` est la source de vérité unique des événements, et les trois
  fournisseurs qui le suivent « ne tiennent plus d'état et n'interrogent plus
  le réseau » (commentaire `App.tsx:190-193`). Cette consolidation a déjà été
  faite : quatre fournisseurs, un seul chargement.
- `PatchNotesModal` ne lit qu'AsyncStorage (`last_seen_version`), pas le
  réseau.
- Le repli sur erreur de police (`fontError`) est correct : il ne fige pas
  l'application.
- `apiService.setSessionExpiredHandler` (`AuthContext.tsx:297`) est le **seul**
  chemin de déconnexion automatique, et le commentaire précise qu'« une simple
  panne réseau ne déclenche rien ». Un démarrage hors ligne ne déconnecte donc
  pas l'utilisateur — c'est le bon comportement, et c'est ce qui rend le
  correctif 3 envisageable.
