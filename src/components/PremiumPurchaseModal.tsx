import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services';
import NewEconomyService from '../services/newEconomyService';
import { effectiveSubscriptionTier } from '../utils/subscriptionTier';
import PremiumCheckoutSheet from './PremiumCheckoutSheet';

interface PremiumPurchaseModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
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

  // Le palier vient de la feuille : elle vend Plus ou Pro, plus seulement Pro.
  const purchase = async (tier: 'plus' | 'pro') => {
    setLoading(true);
    try {
      const result = await apiService.request('/api/users/purchase-subscription', {
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
      onSuccess?.();
      onClose();
    } catch (error: any) {
      Alert.alert('Achat impossible', error?.message || 'Réessaie dans quelques instants.');
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
