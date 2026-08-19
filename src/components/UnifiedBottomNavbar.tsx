import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, withAlpha } from '../theme';
import { useNavigation } from '@react-navigation/native';

type NavigationProp = any;

type TabKey = 'tweets' | 'search' | 'notifications' | 'trading' | 'profile';

interface UnifiedBottomNavbarProps {
  activeTab: TabKey;
  showLabels?: boolean;
  variant?: 'compact' | 'full';
}

export default function UnifiedBottomNavbar({
  activeTab,
  showLabels = true,
  variant = 'full',
}: UnifiedBottomNavbarProps) {
  const navigation = useNavigation<NavigationProp>();

  const tabs: {
    key: TabKey;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconActive: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }[] = [
    {
      key: 'tweets',
      label: 'Accueil',
      icon: 'home-outline',
      iconActive: 'home',
      onPress: () => navigation.navigate('Tweets'),
    },
    {
      key: 'search',
      label: 'Explorer',
      icon: 'search-outline',
      iconActive: 'search',
      // Comportement d'origine préservé (route non câblée dans ce stack).
      onPress: () => console.log('Navigation vers la recherche'),
    },
    {
      key: 'notifications',
      label: 'Notifs',
      icon: 'notifications-outline',
      iconActive: 'notifications',
      onPress: () => console.log('Navigation vers les notifications'),
    },
    {
      key: 'trading',
      label: 'Trading',
      icon: 'trending-up-outline',
      iconActive: 'trending-up',
      onPress: () => navigation.navigate('Trading' as never),
    },
    {
      key: 'profile',
      label: 'Profil',
      icon: 'person-outline',
      iconActive: 'person',
      onPress: () => navigation.navigate('Profile'),
    },
  ];

  const isCompact = variant === 'compact';
  const height = isCompact ? 66 : 82;
  const iconSize = isCompact ? 22 : 23;
  const labelSize = isCompact ? 10 : 11;

  return (
    <View style={[styles.container, { height: height + (Platform.OS === 'ios' ? 20 : 14) }]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.tintOverlay} />
      <View style={styles.topBorder} />

      <View style={[styles.content, { height }]}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={tab.onPress}
              activeOpacity={0.75}
            >
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Ionicons
                  name={active ? tab.iconActive : tab.icon}
                  size={iconSize}
                  color={active ? colors.accent : colors.textMuted}
                />
              </View>
              {showLabels && (
                <Text
                  style={[
                    styles.label,
                    { fontSize: labelSize },
                    active && styles.labelActive,
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingBottom: Platform.OS === 'ios' ? 20 : 14,
    overflow: 'hidden',
  },
  tintOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(colors.bg, 0.72),
  },
  topBorder: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    backgroundColor: colors.borderSubtle,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  iconWrap: {
    width: 46,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  iconWrapActive: {
    backgroundColor: colors.accentMuted,
  },
  label: {
    fontFamily: fonts.medium,
    color: colors.textMuted,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  labelActive: {
    fontFamily: fonts.semibold,
    color: colors.accent,
  },
});
