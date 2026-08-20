/**
 * Programme de monétisation — accès direct.
 *
 * L'écran n'a plus de contenu propre : il affiche `ProgramOverview`, le même
 * bloc que `TweetMonetizationScreen` montre à qui n'est pas encore dans le
 * programme. Deux écrans qui expliquent les mêmes conditions finissent
 * toujours par diverger — l'un annonce un seuil que l'autre a oublié de
 * mettre à jour, et c'est le créateur qui arbitre entre deux chiffres.
 *
 * Il reste atteignable depuis les réglages et depuis la page de monétisation
 * une fois qu'on est admis, quand le tableau de bord a pris toute la place et
 * qu'on veut relire les règles.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StatusBar, StyleSheet, View } from 'react-native';

import {
  AppHeader,
  ErrorState,
  ScreenBackground,
  ScreenSkeleton,
} from '../components/ui';
import { toast } from '../components/ui/Toast';
import { ProgramOverview } from '../components/monetization';
import { colors, statusBarStyle } from '../theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import MonetizationProgramService, {
  MonetizationProgramEligibility,
} from '../services/monetizationProgramService';
import CreatorPoolService, { CreatorPoolDashboard } from '../services/creatorPoolService';

interface Props {
  navigation: any;
}

export default function MonetizationProgramScreen({ navigation }: Props) {
  const { width } = useResponsiveLayout();
  const isWide = width >= 700;

  const [eligibility, setEligibility] = useState<MonetizationProgramEligibility | null>(null);
  const [dashboard, setDashboard] = useState<CreatorPoolDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const status = await MonetizationProgramService.getStatus();
      setEligibility(status);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Programme indisponible');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    // Le pot de la semaine sert d'ordre de grandeur, pas de promesse : son
    // absence ne doit pas empêcher de lire les conditions.
    CreatorPoolService.getDashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const apply = useCallback(async () => {
    if (applying || !eligibility?.canApply) return;
    setApplying(true);
    try {
      await MonetizationProgramService.apply();
      toast.success('Candidature envoyée', { description: 'On te tient au courant après revue.' });
      await load();
    } catch (e: any) {
      toast.error('Envoi impossible', { description: e?.message });
    } finally {
      setApplying(false);
    }
  }, [applying, eligibility, load]);

  const contentStyle = [
    styles.content,
    isWide ? { maxWidth: 680, alignSelf: 'center' as const, width: '100%' as const } : null,
  ];

  const pool = dashboard?.currentPeriod?.pool;

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader
        navigation={navigation}
        title="Programme"
        subtitle="Ce qu’il faut pour être payé"
      />

      {loading && !eligibility ? (
        <View style={contentStyle}>
          <ScreenSkeleton variant="list" />
        </View>
      ) : error && !eligibility ? (
        <View style={contentStyle}>
          <ErrorState detail={error} onRetry={load} retrying={loading} />
        </View>
      ) : eligibility ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          <ProgramOverview
            program={eligibility}
            symbol={dashboard?.currency?.symbol || 'NF'}
            applying={applying}
            onApply={apply}
            pool={pool ? { pool: pool.pool, shareOfInflows: pool.shareOfInflows } : null}
            cohortSize={dashboard?.currentPeriod?.cohortSize}
            weights={dashboard?.weights}
          />
        </ScrollView>
      ) : null}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
});
