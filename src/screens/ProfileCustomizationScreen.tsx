import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
// La version de react-native (core) ne pose aucun inset sur Android — seule
// celle de react-native-safe-area-context protège le haut de l'écran partout.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, withAlpha , statusBarStyle} from '../theme';
import { ScreenBackground, BackButton, ScreenSkeleton } from '../components/ui';
import Avatar from '../components/Avatar';
import { useAuth } from '../contexts/AuthContext';
import {
  AnimatedNameFill,
  AvatarDecorationLayer,
  AvatarDecorationOrnament,
  ProfileThemeBackdrop,
  ProfileTitleChip,
} from '../components/ProfileDecoration';
import { resolveDisplayNameFontFamily } from '../utils/profileDisplayNamePrefs';
import profileCustomizationService, {
  ACCENT_PRESETS,
  AVATAR_DECORATIONS,
  ownsCosmetic,
  NAME_EFFECTS,
  NAME_FONTS,
  NAME_SIZES,
  PROFILE_EFFECTS,
  PROFILE_THEMES,
  PROFILE_TITLE_MAX,
  THEME_INTENSITIES,
  AvatarDecoration,
  BannerStyle,
  NameEffect,
  NameFont,
  NameSize,
  ProfileCustomization,
  ProfileEffect,
  ThemeIntensity,
  certifiedNameColors,
  nameFontOf,
  nameSizeScale,
} from '../services/profileCustomizationService';
import type { VerificationStyle } from '../services/verificationStyleService';
import { toast } from '../components/ui/Toast';

const PREVIEW_AVATAR = 72;
const PREVIEW_BANNER = 96;

