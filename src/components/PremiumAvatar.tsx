import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PremiumProfileEffects, { PREMIUM_PROFILE_RING } from './PremiumProfileEffects';
import Avatar from './Avatar';

interface PremiumAvatarProps {
  size: number;
  username: string;
  uri?: string | null;
  isPremium?: boolean;
  subscriptionTier?: string | null;
  userId?: string;
  style?: any;
}

export default function PremiumAvatar({
  size,
  username,
  uri,
  isPremium = false,
  subscriptionTier,
  userId,
  style,
}: PremiumAvatarProps) {
  const [profileEffect, setProfileEffect] = useState<string>('none');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!userId) {
          const saved = await AsyncStorage.getItem('selectedProfileEffect');
          if (!cancelled) setProfileEffect(saved || 'none');
          return;
        }
        if (!cancelled) setProfileEffect('none');
      } catch {
        if (!cancelled) setProfileEffect('none');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const ring =
    profileEffect !== 'none' && isPremium ? PREMIUM_PROFILE_RING * 2 : 0;
  const avatarInner = Math.max(1, size - ring);

  return (
    <PremiumProfileEffects
      effectType={profileEffect as any}
      isPremium={isPremium}
      subscriptionTier={subscriptionTier}
      size={size}
    >
      <Avatar size={avatarInner} username={username} uri={uri} style={style} />
    </PremiumProfileEffects>
  );
}
