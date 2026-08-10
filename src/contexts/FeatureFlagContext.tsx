/**
 * 🚩 Contexte des drapeaux de fonctionnalité.
 *
 * Rôle unique : décider QUAND redemander les décisions au serveur. Le service
 * garde l'état, ce contexte l'expose à React et déclenche les rafraîchissements
 * aux trois moments où l'instantané peut être devenu faux :
 *
 *   - au démarrage de l'app ;
 *   - à chaque changement de compte (identité = ciblage : changer de compte
 *     change les réponses, et un instantané qui traîne montrerait à l'un ce
 *     qui était accordé à l'autre) ;
 *   - au retour au premier plan, quand l'app est restée en arrière-plan assez
 *     longtemps pour qu'un déploiement ait pu avancer entre-temps.
 *
 * Ce qu'il ne fait PAS : bloquer le rendu. Les drapeaux ne sont jamais une
 * raison d'afficher un écran de chargement — un drapeau qui n'a pas encore
 * répondu vaut « éteint », donc l'ancien comportement, qui est correct.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { featureFlagService } from '../services/featureFlagService';
import type { FlagDecision, FlagMap } from '../types/featureFlag';
import { useAuth } from './AuthContext';

/** Sous ce délai en arrière-plan, inutile de redemander au retour. */
const BACKGROUND_REFRESH_THRESHOLD_MS = 60 * 1000;

interface FeatureFlagContextValue {
  flags: FlagMap;
  /** `false` seulement pendant la toute première lecture du stockage local. */
  hydrated: boolean;
  isEnabled: (key: string) => boolean;
  decision: (key: string) => FlagDecision;
  variant: (key: string) => string | null;
  value: <T>(key: string, fallback: T) => T;
  refresh: (force?: boolean) => Promise<void>;
  overrides: Record<string, boolean>;
  setOverride: (key: string, value: boolean | null) => Promise<void>;
  clearOverrides: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | undefined>(undefined);

export const FeatureFlagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  const [flags, setFlags] = useState<FlagMap>(featureFlagService.snapshot());
  const [hydrated, setHydrated] = useState(featureFlagService.isHydrated());
  const [overrides, setOverridesState] = useState<Record<string, boolean>>(
    featureFlagService.getOverrides()
  );

  const backgroundedAt = useRef<number | null>(null);
  const lastIdentity = useRef<string | null>(null);

  // Le service est la source de vérité ; React ne fait que suivre.
  useEffect(() => {
    const unsubscribe = featureFlagService.subscribe((next) => {
      setFlags({ ...next });
      setOverridesState(featureFlagService.getOverrides());
    });

    featureFlagService.hydrate().then(() => setHydrated(true));
    return unsubscribe;
  }, []);

  // Changement d'identité — y compris la déconnexion, qui doit effacer
  // l'instantané avant que l'écran suivant ne le lise.
  useEffect(() => {
    if (!hydrated) return;

    const identity = isAuthenticated && user?.id ? String(user.id) : null;
    if (identity === lastIdentity.current) return;

    const previous = lastIdentity.current;
    lastIdentity.current = identity;

    if (previous !== null && identity === null) {
      featureFlagService.reset();
      return;
    }
    featureFlagService.refresh(true).catch(() => {});
  }, [hydrated, isAuthenticated, user?.id]);

  // Retour au premier plan.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        backgroundedAt.current = null;
        if (away > BACKGROUND_REFRESH_THRESHOLD_MS) {
          featureFlagService.refresh(true).catch(() => {});
        }
      } else if (state === 'background') {
        backgroundedAt.current = Date.now();
      }
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  const refresh = useCallback(async (force = false) => {
    await featureFlagService.refresh(force);
  }, []);

  const setOverride = useCallback(async (key: string, value: boolean | null) => {
    await featureFlagService.setOverride(key, value);
  }, []);

  const clearOverrides = useCallback(async () => {
    await featureFlagService.clearOverrides();
  }, []);

  const contextValue = useMemo<FeatureFlagContextValue>(
    () => ({
      flags,
      hydrated,
      overrides,
      isEnabled: (key: string) => featureFlagService.isEnabled(key),
      decision: (key: string) => featureFlagService.get(key),
      variant: (key: string) => featureFlagService.variant(key),
      value: <T,>(key: string, fallback: T) => featureFlagService.value<T>(key, fallback),
      refresh,
      setOverride,
      clearOverrides,
    }),
    // `flags` et `overrides` sont dans les dépendances pour que les lectures
    // se réévaluent après un rafraîchissement, même si les fonctions elles-mêmes
    // ne changent pas d'identité.
    [flags, hydrated, overrides, refresh, setOverride, clearOverrides]
  );

  return <FeatureFlagContext.Provider value={contextValue}>{children}</FeatureFlagContext.Provider>;
};

function useFeatureFlagContext(): FeatureFlagContextValue {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error('useFeatureFlags doit être utilisé sous <FeatureFlagProvider>');
  }
  return context;
}

export const useFeatureFlags = useFeatureFlagContext;

/**
 * Le hook du quotidien.
 *
 *   const canBoost = useFlag('tweets.boost');
 *   {canBoost && <BoostButton />}
 */
export function useFlag(key: string): boolean {
  const { flags, overrides } = useFeatureFlagContext();
  return useMemo(() => featureFlagService.isEnabled(key), [key, flags, overrides]);
}

/** Variante servie pour un test A/B. `null` si le drapeau est éteint. */
export function useVariant(key: string): string | null {
  const { flags, overrides } = useFeatureFlagContext();
  return useMemo(() => featureFlagService.variant(key), [key, flags, overrides]);
}

/**
 * Valeur pilotée à distance (un seuil, un libellé, une durée) avec repli.
 * Permet d'ajuster un réglage sans publier de version.
 */
export function useFlagValue<T>(key: string, fallback: T): T {
  const { flags, overrides } = useFeatureFlagContext();
  return useMemo(() => featureFlagService.value<T>(key, fallback), [key, fallback, flags, overrides]);
}

/** Décision complète — utile à l'écran d'administration et au débogage. */
export function useFlagDecision(key: string): FlagDecision {
  const { flags, overrides } = useFeatureFlagContext();
  return useMemo(() => featureFlagService.get(key), [key, flags, overrides]);
}
