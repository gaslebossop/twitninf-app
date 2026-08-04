import { useCallback, useMemo } from 'react';
import { useCachedResource } from './useCachedResource';
import NewEconomyService from '../services/newEconomyService';
import CurrencyService from '../services/currencyService';
import { useAuth } from '../contexts/AuthContext';

/**
 * Le solde NF, disponible partout.
 *
 * Chaque écran qui dépense refaisait sa propre requête, avec sa propre
 * variable `balance`, son propre `null` de départ et son propre identifiant de
 * monnaie codé en dur (cinq copies du même UUID dans le code). Conséquence
 * visible : selon l'écran, on voyait le solde tout de suite, avec du retard,
 * ou pas du tout — et surtout, on découvrait qu'on n'avait pas les moyens
 * APRÈS avoir appuyé.
 *
 * Une seule source ici, servie depuis le cache dès la première image
 * (voir [useCachedResource]), et `canAfford()` pour désarmer un bouton avant
 * le geste plutôt que d'expliquer l'échec après.
 */
export function useCoinBalance() {
  const { user } = useAuth();
  const userId = user?.id ? String(user.id) : null;

  const { data, loading, stale, refresh, set } = useCachedResource(
    userId ? `nf-balance:${userId}` : null,
    async () => {
      const currencyId = await CurrencyService.getTwitCoinsCurrencyId();
      const wallet = await NewEconomyService.getUserWallet(currencyId);
      return {
        balance: Number(wallet?.wallet?.balance ?? 0),
        symbol: wallet?.currency?.symbol || 'NF',
      };
    },
    // Un solde de plus de 12 h n'a plus valeur d'information : mieux vaut
    // afficher « ··· » que de laisser croire à un montant qui n'existe plus.
    { maxAgeMs: 12 * 60 * 60 * 1000 },
  );

  const balance = data?.balance ?? null;

  /** Le compte peut-il payer `amount` ? `true` tant que le solde est inconnu. */
  const canAfford = useCallback(
    (amount: number) => balance === null || balance >= amount,
    [balance],
  );

  /**
   * Solde connu localement après une dépense ou un gain, sans aller-retour.
   * Le serveur reste la référence : le prochain rafraîchissement écrase.
   */
  const setBalance = useCallback(
    (next: number) => set({ balance: next, symbol: data?.symbol || 'NF' }),
    [set, data?.symbol],
  );

  return useMemo(
    () => ({
      balance,
      symbol: data?.symbol || 'NF',
      loading: loading && balance === null,
      stale,
      refresh,
      setBalance,
      canAfford,
    }),
    [balance, data?.symbol, loading, stale, refresh, setBalance, canAfford],
  );
}

export default useCoinBalance;
