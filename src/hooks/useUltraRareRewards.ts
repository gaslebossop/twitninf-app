/**
 * Hook pour gérer les récompenses ultra rares
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ultraRareRewardService, { UltraRareReward, VerifiedBadgeStyle } from '../services/ultraRareRewardService';

interface UseUltraRareRewardsProps {
  eventSlug: string;
  allChallengesCompleted?: boolean;
}

export function useUltraRareRewards({ 
  eventSlug, 
  allChallengesCompleted = false 
}: UseUltraRareRewardsProps) {
  const { user } = useAuth();
  const [ultraRareReward, setUltraRareReward] = useState<UltraRareReward | null>(null);
  const [canClaimReward, setCanClaimReward] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [availableBadgeStyles, setAvailableBadgeStyles] = useState<VerifiedBadgeStyle[]>([]);
  const [currentBadgeStyle, setCurrentBadgeStyle] = useState<VerifiedBadgeStyle | null>(null);

  // Vérifier si une récompense ultra rare est disponible
  useEffect(() => {
    const checkRewardAvailability = async () => {
      if (!user) return;

      const rewardInfo = ultraRareRewardService.getUltraRareRewardInfo(eventSlug);
      setUltraRareReward(rewardInfo);

      if (rewardInfo) {
        const { canClaim } = await ultraRareRewardService.canClaimUltraRareReward(
          user.id,
          eventSlug,
          allChallengesCompleted,
          user.verified || false
        );
        setCanClaimReward(canClaim);
      }
    };

    checkRewardAvailability();
  }, [user, eventSlug, allChallengesCompleted]);

  // Charger les styles de badges disponibles
  useEffect(() => {
    if (user) {
      const styles = ultraRareRewardService.getAvailableBadgeStyles(user.id);
      setAvailableBadgeStyles(styles);
      
      const currentStyle = ultraRareRewardService.getCurrentBadgeStyle(user.id);
      setCurrentBadgeStyle(currentStyle);
    }
  }, [user]);

  const claimUltraRareReward = async () => {
    if (!user || !ultraRareReward) return;

    setIsClaiming(true);
    setClaimError(null);

    try {
      const result = await ultraRareRewardService.claimUltraRareReward(user.id, eventSlug);
      
      if (result.success) {
        // Recharger les styles disponibles
        const styles = ultraRareRewardService.getAvailableBadgeStyles(user.id);
        setAvailableBadgeStyles(styles);
        
        const currentStyle = ultraRareRewardService.getCurrentBadgeStyle(user.id);
        setCurrentBadgeStyle(currentStyle);
        
        setCanClaimReward(false);
      } else {
        setClaimError(result.error || 'Erreur lors de la réclamation');
      }
    } catch (error) {
      console.error('Erreur lors de la réclamation:', error);
      setClaimError('Erreur lors de la réclamation');
    } finally {
      setIsClaiming(false);
    }
  };

  const changeBadgeStyle = async (styleId: string) => {
    if (!user) return;

    try {
      const result = await ultraRareRewardService.changeBadgeStyle(user.id, styleId);
      
      if (result.success) {
        const currentStyle = ultraRareRewardService.getCurrentBadgeStyle(user.id);
        setCurrentBadgeStyle(currentStyle);
      } else {
        setClaimError(result.error || 'Erreur lors du changement de style');
      }
    } catch (error) {
      console.error('Erreur lors du changement de style:', error);
      setClaimError('Erreur lors du changement de style');
    }
  };

  return {
    ultraRareReward,
    canClaimReward,
    isClaiming,
    claimError,
    availableBadgeStyles,
    currentBadgeStyle,
    claimUltraRareReward,
    changeBadgeStyle,
  };
}
