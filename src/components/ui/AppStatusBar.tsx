import React from 'react';
import { Platform, StatusBar, StatusBarStyle } from 'react-native';

import { colors, statusBarStyle } from '../../theme';

/**
 * La barre de statut de l'application — LA façon de la poser, partout.
 *
 * ── Pourquoi ce composant existe ──
 * Une quarantaine d'écrans écrivaient `<StatusBar backgroundColor="transparent"
 * translucent />` à la main, en contradiction directe avec la racine
 * (`App.tsx`), qui la veut NON translucide sur Android. Le dernier `StatusBar`
 * monté gagne : ces écrans annulaient donc la règle de l'app, chacun de leur
 * côté et sans le savoir.
 *
 * ── Ce que ça cassait, et ce n'est pas cosmétique ──
 * Sur Android, rendre la barre translucide pose `FLAG_LAYOUT_NO_LIMITS` sur la
 * fenêtre. Deux conséquences, toutes deux constatées :
 *
 * 1. Le système cesse de réserver la hauteur de la barre. Le contenu remonte
 *    dessous — visible sur le fil et sur l'en-tête des messages.
 * 2. **`adjustResize` cesse d'agir.** Une fenêtre sans limites ne se
 *    redimensionne plus à l'ouverture du clavier, et tout ce qui compte
 *    là-dessus se retrouve caché : c'est ce qui faisait passer le clavier
 *    par-dessus le champ de saisie d'une conversation.
 *
 * ── iOS ──
 * `translucent` y est sans effet et `backgroundColor` inexistant : la barre est
 * toujours par-dessus, et c'est aux insets de gérer. Rien à faire.
 */
export default function AppStatusBar({
  /** Force le style des icônes. Par défaut, celui du thème courant. */
  barStyle,
  /** Fond de la barre sur Android. Par défaut, le fond de l'app. */
  backgroundColor,
}: {
  barStyle?: StatusBarStyle;
  backgroundColor?: string;
}) {
  return (
    <StatusBar
      barStyle={barStyle ?? statusBarStyle()}
      translucent={Platform.OS !== 'android'}
      backgroundColor={Platform.OS === 'android' ? backgroundColor ?? colors.bg : 'transparent'}
    />
  );
}
