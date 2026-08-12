import { registerRootComponent } from 'expo';
import 'react-native-gesture-handler';
import React from 'react';

import { applyThemePalette } from './src/theme/colors';
import { loadThemePreference, resolvePreference } from './src/theme/themePreference';

/**
 * Racine de l'application — elle n'existe QUE pour appliquer le thème avant
 * que le reste du code ne soit chargé.
 *
 * `App` n'est volontairement PAS importé en haut de ce fichier : un `import`
 * statique est évalué au chargement du bundle, donc tout l'arbre d'écrans —
 * et les 178 `StyleSheet.create` qu'il contient — serait figé sur la palette
 * par défaut avant même que la préférence ait pu être lue.
 *
 * Le `require()` plus bas est appelé au moment du rendu, une fois la palette
 * en place : Metro n'évalue le module qu'à cet instant, et tous les styles se
 * construisent alors avec les bonnes couleurs.
 */
function Root() {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        applyThemePalette(resolvePreference(await loadThemePreference()));
      } catch {
        // Palette par défaut : mieux vaut démarrer en sombre que pas du tout.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rien plutôt qu'un écran de chargement : l'écran natif de démarrage est
  // encore affiché à cet instant, et la lecture d'AsyncStorage prend quelques
  // millisecondes. Un indicateur ici ferait un clignotement inutile.
  if (!ready) return null;

  const App = require('./App').default;
  return React.createElement(App);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
