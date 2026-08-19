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
