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

---

## R1-3 — Notifications push au démarrage : deux appels en série, puis un sondage par `setTimeout` — MODÉRÉ

`App.tsx:64-126` et `src/services/push.ts:39-70`

Contrairement aux deux constats précédents, **ce travail ne bloque pas
l'affichage** : il vit dans un `useEffect` qui part après le premier rendu.
D'où le classement en modéré. Il entre néanmoins en concurrence directe avec le
chargement du fil, sur le réseau comme sur le thread JS, à l'instant précis où
l'application a le plus besoin des deux.

### Ce qui se passe

```tsx
useEffect(() => {
  (async () => {
    const token = await registerForPushNotifications(projectId);   // :80
    await setupFranceDailyLocalNotifications();                    // :83  ← EN SÉRIE
    if (token) {
      let retryCount = 0;
      const tryRegisterDevice = async () => {
        if (apiService?.token) {
          await fetch(`${…}/api/notifications/register-device`, { … });   // :95
        } else if (retryCount < maxRetries) {                             // :111
          retryCount++;
          setTimeout(tryRegisterDevice, 1000);      // ← sondage, jusqu'à 10 fois
        }
      };
      tryRegisterDevice();
    }
  })();
}, []);
```

**Trois remarques, par ordre d'importance.**

**1. Le sondage de `apiService.token` est un motif fragile** (`:111-118`).
La fonction ne sait pas quand l'authentification aboutira, alors elle **regarde
toutes les secondes, jusqu'à dix fois**. Deux conséquences :

- si l'authentification prend plus de 10 secondes — réseau très lent, exactement
  le cas où l'on tient à ses notifications — **l'appareil n'est jamais
  enregistré**, silencieusement (`:117`, un `console.error` supprimé en
  release par `transform-remove-console`). L'utilisateur ne reçoit alors
  aucune notification push, sans que rien ne le signale ;
- si elle aboutit vite, on a quand même attendu jusqu'à une seconde pleine pour
  rien, puisque le sondage ne se réveille qu'au prochain battement.

Le contexte d'authentification sait exactement quand le jeton arrive. Le
correctif naturel est de **réagir** plutôt que de sonder :

```tsx
// dans un composant sous AuthProvider
const { isAuthenticated } = useAuth();
useEffect(() => {
  if (!isAuthenticated || !expoPushToken) return;
  apiService.registerDevice(expoPushToken);      // part exactement quand il faut
}, [isAuthenticated, expoPushToken]);
```

Plus de délai, plus de plafond de 10 essais, plus d'échec silencieux.

**2. Les deux préparatifs sont en série sans nécessité** (`:80` et `:83`).
`setupFranceDailyLocalNotifications()` programme des rappels **locaux** : il ne
dépend en rien du jeton push distant. Les deux peuvent partir ensemble :

```tsx
const [token] = await Promise.all([
  registerForPushNotifications(projectId),
  setupFranceDailyLocalNotifications(),
]);
```

**3. La permission de notification est demandée au tout premier lancement,
pendant que le fil charge.** `registerForPushNotifications` appelle
`Notifications.requestPermissionsAsync()` dès que le statut n'est pas
`granted` (`push.ts:61-65`). Sur un premier lancement, la boîte de dialogue
système s'ouvre donc **avant que l'utilisateur ait vu quoi que ce soit de
l'application**.

C'est moins une question de rapidité que d'à-propos, mais l'effet est mesurable :
une demande de permission posée avant toute valeur montrée se solde
habituellement par un refus, et un refus de notification est **définitif** —
l'utilisateur devra aller dans les réglages système pour revenir dessus. Le
dépôt sait pourtant faire mieux : les 8 « gates » de démarrage utilisent une
file d'attente (`StartupPopupContext`) précisément pour poser leurs questions
au bon moment. **La demande de permission push gagnerait à passer par le même
mécanisme**, après le premier fil affiché.

*Cette troisième remarque déborde le cadre de R1 — elle est signalée parce
qu'elle se trouve sur le même chemin de code, pas parce qu'elle relève de la
rapidité.*

### Effet concret pour l'utilisateur

Modéré et diffus : au lancement, une requête vers les serveurs Expo (obtention
du jeton) et une écriture de programmation de notifications locales
s'exécutent pendant que le fil essaie de charger. Sur un réseau contraint,
c'est de la bande passante et des connexions prises à la seule requête qui
intéresse l'utilisateur à cet instant.

Le vrai défaut visible est ailleurs : **sur une connexion lente, les
notifications push ne fonctionnent tout simplement pas**, parce que le sondage
abandonne au bout de 10 secondes sans que personne ne le sache.

### Correctif

Par ordre de gain : le point 1 (réagir au lieu de sonder) corrige un bug
fonctionnel réel ; le point 2 est gratuit ; le point 3 est un arbitrage
produit à trancher.

Un quatrième geste, gratuit lui aussi : différer tout ce bloc après le premier
rendu utile, avec le même délai de décantation que les « gates »
(`setTimeout(…, 400)`). Le fil part alors seul sur le réseau, et les
notifications s'installent une fois la première image affichée.

