/**
 * Service pour gérer les récompenses ultra rares
 * Gère les styles de badges vérifiés ultra rares
 */

export interface UltraRareReward {
  id: string;
  name: string;
  description: string;
  rarity: 'ULTRA_RARE';
  rewardType: 'VERIFIED_BADGE_STYLE';
  style: {
    color: string;
    gradient: string[];
    glowColor: string;
    animationType: 'pulse' | 'glow' | 'sparkle';
  };
  maxQuantity: number;
  claimedBy: string[];
  eventSlug: string;
  requirements: {
    allChallengesCompleted: boolean;
    verifiedAccount: boolean;
  };
}

export interface VerifiedBadgeStyle {
  id: string;
  name: string;
  color: string;
  gradient: string[];
  glowColor: string;
  animationType: 'pulse' | 'glow' | 'sparkle';
  rarity: 'DEFAULT' | 'ULTRA_RARE';
  isActive: boolean;
}

class UltraRareRewardService {
  private static instance: UltraRareRewardService;
  private ultraRareRewards: UltraRareReward[] = [];
  private verifiedBadgeStyles: VerifiedBadgeStyle[] = [];

  private constructor() {
    this.initializeDefaultStyles();
    this.initializeUltraRareRewards();
  }

  public static getInstance(): UltraRareRewardService {
    if (!UltraRareRewardService.instance) {
      UltraRareRewardService.instance = new UltraRareRewardService();
    }
    return UltraRareRewardService.instance;
  }

  private initializeDefaultStyles() {
    // Style par défaut (bleu)
    this.verifiedBadgeStyles.push({
      id: 'default',
      name: 'Style Classique',
      color: '#4F7CFF',
      gradient: ['#4F7CFF', '#3D63D9'],
      glowColor: '#4F7CFF',
      animationType: 'pulse',
      rarity: 'DEFAULT',
      isActive: true,
    });
  }

  private initializeUltraRareRewards() {
    // Récompense ultra rare pour Kospor Birthday
    this.ultraRareRewards.push({
      id: 'kospor-birthday-ultra-rare-badge',
      name: 'Badge Vérifié Rose Kospor',
      description: 'Style de badge vérifié ultra rare en rose, disponible uniquement pour les participants ayant complété tous les défis de l\'anniversaire de Kospor',
      rarity: 'ULTRA_RARE',
      rewardType: 'VERIFIED_BADGE_STYLE',
      style: {
        color: '#ff69b4',
        gradient: ['#ff69b4', '#ff1493', '#dc143c'],
        glowColor: '#ff69b4',
        animationType: 'sparkle',
      },
      maxQuantity: 1,
      claimedBy: [],
      eventSlug: 'kosporbirthday',
      requirements: {
        allChallengesCompleted: true,
        verifiedAccount: true,
      },
    });
  }

  /**
   * Vérifie si un utilisateur peut réclamer une récompense ultra rare
   */
  public async canClaimUltraRareReward(
    userId: string,
    eventSlug: string,
    allChallengesCompleted: boolean,
    isVerified: boolean
  ): Promise<{ canClaim: boolean; reward?: UltraRareReward; reason?: string }> {
    const reward = this.ultraRareRewards.find(r => r.eventSlug === eventSlug);
    
    if (!reward) {
      return { canClaim: false, reason: 'Aucune récompense ultra rare disponible pour cet événement' };
    }

    if (reward.claimedBy.length >= reward.maxQuantity) {
      return { canClaim: false, reason: 'Cette récompense ultra rare a déjà été réclamée' };
    }

    if (reward.claimedBy.includes(userId)) {
      return { canClaim: false, reason: 'Vous avez déjà réclamé cette récompense' };
    }

    if (!allChallengesCompleted) {
      return { canClaim: false, reason: 'Vous devez compléter tous les défis pour réclamer cette récompense' };
    }

    if (!isVerified) {
      return { canClaim: false, reason: 'Vous devez avoir un compte vérifié pour réclamer cette récompense' };
    }

    return { canClaim: true, reward };
  }

