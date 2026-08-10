/**
 * 🚩 Drapeaux de fonctionnalité — client mobile.
 *
 * ── Ce que ce service garantit à l'écran qui l'utilise ──
 * Tester un drapeau est SYNCHRONE et gratuit. `useFlag('x')` lit une valeur
 * déjà en mémoire ; il ne déclenche jamais de requête, jamais d'attente,
 * jamais de scintillement. Toute la logique réseau est ici, en amont.
 *
 * ── Trois sources, dans cet ordre ──
 *   1. **Override local de développement** (AsyncStorage). Force un drapeau
 *      sur l'appareil sans toucher au serveur : c'est ce qui permet de tester
 *      une fonctionnalité avant de l'exposer à qui que ce soit.
 *   2. **Instantané serveur**, rafraîchi au démarrage, à la connexion et au
 *      retour au premier plan.
 *   3. **Instantané persisté** de la session précédente, servi immédiatement
 *      au lancement pendant que le rafraîchissement part en arrière-plan.
 *
 * ── Pourquoi un instantané persisté ──
 * Sans lui, chaque lancement d'app rendrait « tout éteint » pendant les
 * quelques centaines de millisecondes de la requête, puis rallumerait : la
 * fonctionnalité apparaîtrait après coup, sous les yeux de l'utilisateur. Un
 * drapeau doit être invisible, pas clignotant.
 *
 * ── Pourquoi l'évaluation reste au serveur ──
 * Évaluer côté app supposerait de lui envoyer les règles : la liste des
 * testeurs internes et la composition des cohortes partiraient dans le
 * bundle de tout le monde, et un déploiement à 5 % serait lisible par
 * n'importe qui. L'app ne reçoit que des décisions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from './api';
import type {
  FeatureFlag,
  FlagDecision,
  FlagExposure,
  FlagMap,
  FlagSchema,
  FlagSimulation,
  ResolvedFlags,
} from '../types/featureFlag';

const BASE_URL = '/api/feature-flags';
const SNAPSHOT_KEY = 'twitninf_feature_flags_snapshot_v1';
const OVERRIDES_KEY = 'twitninf_feature_flags_overrides_v1';

/**
 * Au-delà de cet âge, l'instantané persisté n'est plus servi au démarrage.
 * Une semaine sans connexion et on repart d'un état neutre plutôt que de
 * rejouer indéfiniment une configuration qui n'existe peut-être plus.
 */
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Anti-rafale : plusieurs écrans qui se montent en même temps ne font qu'un appel. */
const MIN_REFRESH_INTERVAL_MS = 30 * 1000;

const OFF: FlagDecision = { enabled: false, variant: null, payload: null };

type Listener = (flags: FlagMap) => void;

class FeatureFlagService {
  private flags: FlagMap = {};
  private overrides: Record<string, boolean> = {};
  private listeners = new Set<Listener>();
  private hydrated = false;
  private lastRefreshAt = 0;
  private inflight: Promise<FlagMap> | null = null;

  // ─────────────────────── Lecture synchrone ───────────────────────

  /** Décision courante. Toujours définie : un drapeau inconnu est éteint. */
  get(key: string): FlagDecision {
    if (Object.prototype.hasOwnProperty.call(this.overrides, key)) {
      const forced = this.overrides[key];
      return forced ? { ...(this.flags[key] || OFF), enabled: true } : OFF;
    }
    return this.flags[key] || OFF;
  }

  isEnabled(key: string): boolean {
    return this.get(key).enabled;
  }

  variant(key: string): string | null {
    const decision = this.get(key);
    return decision.enabled ? decision.variant : null;
  }

  /** Charge utile du drapeau, avec repli si absent ou éteint. */
  value<T>(key: string, fallback: T): T {
    const decision = this.get(key);
    if (!decision.enabled || decision.payload === null || decision.payload === undefined) {
      return fallback;
    }
    return decision.payload as T;
  }

  snapshot(): FlagMap {
    return this.flags;
  }

