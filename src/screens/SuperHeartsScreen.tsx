import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts, statusBarStyle } from '../theme';
import { AppHeader, ScreenBackground, Card } from '../components/ui';
import { STORY_GRADIENT } from '../components/StoryRing';
import apiService from '../services/api';

interface Props {
  navigation: any;
}

interface SuperHeartsData {
  eligible: boolean;
  remaining: number;
  cap: number;
  renew_days: number;
  renews_at: string | null;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * « Super Cœur » : solde restant, réservé au palier Pro. Consultation
 * seule — la pose se fait par pression longue sur le like, dans le fil.
 */
const SuperHeartsScreen: React.FC<Props> = ({ navigation }) => {
  const [data, setData] = useState<SuperHeartsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.getSuperHearts();
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Chargement impossible');
      }
      setData(response.data);
    } catch (loadError: any) {
      setError(loadError?.message || 'Impossible de charger le solde de Super Cœurs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScreenBackground>
      <View style={styles.safe}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Super Cœur" />

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !data ? (
          <View style={styles.loading}>
            <Text style={styles.error}>{error || 'Informations indisponibles.'}</Text>
            <Pressable style={styles.retryButton} onPress={load}>
              <Text style={styles.retryText}>Réessayer</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Card style={styles.balanceCard}>
              <View style={styles.balanceIcon}>
                <LinearGradient
                  colors={STORY_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <Ionicons name="heart" size={30} color={colors.onAccent} />
              </View>
              <Text style={styles.balanceValue}>{data.remaining}</Text>
              <Text style={styles.balanceLabel}>
                {data.remaining > 1 ? 'Super Cœurs restants' : 'Super Cœur restant'}
              </Text>

              {!data.eligible ? (
                <View style={styles.notice}>
                  <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
                  <Text style={styles.noticeText}>
                    Réservé aux abonnés Pro. Passe au palier Pro pour recevoir des Super Cœurs à
                    chaque renouvellement.
                  </Text>
                </View>
              ) : data.renews_at ? (
                <Text style={styles.renewText}>
                  Prochain renouvellement le {fmtDate(data.renews_at)} — jusqu'à {data.cap} Super
                  Cœurs, tous les {data.renew_days} jours.
                </Text>
              ) : null}
            </Card>

            <Text style={styles.sectionLabel}>Comment ça marche</Text>
            <Card style={styles.infoCard}>
              <InfoRow
                icon="heart-outline"
                text="Maintiens le cœur appuyé sur un tweet pour poser un Super Cœur — un like arc-en-ciel."
              />
              <InfoRow
                icon="trophy-outline"
                text="Un Super Cœur avantage fortement le tweet dans le classement du post du jour."
              />
              <InfoRow
                icon="alert-circle-outline"
                text="Si tu retires un Super Cœur, il est perdu : il ne revient qu'au prochain renouvellement."
              />
            </Card>
          </ScrollView>
        )}
      </View>
    </ScreenBackground>
  );
};

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={17} color={colors.gold} style={styles.infoIcon} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingBottom: 40 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  balanceCard: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 },
  balanceIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 14,
  },
  balanceValue: { color: colors.textPrimary, fontSize: 40, fontFamily: fonts.bold },
  balanceLabel: { marginTop: 4, color: colors.textSecondary, fontSize: 14, fontFamily: fonts.semibold },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 6,
  },
  noticeText: { flex: 1, color: colors.textMuted, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.regular },
  renewText: {
    marginTop: 18,
    color: colors.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
  sectionLabel: {
    marginTop: 22,
    marginBottom: 10,
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontFamily: fonts.semibold,
  },
  infoCard: { paddingVertical: 6, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 },
  infoIcon: { marginTop: 1 },
  infoText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  retryText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bold },
  error: { color: colors.red, fontSize: 12, lineHeight: 18, fontFamily: fonts.semibold, textAlign: 'center' },
});

export default SuperHeartsScreen;