export default function ProfileCustomizationScreen({ navigation }: any) {
  const { user, refreshCurrentUser } = useAuth() as any;
  const [draft, setDraft] = useState<ProfileCustomization>({});
  const [tier, setTier] = useState<'free' | 'plus' | 'pro'>('free');
  const [canCustomize, setCanCustomize] = useState(false);
  const [canUseDecorations, setCanUseDecorations] = useState(false);
  const [canUseCertified, setCanUseCertified] = useState(false);
  const [verificationStyle, setVerificationStyle] = useState<VerificationStyle>('default');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    profileCustomizationService.get().then((state) => {
      if (!active) return;
      setDraft(state.customization || {});
      setTier(state.tier);
      setCanCustomize(state.can_customize);
      setCanUseDecorations(state.can_use_decorations);
      setCanUseCertified(state.can_use_certified_name);
      setVerificationStyle(state.verification_style);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const accent = draft.accent_color || colors.accent;
  const secondary = draft.secondary_color || accent;

  const preview = useMemo<ProfileCustomization>(
    () => ({ ...draft, accent_color: accent, secondary_color: secondary }),
    [draft, accent, secondary],
  );
  const previewFont = resolveDisplayNameFontFamily(nameFontOf(preview));
  const certifColors = certifiedNameColors(verificationStyle);

  /** Un réglage Pro touché sans le palier : on le dit, on ne l'applique pas. */
  /**
   * Cet habillage est-il accessible ?
   *
   * Palier OU possession. Un habillage gagné à un événement est acquis À VIE :
   * le refuser parce que l'abonnement a expiré reviendrait à reprendre une
   * récompense, ce qui vide de sens la promesse « on ne la reverra pas ».
   *
   * Avant, tout passait par le seul booléen d'abonnement — les cosmétiques
   * gagnés n'avaient donc AUCUN effet : le serveur les accordait, l'app ne les
   * lisait nulle part.
   */
  const allows = (slot: string, key: string) =>
    canUseDecorations || ownsCosmetic(draft, slot, key);

  /** Un réglage touché sans le palier ni la possession. */
  const requireAccess = (slot: string, key: string, apply: () => void) => {
    if (!allows(slot, key)) {
      toast.info('Réservé', {
        description: "Cet habillage demande l'abonnement Pro, ou se gagne pendant un événement.",
      });
      return;
    }
    apply();
  };

  /** Réglages qui ne portent pas sur un habillage identifiable. */
  const requirePro = (apply: () => void) => requireAccess('', '', apply);

  const update = (patch: Partial<ProfileCustomization>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const save = async () => {
    if (!canCustomize) {
      toast.error('Abonnement requis', {
        description: 'La personnalisation de profil est réservée aux abonnements Plus et Pro.',
      });
      return;
    }
    setSaving(true);
    try {
      const result = await profileCustomizationService.save(draft);
      if (!result.success) {
        toast.error(result.message || 'Enregistrement impossible');
        return;
      }
      await refreshCurrentUser?.();
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setDraft({});

  if (loading) {
    return (
      <ScreenBackground>
        <ScreenSkeleton variant="list" />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        <View style={styles.header}>
          <BackButton navigation={navigation} />
          <Text style={styles.headerTitle}>Personnalisation</Text>
          <TouchableOpacity onPress={reset} hitSlop={hitSlop} style={styles.headerBtn}>
            <Text style={styles.resetText}>Réinit.</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!canCustomize && (
            <View style={styles.lockBanner}>
              <Ionicons name="lock-closed" size={16} color={colors.gold} />
              <Text style={styles.lockText}>
                Réservé aux abonnements Plus et Pro. Tu peux tout essayer ici, l'enregistrement demandera un abonnement.
              </Text>
            </View>
          )}

          {/* ── Aperçu en direct ──
              Une vraie carte de profil miniature : le thème passe DERRIÈRE
              toute la carte, la bannière garde ses couleurs. C'est exactement
              ce que verront les visiteurs. */}
          <View style={styles.previewCard}>
            <ProfileThemeBackdrop customization={preview} bannerHeight={PREVIEW_BANNER} />
            <View style={styles.previewBanner}>
              <LinearGradient
                colors={['#39414f', '#262b36']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
            <View style={styles.previewBody}>
              <View style={styles.previewAvatarWrap}>
                <AvatarDecorationLayer customization={preview} size={PREVIEW_AVATAR} />
                <Avatar size={PREVIEW_AVATAR} username={user?.username} uri={user?.avatar} />
                <AvatarDecorationOrnament customization={preview} size={PREVIEW_AVATAR} />
              </View>
              <AnimatedNameFill
                customization={preview}
                name={user?.full_name || 'Ton nom'}
                numberOfLines={1}
                style={[
                  styles.previewName,
                  previewFont ? { fontFamily: previewFont } : null,
                  { fontSize: styles.previewName.fontSize * nameSizeScale(preview) },
                ]}
                verified={canUseCertified}
                verificationStyle={verificationStyle}
              />
              <Text style={[styles.previewHandle, { color: accent }]}>@{user?.username || 'pseudo'}</Text>
              <ProfileTitleChip customization={preview} />
              {!!draft.about_me && (
                <View style={[styles.previewAbout, { borderLeftColor: accent }]}>
                  <Text style={styles.previewAboutText}>{draft.about_me}</Text>
                </View>
              )}
              <View style={[styles.previewBtn, { backgroundColor: accent }]}>
                <Text style={styles.previewBtnText}>Suivre</Text>
              </View>
            </View>
          </View>

          {/* ── Couleur d'accent ── */}
          <Text style={styles.sectionTitle}>Couleur d'accent</Text>
          <View style={styles.swatchGrid}>
            {ACCENT_PRESETS.map((color) => (
              <TouchableOpacity
                key={`accent-${color}`}
                style={[
                  styles.swatch,
                  { backgroundColor: color },
                  draft.accent_color === color && styles.swatchActive,
                ]}
                onPress={() => update({ accent_color: color })}
                activeOpacity={0.85}
              >
                {draft.accent_color === color && <Ionicons name="checkmark" size={16} color="#000" />}
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Couleur secondaire ── */}
          <Text style={styles.sectionTitle}>Couleur secondaire</Text>
          <Text style={styles.sectionHint}>Utilisée pour les dégradés du thème et des décorations.</Text>
          <View style={styles.swatchGrid}>
            {ACCENT_PRESETS.map((color) => (
              <TouchableOpacity
                key={`secondary-${color}`}
                style={[
                  styles.swatch,
                  { backgroundColor: color },
                  draft.secondary_color === color && styles.swatchActive,
                ]}
                onPress={() => update({ secondary_color: color })}
                activeOpacity={0.85}
              >
                {draft.secondary_color === color && <Ionicons name="checkmark" size={16} color="#000" />}
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Thème de profil ── */}
          <Text style={styles.sectionTitle}>Thème de profil</Text>
          <Text style={styles.sectionHint}>
            Le dégradé habille tout le profil. Ta bannière reste intacte.
          </Text>
          <View style={styles.chipRow}>
            {PROFILE_THEMES.map((option) => {
              const active = (draft.banner_style || 'none') === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.chip, active && { borderColor: accent, backgroundColor: withAlpha(accent, 0.14) }]}
                  onPress={() => update({ banner_style: option.key as BannerStyle })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && { color: colors.textPrimary }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Intensité du thème ── */}
          <Text style={styles.sectionTitle}>Intensité</Text>
          <Text style={styles.sectionHint}>Le même thème, plus ou moins présent.</Text>
          <View style={styles.chipRow}>
            {THEME_INTENSITIES.map((option) => {
              const active = (draft.theme_intensity || 'normal') === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.chip, active && { borderColor: accent, backgroundColor: withAlpha(accent, 0.14) }]}
                  onPress={() => update({ theme_intensity: option.key as ThemeIntensity })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && { color: colors.textPrimary }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Ambiance de profil (Pro) ── */}
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Ambiance</Text>
            {!canUseDecorations && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
          <Text style={styles.sectionHint}>
            Des particules qui traversent le fond du profil, en continu.
          </Text>
          <View style={styles.chipRow}>
            {PROFILE_EFFECTS.map((option) => {
              const active = (draft.profile_effect || 'none') === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.chip,
                    styles.chipIcon,
                    active && { borderColor: accent, backgroundColor: withAlpha(accent, 0.14) },
                    !allows('profile_effect', option.key) && option.key !== 'none' && styles.chipDisabled,
                  ]}
                  onPress={() =>
                    option.key === 'none'
                      ? update({ profile_effect: 'none' })
                      : requireAccess('profile_effect', option.key, () => update({ profile_effect: option.key as ProfileEffect }))
                  }
                  activeOpacity={0.8}
                >
                  <Ionicons name={option.icon as any} size={15} color={active ? accent : colors.textSecondary} />
                  <Text style={[styles.chipText, active && { color: colors.textPrimary }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Nom affiché (Pro) ── */}
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Nom affiché</Text>
            {!canUseDecorations && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
          <Text style={styles.sectionHint}>Police et traitement lumineux de ton nom.</Text>
          <View style={styles.chipRow}>
            {NAME_FONTS.map((option) => {
              const active = (draft.name_font || 'system') === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.chip,
                    active && { borderColor: accent, backgroundColor: withAlpha(accent, 0.14) },
                    !allows('name_font', option.key) && option.key !== 'system' && styles.chipDisabled,
                  ]}
                  onPress={() =>
                    option.key === 'system'
                      ? update({ name_font: 'system' })
                      : requireAccess('name_font', option.key, () => update({ name_font: option.key as NameFont }))
                  }
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { fontFamily: resolveDisplayNameFontFamily(option.key) || undefined },
                      active && { color: colors.textPrimary },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.chipRow, { marginTop: 8 }]}>
            {NAME_EFFECTS.map((option) => {
              const active = (draft.name_effect || 'none') === option.key;
              // « Certifié » ne suit pas le palier payant : c'est le badge qui
              // l'ouvre. Un compte Pro non certifié ne l'a donc pas.
              const certifOption = option.key === 'certified';
              const unlocked =
                option.key === 'none' || (certifOption ? canUseCertified : canUseDecorations);
              // La pastille prend la couleur du badge : elle montre ce qu'on achète.
              const tint = certifOption ? certifColors.from : accent;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.chip,
                    styles.chipIcon,
                    active && { borderColor: tint, backgroundColor: withAlpha(tint, 0.14) },
                    !unlocked && styles.chipDisabled,
                  ]}
                  onPress={() => {
                    if (option.key === 'none') return update({ name_effect: 'none' });
                    if (certifOption) {
                      if (!canUseCertified) {
                        toast.error('Compte certifié requis', {
                          description: 'Cet effet reprend la couleur de ton badge de certification : il faut être certifié pour l\'utiliser.',
                        });
                        return;
                      }
                      return update({ name_effect: 'certified' });
                    }
                    requirePro(() => update({ name_effect: option.key as NameEffect }));
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name={option.icon as any} size={15} color={active ? tint : colors.textSecondary} />
                  <Text style={[styles.chipText, active && { color: colors.textPrimary }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Taille du pseudo (Pro) ── */}
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Taille du pseudo</Text>
            {!canUseDecorations && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
          <Text style={styles.sectionHint}>Agrandit ton pseudo sur ton profil.</Text>
          <View style={styles.chipRow}>
            {NAME_SIZES.map((option) => {
              const active = (draft.name_size || 'normal') === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.chip,
                    active && { borderColor: accent, backgroundColor: withAlpha(accent, 0.14) },
                    !canUseDecorations && option.key !== 'normal' && styles.chipDisabled,
                  ]}
                  onPress={() =>
                    option.key === 'normal'
                      ? update({ name_size: 'normal' })
                      : requirePro(() => update({ name_size: option.key as NameSize }))
                  }
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && { color: colors.textPrimary }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Décoration d'avatar (Pro) ── */}
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Décoration d'avatar</Text>
            {!canUseDecorations && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
          <Text style={styles.sectionHint}>Animées en continu, aux couleurs choisies plus haut.</Text>
          <View style={styles.chipRow}>
            {AVATAR_DECORATIONS.map((option) => {
              const active = (draft.avatar_decoration || 'none') === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.chip,
                    styles.chipIcon,
                    active && { borderColor: accent, backgroundColor: withAlpha(accent, 0.14) },
                    !allows('avatar_decoration', option.key) && option.key !== 'none' && styles.chipDisabled,
                  ]}
                  onPress={() =>
                    option.key === 'none'
                      ? update({ avatar_decoration: 'none' })
                      : requireAccess('avatar_decoration', option.key, () => update({ avatar_decoration: option.key as AvatarDecoration }))
                  }
                  activeOpacity={0.8}
                >
                  <Ionicons name={option.icon as any} size={15} color={active ? accent : colors.textSecondary} />
                  <Text style={[styles.chipText, active && { color: colors.textPrimary }]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Titre ── */}
          <Text style={styles.sectionTitle}>Titre</Text>
          <Text style={styles.sectionHint}>Une ligne affichée juste sous ton pseudo.</Text>
          <TextInput
            style={styles.titleInput}
            value={draft.profile_title || ''}
            onChangeText={(value) => update({ profile_title: value })}
            placeholder="Ex. Dev · Kinshasa"
            placeholderTextColor={colors.textMuted}
            maxLength={PROFILE_TITLE_MAX}
          />
          <Text style={styles.counter}>
            {(draft.profile_title || '').length}/{PROFILE_TITLE_MAX}
          </Text>

          {/* ── À propos ── */}
          <Text style={styles.sectionTitle}>À propos de moi</Text>
          <TextInput
            style={styles.aboutInput}
            value={draft.about_me || ''}
            onChangeText={(value) => update({ about_me: value })}
            placeholder="Quelques lignes affichées sur ton profil"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={300}
          />
          <Text style={styles.counter}>{(draft.about_me || '').length}/300</Text>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: accent }, saving && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
          </TouchableOpacity>
          <Text style={styles.tierNote}>
            Palier actuel : {tier === 'pro' ? 'Pro' : tier === 'plus' ? 'Plus' : 'Gratuit'}
          </Text>
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: { padding: 4, minWidth: 60 },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.display },
  resetText: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.semibold, textAlign: 'right' },

  content: { padding: 16, paddingBottom: 120 },

  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: withAlpha(colors.gold, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.gold, 0.4),
    marginBottom: 16,
  },
  lockText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },

  previewCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 22,
  },
  previewBanner: { height: PREVIEW_BANNER, backgroundColor: colors.surfaceAlt },
  previewBody: { padding: 16, paddingTop: 0, alignItems: 'center' },
  /** `relative` : les calques de parure se posent en absolu autour. */
  previewAvatarWrap: { position: 'relative', marginTop: -36, marginBottom: 10 },
  previewName: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.display },
  previewHandle: { fontSize: 14, marginTop: 2, fontFamily: fonts.semibold },
  previewAbout: {
    marginTop: 12,
    alignSelf: 'stretch',
    paddingLeft: 10,
    borderLeftWidth: 3,
  },
  previewAboutText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  previewBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  previewBtnText: { color: '#fff', fontSize: 14, fontFamily: fonts.bold },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.semibold, marginTop: 18, marginBottom: 8 },
  sectionHint: { color: colors.textMuted, fontSize: 12, marginTop: -4, marginBottom: 10 },

  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: '#fff' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipIcon: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipDisabled: { opacity: 0.45 },
  chipText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.medium },

  proBadge: {
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: withAlpha(colors.gold, 0.18),
  },
  proBadgeText: { color: colors.gold, fontSize: 10, fontFamily: fonts.bold },

  titleInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.textPrimary,
    fontSize: 14,
  },
  aboutInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 14,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  counter: { color: colors.textMuted, fontSize: 11, textAlign: 'right', marginTop: 6 },

  saveBtn: { marginTop: 24, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.bold },
  tierNote: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 10 },
});
