import { OptionalTabKey } from '../services/navbarPreferences';

/**
 * Répartition des destinations entre la barre d'onglets et l'écran « Plus ».
 *
 * Une seule règle, partagée par `BottomTabNavigator` (qui monte la barre) et
 * `MoreScreen` (qui liste le reste) : sans ça, les deux listes divergeraient
 * au premier changement de préférences et une destination pourrait
 * disparaître des deux côtés à la fois.
 *
 * Le plafond de cinq n'est pas esthétique, il est imposé : au-delà,
 * `UITabBarController` remplace le cinquième onglet par son propre « More »,
 * une UITableView grise qu'on ne peut ni styler ni déplacer — et qui
 * embarquerait Profil avec elle.
 */

/** Nombre d'onglets natifs au-delà duquel UIKit fabrique son propre « More ». */
export const MAX_NATIVE_TABS = 5;

export interface TabLayout {
  /**
   * Occupant du troisième slot : Messages en priorité, sinon Revue, sinon
   * personne — auquel cas Activité récupère la place.
   */
  dynamic: 'messages' | 'revue' | null;
  /** Activité tient-elle dans la barre, ou bascule-t-elle dans le Plus ? */
  showsNotifications: boolean;
}

export function resolveTabLayout(selected: OptionalTabKey[]): TabLayout {
  const dynamic = selected.includes('messages')
    ? 'messages'
    : selected.includes('revue')
      ? 'revue'
      : null;

  return {
    dynamic,
    // Le slot dynamique et Activité se disputent la même place.
    showsNotifications: dynamic === null,
  };
}

/**
 * Onglets optionnels qui n'ont PAS obtenu de place dans la barre et doivent
 * donc apparaître dans le Plus, dans l'ordre choisi à l'onboarding.
 */
export function optionalKeysInMore(
  selected: OptionalTabKey[],
  layout: TabLayout,
): OptionalTabKey[] {
  return selected.filter((key) => key !== layout.dynamic);
}
