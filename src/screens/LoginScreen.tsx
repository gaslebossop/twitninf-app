import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { signInWithGAuth } from '../services/gAuthLogin';
import {
  wp,
  hp,
  fontSize,
  spacing,
  borderRadius,
  shadow,
} from '../utils/responsive';
import { colors, fonts, gradients, glow } from '../theme';
import { ScreenBackground, GlassCard } from '../components/ui';

const { width } = Dimensions.get('window');


// ── Icônes SVG ─────────────────────────────────────────────────────
const UserIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <Circle cx={9} cy={6} r={3.5} stroke={colors.textMuted} strokeWidth={1.3} />
    <Path
      d="M2 16c0-3.3 3.1-6 7-6s7 2.7 7 6"
      stroke={colors.textMuted}
      strokeWidth={1.3}
      strokeLinecap="round"
    />
  </Svg>
);

const LockIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <Rect x={3} y={8} width={12} height={9} rx={2.5} stroke={colors.textMuted} strokeWidth={1.3} />
    <Path
      d="M6 8V5.5a3 3 0 016 0V8"
      stroke={colors.textMuted}
      strokeWidth={1.3}
      strokeLinecap="round"
    />
    <Circle cx={9} cy={12.5} r={1.2} fill={colors.textMuted} />
  </Svg>
);

const EyeIcon = ({ open }: { open: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
    <Path
      d="M1.5 9C1.5 9 4 3.5 9 3.5S16.5 9 16.5 9 14 14.5 9 14.5 1.5 9 1.5 9z"
      stroke={colors.textSecondary}
      strokeWidth={1.3}
    />
    <Circle cx={9} cy={9} r={2.2} stroke={colors.textSecondary} strokeWidth={1.3} />
    {!open && (
      <Line
        x1={3}
        y1={3}
        x2={15}
        y2={15}
        stroke={colors.textSecondary}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    )}
  </Svg>
);

const ArrowLeftIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <Path
      d="M11 4L6 9L11 14"
      stroke={colors.textPrimary}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const AlertIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Circle cx={8} cy={8} r={7} stroke="#F09595" strokeWidth={1.3} />
    <Path d="M8 5v4M8 11v.5" stroke="#F09595" strokeWidth={1.4} strokeLinecap="round" />
  </Svg>
);

const GIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={11} fill={colors.accent} />
    <SvgText x={12} y={16.5} fontSize={13} fontWeight="700" fill="#ffffff" textAnchor="middle">
      G
    </SvgText>
  </Svg>
);

const AppleIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24">
    <Path
      fill={colors.textPrimary}
      d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.1-2.01-3.77-2.04-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.4-.89-1.75.03-3.36 1.02-4.26 2.58-1.82 3.16-.47 7.83 1.3 10.39.86 1.25 1.89 2.66 3.24 2.61 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.28 3.15-2.54.99-1.46 1.4-2.87 1.42-2.94-.03-.01-2.72-1.04-2.75-4.13zM14.6 4.4c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-1.08 3.18 1.15.09 2.32-.58 3.03-1.45z"
    />
  </Svg>
);

