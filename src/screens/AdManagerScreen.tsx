import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import apiService from '../services/api';
import { BackButton } from '../components/ui';

const { width } = Dimensions.get('window');

interface AdBalance {
  balance: number;
  currency: string;
  prices: {
    impression: number;
    click: number;
    engagement: number;
  };
}

interface AdStats {
  campaigns: {
    total: number;
    active: number;
    paused: number;
  };
  performance: {
    total_impressions: number;
    total_clicks: number;
    total_engagements: number;
    total_spent: number;
    ctr: string;
    engagement_rate: string;
  };
  balance: {
    current: number;
    currency: string;
  };
}

export default function AdManagerScreen() {
  const navigation = useNavigation();
  const [balance, setBalance] = useState<AdBalance | null>(null);
  const [stats, setStats] = useState<AdStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [balanceResponse, statsResponse] = await Promise.all([
        apiService.get('/api/ads/balance'),
        apiService.get('/api/ads/stats')
      ]);

      if (balanceResponse.success) {
        setBalance(balanceResponse.data);
      }

      if (statsResponse.success) {
        setStats(statsResponse.data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      Alert.alert('Erreur', 'Impossible de charger les données publicitaires');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const StatCard = ({ title, value, icon, color }: {
    title: string;
    value: string | number;
    icon: string;
    color: string;
  }) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statHeader}>
        <Ionicons name={icon as any} size={20} color={color} />
        <Text style={styles.statTitle}>{title}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <BackButton navigation={navigation} />
        <Text style={styles.headerTitle}>Gestionnaire Publicitaire</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('AdSettings' as never)}
        >
          <Ionicons name="settings-outline" size={24} color="#4F7CFF" />
        </TouchableOpacity>
      </View>

      {/* Solde TWC */}
      {balance && (
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Ionicons name="wallet-outline" size={24} color="#4F7CFF" />
            <Text style={styles.balanceTitle}>Solde TWC</Text>
          </View>
          <Text style={styles.balanceAmount}>{balance.balance} TWC</Text>
          <Text style={styles.balanceSubtext}>
            Prix: {balance.prices.impression} TWC/vue • {balance.prices.click} TWC/clic
          </Text>
        </View>
      )}

      {/* Statistiques */}
      {stats && (
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Statistiques Globales</Text>
          
          <View style={styles.statsGrid}>
            <StatCard
              title="Campagnes"
              value={`${stats.campaigns.active}/${stats.campaigns.total}`}
              icon="megaphone-outline"
              color="#4F7CFF"
            />
            <StatCard
              title="Impressions"
              value={stats.performance.total_impressions?.toLocaleString() || '0'}
              icon="eye-outline"
              color="#17BF63"
            />
            <StatCard
              title="Clics"
              value={stats.performance.total_clicks?.toLocaleString() || '0'}
              icon="hand-left-outline"
              color="#FF6B35"
            />
            <StatCard
              title="Engagements"
              value={stats.performance.total_engagements?.toLocaleString() || '0'}
              icon="heart-outline"
              color="#E91E63"
            />
            <StatCard
              title="CTR"
              value={`${stats.performance.ctr || 0}%`}
              icon="trending-up-outline"
              color="#9C27B0"
            />
            <StatCard
              title="Dépensé"
              value={`${stats.performance.total_spent?.toFixed(2) || '0.00'} TWC`}
              icon="cash-outline"
              color="#FF9800"
            />
          </View>
        </View>
      )}

      {/* Actions rapides */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>Actions Rapides</Text>
        
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => navigation.navigate('CreateCampaign' as never)}
          >
            <Ionicons name="add-circle-outline" size={24} color="white" />
            <Text style={styles.actionButtonText}>Nouvelle Campagne</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => navigation.navigate('CreateAdvertisement' as never)}
          >
            <Ionicons name="megaphone-outline" size={24} color="#4F7CFF" />
            <Text style={[styles.actionButtonText, { color: '#4F7CFF' }]}>
              Nouvelle Publicité
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation vers les listes */}
      <View style={styles.navigationSection}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('CampaignsList' as never)}
        >
          <View style={styles.navItemLeft}>
            <Ionicons name="list-outline" size={24} color="#4F7CFF" />
            <Text style={styles.navItemText}>Mes Campagnes</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#657786" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('AdvertisementsList' as never)}
        >
          <View style={styles.navItemLeft}>
            <Ionicons name="layers-outline" size={24} color="#4F7CFF" />
            <Text style={styles.navItemText}>Mes Publicités</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#657786" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('AdAnalytics' as never)}
        >
          <View style={styles.navItemLeft}>
            <Ionicons name="analytics-outline" size={24} color="#4F7CFF" />
            <Text style={styles.navItemText}>Analyses Détaillées</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#657786" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f7f9fa',
  },
  loadingText: {
    fontSize: 16,
    color: '#657786',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#14171a',
  },
  settingsButton: {
    padding: 8,
  },
  balanceCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceTitle: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#14171a',
    marginLeft: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#4F7CFF',
    marginBottom: 4,
  },
  balanceSubtext: {
    fontSize: 14,
    color: '#657786',
  },
  statsSection: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#14171a',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: 'white',
    width: (width - 48) / 2,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statTitle: {
    fontSize: 14,
    color: '#657786',
    marginLeft: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  actionsSection: {
    margin: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  primaryButton: {
    backgroundColor: '#4F7CFF',
  },
  secondaryButton: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#4F7CFF',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: 'white',
    marginLeft: 8,
  },
  navigationSection: {
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  navItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navItemText: {
    fontSize: 16,
    color: '#14171a',
    marginLeft: 12,
  },
});
