import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Affiche ce qu'on sait déjà, puis va chercher la suite.
 *
 * Le schéma dominant de l'app était : `setLoading(true)` → requête → rendu.
 * Résultat, revenir sur son portefeuille pour la dixième fois de la journée
 * repassait par une page vide, alors que le solde de la veille était une
 * approximation parfaitement acceptable pendant les 400 ms de la requête.
 *
 * Ici, la dernière valeur connue est rendue immédiatement (état `stale`), la
 * requête part en fond, et la vue se met à jour quand elle répond. L'écran
 * n'est vide QUE la toute première fois.
 *
 * Ce que ce hook ne fait pas : il ne remplace pas un vrai cache réseau. Il ne
 * garde qu'un instantané par clé, dans le stockage local — c'est justement ce
 * qui le rend sûr à brancher partout sans coordination.
 *
 * ```ts
 * const { data, stale, loading, error, refresh } = useCachedResource(
 *   `wallet:${userId}`,
 *   () => WalletService.getWallet(userId),
 * );
 * ```
 *  - `data` : valeur affichable (cache puis serveur) ;
 *  - `stale` : vrai tant que `data` vient du cache — sert à teinter un
 *    indicateur discret, jamais à masquer le contenu ;
 *  - `loading` : vrai uniquement quand il n'y a RIEN à montrer (premier
 *    passage) — c'est lui, et lui seul, qui doit déclencher un squelette.
 */

const PREFIX = 'cache:v1:';

interface Snapshot<T> {
  value: T;
  at: number;
}

export interface CachedResource<T> {
  data: T | null;
  stale: boolean;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  /** Date de la valeur affichée (ms epoch), `null` si rien n'a jamais été chargé. */
  updatedAt: number | null;
  refresh: () => Promise<void>;
  /** Écrit une valeur localement (mise à jour optimiste) sans requête. */
  set: (value: T) => void;
}

export interface CachedResourceOptions {
  /** Au-delà de cet âge, la valeur en cache n'est plus affichée du tout. */
  maxAgeMs?: number;
  /** Passe à faux pour suspendre (identifiant pas encore connu, écran masqué). */
  enabled?: boolean;
}

export function useCachedResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: CachedResourceOptions = {},
): CachedResource<T> {
  const { maxAgeMs = 24 * 60 * 60 * 1000, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  // Le fetcher est presque toujours une closure recréée à chaque rendu :
  // le garder dans une ref évite de relancer la requête à chaque rendu du
  // parent, sans imposer un `useCallback` à tous les appelants.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const write = useCallback(
    async (value: T) => {
      if (!key) return;
      try {
        const snapshot: Snapshot<T> = { value, at: Date.now() };
        await AsyncStorage.setItem(PREFIX + key, JSON.stringify(snapshot));
      } catch {
        // Un cache qui n'a pas pu s'écrire ne doit jamais casser l'écran.
      }
    },
    [key],
  );

  const load = useCallback(async () => {
    if (!key || !enabled) return;
    setRefreshing(true);
    try {
      const value = await fetcherRef.current();
      if (!aliveRef.current) return;
      setData(value);
      setStale(false);
      setUpdatedAt(Date.now());
      setError(null);
      void write(value);
    } catch (e: any) {
      if (!aliveRef.current) return;
      // On garde la valeur en cache à l'écran : une erreur réseau ne doit pas
      // effacer ce que l'utilisateur était en train de lire.
      setError(e instanceof Error ? e : new Error(String(e?.message || e)));
    } finally {
      if (aliveRef.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [key, enabled, write]);

  // Premier passage : lire le cache, l'afficher, puis rafraîchir.
  useEffect(() => {
    let cancelled = false;
    if (!key || !enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFIX + key);
        if (raw && !cancelled) {
          const snapshot = JSON.parse(raw) as Snapshot<T>;
          if (snapshot && Date.now() - snapshot.at < maxAgeMs) {
            setData(snapshot.value);
            setStale(true);
            setUpdatedAt(snapshot.at);
            // On a de quoi peindre l'écran : plus besoin de squelette, même
            // si la requête est encore en vol.
            setLoading(false);
          }
        }
      } catch {
        // Cache illisible (format changé) : on se contente du réseau.
      }
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [key, enabled, maxAgeMs, load]);

  const set = useCallback(
    (value: T) => {
      setData(value);
      setStale(false);
      setUpdatedAt(Date.now());
      void write(value);
    },
    [write],
  );

  return { data, stale, loading, refreshing, error, updatedAt, refresh: load, set };
}

/** Vide tout le cache local (déconnexion, changement de compte). */
export async function clearResourceCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    // Sans importance : les entrées expireront d'elles-mêmes (`maxAgeMs`).
  }
}

export default useCachedResource;
