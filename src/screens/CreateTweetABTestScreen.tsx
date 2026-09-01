import { colors, fonts, glow , statusBarStyle} from '../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
// La version de react-native (ci-dessus, retirée) ne pose aucun inset sur
// Android — seule celle de react-native-safe-area-context protège le haut
// de l'écran sur les deux plateformes.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tweet, AB_TEST_LIMITS, CreateTweetRequest } from '../types/api';
import { apiService } from '../services/api';
import { neuralRankService } from '../services/neuralRankService';
import { wp, hp, fontSize, spacing, borderRadius, iconSize, shadow } from '../utils/responsive';
import { BackButton } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';


type CreateTweetABTestScreenNavigationProp = StackNavigationProp<any, 'CreateTweetABTest'>;
type CreateTweetABTestScreenRouteProp = RouteProp<any, 'CreateTweetABTest'>;

interface CreateTweetABTestScreenProps {
  navigation: CreateTweetABTestScreenNavigationProp;
  route: CreateTweetABTestScreenRouteProp;
}

const VARIANT_COLORS = [colors.accent, colors.cyan, colors.gold, colors.success];
const variantLetter = (index: number) => String.fromCharCode(65 + index);

export default function CreateTweetABTestScreen({ navigation, route }: CreateTweetABTestScreenProps) {

  // États pour les versions A/B - maintenant dynamiques
  const { parentTweetId, replyTo, quoteTweetId, prefill } = route.params || {};

  // Le texte déjà saisi dans le composeur devient le TÉMOIN. Repartir d'une
  // page blanche après avoir écrit son tweet était le moyen le plus sûr de ne
  // jamais lancer de test.
  const [versions, setVersions] = useState([
    { id: 1, content: typeof prefill === 'string' ? prefill : '', label: 'Original' },
    { id: 2, content: '', label: 'Alternative' }
  ]);
  const [loading, setLoading] = useState(false);

  const handleVersionChange = (id: number, text: string) => {
    // Vérification que la version existe avant modification
    const versionExists = versions.some(v => v.id === id);
    if (!versionExists) {
      console.error('Tentative de modification d\'une version inexistante:', id);
      return;
    }

    setVersions(prevVersions =>
      prevVersions.map(version =>
        version.id === id ? { ...version, content: text } : version
      )
    );
  };

  const handleAddVersion = () => {
    // ⚠ Le plafond vient de l'API (`MAX_VARIANTS`), ce n'est pas un choix
    // d'ergonomie. Cet écran en proposait dix : au-delà de quatre, la
    // publication partait puis échouait en bloc, après que l'auteur avait
    // rédigé six versions pour rien.
    if (versions.length >= AB_TEST_LIMITS.MAX_VERSIONS) {
      toast.error('Limite atteinte', {
        description: `Une expérience compte ${AB_TEST_LIMITS.MAX_VERSIONS} versions au maximum : au-delà, chacune reçoit trop peu de vues pour qu'on puisse les départager.`,
      });
      return;
    }

    // Trouver le prochain ID disponible pour éviter les collisions
    const maxId = versions.length > 0 ? Math.max(...versions.map(v => v.id)) : 0;
    const newVersionNumber = maxId + 1;

    // Vérification supplémentaire pour éviter les doublons
    const idExists = versions.some(v => v.id === newVersionNumber);
    if (idExists) {
      console.error('ID déjà existant, utilisation d\'un ID alternatif');
      // Utiliser un timestamp comme ID alternatif
      const fallbackId = Date.now();
      const newVersion = {
        id: fallbackId,
        content: '',
        label: `Version ${versions.length + 1}`
      };
      setVersions(prevVersions => [...prevVersions, newVersion]);
      return;
    }

    const newVersion = {
      id: newVersionNumber,
      content: '',
      label: `Version ${versions.length + 1}`
    };

    setVersions(prevVersions => [...prevVersions, newVersion]);
  };

  const handleRemoveVersion = (id: number) => {
    // Vérifications de sécurité multiples
    if (versions.length <= 2) {
      toast.error('Impossible de supprimer', {
        description: 'Vous devez garder au minimum 2 versions pour un test A/B efficace.',
      });
      return;
    }

    const versionToRemove = versions.find(v => v.id === id);
    if (!versionToRemove) {
      console.error('Version non trouvée pour suppression:', id);
      return;
    }

    // Confirmation avant suppression
    confirmAsync({
      title: 'Supprimer la version',
      message: `Êtes-vous sûr de vouloir supprimer "${versionToRemove.label}" ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
    }).then((ok) => {
      if (ok) (() => {
            // Suppression sécurisée avec vérification
            setVersions(prevVersions => {
              const filtered = prevVersions.filter(version => version.id !== id);

              // Vérification post-suppression
              if (filtered.length < 2) {
                console.error('Erreur: Moins de 2 versions après suppression');
                return prevVersions; // Annuler la suppression
              }

              // Re-numéroter les labels pour éviter les trous
              return filtered.map((version, index) => ({
                ...version,
                label: index === 0 ? 'Original' :
                       index === 1 ? 'Alternative' :
                       `Version ${index + 1}`
              }));
            });
          })();
    });
  };

  const handlePublish = async () => {
    const contents = versions
      .map(version => version.content.trim())
      .filter(Boolean);

    // ── Les refus que l'API opposerait, opposés ICI ───────────────────
    //
    // Chacun de ces contrôles existe côté serveur (voir
    // `api/src/services/tweetAbTestService.js`) et c'est lui qui fait foi. Les
    // rejouer ici n'est pas de la défiance : sans eux, l'auteur découvre le
    // problème APRÈS l'aller-retour, sur un écran qui a déjà refermé le
    // clavier, avec un message écrit pour une API et non pour lui.
    if (contents.length < AB_TEST_LIMITS.MIN_VERSIONS) {
      toast.error('Il faut au moins deux versions', {
        description: "Un test A/B compare des formulations : avec une seule, il n'y a rien à comparer.",
      });
      return;
    }
    if (contents.length > AB_TEST_LIMITS.MAX_VERSIONS) {
      toast.error(`${AB_TEST_LIMITS.MAX_VERSIONS} versions au maximum`);
      return;
    }
    if (contents.some(c => c.length > AB_TEST_LIMITS.MAX_CONTENT_LENGTH)) {
      toast.error('Une version dépasse la limite', {
        description: `Chaque version tient en ${AB_TEST_LIMITS.MAX_CONTENT_LENGTH} caractères.`,
      });
      return;
    }
    if (new Set(contents).size !== contents.length) {
      toast.error('Deux versions sont identiques', {
        description: 'Comparer un texte à lui-même ne peut rien départager.',
      });
      return;
    }

    try {
      setLoading(true);

      // ⚠ `content` EST la première version, le témoin ; `ab_test.variants` ne
      // porte que les AUTRES. Recopier le témoin dans `variants` ferait échouer
      // la publication sur « les versions doivent être différentes ».
      const [temoin, ...autres] = contents;
      const payload: CreateTweetRequest = {
        content: temoin,
        language: 'fr',
        is_private: false,
        ab_test: { variants: autres, strategy: 'adaptive' },
      };

      const response = await apiService.createTweet(payload);

      if (!response.success) {
        // Le message vient du serveur : compte non certifié, moins de onze
        // abonnés, cohorte fermée, deux expériences déjà en cours. Le
        // reformuler ici le rendrait faux dès que la règle bouge.
        toast.error('Test A/B non lancé', {
          description: response.message || 'La publication a échoué.',
        });
        return;
      }

      const newTweetId = (response as any).data?.tweet?.id || (response as any).data?.id;
      if (newTweetId) neuralRankService.onPublish(String(newTweetId));

      toast.success(`${contents.length} versions en test`, {
        description: 'Le moteur sert les variantes et gardera celle qui performe le mieux.',
      });
      navigation.goBack();
    } catch (error) {
      console.error('Erreur lors de la création du test A/B:', error);
      toast.error('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <BackButton navigation={navigation} />
          <View style={styles.headerTitleWrap}>
            <Ionicons name="flask" size={16} color={colors.gold} />
            <Text style={styles.headerTitle}>A/B Test</Text>
          </View>
          <View style={styles.headerRight} />
        </View>
      </View>

      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text style={styles.title}>Testez vos formulations</Text>
          <Text style={styles.description}>
            Créez plusieurs versions d'un même tweet et gardez celle qui performe le mieux.
          </Text>

          {/* Affichage dynamique des versions */}
          {versions.map((version, index) => {
            const canDelete = versions.length > 2 &&
                             version.label !== 'Original' &&
                             version.label !== 'Alternative';
            const variantColor = VARIANT_COLORS[index % VARIANT_COLORS.length];

            return (
              <View key={version.id} style={styles.versionContainer}>
                <View style={styles.versionHeader}>
                  <View style={styles.versionLabelRow}>
                    <View style={[styles.variantBadge, { backgroundColor: variantColor }]}>
                      <Text style={styles.variantBadgeText}>{variantLetter(index)}</Text>
                    </View>
                    <Text style={styles.sectionLabel}>{version.label}</Text>
                  </View>
                  {canDelete && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => handleRemoveVersion(version.id)}
                    >
                      <Ionicons name="close-circle" size={iconSize.md} color={colors.red} />
                    </TouchableOpacity>
                  )}
                </View>
              <View style={[styles.inputBox, { borderColor: variantColor + '40' }]}>
                <TextInput
                  style={styles.inputText}
                  placeholder={`Tapez votre ${version.label.toLowerCase()}...`}
                  placeholderTextColor={colors.textMuted}
                  value={version.content}
                  onChangeText={(text) => handleVersionChange(version.id, text)}
                  maxLength={AB_TEST_LIMITS.MAX_CONTENT_LENGTH}
                  multiline
                  textAlignVertical="top"
                />
                {version.content.length > 0 && (
                  <Text style={styles.charCount}>
                    {version.content.length} / {AB_TEST_LIMITS.MAX_CONTENT_LENGTH}
                  </Text>
                )}
              </View>
            </View>
            );
          })}

          {/* Boutons */}
          <View style={styles.buttonContainer}>
            {versions.length < AB_TEST_LIMITS.MAX_VERSIONS && (
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={handleAddVersion}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={18} color={colors.textPrimary} />
                <Text style={styles.btnSecondaryText}>Ajouter une version</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={handlePublish}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>
                {loading ? 'Publication...' : 'Publier le test'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: wp(38),
    height: wp(38),
    borderRadius: wp(12),
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontFamily: fonts.bold,
  },
  headerRight: {
    width: wp(38),
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  title: {
    fontSize: fontSize.xxxl,
    fontFamily: fonts.displayHeavy,
    marginBottom: spacing.sm,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.5,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
    fontFamily: fonts.regular,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  versionContainer: {
    marginBottom: spacing.lg,
  },
  versionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  versionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  variantBadge: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantBadgeText: {
    color: '#0A0A0A',
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  removeButton: {
    padding: spacing.xs,
  },
  inputBox: {
    width: '100%',
    minHeight: hp(80),
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  // Aligné à droite sous le champ, dans la teinte discrète : il informe quand
  // on le cherche et ne se met pas en travers de la rédaction.
  charCount: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  inputText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    flex: 1,
    textAlignVertical: 'top',
    minHeight: hp(48),
    fontFamily: fonts.regular,
  },
  buttonContainer: {
    marginTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  btnPrimary: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xxl,
    backgroundColor: colors.accent,
    alignItems: 'center',
    ...glow(colors.accent, 14),
  },
  btnSecondary: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xxl,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnSecondaryText: {
    fontSize: fontSize.md,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  btnText: {
    fontSize: fontSize.md,
    fontFamily: fonts.bold,
    color: colors.white,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
