import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { ScreenBackground, BackButton } from '../components/ui';
import UserStatsTab from '../components/UserStatsTab';
import { useAuth } from '../contexts/AuthContext';
import { colors, fonts } from '../theme';

interface AccountStatsScreenProps {
  navigation: any;
}

const AccountStatsScreen: React.FC<AccountStatsScreenProps> = ({ navigation }) => {
  const { user } = useAuth();

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

        <View style={styles.headerShell}>
          <View style={styles.header}>
            <View style={styles.roundSlot}>
              <BackButton navigation={navigation} style={styles.roundButton} />
            </View>

            <View style={styles.titleGroup}>
              <Text style={styles.title} numberOfLines={1}>Statistiques</Text>
            </View>

            <View
              style={[styles.roundSlot, styles.roundButton]}
              accessibilityLabel="Statistiques privées"
            >
              <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
            </View>
          </View>
        </View>

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
          <View style={styles.emptyState} accessibilityRole="alert">
            <View style={styles.emptyIcon}>
              <Ionicons name="person-outline" size={24} color={colors.warning} />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>Session introuvable</Text>
              <Text style={styles.emptyText}>Reconnectez-vous pour accéder à vos performances.</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  headerShell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
    zIndex: 10,
  },
  header: {
    width: '100%',
    maxWidth: 1236,
    minHeight: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  /** Pastilles rondes de part et d'autre du titre : même gabarit des deux
   * côtés pour que le titre reste optiquement centré. */
  roundSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButton: {
    width: 40,
    height: 40,
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    textAlign: 'center',
    fontFamily: fonts.heading,
  },
  emptyState: {
    width: '100%',
    maxWidth: 560,
    marginTop: 48,
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
