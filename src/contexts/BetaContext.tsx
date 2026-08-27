/**
 * 🧪 Contexte du programme beta.
 *
 * Répond à une seule question, partout dans l'app : « ce compte est-il dans
 * la beta ? ». Le badge près du logo en dépend, l'écran BETA aussi.
 *
 * ── Pourquoi un instantané persisté ──
 * Sans lui, chaque lancement rendrait « pas membre » pendant les quelques
 * centaines de millisecondes de la requête, puis basculerait : le badge
 * apparaîtrait après coup, sous les yeux de l'utilisateur, à chaque
 * ouverture. Même raison que pour les drapeaux — un état de compte doit être
 * invisible, pas clignotant.
 *
 * ── Pourquoi un appel séparé de `/feature-flags/resolve` ──
 * Le statut beta est une donnée du COMPTE (« ta candidature est 4e de la
 * file »), pas une décision de déploiement. Le glisser dans `/resolve`, qui
 * est en authentification optionnelle, y ferait transiter une information
 * personnelle sans raison.
 *
 * ── Ce qu'il ne fait PAS ──
 * Bloquer le rendu. Tant que rien n'est revenu, le compte est « pas membre » :
 * pas de badge, fil normal. C'est l'ancien comportement, celui qui est
 * éprouvé, et c'est aussi ce que rend une panne réseau.
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import betaService, { BetaState, UNKNOWN_BETA_STATE } from '../services/betaService';
import { useAuth } from './AuthContext';

const SNAPSHOT_KEY = 'twitninf_beta_state_v1';

/** Sous ce délai en arrière-plan, inutile de redemander au retour. */
const BACKGROUND_REFRESH_THRESHOLD_MS = 60 * 1000;

/**
 * Au-delà de cet âge, l'instantané n'est plus servi au démarrage : une
 * semaine sans connexion et on repart de « pas membre » plutôt que d'afficher
 * indéfiniment un badge pour un accès peut-être révoqué depuis.
 */
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface BetaContextValue {
  state: BetaState;
  /** Raccourci : c'est la seule chose que 90 % des appelants veulent savoir. */
  isMember: boolean;
  /** `false` seulement pendant la toute première lecture du stockage local. */
  hydrated: boolean;
  refresh: () => Promise<void>;
  /** Applique un état renvoyé par une action (candidater, quitter). */
  setState: (next: BetaState) => void;
}

const BetaContext = createContext<BetaContextValue | undefined>(undefined);

export const BetaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  const [state, setStateRaw] = useState<BetaState>(UNKNOWN_BETA_STATE);
  const [hydrated, setHydrated] = useState(false);

  const backgroundedAt = useRef<number | null>(null);
  const lastIdentity = useRef<string | null>(null);

  const persist = useCallback(async (next: BetaState, identity: string | null) => {
    try {
      await AsyncStorage.setItem(
        SNAPSHOT_KEY,
        JSON.stringify({ at: Date.now(), identity, state: next })
      );
    } catch {
      // Le cache est un confort, pas une dépendance : son échec ne se voit pas.
    }
  }, []);

  const setState = useCallback(
    (next: BetaState) => {
      setStateRaw(next);
      persist(next, user?.id ? String(user.id) : null);
    },
    [persist, user?.id]
  );

  const refresh = useCallback(async () => {
    const outcome = await betaService.fetchStatus();
    if (outcome.success && outcome.data) setState(outcome.data);
    // Un échec ne remet PAS l'état à zéro : perdre le réseau ne doit pas
    // faire disparaître le badge d'un membre qui l'est toujours.
  }, [setState]);

  // Hydratation : l'instantané de la session précédente, s'il appartient bien
  // au compte courant. Un instantané d'un autre compte montrerait à l'un ce
  // qui a été accordé à l'autre.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw);
          const fresh = Date.now() - (parsed?.at || 0) < SNAPSHOT_MAX_AGE_MS;
          const sameAccount = parsed?.identity === (user?.id ? String(user.id) : null);
          if (fresh && sameAccount && parsed?.state) setStateRaw(parsed.state);
        }
      } catch {
        /* Instantané illisible : on repart de l'état neutre. */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Volontairement au montage seul : les changements de compte sont gérés
    // par l'effet suivant, qui va chercher la vérité au serveur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changement d'identité, déconnexion comprise.
  useEffect(() => {
    if (!hydrated) return;
    const identity = isAuthenticated && user?.id ? String(user.id) : null;
    if (identity === lastIdentity.current) return;

    const previous = lastIdentity.current;
    lastIdentity.current = identity;

    if (identity === null) {
      if (previous !== null) {
        setStateRaw(UNKNOWN_BETA_STATE);
        AsyncStorage.removeItem(SNAPSHOT_KEY).catch(() => {});
      }
      return;
    }
    refresh().catch(() => {});
  }, [hydrated, isAuthenticated, user?.id, refresh]);

  // Retour au premier plan : une approbation a pu tomber entre-temps.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'active') {
        const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0;
        backgroundedAt.current = null;
        if (away > BACKGROUND_REFRESH_THRESHOLD_MS && isAuthenticated) {
          refresh().catch(() => {});
        }
      } else if (next === 'background') {
        backgroundedAt.current = Date.now();
      }
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [isAuthenticated, refresh]);

  const value = useMemo<BetaContextValue>(
    () => ({ state, isMember: state.is_member, hydrated, refresh, setState }),
    [state, hydrated, refresh, setState]
  );

  return <BetaContext.Provider value={value}>{children}</BetaContext.Provider>;
};

/**
 * Ne lève pas hors du provider : le badge est monté dans des en-têtes de fil
 * qui sont aussi rendus par des écrans de prévisualisation isolés. « Pas
 * membre » y est la bonne réponse, un crash ne l'est pas.
 */
export function useBeta(): BetaContextValue {
  const context = useContext(BetaContext);
  if (!context) {
    return {
      state: UNKNOWN_BETA_STATE,
      isMember: false,
      hydrated: true,
      refresh: async () => {},
      setState: () => {},
    };
  }
  return context;
}

/** Le hook du quotidien : `{useIsBetaMember() && <BetaBadge />}`. */
export function useIsBetaMember(): boolean {
  return useBeta().isMember;
}

export default BetaContext;