// ── Composant principal ────────────────────────────────────────────
const LoginScreen: React.FC = () => {
  const navigation: any = useNavigation();
  const { login, completeGAuthLogin, isAuthenticated } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGAuthLoading, setIsGAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Animations d'entrée
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const errorShake = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
  }, []);

  const shakeError = () => {
    Animated.sequence([
      Animated.timing(errorShake, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(errorShake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    setError(null);

    if (!username.trim() || !password) {
      setError('Veuillez remplir tous les champs.');
      shakeError();
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(username.trim(), password);
      if (!result.success) {
        setError(result.message);
        shakeError();
      } else {
        try {
          if (navigation?.canGoBack?.()) {
            navigation.goBack();
          } else {
            navigation?.navigate?.('Profile');
          }
        } catch (_) { }
      }
    } catch {
      setError('Une erreur est survenue lors de la connexion.');
      shakeError();
    } finally {
      setIsLoading(false);
    }
  };

  const goToMainApp = () => {
    try {
      if (navigation?.canGoBack?.()) {
        navigation.goBack();
      } else {
        navigation?.navigate?.('Profile');
      }
    } catch (_) { }
  };

  const handleGAuthSignIn = async () => {
    if (isGAuthLoading) return;
    setError(null);
    setIsGAuthLoading(true);
    try {
      const result = await signInWithGAuth();
      if (result.type === 'cancel') return;
      if (result.type === 'error') {
        setError(result.message);
        shakeError();
        return;
      }

      const session = await completeGAuthLogin(result.token, result.refreshToken);
      if (!session.success) {
        setError(session.message);
        shakeError();
        return;
      }
      goToMainApp();
    } catch {
      setError('La connexion à G a échoué.');
      shakeError();
    } finally {
      setIsGAuthLoading(false);
    }
  };

  return (
    <ScreenBackground>
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Bouton retour */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <ArrowLeftIcon />
          </TouchableOpacity>
        </Animated.View>

        {/* Header */}
        <Animated.View
          style={[
            styles.header,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Logo — `brand-mark-lg.png` (288×288), pas `icon.png` (1920×1920) :
              affiché à 80 pt (240 px @3x) dans une entrée animée au montage. */}
          <Image
            source={require('../../assets/brand-mark-lg.png')}
            style={{ width: 80, height: 80 }}
            resizeMode="contain"
          />

          <Text style={styles.appName}>twitninf</Text>
          <Text style={styles.appSub}>Heureux de vous revoir</Text>
        </Animated.View>

        {/* Formulaire */}
        <Animated.View
          style={[
            styles.form,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
         <GlassCard padding={20} highlight>
          {/* Username */}
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>NOM D'UTILISATEUR</Text>
            <View
              style={[
                styles.inputRow,
                focusedField === 'username' && styles.inputFocused,
              ]}
            >
              <UserIcon />
              <TextInput
                style={styles.input}
                placeholder="Votre nom d'utilisateur"
                placeholderTextColor={colors.overlayStrong}
                value={username}
                onChangeText={setUsername}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>MOT DE PASSE</Text>
            <View
              style={[
                styles.inputRow,
                focusedField === 'password' && styles.inputFocused,
              ]}
            >
              <LockIcon />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Votre mot de passe"
                placeholderTextColor={colors.overlayStrong}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.6}
                style={styles.eyeBtn}
              >
                <EyeIcon open={showPassword} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mot de passe oublié */}
          <TouchableOpacity style={styles.forgotRow} activeOpacity={0.7}>
            <Text style={styles.forgotLink}>Mot de passe oublié ?</Text>
          </TouchableOpacity>

          {/* Erreur */}
          {error && (
            <Animated.View
              style={[
                styles.errorBox,
                { transform: [{ translateX: errorShake }] },
              ]}
            >
              <AlertIcon />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          )}

          {/* Bouton connexion */}
          <TouchableOpacity
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={isLoading}
            style={[styles.loginBtn, isLoading && { opacity: 0.65 }]}
          >
            <LinearGradient
              colors={gradients.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.loginBtnInner}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.loginBtnText}>Se connecter</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
         </GlassCard>
        </Animated.View>

        {/* Footer */}
        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          {/* Séparateur */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou continuer avec</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Boutons sociaux */}
          <View style={styles.socialRow}>
            <TouchableOpacity
              style={[styles.socialBtn, isGAuthLoading && { opacity: 0.65 }]}
              activeOpacity={0.7}
              onPress={handleGAuthSignIn}
              disabled={isGAuthLoading}
            >
              {isGAuthLoading ? (
                <ActivityIndicator color={colors.textPrimary} size="small" />
              ) : (
                <>
                  <GIcon />
                  <Text style={styles.socialBtnLabel}>G</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
              <AppleIcon />
              <Text style={styles.socialBtnLabel}>Apple</Text>
            </TouchableOpacity>
          </View>

          {/* Inscription */}
          <View style={styles.registerRow}>
            <Text style={styles.registerHint}>Pas encore de compte ? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Créer un compte</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
    </ScreenBackground>
  );
};

// ── Styles ─────────────────────────────────────────────────────────
const ACCENT = colors.accent;
const ACCENT2 = colors.success;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl ?? 24,
    paddingTop: hp ? hp(56) : 56,
    paddingBottom: spacing.xxxl ?? 40,
  },

  // Orbes de fond
  orb1: {
    position: 'absolute',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width * 0.45,
    backgroundColor: 'transparent',
    top: -width * 0.3,
    left: -width * 0.2,
    // Simuler une lueur radiale
    borderWidth: 80,
    borderColor: 'rgba(99,91,255,0.06)',
  },
  orb2: {
    position: 'absolute',
    width: width * 0.6,
    height: width * 0.6,
    borderRadius: width * 0.3,
    bottom: 60,
    right: -width * 0.2,
    borderWidth: 60,
    borderColor: 'rgba(0,207,207,0.05)',
  },

  // Bouton retour
  backBtn: {
    width: wp ? wp(40) : 40,
    height: wp ? wp(40) : 40,
    borderRadius: wp ? wp(20) : 20,
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  appName: {
    fontSize: fontSize?.xxxl ?? 28,
    fontFamily: fonts.displayHeavy,
    color: colors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  appSub: {
    fontSize: fontSize?.sm ?? 13,
    color: colors.textSecondary,
    fontWeight: '400', fontFamily: fonts.regular,
    letterSpacing: 0.3,
  },

  // Formulaire
  form: {
    marginBottom: 32,
  },
  fieldBlock: {
    marginBottom: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.overlayMedium,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    borderRadius: borderRadius?.md ?? 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
  },
  inputFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  input: {
    flex: 1,
    fontSize: fontSize?.md ?? 15,
    color: colors.textPrimary,
    backgroundColor: 'transparent',
  },
  eyeBtn: {
    paddingLeft: 8,
    paddingVertical: 4,
  },

  // Mot de passe oublié
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: 4,
    marginTop: 2,
  },
  forgotLink: {
    fontSize: fontSize?.sm ?? 12,
    color: ACCENT,
    fontWeight: '600', fontFamily: fonts.semibold,
  },

  // Erreur
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(226,75,74,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(226,75,74,0.2)',
    borderRadius: borderRadius?.sm ?? 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    marginTop: 8,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize?.sm ?? 13,
    color: '#F09595',
  },

  // Bouton connexion
  loginBtn: {
    borderRadius: borderRadius?.md ?? 14,
    overflow: 'hidden',
    marginTop: 16,
    ...glow(colors.accent, 16),
  },
  loginBtnInner: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtnText: {
    fontSize: fontSize?.md ?? 15,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#ffffff',
    letterSpacing: 0.3,
  },

  // Footer
  footer: {
    marginTop: 'auto',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: borderRadius?.md ?? 12,
    backgroundColor: colors.overlayMedium,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  socialBtnIcon: {
    fontSize: 15,
    fontWeight: '700', fontFamily: fonts.bold,
    color: colors.textSecondary,
  },
  socialBtnLabel: {
    fontSize: fontSize?.sm ?? 13,
    color: colors.textPrimary,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerHint: {
    fontSize: fontSize?.sm ?? 13,
    color: colors.textSecondary,
    fontWeight: '400', fontFamily: fonts.regular,
  },
  registerLink: {
    fontSize: fontSize?.sm ?? 13,
    color: ACCENT,
    fontWeight: '700', fontFamily: fonts.bold,
  },
});

export default LoginScreen;