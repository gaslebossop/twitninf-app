import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import useHeaderMetrics from '../hooks/useHeaderMetrics';
import { useNavbarPrefs } from '../contexts/NavbarPrefsContext';
import { useKosporBirthdayEvent } from '../hooks/useKosporBirthdayEvent';
import { useForegroundInterval } from '../hooks/useForegroundInterval';
import { liveService } from '../services/liveService';
import unreadService from '../services/unreadService';
import { OPTIONAL_TABS, OptionalTabKey } from '../services/navbarPreferences';
import { optionalKeysInMore, resolveTabLayout } from '../navigation/tabLayout';

/**
 * Écran « Plus » — le menu des destinations qui ne tiennent pas dans la barre.
 *
 * Il remplace le « More » d'UIKit, que `UITabBarController` fabrique tout seul
 * dès qu'on lui passe plus de cinq onglets : une `UITableView` grise, non
 * stylable, toujours collée au dernier slot et livrée avec son bouton « Edit ».
 * Rien de tout ça n'est paramétrable, d'où cet écran maison — et d'où le
 * plafond tenu dans `tabLayout`, seule façon d'empêcher UIKit d'en ajouter un.
 *
 * Les destinations listées ici ne sont pas des onglets : ce sont les routes du
 * `MainStack` (voir MainNavigator), déjà utilisées par Réglages. On les pousse
 * donc sur la pile, sans dupliquer d'écran.
 *
 * Le composant lit lui-même préférences et compteurs plutôt que de les
 * recevoir en props : `NativeTab.Screen` prend un `component`, et lui passer
 * une closure recalculée à chaque rafraîchissement de badge remonterait
 * l'écran toutes les trente secondes.
 */

/** Route du MainStack derrière chaque onglet optionnel de l'onboarding. */
const ROUTE_FOR_OPTIONAL: Record<OptionalTabKey, string> = {
  video: 'Video',
  messages: 'Messages',
  casino: 'Casino',
  revue: 'CommunityReview',
  trading: 'Trading',
  wallet: 'WalletDetail',
  analytics: 'AccountStats',
  monetization: 'TweetMonetization',
};

interface MoreEntry {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  badge?: number;
}

export default function MoreScreen() {
  const navigation = useNavigation<any>();
  const header = useHeaderMetrics();
  const { selected } = useNavbarPrefs();
  const { isEventActive } = useKosporBirthdayEvent();

  const [liveCount, setLiveCount] = React.useState(0);
  const [notificationCount, setNotificationCount] = React.useState(0);
  const [messageCount, setMessageCount] = React.useState(0);

  useForegroundInterval(
    React.useCallback(async () => {
      try {
        const lives = await liveService.getLives();
        setLiveCount(lives.length);
      } catch {
        // Un direct manquant ne doit pas vider le menu : on garde la valeur
        // précédente plutôt que d'afficher un faux zéro.
      }
    }, []),
    30000,
  );

  const refreshCounts = React.useCallback(async () => {
    const [notifCount, msgCount] = await Promise.all([
      unreadService.getNotificationsUnreadCount(),
      unreadService.getMessagesUnreadCount(),
    ]);
    setNotificationCount(notifCount);
    setMessageCount(msgCount);
  }, []);

  useForegroundInterval(refreshCounts, 30000);
  React.useEffect(() => unreadService.subscribe(refreshCounts), [refreshCounts]);

  const layout = resolveTabLayout(selected);

  const entries = React.useMemo<MoreEntry[]>(() => {
    const list: MoreEntry[] = [];

    // Activité n'est ici que lorsqu'elle a cédé sa place au slot dynamique.
    if (!layout.showsNotifications) {
      list.push({
        key: 'notifications',
        label: 'Activité',
        description: 'Mentions, likes et nouveaux abonnés',
        icon: 'notifications-outline',
        route: 'Notifications',
        badge: notificationCount,
      });
    }

    list.push({
      key: 'live',
      label: 'Live',
      description: 'Les directs en cours sur twitninf',
      icon: 'radio-outline',
      route: 'Lives',
      badge: liveCount,
    });

    for (const key of optionalKeysInMore(selected, layout)) {
      const info = OPTIONAL_TABS.find((tab) => tab.key === key);
      if (!info) continue;
      list.push({
        key: info.key,
        label: info.label,
        description: info.description,
        icon: info.icon as keyof typeof Ionicons.glyphMap,
        route: ROUTE_FOR_OPTIONAL[info.key],
        badge: info.key === 'messages' ? messageCount : 0,
      });
    }

    if (isEventActive) {
      list.push({
        key: 'kospor',
        label: 'Anniversaire Kospor',
        description: "L'événement est en cours",
        icon: 'gift-outline',
        route: 'KosporBirthday',
      });
    }

    return list;
  }, [
    isEventActive,
    layout,
    liveCount,
    messageCount,
    notificationCount,
    selected,
  ]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: header.top, height: header.height }]}>
        <Text style={styles.headerTitle}>Plus</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {entries.map((entry) => (
          <TouchableOpacity
            key={entry.key}
            style={styles.item}
            activeOpacity={0.85}
            onPress={() => navigation.navigate(entry.route)}
          >
            <View style={styles.itemIcon}>
              <Ionicons name={entry.icon} size={20} color={colors.accent} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{entry.label}</Text>
              <Text style={styles.itemDescription}>{entry.description}</Text>
            </View>
            {entry.badge != null && entry.badge > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {entry.badge > 99 ? '99+' : entry.badge}
                </Text>
              </View>
            )}
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    // La barre d'onglets est translucide et flotte au-dessus du contenu :
    // sans cette réserve, la dernière ligne se retrouve dessous.
    paddingBottom: 120,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
});
