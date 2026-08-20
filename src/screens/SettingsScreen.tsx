import React, { useState, useEffect } from 'react';
import { fonts, colors , statusBarStyle} from '../theme';
import { AppHeader, ScreenBackground } from '../components/ui';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  StatusBar,
  useWindowDimensions,
  Platform,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../contexts/AuthContext';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { useEvents } from '../contexts/EventContext';
import { apiService } from '../services';
import { liveService, RTMP_INGEST_URL } from '../services/liveService';
import { useKosporBirthdayEvent } from '../hooks/useKosporBirthdayEvent';
import PremiumProfileCard from '../components/PremiumProfileCard';
import GAuthLinkRewardCard from '../components/GAuthLinkRewardCard';
import PremiumPurchaseModal from '../components/PremiumPurchaseModal';
import VerificationButton from '../../components/VerificationButton';
import VerificationRequestForm from '../../components/VerificationRequestForm';
import VerificationStyleScreen from './VerificationStyleScreen';
import { useBehaviorTracking } from '../hooks/useBehaviorTracking';
import {
  getFranceDailyLocalNotificationsDebug,
  sendImmediateNotification,
  setupFranceDailyLocalNotifications,
  scheduleRandomDebugNotificationAtTime
} from '../services/push';
import { APP_VERSION } from '../services/clientIdentity';
import { useReadingLanguage } from '../contexts/ReadingLanguageContext';
import { toast } from '../components/ui/Toast';
import { showActionSheet } from '../components/ui/ActionSheet';
import { linkGAuthAccount } from '../services/gAuthLogin';
import { useFlag } from '../contexts/FeatureFlagContext';
import { useFeed2BTour } from '../components/tour/Feed2BTour';
import { FLAGS } from '../config/featureFlagKeys';

const { width, height } = Dimensions.get('window');

interface SettingsScreenProps {
  navigation: any;
  route?: any;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const nfMapEnabled = useFlag(FLAGS.NF_MAP);
  const superHeartEnabled = useFlag(FLAGS.SUPER_HEART);
  const feed2BEnabled = useFlag(FLAGS.FEED_2B);
  const { start: startFeed2BTour } = useFeed2BTour();
  const { user, refreshCurrentUser } = useAuth();
  const { isAdmin, isSuperAdmin } = useAdminPermissions();
  const { activeEvent, hasActiveEvent } = useEvents();
  const { isEventActive: isKosporEventActive, events: kosporEvents } = useKosporBirthdayEvent();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // 📊 Tracking comportemental pour SettingsScreen
  const { trackSettingChange, trackCustomAction } = useBehaviorTracking({
    autoTrackScreenView: true,
    screenName: 'SettingsScreen',
    trackTimeSpent: true
  });
  const [fadeAnim] = useState(new Animated.Value(1));
  const [slideAnim] = useState(new Animated.Value(0));
  const [showVerificationForm, setShowVerificationForm] = useState(false);
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [showPremiumPopup, setShowPremiumPopup] = useState(false);
  const { preferredLanguage, languages } = useReadingLanguage();
  const currentLanguageLabel =
    languages.find((language) => language.code === preferredLanguage)?.label || 'Non définie';

  // États pour les paramètres
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [gAuthLinkLoading, setGAuthLinkLoading] = useState(false);

  // Calculs responsive
  const isSmallScreen = screenHeight < 700;
  const isMediumScreen = screenHeight >= 700 && screenHeight < 900;


  const handleTogglePrivateAccount = async (value: boolean) => {
    if (privacyLoading) return;
    setPrivacyLoading(true);
    try {
      const response = await apiService.updatePrivacy(value);
      if (response.success) {
        await refreshCurrentUser?.();
      } else {
        toast.error('Impossible de mettre à jour la confidentialité du compte.');
      }
    } catch {
      toast.error('Impossible de mettre à jour la confidentialité du compte.');
    } finally {
      setPrivacyLoading(false);
    }
  };

