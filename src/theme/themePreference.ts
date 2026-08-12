import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

import type { ThemeName } from './colors';

/**
 * Choix de thème de l'utilisateur, persisté sur l'appareil.
 *
 * `system` suit le réglage de l'OS et n'est résolu qu'au démarrage : le thème
 * est figé pour la durée de la session (voir `colors.ts`), donc réagir à un
 * changement d'apparence en cours de route ne changerait rien à l'écran tant
 * que l'app n'a pas redémarré.
 */
export type ThemePreference = ThemeName | 'system';

const KEY = 'theme_preference_v1';

export function resolvePreference(preference: ThemePreference): ThemeName {
  if (preference !== 'system') return preference;
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch {
    // Stockage indisponible : le thème par défaut vaut mieux qu'un écran bloqué.
  }
  return 'dark';
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, preference);
  } catch {
    // Échec d'écriture : le thème s'appliquera quand même pour cette session,
    // il sera simplement oublié au prochain démarrage.
  }
}

/**
 * Enregistre le choix puis relance l'application.
 *
 * Le rechargement n'est pas un raccourci de fainéant : les styles de tous les
 * écrans sont construits une seule fois au chargement du bundle (voir
 * `colors.ts`), donc seul un redémarrage les reconstruit avec la nouvelle
 * palette. Sans lui, seuls les rares styles calculés au rendu changeraient et
 * l'app se retrouverait à moitié dans chaque thème.
 *
 * Renvoie `false` si le rechargement automatique n'a pas pu se faire — à
 * l'appelant de dire à l'utilisateur de rouvrir l'app lui-même.
 */
export async function saveThemeAndReload(preference: ThemePreference): Promise<boolean> {
  await saveThemePreference(preference);

  try {
    const Updates = require('expo-updates');
    await Updates.reloadAsync();
    return true;
  } catch {
    // Expo Go et le client de dev refusent `reloadAsync` : on retombe sur le
    // rechargement de développement, qui n'existe qu'en debug.
    try {
      const { DevSettings } = require('react-native');
      if (DevSettings?.reload) {
        DevSettings.reload();
        return true;
      }
    } catch {}
    return false;
  }
}
