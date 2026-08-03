import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { clampMemberBadgeId, getMemberBadgeDef } from '../utils/profileMemberBadges';

interface PremiumBadgeProps {
  type?: 'xs' | 'small' | 'medium' | 'large';
  style?: any;
  animated?: boolean;
  /** Palier API (free / plus / pro) */
  subscriptionTier?: 'free' | 'plus' | 'pro';
  /** Id badge AsyncStorage (`selectedBadge`) ; si absent, défaut selon palier */
  memberBadgeId?: string | null;
  /**
   * Couleurs de la certification du compte (voir `certifiedNameColors`).
   *
   * Quand elles sont fournies, elles REPEIGNENT le badge. Le nom, la pastille
   * de certification et ce badge se suivent alors sur une seule couleur au lieu
   * d'aligner trois palettes sans rapport : un badge orange posé à côté d'une
   * certification dorée et d'un nom rose se lisait comme trois décorations
   * empilées, pas comme une identité.
   *
   * Sans certification, le badge garde les couleurs de l'icône choisie — c'est
   * alors la seule chose qui distingue le compte.
   */
  tint?: { from: string; to: string; glow: string } | null;
  /**
   * Diamètre imposé, en points. Sans lui, le gabarit vient de `type`.
   * Sert à accorder la pastille au corps réel du pseudo voisin, qui peut
   * doubler selon la taille choisie par l'utilisateur.
   */
  size?: number;
}

export default function PremiumBadge({
  type = 'medium',
  style,
  animated = true,
  subscriptionTier,
  memberBadgeId,
  tint,
  size,
}: PremiumBadgeProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [animated, pulse]);

  /**
   * Gabarits resserrés.
   *
   * Le badge est un disque PLEIN posé à côté d'une pastille de certification
   * qui n'est qu'une coche : à boîte égale, le disque pèse beaucoup plus lourd
   * et devient l'élément dominant de la ligne du pseudo. Il est donc calibré
   * juste sous la certification (17 contre 18 sur le profil), pour se lire
   * comme un complément et non comme un second badge en concurrence.
   */
  const preset =
    type === 'xs'
      ? { box: 14, icon: 8 }
      : type === 'small'
        ? { box: 17, icon: 10 }
        : type === 'large'
          ? { box: 26, icon: 15 }
          : { box: 21, icon: 12 };

  // `size` donne le diamètre ; l'icône garde le rapport du gabarit (~0,59)
  // pour que le disque ne se remplisse pas quand la pastille grandit.
  const dim =
    typeof size === 'number'
      ? { box: size, icon: Math.round(size * 0.59) }
      : preset;

  const isPaid = subscriptionTier === 'plus' || subscriptionTier === 'pro';
  const resolved = useMemo(
    () => clampMemberBadgeId(memberBadgeId ?? null, isPaid, subscriptionTier),
    [memberBadgeId, isPaid, subscriptionTier]
  );
  const def = getMemberBadgeDef(resolved);
  const ownColors = def?.colors ?? (['#f59e0b', '#f97316', '#ea580c'] as [string, string, string]);
  const fillColors = tint ? ([tint.from, tint.to] as [string, string]) : ownColors;
  const iconName = (def?.icon || 'diamond') as any;

  const badge = (
    <Animated.View style={[{ transform: animated ? [{ scale: pulse }] : [] }, style]}>
      <LinearGradient
        colors={fillColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.circle,
          {
            width: dim.box,
            height: dim.box,
            borderRadius: dim.box / 2,
          },
        ]}
      >
        <Ionicons name={iconName} size={dim.icon} color="#fff" />
      </LinearGradient>
    </Animated.View>
  );

  return badge;
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 4,
  },
});