  /**
   * Réclame une récompense ultra rare
   */
  public async claimUltraRareReward(
    userId: string,
    eventSlug: string
  ): Promise<{ success: boolean; reward?: UltraRareReward; error?: string }> {
    try {
      const reward = this.ultraRareRewards.find(r => r.eventSlug === eventSlug);
      
      if (!reward) {
        return { success: false, error: 'Récompense non trouvée' };
      }

      if (reward.claimedBy.length >= reward.maxQuantity) {
        return { success: false, error: 'Récompense déjà réclamée' };
      }

      if (reward.claimedBy.includes(userId)) {
        return { success: false, error: 'Vous avez déjà réclamé cette récompense' };
      }

      // Ajouter l'utilisateur à la liste des réclamants
      reward.claimedBy.push(userId);

      // Ajouter le style de badge à la liste des styles disponibles
      if (reward.rewardType === 'VERIFIED_BADGE_STYLE') {
        this.verifiedBadgeStyles.push({
          id: reward.id,
          name: reward.name,
          color: reward.style.color,
          gradient: reward.style.gradient,
          glowColor: reward.style.glowColor,
          animationType: reward.style.animationType,
          rarity: 'ULTRA_RARE',
          isActive: true,
        });
      }

      return { success: true, reward };
    } catch (error) {
      console.error('Erreur lors de la réclamation de la récompense ultra rare:', error);
      return { success: false, error: 'Erreur lors de la réclamation' };
    }
  }

  /**
   * Obtient les styles de badges vérifiés disponibles pour un utilisateur
   */
  public getAvailableBadgeStyles(userId: string): VerifiedBadgeStyle[] {
    return this.verifiedBadgeStyles.filter(style => {
      if (style.rarity === 'DEFAULT') {
        return true; // Le style par défaut est toujours disponible
      }
      
      if (style.rarity === 'ULTRA_RARE') {
        // Vérifier si l'utilisateur a réclamé cette récompense
        const reward = this.ultraRareRewards.find(r => r.id === style.id);
        return reward && reward.claimedBy.includes(userId);
      }
      
      return false;
    });
  }

  /**
   * Obtient le style de badge actuel d'un utilisateur
   */
  public getCurrentBadgeStyle(userId: string): VerifiedBadgeStyle {
    const availableStyles = this.getAvailableBadgeStyles(userId);
    // Pour l'instant, retourner le style le plus rare disponible
    const ultraRareStyle = availableStyles.find(s => s.rarity === 'ULTRA_RARE');
    return ultraRareStyle || availableStyles[0];
  }

  /**
   * Change le style de badge d'un utilisateur
   */
  public async changeBadgeStyle(
    userId: string,
    styleId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const availableStyles = this.getAvailableBadgeStyles(userId);
      const selectedStyle = availableStyles.find(s => s.id === styleId);
      
      if (!selectedStyle) {
        return { success: false, error: 'Style non disponible' };
      }

      // Ici, on pourrait sauvegarder le choix de l'utilisateur
      // Pour l'instant, on retourne juste le succès
      return { success: true };
    } catch (error) {
      console.error('Erreur lors du changement de style:', error);
      return { success: false, error: 'Erreur lors du changement de style' };
    }
  }

  /**
   * Vérifie si une récompense ultra rare est disponible pour un événement
   */
  public isUltraRareRewardAvailable(eventSlug: string): boolean {
    const reward = this.ultraRareRewards.find(r => r.eventSlug === eventSlug);
    return reward ? reward.claimedBy.length < reward.maxQuantity : false;
  }

  /**
   * Obtient les informations d'une récompense ultra rare
   */
  public getUltraRareRewardInfo(eventSlug: string): UltraRareReward | null {
    return this.ultraRareRewards.find(r => r.eventSlug === eventSlug) || null;
  }
}

export default UltraRareRewardService.getInstance();
