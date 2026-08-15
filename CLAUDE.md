# twitninf-app (mobile) — Contexte Claude

Réservé aux conventions qu'une exploration à froid (Glob/Grep) ne révèle pas
vite, ou révèle mal. But : que la routine automatisée (voir
`.github/workflows/agent-task-trigger.yml`, déclenchée par une idée retenue
sur « La Forge ») code juste du premier coup, sans redécouvrir ça à chaque
run.

## Piège n°1 — `.gitignore` avale silencieusement `*.md` et `*.js`

```
*.md
*.js
!tests/*.test.js
App.tsx
```

Un `git add .` ou `git add fichier.md` ne renvoie **aucune erreur, aucun `??`
dans `git status`** — le fichier est juste absent du commit. Ce piège a déjà
fait perdre un document de passation entier.

**Toujours `git add -f` sur tout `.md` ou `.js` nouveau/modifié** (sauf ceux
déjà réintégrés explicitement : `app.config.js`, `babel.config.js`,
`metro.config.js`, `App.tsx`, `plugins/*.js`, `CLAUDE.md`). Vérifier avec
`git show --stat HEAD` avant de push que le fichier y figure vraiment.

## Structure

- `src/screens/*.tsx` — un écran par fichier, pas de sous-dossiers.
- `src/components/ui/` — primitives partagées, exportées depuis `index.ts`.
  Toujours regarder ce barrel avant d'écrire un nouveau composant : la
  primitive existe probablement déjà.
- `src/navigation/MainNavigator.tsx` — stack racine. Un nouvel écran demande
  DEUX ajouts ici : le type de route dans le param list (`NomEcran:
  undefined` ou avec params), et un `<MainStack.Screen name="NomEcran"
  component={NomEcranScreen} />`. `BottomTabNavigator.tsx` séparément pour un
  onglet, pas un écran poussé.
- `src/theme/` — point d'entrée unique : `import { colors, spacing, radius,
  typography, fonts } from '../theme'`. Ne jamais coder une couleur hex en
  dur ni dupliquer un token ailleurs.
- `src/services/*.ts` — un fichier par domaine (ex. `forgeService.ts`),
  fonctions exportées + `export default { ... }` en fin de fichier, chaque
  fonction retourne `{ success, data?, message? }` et catch ses propres
  erreurs réseau. Suivre ce patron pour tout nouveau service.

## Interdits — remplacés par `src/components/ui`

`Alert.alert` a été retiré entièrement de ce repo (392 appels → 0). Ne
jamais le réintroduire, ni `ActionSheetIOS`, ni `Alert.prompt` (iOS
seulement, no-op sur Android). À la place :

| Besoin | Hook | Import impératif (hors composant) |
|---|---|---|
| Message d'issue (succès/erreur/info/gain) | `useToast()` | `toast.success/error/info/reward(...)` |
| Question fermée oui/non | `useConfirm()` | `confirmAsync({ title, destructive })` → `Promise<boolean>` |
| Menu de N actions | `useActionSheet()` | `showActionSheet({ items })` |
| Question à réponse écrite | `usePrompt()` | `promptAsync({...})` → `Promise<string \| null>` |
| Célébration d'un gain NF | `useReward()` | `celebrateReward({ amount, label, multiplier })` |

**Piège** : ces hôtes ne s'affichent pas sous une `<Modal>` React Native
(fenêtre native séparée). Un sous-écran modal doit afficher son message
dedans, jamais via ces hooks.

`expo-haptics` n'est pas installé — retour tactile via `Vibration` du cœur
React Native uniquement (muet sur iOS pour un tap léger, c'est normal).

Zone tapable : `Tappable` (enfoncement + vibration), pas `TouchableOpacity`
seul — l'opacité seule est invisible sur fond noir.

## Design system « Pulse »

Noir plat `colors.bg` (`#0A0A0A`), accent magenta `colors.accent`
(`#FE2C55`), cyan `colors.cyan` rare (live/liens/retweet uniquement), or
pour la monnaie/casino, `colors.success`/`colors.danger` distincts du
magenta.

**Règle centrale : surfaces PLEINES.** Plus de `BlurView` décoratif, plus de
`rgba(255,255,255,0.0X)` translucide, plus de dégradé multiple par carte,
plus de couleur différente par bouton de menu (pattern identifié comme
« généré par IA », explicitement rejeté). Une carte = `GlassCard`/`Card`
(malgré le nom, surface pleine depuis la refonte Pulse), un bouton =
`GlassButton`/`Button`, un en-tête = `GlassHeader`/`Header`.

Un nouvel écran s'ouvre avec `<ScreenBackground>` (fond plat, pas d'aurora
SVG) et respecte les insets via `react-native-safe-area-context`
(`useSafeAreaInsets`) — `SafeAreaProvider` est monté dans `App.tsx`.

## Animation — trois défauts explicitement rejetés

1. **Le ressort qui oscille.** Jamais `springify().damping(14)` ni un spring
   sous-amorti. Soit une durée courte (140–200 ms, `Easing.out`), soit un
   ressort en amortissement critique — `src/theme/motion.ts` a déjà les
   bonnes valeurs (`duration.fast/base`, `easing.out`, `spring`).
2. **L'animation rejouée au recyclage d'une `FlatList`.** Ne jamais mettre
   `entering=` sur une ligne sans garde-fou (`Set` d'ids déjà animés +
   drapeau « chargement initial fait »).
3. **Le « diaporama » au montage.** Aucun fondu/glissement d'entrée sur
   l'écran lui-même à l'ouverture — l'écran doit être prêt immédiatement, pas
   se dévoiler. Animer uniquement ce qui répond à une action directe
   (appui, envoi, glissé), jamais l'apparition de l'écran.

`TweetsScreen` importe Reanimated sous le nom `Animated` — une
`Animated.Value` du cœur RN qui y échoue silencieusement
(`Invariant Violation: Transform… must be a number`) vient presque toujours
de ce nommage ambigu.

## Tab bar — recouvre le bas de chaque écran

`BottomTabNavigator` est `position: 'absolute'`, hauteur 83 (iOS) / 85
(Android). Un élément ancré en bas d'un écran d'onglet doit ajouter cette
hauteur via `useContext(BottomTabBarHeightContext)` (rend `undefined` hors
tab navigator, contrairement à `useBottomTabBarHeight` qui lève une erreur).

## Vérifier avant de push

```bash
npm run typecheck   # tsc --noEmit — doit sortir sans erreur
```

Si cette commande échoue avec des erreurs de résolution de module sans
rapport avec le code touché (conflit `customConditions`/`moduleResolution`
connu sur ce repo), relancer avec :
`npx tsc --noEmit --moduleResolution bundler --module esnext --target es2017 --skipLibCheck --strict false --esModuleInterop --resolveJsonModule --allowSyntheticDefaultImports`
et ignorer les erreurs préexistantes dans `behaviorTracker.ts`,
`PremiumProfileEffects.tsx`, `EventContext.tsx` si elles ne touchent pas les
fichiers modifiés.
