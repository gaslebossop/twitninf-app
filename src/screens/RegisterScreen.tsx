import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { useAuth } from '../contexts/AuthContext';
import {
  wp,
  hp,
  fontSize,
  spacing,
  borderRadius,
  shadow,
} from '../utils/responsive';
import { colors, withAlpha, fonts, gradients, glow } from '../theme';
import { ScreenBackground, GlassCard } from '../components/ui';

const { width } = Dimensions.get('window');


// ── Icônes SVG ─────────────────────────────────────────────────────
const ArrowLeftIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <Path
      d="M11 4L6 9L11 14"
      stroke="rgba(255,255,255,0.8)"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const UserIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <Circle cx={9} cy={6} r={3.5} stroke="rgba(255,255,255,0.4)" strokeWidth={1.3} />
    <Path
      d="M2 16c0-3.3 3.1-6 7-6s7 2.7 7 6"
      stroke="rgba(255,255,255,0.4)"
      strokeWidth={1.3}
      strokeLinecap="round"
    />
  </Svg>
);

const NameIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <Rect x={2} y={3} width={14} height={3} rx={1.5} fill="rgba(255,255,255,0.4)" />
    <Rect x={2} y={8} width={10} height={2.5} rx={1.25} fill="rgba(255,255,255,0.25)" />
    <Rect x={2} y={12.5} width={7} height={2.5} rx={1.25} fill="rgba(255,255,255,0.15)" />
  </Svg>
);

const LockIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <Rect x={3} y={8} width={12} height={9} rx={2.5} stroke="rgba(255,255,255,0.4)" strokeWidth={1.3} />
    <Path
      d="M6 8V5.5a3 3 0 016 0V8"
      stroke="rgba(255,255,255,0.4)"
      strokeWidth={1.3}
      strokeLinecap="round"
    />
    <Circle cx={9} cy={12.5} r={1.2} fill="rgba(255,255,255,0.4)" />
  </Svg>
);

const CheckLockIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
    <Rect x={3} y={8} width={12} height={9} rx={2.5} stroke={withAlpha(colors.accent, 0.7)} strokeWidth={1.3} />
    <Path
      d="M6 8V5.5a3 3 0 016 0V8"
      stroke={withAlpha(colors.accent, 0.7)}
      strokeWidth={1.3}
      strokeLinecap="round"
    />
    <Path
      d="M7 12.5l1.5 1.5 2.5-2.5"
      stroke={colors.success}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const EyeIcon = ({ open }: { open: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
    <Path
      d="M1.5 9C1.5 9 4 3.5 9 3.5S16.5 9 16.5 9 14 14.5 9 14.5 1.5 9 1.5 9z"
      stroke="rgba(255,255,255,0.4)"
      strokeWidth={1.3}
    />
    <Circle cx={9} cy={9} r={2.2} stroke="rgba(255,255,255,0.4)" strokeWidth={1.3} />
    {!open && (
      <Line
        x1={3} y1={3} x2={15} y2={15}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    )}
  </Svg>
);

const AlertIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Circle cx={8} cy={8} r={7} stroke="#F09595" strokeWidth={1.3} />
    <Path d="M8 5v4M8 11v.5" stroke="#F09595" strokeWidth={1.4} strokeLinecap="round" />
  </Svg>
);

// ── Barre de force du mot de passe ─────────────────────────────────
const getPasswordStrength = (pwd: string): { score: number; label: string; color: string } => {
  if (!pwd) return { score: 0, label: '', color: 'transparent' };
  let score = 0;
  if (pwd.length >= 7) score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { score: 1, label: 'Faible', color: colors.red };
  if (score <= 2) return { score: 2, label: 'Moyen', color: colors.warning };
  if (score <= 3) return { score: 3, label: 'Bien', color: colors.accent };
  return { score: 4, label: 'Fort', color: colors.success };
};

// ── Composant champ de formulaire ──────────────────────────────────
interface FieldProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  secure?: boolean;
  showToggle?: boolean;
  toggleVisible?: boolean;
  onToggle?: () => void;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  textContentType?: string;
  autoComplete?: string;
  passwordRules?: string;
}