  isHydrated(): boolean {
    return this.hydrated;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.flags);
  }

  // ─────────────────────── Cycle de vie ───────────────────────

  /**
   * À appeler une fois au démarrage. Sert l'instantané persisté tout de suite,
   * puis rafraîchit en arrière-plan : l'app n'attend jamais le réseau pour
   * décider de ce qu'elle affiche.
   */
  async hydrate(): Promise<void> {
    try {
      const [rawSnapshot, rawOverrides] = await Promise.all([
        AsyncStorage.getItem(SNAPSHOT_KEY),
        AsyncStorage.getItem(OVERRIDES_KEY),
      ]);

      if (rawOverrides) this.overrides = JSON.parse(rawOverrides) || {};

      if (rawSnapshot) {
        const parsed = JSON.parse(rawSnapshot) as { flags: FlagMap; savedAt: number };
        if (parsed?.flags && Date.now() - (parsed.savedAt || 0) < SNAPSHOT_MAX_AGE_MS) {
          this.flags = parsed.flags;
        }
      }
    } catch {
      // Stockage illisible : on démarre sur un état neutre, tout éteint.
    }

    this.hydrated = true;
    this.emit();
    this.refresh().catch(() => {});
  }

  /**
   * Redemande les décisions au serveur.
   * @param force ignore l'anti-rafale — à utiliser après une connexion ou un
   *              changement de compte, où l'ancien instantané n'est plus le bon.
   */
  async refresh(force = false): Promise<FlagMap> {
    if (!force && Date.now() - this.lastRefreshAt < MIN_REFRESH_INTERVAL_MS) {
      return this.flags;
    }
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const response = await apiService.get(`${BASE_URL}/resolve`);
        const data: ResolvedFlags | undefined = response?.data;

        if (data?.flags) {
          this.flags = data.flags;
          this.lastRefreshAt = Date.now();
          this.emit();
          AsyncStorage.setItem(
            SNAPSHOT_KEY,
            JSON.stringify({ flags: this.flags, savedAt: Date.now() })
          ).catch(() => {});
        }
      } catch {
        // Réseau indisponible : on garde l'instantané précédent. Perdre le
        // réseau ne doit pas éteindre les fonctionnalités déjà accordées.
      } finally {
        this.inflight = null;
      }
      return this.flags;
    })();

    return this.inflight;
  }

  /**
   * Vide tout. Appelé à la déconnexion : les décisions du compte précédent ne
   * doivent pas fuiter sur le compte suivant, en particulier une allowlist de
   * testeur interne sur un appareil partagé.
   */
  async reset(): Promise<void> {
    this.flags = {};
    this.lastRefreshAt = 0;
    this.emit();
    await AsyncStorage.removeItem(SNAPSHOT_KEY).catch(() => {});
  }

  // ─────────────────────── Overrides locaux ───────────────────────

  getOverrides(): Record<string, boolean> {
    return { ...this.overrides };
  }

  /** Force un drapeau sur CET appareil. `null` rend la main au serveur. */
  async setOverride(key: string, value: boolean | null): Promise<void> {
    if (value === null) delete this.overrides[key];
    else this.overrides[key] = value;

    this.emit();
    await AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(this.overrides)).catch(() => {});
  }

  async clearOverrides(): Promise<void> {
    this.overrides = {};
    this.emit();
    await AsyncStorage.removeItem(OVERRIDES_KEY).catch(() => {});
  }

  // ─────────────────────── Administration ───────────────────────

  async adminList(includeArchived = false): Promise<{ flags: FeatureFlag[]; schema: FlagSchema }> {
    const response = await apiService.get(`${BASE_URL}/admin`, {
      include_archived: includeArchived ? 'true' : undefined,
    });
    return {
      flags: response?.data?.flags || [],
      schema: response?.data?.schema || { attributes: {}, operators: [], bucket_units: [] },
    };
  }

  async adminCreate(flag: Partial<FeatureFlag>): Promise<FeatureFlag> {
    const response = await apiService.post(`${BASE_URL}/admin`, flag);
    if (!response?.success) throw new Error(response?.message || 'Création impossible');
    return response.data;
  }

  async adminUpdate(key: string, changes: Partial<FeatureFlag>): Promise<FeatureFlag> {
    const response = await apiService.put(`${BASE_URL}/admin/${key}`, changes);
    if (!response?.success) throw new Error(response?.message || 'Mise à jour impossible');
    return response.data;
  }

  /** Change le palier de déploiement sans renvoyer le reste de la définition. */
  async adminSetRollout(key: string, percentage: number, enabled?: boolean): Promise<FeatureFlag> {
    const response = await apiService.post(`${BASE_URL}/admin/${key}/rollout`, {
      rollout_percentage: percentage,
      ...(enabled === undefined ? {} : { enabled }),
    });
    if (!response?.success) throw new Error(response?.message || 'Changement de palier impossible');
    return response.data;
  }

  /**
   * Arme ou désarme la montée automatique du palier.
   *
   * Armer ne fait pas monter tout de suite : le premier cran tombe au bout
   * d'un intervalle, qui sert à observer le palier courant.
   */
  async adminSetAutoRollout(
    key: string,
    plan: { enabled: false } | { enabled: true; steps?: number[]; interval_minutes?: number }
  ): Promise<FeatureFlag> {
    const response = await apiService.post(`${BASE_URL}/admin/${key}/auto-rollout`, plan);
    if (!response?.success) throw new Error(response?.message || 'Montée automatique impossible');
    return response.data;
  }

  async adminKill(key: string): Promise<FeatureFlag> {
    const response = await apiService.post(`${BASE_URL}/admin/${key}/kill`);
    if (!response?.success) throw new Error(response?.message || 'Coupure impossible');
    return response.data;
  }

  async adminArchive(key: string, restore = false): Promise<FeatureFlag> {
    const response = await apiService.post(`${BASE_URL}/admin/${key}/archive`, { restore });
    if (!response?.success) throw new Error(response?.message || 'Archivage impossible');
    return response.data;
  }

  /** « Est-ce que @machin verrait la fonctionnalité, et pourquoi ? » */
  async adminSimulate(key: string, target: { username?: string; user_id?: string }): Promise<FlagSimulation> {
    const response = await apiService.post(`${BASE_URL}/admin/${key}/simulate`, target);
    if (!response?.success) throw new Error(response?.message || 'Simulation impossible');
    return response.data;
  }

  async adminExposure(key: string): Promise<FlagExposure> {
    const response = await apiService.get(`${BASE_URL}/admin/${key}/exposure`);
    if (!response?.success) throw new Error(response?.message || 'Estimation impossible');
    return response.data;
  }
}

export const featureFlagService = new FeatureFlagService();

/**
 * Accès impératif pour le code qui n'est pas dans un composant (services,
 * gestionnaires définis hors du corps d'un composant). Même valeur que le
 * hook, sans hook — le contexte reste la voie normale dans un écran.
 */
export const featureFlags = {
  isEnabled: (key: string) => featureFlagService.isEnabled(key),
  variant: (key: string) => featureFlagService.variant(key),
  value: <T,>(key: string, fallback: T) => featureFlagService.value<T>(key, fallback),
};
