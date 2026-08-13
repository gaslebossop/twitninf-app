import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AppHeader, ScreenBackground } from '../components/ui';
import UserStatsTab from '../components/UserStatsTab';
import { useAuth } from '../contexts/AuthContext';
import { colors, fonts , statusBarStyle} from '../theme';

interface AccountStatsScreenProps {
  navigation: any;
}

const AccountStatsScreen: React.FC<AccountStatsScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const { height } = useWindowDimensions();
  const emptyTop = Math.max(20, Math.min(48, Math.round(height * 0.055)));

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />

        <AppHeader
          navigation={navigation}
          title="Statistiques"
          subtitle="Votre activité et vos signaux privés"
        />

        {user?.id ? (
          <UserStatsTab
            userId={user.id}
            baseStats={{
              followers: (user as any)?.stats?.followers,
              following: (user as any)?.stats?.following,
              tweets: (user as any)?.stats?.tweets,
            }}
          />
        ) : (
          <View style={[styles.emptyState, { marginTop: emptyTop }]} accessibilityRole="alert">
            <View style={styles.emptyIcon}>
              <Ionicons name="person-outline" size={24} color={colors.warning} />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>Session introuvable</Text>
              <Text style={styles.emptyText}>Reconnectez-vous pour accéder à vos performances.</Text>
            </View>
          </View>
        )}
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    width: '100%',
    maxWidth: 560,
    marginTop: 0,
    paddingHorizontal: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningMuted,
  },
  emptyCopy: {
    flex: 1,
    marginLeft: 14,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
    fontFamily: fonts.regular,
  },
});

export default AccountStatsScreen;