const FormField: React.FC<FieldProps> = ({
  label, icon, value, onChange, placeholder, focused,
  onFocus, onBlur, secure = false, showToggle = false,
  toggleVisible = false, onToggle, autoCapitalize = 'none',
  textContentType, autoComplete, passwordRules,
}) => (
  <View style={fieldStyles.block}>
    <Text style={fieldStyles.label}>{label}</Text>
    <View style={[fieldStyles.row, focused && fieldStyles.rowFocused]}>
      <View style={fieldStyles.iconWrap}>{icon}</View>
      <TextInput
        style={[fieldStyles.input, showToggle && { flex: 1 }]}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.2)"
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        secureTextEntry={secure && !toggleVisible}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        textContentType={textContentType as any}
        autoComplete={autoComplete as any}
        passwordRules={passwordRules}
      />
      {showToggle && onToggle && (
        <TouchableOpacity onPress={onToggle} activeOpacity={0.6} style={fieldStyles.eyeBtn}>
          <EyeIcon open={toggleVisible!} />
        </TouchableOpacity>
      )}
    </View>
  </View>
);

const fieldStyles = StyleSheet.create({
  block: { marginBottom: 16 },
  label: {
    fontSize: 10,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: colors.textMuted,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: borderRadius?.md ?? 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    gap: 10,
  },
  rowFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  iconWrap: { width: 18, alignItems: 'center' },
  input: {
    flex: 1,
    fontSize: fontSize?.md ?? 15,
    color: colors.textPrimary,
    backgroundColor: 'transparent',
  },
  eyeBtn: { paddingLeft: 8, paddingVertical: 4 },
});

