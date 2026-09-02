import React, { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import ThemeMaterial from './ThemeMaterial';
import ThemeShader from './ThemeShader';
import ThemeSkia from './ThemeSkia';
import { hasSkia } from './skiaRuntime';
import type { ThemeMaterialKind } from './themeBudget';

/**
 * Le fond de thème, et le choix de son moteur.
 *
 * TROIS implémentations de la même image, un seul dosage (`themeBudget`) pour
 * les trois, et une dégradation ordonnée :
 *
 *  1. **`ThemeSkia`** (SkSL) quand le binaire embarque Skia — donc dans un
 *     build, pas dans Expo Go. C'est le seul des trois qui ait du **bruit
 *     fractal** : le contour des foyers n'y est plus une ellipse mais une
 *     frontière de nuage qui se déforme, et il y a du **grain**. C'est la
 *     différence entre de la matière et un dégradé.
 *  2. **`ThemeShader`** (GLSL sur `expo-gl`) partout ailleurs, Expo Go
 *     compris. Formes exactes, tramage anti-banding, mais pas de bruit :
 *     ce sont des ellipses parfaites, très propres.
 *  3. **`ThemeMaterial`** (`react-native-svg`) en dernier recours. Ce n'est
 *     pas un brouillon : c'est la version validée à l'écran, et elle doit
 *     continuer de marcher là où rien d'autre ne tourne.
 *
 * Rien ne DISPARAÎT quand on descend d'un cran — on perd du grain, du bruit
 * et de la finesse, jamais un élément du dessin.
 *
 * ── Quand on retombe en SVG ──────────────────────────────────────────────
 *
 *  1. **Le web.** L'entrée web de l'app est un bundle à part et `GLView` y
 *     dépend d'un canvas WebGL qui n'a aucune raison d'être garanti. Le fond
 *     d'un profil ne mérite pas ce pari.
 *  2. **L'échec de création du contexte.** Émulateur sans GL, appareil qui
 *     refuse un second contexte, pilote capricieux : `ThemeShader` le signale
 *     et on bascule. Sans ce filet, l'échec se verrait comme un rectangle
 *     noir sur tout le haut du profil — bien pire que l'absence de shader.
 *
 * La bascule est à SENS UNIQUE dans la vie du composant. Réessayer GL après
 * un échec ferait clignoter le fond entre deux rendus différents à chaque
 * remontage, sur un appareil où l'on sait déjà que ça ne marche pas.
 */

export interface ThemeFieldProps {
  kind: ThemeMaterialKind;
  accent: string;
  secondary: string;
  /** Multiplicateur d'intensité (Discret / Normal / Intense). */
  factor: number;
  /** Hauteur de la bande bannière, en px. */
  bannerHeight: number;
  /** Hauteur totale du champ, en px. */
  height: number;
  /**
   * Couleur sur laquelle le champ est posé — le shader la peint lui-même.
   * Voir `ThemeShader` : la surface GL est opaque par choix, et l'aperçu de
   * l'écran de personnalisation ne repose pas sur le fond d'écran.
   */
  base?: string;
}

export default function ThemeField(props: ThemeFieldProps) {
  const [glFailed, setGlFailed] = useState(false);
  const onUnavailable = useCallback(() => setGlFailed(true), []);

  // Skia d'abord : c'est le seul moteur qui ait du bruit, et il n'a pas de
  // mode d'échec à l'exécution — soit le module natif est là, soit il ne
  // l'est pas, et `hasSkia` le sait avant le premier rendu.
  if (hasSkia() && Platform.OS !== 'web') {
    return <ThemeSkia {...props} />;
  }

  if (Platform.OS === 'web' || glFailed) {
    return (
      <ThemeMaterial
        kind={props.kind}
        accent={props.accent}
        secondary={props.secondary}
        factor={props.factor}
        bannerHeight={props.bannerHeight}
        height={props.height}
      />
    );
  }

  return <ThemeShader {...props} onUnavailable={onUnavailable} />;
}