### Vérifié au passage

- `registerForPushNotifications` sort immédiatement si `!Device.isDevice`
  (`push.ts:46-49`) : aucun coût en simulateur.
- Le bloc entier est enveloppé dans un `try/catch` (`App.tsx:122`) : un échec
  des notifications ne peut pas faire tomber le démarrage.
- Les nombreux `console.log` de `push.ts` disparaissent en release
  (`transform-remove-console`) — mais c'est aussi ce qui rend l'échec du
  sondage totalement muet en production.

---

# R1 — SYNTHÈSE DE SECTION

## Les constats

| # | Où | Défaut | Gravité |
|---|---|---|---|
| R1-2 | `App.tsx:127` → `AppNavigator.tsx:42` | polices PUIS authentification : deux attentes indépendantes en série, + 1 à 3 allers-retours réseau avant le montage du navigateur | **CRITIQUE** |
| R1-1 | `App.tsx:56`, `theme/fonts.ts:102` | 20 polices bloquent le premier écran, dont 17 pour une option cosmétique | **CRITIQUE** |
| R1-3 | `App.tsx:64-126` | 2 appels en série + sondage `setTimeout` de l'authentification (échec silencieux au-delà de 10 s) | MODÉRÉ |

*(Rappel : `AppLoadingScreen` anime une image de 1920 × 1920 px — c'est **F1-1**,
déjà écrit, sur ce même chemin de démarrage. Ne pas le recompter, mais le
traiter avec R1-1 : les deux concernent le même écran.)*

## Ce qu'il faut en retenir

**Le démarrage est une chaîne entièrement séquentielle de cinq maillons**, là
où trois d'entre eux pourraient avancer ensemble :

```
20 polices → 3 lectures de stockage → 1 à 3 appels réseau d'auth
          → montage du navigateur → 1er appel réseau du fil → 1er tweet
```

Aucun de ces maillons n'est aberrant pris isolément. C'est leur **mise bout à
bout** qui coûte, et c'est ce qui rend le problème invisible en relecture de
code : il faut dessiner la chaîne pour le voir.

**Les trois correctifs de R1-2 se composent** et attaquent chacun un maillon
différent :

1. monter l'arbre tout de suite et n'afficher le chargement qu'en
   surimpression → les polices ne sont plus **avant** l'authentification ;
2. ne bloquer que sur les 3 polices de marque (R1-1) → le maillon « polices »
   devient négligeable ;
3. lever `isLoading` dès la lecture du jeton en stockage → **un à trois
   allers-retours réseau quittent le chemin critique**, et la requête du fil
   part presque immédiatement.

Le premier et le deuxième sont mécaniques et sans risque. **Le troisième est le
plus rentable et le seul qui demande une revue** (les écrans doivent tolérer un
`user` momentanément nul) — c'est celui à mesurer avant d'appliquer.

## Ce que j'ai vérifié et trouvé SAIN

- **Les 8 « gates » de démarrage** — délai de décantation individuel
  (250/300/400 ms), chargement `if (visible)` seulement, coordination par
  `StartupPopupContext`. Aucun ne tire sur le réseau au montage. **C'est le
  meilleur mécanisme de démarrage du dépôt**, et il montre que la discipline
  existe : elle n'a simplement pas été appliquée aux polices ni à
  l'authentification.
- **Les 4 fournisseurs d'événements** ont été consolidés : `EventsProvider`
  est seul à charger, les trois autres « ne tiennent plus d'état et
  n'interrogent plus le réseau » (`App.tsx:190-193`).
- **Les 13 fournisseurs sont tous mémoïsés** (vérifié en F2) — leur montage ne
  provoque pas de cascade de rendus.
- `PatchNotesModal` ne lit qu'AsyncStorage, jamais le réseau.
- Le repli sur échec de police (`fontError`) n'immobilise pas l'application.
- La déconnexion automatique passe par un **seul** chemin
  (`setSessionExpiredHandler`, `AuthContext.tsx:297`) et une panne réseau ne la
  déclenche pas : un démarrage hors ligne ne déconnecte pas l'utilisateur.
- `TweetSkeleton` / `ScreenSkeleton` sont utilisés pendant les chargements —
  la perception du démarrage est soignée, même quand la durée ne l'est pas.

## Limites de cette section

- **Aucun chronométrage, aucun profil de démarrage.** Toute la section décrit
  une structure séquentielle lue dans le code. Elle ne dit pas lequel des cinq
  maillons domine réellement — un profil Hermes le dirait en une passe, et
  vaut la peine d'être fait avant le correctif 3 de R1-2, qui est le plus
  invasif.
- Le poids des 17 polices Google n'est pas mesuré (règle de l'audit :
  `node_modules/` interdit). Seul leur **nombre** est vérifié.
- Le coût de montage des 13 fournisseurs a été instruit par la recherche
  d'appels réseau et AsyncStorage dans leurs `useEffect` ; leur coût de rendu
  propre (travail synchrone au montage) n'a pas été mesuré.
