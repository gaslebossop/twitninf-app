import React, { useEffect, useState } from 'react';
import {  } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services';
import NewEconomyService from '../services/newEconomyService';
import { effectiveSubscriptionTier } from '../utils/subscriptionTier';
import PremiumCheckoutSheet from './PremiumCheckoutSheet';
import { toast } from './ui/Toast';

/** Ce que l'API renvoie d'utile après un achat confirmé. */
export interface PremiumPurchaseResult {
  subscription_tier?: string;
  duration_days?: number;
  subscription_expires_at?: string;
  /**
   * Crédit publicitaire Ultra réellement versé, en NF.
   *
   * L'API le verse depuis le trésor dans la transaction d'achat et le renvoie
   * ici depuis toujours — l'app ne le lisait simplement pas. C'était le seul
   * avantage Ultra CHIFFRÉ de l'argumentaire (« 100 € »), et il n'apparaissait
   * nulle part après l'achat : ni confirmation, ni ligne de portefeuille
   * identifiable. Une promesse chiffrée invérifiable se lit comme un mensonge,
   * pas comme un avantage.
   */
  ad_credit_granted?: number;
  /** Contrepartie en euros annoncée à la vente, pour pouvoir la reprendre mot pour mot. */
  ad_credit_eur_equivalent?: number;
}

interface PremiumPurchaseModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (purchase?: PremiumPurchaseResult) => void;
}

/**
 * Parcours Premium commun aux réglages et au profil.
 * Le montant affiché vient de /subscription-pricing et l'achat est recalculé
 * côté serveur au même cours NF : le client ne possède aucun prix fixe.
 */
export default function PremiumPurchaseModal({
  visible,
  onClose,
  onSuccess,
}: PremiumPurchaseModalProps) {
  const { user, refreshCurrentUser } = useAuth() as any;
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState(false);
  const [loading, setLoading] = useState(false);
  const currentTier = effectiveSubscriptionTier(!!user?.premium, user?.subscription_tier);

  const loadWallet = async () => {
    setWalletLoading(true);
    setWalletError(false);
    try {
      const walletData = await NewEconomyService.getNfWallet();
      setWalletBalance(Number(walletData?.wallet?.balance || 0));
    } catch {
      setWalletBalance(0);
      setWalletError(true);
    } finally {
      setWalletLoading(false);
    }
  };

  useEffect(() => {
    if (visible) void loadWallet();
  }, [visible]);

  // Le palier vient de la feuille : elle vend Plus, Pro ou Ultra.
  const purchase = async (tier: 'plus' | 'pro' | 'ultra') => {
    setLoading(true);
    try {
      // Ultra a son propre point d'entrée : prix fixe en NF, pas de `{ tier }`
      // à passer (contrairement à Plus/Pro, tarifiés en euros convertis).
      const result = tier === 'ultra'
        ? await apiService.request('/api/users/purchase-ultra', { method: 'POST', requiresAuth: true })
        : await apiService.request('/api/users/purchase-subscription', {
            method: 'POST',
            requiresAuth: true,
            body: { tier },
          });
      const purchase = result?.data;
      if (
        result?.success !== true ||
        purchase?.payment_confirmed !== true ||
        !purchase?.transaction_id ||
        purchase?.subscription_tier !== tier
      ) {
        throw new Error(result?.message || 'Le paiement NF n’a pas été confirmé.');
      }
      await refreshCurrentUser();
      await loadWallet();

      // Le crédit publicitaire Ultra est annoncé à la vente (« 100 € ») et
      // versé pour de bon, mais rien ne le disait après coup : l'acheteur
      // repartait sans savoir s'il l'avait eu. On le dit, avec le montant NF
      // réellement crédité — pas le montant promis, celui qui est arrivé.
      const adCredit = Number((purchase as PremiumPurchaseResult)?.ad_credit_granted) || 0;
      if (tier === 'ultra' && adCredit > 0) {
        const eur = (purchase as PremiumPurchaseResult)?.ad_credit_eur_equivalent;
        toast.reward('Crédit publicitaire versé', {
          description: `${adCredit} NF${eur ? ` (${eur} €)` : ''} ajoutés à ton portefeuille, prêts à booster tes publications.`,
        });
      }

      onSuccess?.(purchase as PremiumPurchaseResult);
      onClose();
    } catch (error: any) {
      toast.error('Achat impossible', {
        description: error?.message || 'Réessaie dans quelques instants.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PremiumCheckoutSheet
      visible={visible}
      onClose={onClose}
      currentTier={currentTier}
      walletBalance={walletBalance}
      walletLoading={walletLoading}
      walletError={walletError}
      onRetryWallet={loadWallet}
      loading={loading}
      onPurchase={purchase}
    />
  );
}
