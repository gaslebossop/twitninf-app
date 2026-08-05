import React from 'react';
import { RefreshControl, RefreshControlProps } from 'react-native';

/**
 * L'indicateur de rafraîchissement de l'app, en blanc.
 *
 * C'est le contrôle NATIF (`UIRefreshControl` sur iOS, `SwipeRefreshLayout`
 * sur Android) : il est dessiné et animé par la plateforme, pas par le thread
 * JS — donc il continue de tourner à l'image même pendant que l'écran
 * reconstruit sa liste, ce qu'un indicateur maison ne peut pas faire.
 *
 * Le blanc plutôt que l'accent : chaque écran tirait sa propre couleur
 * (accent sur le fil et le profil, gris secondaire sur les messages), et
 * l'attente n'avait pas la même tête d'un onglet à l'autre. Sur un fond noir,
 * le blanc est aussi ce qui se lit le mieux.
 */
export default function AppRefreshControl(props: RefreshControlProps) {
  return (
    <RefreshControl
      {...props}
      // iOS : couleur de la roue. Android : `colors` (le trait qui tourne) et
      // `progressBackgroundColor` (la pastille qui le porte).
      tintColor="#FFFFFF"
      colors={['#FFFFFF']}
      progressBackgroundColor="#1A1A1A"
    />
  );
}
