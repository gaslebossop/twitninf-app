import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Hauteur de contenu identique pour TOUS les headers custom de l'app (au-dessus
 * de l'encoche/barre de statut) : c'est elle qui garantit que chaque écran a
 * un header à la même hauteur, ni trop haut ni trop bas, sans que chaque
 * écran choisisse son propre chiffre.
 */
export const HEADER_CONTENT_HEIGHT = 52;

/**
 * Décalage haut d'un header custom — LE calcul unique à utiliser partout,
 * iOS et Android, plutôt que des valeurs devinées à la main
 * (`Platform.OS === 'ios' ? 55 : 35`, `paddingTop: 50`, etc.).
 *
 * `insets.top` vient de la mesure native réelle de l'appareil : encoche,
 * Dynamic Island, hauteur de barre de statut Android — jamais une constante.
 * Cette app ne monte pas explicitement de `<SafeAreaProvider>` dans App.tsx,
 * mais `@react-navigation/stack` en fournit un en interne
 * (`SafeAreaProviderCompat`, dans `@react-navigation/elements`) qui enveloppe
 * déjà tout l'arbre de navigation : le hook fonctionne donc sur n'importe
 * quel écran de l'app sans configuration supplémentaire.
 *
 * Sur Android, la StatusBar de l'app est volontairement NON translucide
 * (voir `App.tsx`) : le système réserve déjà cet espace, et `insets.top` y
 * vaut donc naturellement ~0 — pas besoin de branche `Platform.OS` séparée,
 * la même formule est correcte des deux côtés.
 */
export function useHeaderMetrics() {
  const insets = useSafeAreaInsets();
  return {
    /** À poser en `paddingTop` du conteneur de header. */
    top: insets.top,
    /** Hauteur totale du header (insets + contenu), pour un `height` fixe. */
    height: insets.top + HEADER_CONTENT_HEIGHT,
    /** Hauteur de la seule zone de contenu (boutons/titre), sans l'inset. */
    contentHeight: HEADER_CONTENT_HEIGHT,
  };
}

export default useHeaderMetrics;