// ── Composant principal ────────────────────────────────────────────
interface RegisterScreenProps {
  navigation: any;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({ navigation }) => {
  const { register } = useAuth();

  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const errorShake = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
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

  const update = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const validate = (): boolean => {
    const { username, fullName, password, confirmPassword } = formData;
    if (!username || !fullName || !password || !confirmPassword) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return false;
    }
    if (username.length < 3) {
      setError("Le nom d'utilisateur doit contenir au moins 3 caractères.");
      return false;
    }
    if (password.length < 7) {
      setError('Le mot de passe doit contenir au moins 7 caractères.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return false;
    }
    return true;
  };

  const handleRegister = async () => {
    setError(null);
    if (!validate()) { shakeError(); return; }

    setIsLoading(true);
    try {
      const result = await register(formData.username, formData.fullName, formData.password);
      if (!result.success) {
        setError(result.message);
        shakeError();
      } else {
        // Pas de navigation manuelle ici : `register()` bascule `isAuthenticated`
        // à true dans AuthContext, ce qui fait passer AppNavigator de la pile
        // publique (Intro/Login/Register) à MainApp par rendu conditionnel.
        // Le `navigate('Profile')` précédent visait un écran qui n'existe pas
        // sur cette pile (le tab s'appelle "Profil"), d'où l'avertissement
        // "NAVIGATE Profile not handled by any navigator" à chaque inscription.
        Alert.alert('Bienvenue !', 'Ton compte a été créé avec succès.');
      }
    } catch {
      setError("Une erreur est survenue lors de l'inscription.");
      shakeError();
    } finally {
      setIsLoading(false);
    }
  };

  const pwdStrength = getPasswordStrength(formData.password);
  const passwordsMatch =
    formData.confirmPassword.length > 0 &&
    formData.password === formData.confirmPassword;

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
          <Image
            source={require('../../assets/icon.png')}
            style={{ width: 80, height: 80 }}
            resizeMode="contain"
          />
          <Text style={styles.title}>Créer un compte</Text>
          <Text style={styles.subtitle}>Rejoins la communauté twitninf</Text>
        </Animated.View>

        {/* Formulaire */}
        <Animated.View
          style={[
            styles.form,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
         <GlassCard padding={20} highlight>
          <FormField
            label="NOM D'UTILISATEUR *"
            icon={<UserIcon />}
            value={formData.username}
            onChange={v => update('username', v)}
            placeholder="votre_username"
            focused={focusedField === 'username'}
            onFocus={() => setFocusedField('username')}
            onBlur={() => setFocusedField(null)}
            autoCapitalize="none"
            textContentType="username"
            autoComplete="username"
          />

          <FormField
            label="NOM COMPLET *"
            icon={<NameIcon />}
            value={formData.fullName}
            onChange={v => update('fullName', v)}
            placeholder="Prénom Nom"
            focused={focusedField === 'fullName'}
            onFocus={() => setFocusedField('fullName')}
            onBlur={() => setFocusedField(null)}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
          />

          {/* Mot de passe + jauge */}
          <FormField
            label="MOT DE PASSE *"
            icon={<LockIcon />}
            value={formData.password}
            onChange={v => update('password', v)}
            placeholder="Minimum 7 caractères"
            focused={focusedField === 'password'}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            secure
            showToggle
            toggleVisible={showPassword}
            onToggle={() => setShowPassword(!showPassword)}
            autoCapitalize="none"
            textContentType="newPassword"
            autoComplete="new-password"
            passwordRules="minlength: 7;"
          />

          {/* Barre de force */}
          {formData.password.length > 0 && (
            <View style={styles.strengthRow}>
              <View style={styles.strengthBars}>
                {[1, 2, 3, 4].map(i => (
                  <View
                    key={i}
                    style={[
                      styles.strengthBar,
                      {
                        backgroundColor:
                          i <= pwdStrength.score
                            ? pwdStrength.color
                            : colors.border,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.strengthLabel, { color: pwdStrength.color }]}>
                {pwdStrength.label}
              </Text>
            </View>
          )}

          {/* Confirmer mot de passe */}
          <FormField
            label="CONFIRMER LE MOT DE PASSE *"
            icon={passwordsMatch ? <CheckLockIcon /> : <LockIcon />}
            value={formData.confirmPassword}
            onChange={v => update('confirmPassword', v)}
            placeholder="Répétez votre mot de passe"
            focused={focusedField === 'confirmPassword'}
            onFocus={() => setFocusedField('confirmPassword')}
            onBlur={() => setFocusedField(null)}
            secure
            showToggle
            toggleVisible={showConfirmPassword}
            onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
            autoCapitalize="none"
            textContentType="newPassword"
            autoComplete="new-password"
            passwordRules="minlength: 7;"
          />

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

          {/* Bouton */}
          <TouchableOpacity
            onPress={handleRegister}
            activeOpacity={0.85}
            disabled={isLoading}
            style={[styles.registerBtn, isLoading && { opacity: 0.65 }]}
          >
            <LinearGradient
              colors={gradients.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.registerBtnInner}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.registerBtnText}>Créer mon compte</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* CGU */}
          <Text style={styles.cguText}>
            En créant un compte, tu acceptes nos{' '}
            <Text style={styles.cguLink}>Conditions d'utilisation</Text>
            {' '}et notre{' '}
            <Text style={styles.cguLink}>Politique de confidentialité</Text>.
          </Text>
         </GlassCard>
        </Animated.View>

        {/* Footer */}
        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          <Text style={styles.footerHint}>Tu as déjà un compte ? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.footerLink}>Se connecter</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
    </ScreenBackground>
  );
};

// ── Styles ─────────────────────────────────────────────────────────
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

  orb1: {
    position: 'absolute',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width * 0.45,
    top: -width * 0.3,
    left: -width * 0.2,
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

  backBtn: {
    width: wp ? wp(40) : 40,
    height: wp ? wp(40) : 40,
    borderRadius: wp ? wp(20) : 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },

  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    fontSize: fontSize?.xxxl ?? 26,
    fontFamily: fonts.displayHeavy,
    color: colors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: fontSize?.sm ?? 13,
    color: colors.textSecondary,
    fontWeight: '400', fontFamily: fonts.regular,
    letterSpacing: 0.3,
  },

  form: {
    marginBottom: 28,
  },

  // Jauge de force
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  strengthBars: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: '600', fontFamily: fonts.semibold,
    letterSpacing: 0.3,
    minWidth: 36,
    textAlign: 'right',
  },

  // Erreur
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.redMuted,
    borderWidth: 1,
    borderColor: withAlpha(colors.red, 0.2),
    borderRadius: borderRadius?.sm ?? 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize?.sm ?? 13,
    color: '#F09595',
  },

  // Bouton inscription
  registerBtn: {
    borderRadius: borderRadius?.md ?? 14,
    overflow: 'hidden',
    marginTop: 16,
    ...glow(colors.accent, 16),
  },
  registerBtnInner: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerBtnText: {
    fontSize: fontSize?.md ?? 15,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#ffffff',
    letterSpacing: 0.3,
  },

  // CGU
  cguText: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 14,
    paddingHorizontal: 8,
  },
  cguLink: {
    color: colors.accent,
    fontWeight: '600', fontFamily: fonts.semibold,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 8,
  },
  footerHint: {
    fontSize: fontSize?.sm ?? 13,
    color: colors.textSecondary,
    fontWeight: '400', fontFamily: fonts.regular,
  },
  footerLink: {
    fontSize: fontSize?.sm ?? 13,
    color: colors.accent,
    fontWeight: '700', fontFamily: fonts.bold,
  },
});

export default RegisterScreen;