import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

// Palette de couleurs futuriste du README
const COLORS = {
  // Couleurs principales - Bleus cybernétiques
  primary: '#4F7CFF',      // Bleu électrique principal
  secondary: '#3D63D9',    // Bleu océan secondaire
  accent: '#3354C4',       // Bleu profond accent
  
  // Arrière-plans - Gradients sombres
  bgPrimary: '#0B0C0F',    // Noir profond
  bgSecondary: '#15171C',  // Bleu très sombre
  bgTertiary: '#1B1E25',   // Bleu sombre
  bgQuaternary: '#0B0C0F', // Bleu noir
  
  // Texte - Hiérarchie claire
  textPrimary: '#ffffff',   // Blanc pur
  textSecondary: '#cbd5e0', // Blanc cassé
  textMuted: '#9BA1AC',     // Gris bleuté
  
  // États et interactions
  success: '#4F7CFF',       // Bleu électrique
  error: '#ff4757',         // Rouge vif
  warning: '#ffa502',       // Orange
};

const TYPOGRAPHY = {
  body: { fontSize: 14, fontWeight: '400' as const },
  button: { fontSize: 13, fontWeight: '600' as const },
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

interface ModerationButtonProps {
  style?: any;
}

const ModerationButton: React.FC<ModerationButtonProps> = ({ style }) => {
  const navigation = useNavigation();
  const { isModerator, userRole, loading } = useAdminPermissions();

  if (loading) {
    return null; // Ne rien afficher pendant le chargement
  }

  // Ne pas afficher le bouton si l'utilisateur n'est pas modérateur
  if (!isModerator) {
    return null;
  }

  const getRoleIcon = () => {
    switch (userRole) {
      case 'superadmin':
        return 'shield-checkmark';
      case 'admin':
        return 'shield';
      case 'moderator':
        return 'shield-half';
      case 'classeurdetweets':
        return 'document-text';
      default:
        return 'shield';
    }
  };

  const getRoleGradient = () => {
    switch (userRole) {
      case 'superadmin':
        return [COLORS.primary, COLORS.accent];
      case 'admin':
        return [COLORS.secondary, COLORS.primary];
      case 'moderator':
        return [COLORS.accent, COLORS.secondary];
      case 'classeurdetweets':
        return [COLORS.success, COLORS.secondary];
      default:
        return [COLORS.primary, COLORS.secondary];
    }
  };

  const getRoleLabel = () => {
    switch (userRole) {
      case 'superadmin':
        return 'Super Admin';
      case 'admin':
        return 'Admin';
      case 'moderator':
        return 'Modérateur';
      case 'classeurdetweets':
        return 'Classeur';
      default:
        return 'Modération';
    }
  };

  const getPrimaryColor = () => {
    switch (userRole) {
      case 'superadmin':
        return COLORS.primary;
      case 'admin':
        return COLORS.secondary;
      case 'moderator':
        return COLORS.accent;
      case 'classeurdetweets':
        return COLORS.success;
      default:
        return COLORS.primary;
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Ombre colorée futuriste */}
      <View style={[styles.shadowContainer, { 
        shadowColor: getPrimaryColor(),
        elevation: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      }]}>
        <TouchableOpacity
          style={styles.buttonWrapper}
          onPress={() => navigation.navigate('Moderation' as never)}
          activeOpacity={0.85}
        >
          {/* Effet de flou en arrière-plan */}
          <BlurView intensity={20} style={styles.blurBackground} />
          
          {/* Gradient de bordure */}
          <LinearGradient
            colors={getRoleGradient()}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientBorder}
          >
            <View style={styles.innerButton}>
              {/* Arrière-plan avec gradient subtil */}
              <LinearGradient
                colors={[
                  `${COLORS.bgSecondary}95`,
                  `${COLORS.bgTertiary}85`,
                  `${COLORS.bgQuaternary}90`
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.buttonBackground}
              >
                <View style={styles.content}>
                  {/* Icône avec effet de brillance */}
                  <View style={styles.iconContainer}>
                    <Ionicons
                      name={getRoleIcon() as keyof typeof Ionicons.glyphMap}
                      size={18}
                      color={getPrimaryColor()}
                    />
                    {/* Effet de brillance sur l'icône */}
                    <View style={[styles.iconGlow, { backgroundColor: getPrimaryColor() }]} />
                  </View>
                  
                  {/* Texte avec typographie futuriste */}
                  <Text style={[styles.text, { color: COLORS.textPrimary }]}>
                    {getRoleLabel()}
                  </Text>
                  
                  {/* Particule decorative */}
                  <View style={[styles.particle, { backgroundColor: getPrimaryColor() }]} />
                </View>
              </LinearGradient>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.sm,
  },
  shadowContainer: {
    borderRadius: 25,
  },
  buttonWrapper: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 25,
  },
  blurBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  gradientBorder: {
    padding: 1, // Épaisseur de la bordure gradient
    borderRadius: 25,
  },
  innerButton: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  buttonBackground: {
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  iconContainer: {
    position: 'relative',
    marginRight: SPACING.xs + 2,
  },
  iconGlow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 12,
    height: 12,
    borderRadius: 6,
    opacity: 0.2,
    transform: [{ translateX: -6 }, { translateY: -6 }],
  },
  text: {
    ...TYPOGRAPHY.button,
    letterSpacing: 0.5, // Espacement des lettres pour l'élégance
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  particle: {
    position: 'absolute',
    right: -4,
    top: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },
});

export default ModerationButton;