  const handleLinkGAuth = async () => {
    if (gAuthLinkLoading) return;
    setGAuthLinkLoading(true);
    try {
      const result = await linkGAuthAccount();

      if (result.type === 'cancel') return;

      if (result.type === 'linked') {
        const rewardParts: string[] = [];
        if (result.bonus > 0) rewardParts.push(`+${result.bonus} NF`);
        if (result.trialDays > 0) rewardParts.push(`${result.trialDays} jours de Pro offerts`);
        toast.success('Compte associé !', {
          description: rewardParts.length > 0
            ? `${rewardParts.join(' et ')} ont été ajoutés à ton compte.`
            : 'Ton compte G est maintenant associé.',
        });
        await refreshCurrentUser?.();
        return;
      }
      if (result.type === 'already_linked') {
        toast.info('Ton compte est déjà associé à G.');
        await refreshCurrentUser?.();
        return;
      }
      if (result.type === 'taken') {
        toast.error('Ce compte G est déjà associé à un autre compte twitninf.');
        return;
      }
      toast.error(result.message);
    } catch {
      toast.error("L'association à G a échoué.");
    } finally {
      setGAuthLinkLoading(false);
    }
  };

  const renderSettingItem = (
    title: string,
    description: string,
    icon: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    isSwitch: boolean = true
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon as any} size={22} color={colors.accent} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      {isSwitch && (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
          thumbColor={colors.textPrimary}
          ios_backgroundColor={colors.surfaceAlt}
        />
      )}
    </View>
  );

  const renderActionButton = (title: string, description: string, icon: string, onPress: () => void) => (
    <TouchableOpacity style={styles.actionButton} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon as any} size={22} color={colors.accent} />
      </View>
      <View style={styles.actionContent}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <ScreenBackground>
    <View style={styles.safeArea}>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

      <View style={styles.gradient}>
        {/* Header */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <AppHeader
            navigation={navigation}
            title="Paramètres"
            subtitle="Personnalisez votre expérience"
          />
        </Animated.View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Carte Premium */}
          <Animated.View
            style={[
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <PremiumProfileCard
              isPremium={user?.premium || false}
              expiresAt={user?.subscription_expires_at}
              onUpgrade={() => setShowPremiumPopup(true)}
            />
            <GAuthLinkRewardCard />
          </Animated.View>

          {/* Section Compte */}
          <Animated.View
            style={[
              styles.section,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons name="link-outline" size={24} color={colors.accent} />
              <Text style={styles.sectionTitle}>Compte</Text>
            </View>

            {renderActionButton(
              'Associer mon compte à G',
              user?.g_auth_linked
                ? 'Ton compte est associé à G.'
                : 'Connecte ton compte à G et reçois 5 NF + 3 jours de Pro offerts.',
              user?.g_auth_linked ? 'checkmark-circle' : 'link-outline',
              handleLinkGAuth
            )}

            {superHeartEnabled && renderActionButton(
              'Super Cœur',
              'Le like arc-en-ciel du palier Pro — ton solde restant, ta prochaine recharge',
              'heart-circle-outline',
              () => navigation.navigate('SuperHearts')
            )}

            {renderActionButton(
              'État du compte',
              'Distribution de tes posts, avertissements actifs et date de retour',
              'shield-checkmark-outline',
              () => navigation.navigate('AccountStatus')
            )}

            {renderActionButton(
              'Recalibrer l\'algorithme',
              '5 tours de tweets pour affiner ce qu\'on te recommande',
              'sparkles-outline',
              () => navigation.navigate('Calibration')
            )}
          </Animated.View>

          {/* Section Confidentialité */}
          <Animated.View
            style={[
              styles.section,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons name="lock-closed" size={24} color={colors.success} />
              <Text style={styles.sectionTitle}>Confidentialité</Text>
            </View>

            {renderSettingItem(
              'Compte privé',
              'Seuls vos abonnés acceptés peuvent voir vos publications',
              'lock-closed-outline',
              !!user?.is_private_account,
              handleTogglePrivateAccount
            )}

            {/* Le RGPD (art. 7.3) exige que retirer un accord soit aussi simple
                que de le donner : même écran, accessible à tout moment. */}
            {renderActionButton(
              'Tes données et tes accords',
              'Personnalisation, statistiques d\'audience, notifications de découverte',
              'shield-checkmark-outline',
              () => navigation.navigate('PrivacyData')
            )}

            {renderActionButton(
              'Favoris',
              'Les tweets que vous avez mis de côté',
              'bookmark-outline',
              () => navigation.navigate('Bookmarks')
            )}

            {renderActionButton(
              'Comptes bloqués',
              'Voir et débloquer les comptes que vous avez bloqués',
              'ban-outline',
              () => navigation.navigate('BlockedAccounts')
            )}
          </Animated.View>

          {/* Section Navigation — onglets optionnels de la navbar (mobile uniquement) */}
          <Animated.View
            style={[
              styles.section,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons name="apps" size={24} color={colors.cyan} />
              <Text style={styles.sectionTitle}>Navigation</Text>
            </View>

            {renderActionButton(
              'Thème',
              'Sombre ou clair, avec un aperçu des deux',
              'contrast-outline',
              () => navigation.navigate('Theme')
            )}

            {renderActionButton(
              'Langue de lecture',
              `${currentLanguageLabel} · les publications traduites s'affichent dans cette langue`,
              'language-outline',
              () => navigation.navigate('ReadingLanguage')
            )}

            {renderActionButton(
              'Personnaliser la navbar',
              'Choisis les raccourcis affichés en bas de l\'écran',
              'options-outline',
              () => navigation.navigate('NavbarCustomization')
            )}

            {/* Réservé aux comptes du test : présenter un fil que la personne
                n'a pas donnerait une page décrivant une interface introuvable. */}
            {feed2BEnabled && renderActionButton(
              'Revoir la visite du fil',
              'La gouttière, la question de l\'algorithme et Explorer, désignés sur le vrai fil',
              'sparkles-outline',
              () => {
                // On arme la visite PUIS on ramène au fil : les bulles se
                // posent sur des éléments réels, elles n'ont rien à désigner
                // depuis l'écran des réglages.
                startFeed2BTour();
                navigation.navigate('MainTabs');
              }
            )}

            {renderActionButton(
              'Vidéos',
              'Le fil vidéo façon TikTok',
              'play-circle-outline',
              () => navigation.navigate('Video')
            )}

            {renderActionButton(
              'Messages',
              'Tes conversations privées',
              'mail-outline',
              () => navigation.navigate('Messages')
            )}
          </Animated.View>

          {/* Section Actions */}
          <Animated.View 
            style={[
              styles.section,
              { 
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons name="build" size={24} color={colors.red} />
              <Text style={styles.sectionTitle}>Actions</Text>
            </View>

            {renderActionButton(
              'Statistiques du compte',
              'Ouvrir la page dédiée avec vos analytics TwitNinf',
              'stats-chart-outline',
              () => navigation.navigate('AccountStats')
            )}

            {renderActionButton(
              'Studio créateur',
              'Ventes, programmation, visiteurs, radar et marché des pseudos',
              'briefcase-outline',
              () => navigation.navigate('CreatorStudio')
            )}

            {renderActionButton(
              'Analytics prédictifs',
              'Estimez la portée d\'un tweet avant de le publier (Pro)',
              'trending-up-outline',
              () => navigation.navigate('PredictiveAnalytics')
            )}

            {renderActionButton(
              'Mes invitations',
              'Les places à présenter à l\'entrée d\'un événement',
              'ticket-outline',
              () => navigation.navigate('MyPasses')
            )}

            {renderActionButton(
              'Support',
              'Ouvrir un ticket — traitement prioritaire avec le palier Pro',
              'headset-outline',
              () => navigation.navigate('Support')
            )}

            {renderActionButton(
              'Signaler un bug',
              'Pointe l\'écran qui a cassé, l\'app joint le contexte toute seule',
              'bug-outline',
              () => navigation.navigate('ReportBug')
            )}

            {renderActionButton(
              'Proposer une fonctionnalité',
              'La Forge : si on la construit, tu es récompensé en NF',
              'hammer-outline',
              () => navigation.navigate('Forge')
            )}

            {renderActionButton(
              'Debug notifs locales',
              'Voir les rappels 12h/16h/20h planifiés',
              'notifications-outline',
              async () => {
                const setupOk = await setupFranceDailyLocalNotifications();
                const debugInfo = await getFranceDailyLocalNotificationsDebug();
                await sendImmediateNotification(
                  'Debug notifications',
                  'Test local: le bouton debug a bien declenche une notification.',
                  { type: 'debug_local_notification' }
                );
                const reminders = debugInfo.reminders || [];
                const lines = reminders.length
                  ? reminders
                      .map((r, index) => {
                        const hh = String(r.hour ?? '--').padStart(2, '0');
                        const mm = String(r.minute ?? '--').padStart(2, '0');
                        const tz = r.timezone || 'default';
                        return `${index + 1}. ${hh}:${mm} (${tz})`;
                      })
                      .join('\n')
                  : 'Aucun rappel taggé trouvé';

                toast.error('Debug notifs locales', {
                  description: `Replanification: ${setupOk ? 'OK' : 'ECHEC'}\nTotal planifiées: ${debugInfo.totalScheduled}\nRappels FR: ${reminders.length}\n\n${lines}${
                    (debugInfo as any).error ? `\n\nErreur: ${(debugInfo as any).error}` : ''
                  }`,
                });
              }
            )}

            {renderActionButton(
              'Debug notif personnalisée',
              'Programmer une notif a l heure choisie',
              'timer-outline',
              async () => {
                const scheduleAt = async (hour: number, minute: number) => {
                  const result = await scheduleRandomDebugNotificationAtTime(hour, minute);
                  if (!result.success) {
                    toast.error(`Impossible de programmer la notif.\n${(result as any).error || ''}`);
                    return;
                  }
                  toast.info('Notif programmée', {
                    description: `Heure: ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}\nTitre: ${
                      (result as any).title
                    }\nMessage: ${(result as any).body}`,
                  });
                };

                // `Alert.prompt` (saisie libre) n'existe que sur iOS : Android
                // n'avait droit qu'à trois créneaux. Une seule liste pour les
                // deux — c'est un outil de mise au point, la saisie libre au
                // format HH:MM n'y apportait rien qu'un risque de faute de
                // frappe.
                showActionSheet({
                  title: 'À quelle heure ?',
                  items: [
                    { label: '09:00', icon: 'partly-sunny-outline', onPress: () => scheduleAt(9, 0) },
                    { label: '12:00', icon: 'sunny-outline', onPress: () => scheduleAt(12, 0) },
                    { label: '16:00', icon: 'cafe-outline', onPress: () => scheduleAt(16, 0) },
                    { label: '20:00', icon: 'moon-outline', onPress: () => scheduleAt(20, 0) },
                  ],
                });
              }
            )}

            {/* Bouton de vérification */}
            <VerificationButton
              onPress={() => setShowVerificationForm(true)}
              style={{ marginBottom: 16 }}
            />

            {/* Revue communautaire — ouverte à tout le monde, pas réservée aux
                modérateurs : c'est justement un jury d'utilisateurs. */}
            {renderActionButton(
              'Revue communautaire',
              'Jugez des contenus signalés, anonymisés',
              'hammer-outline',
              () => navigation.navigate('CommunityReview')
            )}

            {renderActionButton(
              'Monétisation des Tweets',
              'Gagnez des TWC avec vos tweets de qualité',
              'cash-outline',
              () => navigation.navigate('TweetMonetization')
            )}

            {renderActionButton(
              'Créer une publicité ciblée',
              'Diffusez votre ad sur une audience ultra-ciblée',
              'megaphone-outline',
              () => navigation.navigate('CreateTargetingAd')
            )}

            {renderActionButton(
              'TwitCoins Store',
              'Acheter des TwitCoins officiels',
              'wallet-outline',
              () => navigation.navigate('NewEconomy')
            )}

        {renderActionButton(
          'Trading Dashboard',
          'Analyse technique et statistiques avancées',
          'analytics-outline',
          () => navigation.navigate('Trading')
        )}

        {renderActionButton(
          'Mon Portefeuille',
          'Historique des transactions et statistiques détaillées',
          'wallet-outline',
          () => navigation.navigate('WalletDetail')
        )}

        {renderActionButton(
          'Casino NF',
          'Pile ou face et machine à sous, mise tes NF',
          'dice-outline',
          () => navigation.navigate('Casino')
        )}

        {/* Bouton pour changer le style de certification (utilisateurs vérifiés uniquement) */}
        {user?.verified && renderActionButton(
          'Style de Certification',
          'Changer le style de votre badge vérifié',
          'color-palette-outline',
          () => navigation.navigate('VerificationStyle' as never)
        )}

        {/* Banc d'essai des animations. Reserve aux comptes certifies : ce
            n'est pas une fonctionnalite mais un outil, et les pages qu'il
            montre ne s'affichent normalement que dans des conditions qu'on ne
            peut pas provoquer a la demande. */}
        {user?.verified && renderActionButton(
          'Animations',
          'Voir les pages de démarrage sans attendre leur déclencheur',
          'flask-outline',
          () => navigation.navigate('AnimationLab' as never)
        )}

        {/* Bouton de gestion des événements fonctionnels (admin uniquement) */}
        {(isAdmin || isSuperAdmin) && renderActionButton(
          'Gestion des Événements',
          'Lancer l\'événement Kospor Birthday',
          'gift-outline',
          () => navigation.navigate('FunctionalEventManagement')
        )}

        {/* Carte NF — sous drapeau : l'entrée n'apparaît que pour les comptes
            dont le palier est ouvert. */}
        {nfMapEnabled && renderActionButton(
          'Carte NF',
          'Vois où sont les comptes que tu suis, et choisis ce que tu montres',
          'map-outline',
          () => navigation.navigate('NfMap' as never)
        )}

        {/* Déploiement progressif des fonctionnalités (admin uniquement) */}
        {(isAdmin || isSuperAdmin) && renderActionButton(
          'Fonctionnalités en test',
          'Ouvrir une nouveauté à un groupe, puis à tout le monde',
          'flag-outline',
          () => navigation.navigate('FeatureFlagsAdmin' as never)
        )}

        {/* SECTION DÉVELOPPEUR */}
        {renderActionButton(
          'Portail Développeur API',
          'Créez des applications tierces avec l\'API OAuth 2.0',
          'code-slash-outline',
          () => navigation.navigate('DeveloperPortal' as never)
        )}

        {renderActionButton(
          'Notes de version',
          `Version ${APP_VERSION} — voir les dernières nouveautés`,
          'sparkles-outline',
          () => navigation.navigate('VersionNotes')
        )}

        {/* SECTION STREAMING (Vérifiés uniquement) */}
        {user?.verified && (
          <View style={[styles.section, { marginTop: 20 }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="videocam" size={24} color={colors.accent} />
              <Text style={styles.sectionTitle}>Diffusion en Direct</Text>
            </View>
            <Text style={styles.sectionDescription}>
              Utilisez votre clé de stream pour diffuser depuis OBS, Streamlabs ou CameraFi, ou lancez un live directement depuis l'application.
            </Text>

            {renderActionButton(
              'Lancer un live',
              'Diffuser directement depuis la caméra de votre téléphone',
              'radio-outline',
              () => {
                navigation.navigate('GoLive' as never);
              }
            )}

            <View style={styles.streamKeyCard}>
              <View style={styles.streamKeyInfo}>
                <Text style={styles.streamKeyLabel}>URL du serveur (RTMP)</Text>
                <View style={styles.streamKeyRow}>
                  <Text style={styles.streamKeyText} numberOfLines={1}>{RTMP_INGEST_URL}</Text>
                </View>
              </View>

              <View style={[styles.streamKeyInfo, { marginTop: 15 }]}>
                <Text style={styles.streamKeyLabel}>Clé de stream</Text>
                <View style={styles.streamKeyRow}>
                  <Text style={styles.streamKeyText}>
                    {user?.stream_key 
                      ? (showStreamKey ? user.stream_key : '••••••••••••••••') 
                      : 'Aucune clé générée'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {user?.stream_key && (
                      <TouchableOpacity onPress={() => setShowStreamKey(!showStreamKey)} style={styles.copyBtn}>
                        <Ionicons name={showStreamKey ? "eye-off-outline" : "eye-outline"} size={18} color={colors.accent} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      onPress={async () => {
                        try {
                          const credentials = await liveService.requestStreamCredentials();
                          toast.info('✅ Accès de diffusion généré', {
                            description: `URL : ${credentials.ingestUrl}\n\nClé : ${credentials.streamKey}\n\nCette clé est temporaire et à usage unique.`,
                          });
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Impossible de générer l'accès de diffusion.");
                        }
                      }} 
                      style={styles.generateBtn}
                    >
                      <Text style={styles.generateBtnText}>{user?.stream_key ? 'Régénérer' : 'Générer'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
          </Animated.View>

          {/* Événement actif */}
          {(hasActiveEvent && activeEvent) || (isKosporEventActive && kosporEvents.length > 0) ? (
            <Animated.View 
              style={[
                styles.eventInfo,
                { 
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }]
                }
              ]}
            >
              <View style={styles.eventInfoHeader}>
                <Ionicons name={isKosporEventActive ? "gift" : "calendar"} size={20} color={colors.accent} />
                <Text style={styles.eventInfoTitle}>Événement Actif</Text>
              </View>
              {isKosporEventActive && kosporEvents.length > 0 ? (
                <>
                  <Text style={styles.eventInfoName}>🎂 {kosporEvents[0].name}</Text>
                  {kosporEvents[0].description && (
                    <Text style={styles.eventInfoDescription}>{kosporEvents[0].description}</Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.eventInfoName}>🎉 {activeEvent.name}</Text>
                  {activeEvent.description && (
                    <Text style={styles.eventInfoDescription}>{activeEvent.description}</Text>
                  )}
                </>
              )}
            </Animated.View>
          ) : null}

          {/* Informations sur l'application */}
          <Animated.View 
            style={[
              styles.appInfo,
              { 
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <Text style={styles.appName}>TwitNin Legacy</Text>
            <Text style={styles.appVersion}>Version {APP_VERSION}</Text>
            <Text style={styles.appDescription}>
              Propulsé par l'IA ultra-puissante 🚀
            </Text>
          </Animated.View>
        </ScrollView>
      </View>

      {/* Modal de demande de vérification */}
      <VerificationRequestForm
        visible={showVerificationForm}
        onClose={() => setShowVerificationForm(false)}
        onSuccess={() => {
          setShowVerificationForm(false);
          // Optionnel: rafraîchir les données utilisateur
        }}
      />

      {/* Modal Premium */}
      <PremiumPurchaseModal
        visible={showPremiumPopup}
        onClose={() => setShowPremiumPopup(false)}
        onSuccess={(purchase) => {
          setShowPremiumPopup(false);
          const days = Number(purchase?.duration_days) || 5;
          toast.info('Bienvenue dans Premium Pro', {
            description: `Tous tes avantages sont actifs pour ${days} jour${days > 1 ? 's' : ''}.`,
          });
        }}
      />

    </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    justifyContent: 'space-between',
  },
  premiumBadgeInHeader: {
    marginLeft: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginLeft: 12,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 30,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 20,
  },
  appName: {
    fontSize: 20,
    fontWeight: '800', fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginBottom: 5,
  },
  appVersion: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginBottom: 10,
  },
  appDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  eventInfo: {
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  eventInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventInfoTitle: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: colors.accent,
    marginLeft: 8,
  },
  eventInfoName: {
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  eventInfoDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  // STYLES STREAMING
  streamKeyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
  },
  streamKeyInfo: {
    gap: 6,
  },
  streamKeyLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    textTransform: 'uppercase',
  },
  streamKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  streamKeyText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    flex: 1,
  },
  copyBtn: {
    padding: 4,
  },
  generateBtn: {
    backgroundColor: 'rgba(79, 124, 255, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(79, 124, 255, 0.3)',
  },
  generateBtnText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700', fontFamily: fonts.bold,
  },
});

export default SettingsScreen;
