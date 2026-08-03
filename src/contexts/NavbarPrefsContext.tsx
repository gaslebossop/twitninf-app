import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getNavbarPrefs, saveNavbarPrefs, OptionalTabKey } from '../services/navbarPreferences';

interface NavbarPrefsContextValue {
  /** Chargement du réglage stocké — tant que c'est vrai, on ne sait pas encore. */
  loading: boolean;
  /** L'utilisateur a déjà validé un choix (onboarding fait ou refait depuis Réglages). */
  configured: boolean;
  selected: OptionalTabKey[];
  save: (selected: OptionalTabKey[]) => Promise<void>;
}

/**
 * Tant que rien n'est configuré, on affiche TOUS les onglets optionnels —
 * comportement identique à avant cette fonctionnalité. Le filtrage ne
 * s'active qu'une fois l'utilisateur passé par la sélection (`configured`).
 */
const ALL_OPTIONAL: OptionalTabKey[] = ['video', 'messages', 'casino', 'revue'];

const NavbarPrefsContext = createContext<NavbarPrefsContextValue>({
  loading: true,
  configured: false,
  selected: ALL_OPTIONAL,
  save: async () => {},
});

export function NavbarPrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [selected, setSelected] = useState<OptionalTabKey[]>(ALL_OPTIONAL);

  useEffect(() => {
    let active = true;
    // Pas encore d'utilisateur (hydratation de la session en cours, ou
    // déconnecté) : on ne sait rien de ses préférences, donc on reste en
    // `loading`. Passer à `false` ici revenait à annoncer « compte non
    // configuré » et déclenchait l'onboarding sur un état transitoire.
    if (!user?.id) {
      setLoading(true);
      setConfigured(false);
      setSelected(ALL_OPTIONAL);
      return;
    }
    setLoading(true);
    getNavbarPrefs(user.id)
      .then((prefs) => {
        if (!active) return;
        setConfigured(prefs.configured);
        setSelected(prefs.configured ? prefs.selected : ALL_OPTIONAL);
      })
      .catch(() => {
        if (!active) return;
        setConfigured(false);
        setSelected(ALL_OPTIONAL);
      })
      .finally(() => {
        if (!active) return;
        // Sans ce `finally`, un échec de lecture laissait `loading` à true
        // pour toujours : la modale ne s'ouvrait alors jamais.
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const save = useCallback(
    async (next: OptionalTabKey[]) => {
      if (!user?.id) return;
      await saveNavbarPrefs(user.id, next);
      setSelected(next);
      setConfigured(true);
    },
    [user?.id],
  );

  return (
    <NavbarPrefsContext.Provider value={{ loading, configured, selected, save }}>
      {children}
    </NavbarPrefsContext.Provider>
  );
}

export function useNavbarPrefs() {
  return useContext(NavbarPrefsContext);
}
