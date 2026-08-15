import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
// La version de react-native (core) ne pose aucun inset sur Android — seule
// celle de react-native-safe-area-context protège le haut de l'écran partout.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, withAlpha , statusBarStyle} from '../theme';
import { ScreenBackground, BackButton, ScreenSkeleton, Tappable } from '../components/ui';
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
  isTitleLocked,
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

const PREVIEW_AVATAR = 64;
const PREVIEW_BANNER = 72;

/**
 * Les trois familles de réglages.
 *
 * Il y en avait neuf, empilées, chacune sous un titre de 15 px : la page
 * ressemblait à un écran de réglages système, pas à l'endroit où on fabrique
 * son profil. Neuf titres, c'est neuf décisions annoncées d'emblée, et aucune
 * hiérarchie entre « Couleur d'accent » et « À propos de moi ».
 *
 * Le regroupement n'est pas cosmétique, il suit l'ordre dans lequel on
 * fabrique réellement quelque chose : on choisit d'abord SA COULEUR, puis ce
 * qu'elle HABILLE, puis ce qu'on DIT. Les couleurs viennent en premier parce
 * que tout le reste s'en sert.
 */
const FAMILIES = [
  { key: 'colors', label: 'Couleurs', icon: 'color-palette-outline' },
  { key: 'dressing', label: 'Habillage', icon: 'sparkles-outline' },
  { key: 'identity', label: 'Identité', icon: 'person-outline' },
] as const;

type FamilyKey = (typeof FAMILIES)[number]['key'];

/**
 * Une pastille de choix. Six blocs quasi identiques la réécrivaient chacun de
 * leur côté ; ils divergeaient déjà (l'un gérait une police, l'autre une
 * teinte propre, un troisième ni l'un ni l'autre).
 */
function Choice({
  label,
  icon,
  active,
  locked,
  tint,
  fontFamily,
  onPress,
}: {
  label: string;
  icon?: string;
  active: boolean;
  locked?: boolean;
  tint: string;
  fontFamily?: string | null;
  onPress: () => void;
}) {
  return (
    <Tappable
      haptic="select"
      onPress={onPress}
      style={[
        styles.chip,
        icon ? styles.chipIcon : null,
        active && { borderColor: tint, backgroundColor: withAlpha(tint, 0.14) },
        locked && styles.chipDisabled,
      ]}
    >
      {icon ? (
        <Ionicons name={icon as any} size={15} color={active ? tint : colors.textSecondary} />
      ) : null}
      <Text
        style={[
          styles.chipText,
          fontFamily ? { fontFamily } : null,
          active && { color: colors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </Tappable>
  );
}

/** Un bloc de réglage : titre, éventuelle explication, éventuel palier. */
function Section({
  title,
  hint,
  pro,
  first,
  children,
}: {
  title: string;
  hint?: string;
  pro?: boolean;
  /** Le premier bloc d'une famille ne prend pas la marge haute. */
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={first ? undefined : styles.section}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {pro && (
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>PRO</Text>
          </View>
        )}
      </View>
      {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
      {children}
    </View>
  );
}

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
  const [family, setFamily] = useState<FamilyKey>('colors');

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
          <Tappable onPress={reset} hitSlop={10} style={styles.headerBtn}>
            <Text style={styles.resetText}>Réinit.</Text>
          </Tappable>
        </View>

        {!canCustomize && (
          <View style={styles.lockBanner}>
            <Ionicons name="lock-closed" size={15} color={colors.gold} />
            <Text style={styles.lockText}>
              Essaie tout librement — l'enregistrement demandera un abonnement Plus ou Pro.
            </Text>
          </View>
        )}

        {/* ── L'aperçu, COLLÉ ──
            C'est l'objet qu'on fabrique : il ne doit jamais quitter l'écran.
            Il est donc hors du défilement, et pas en tête de contenu comme
            avant — dès la deuxième section, on réglait à l'aveugle.

            Le thème passe DERRIÈRE toute la carte et la bannière garde ses
            couleurs, exactement comme sur un vrai profil. */}
        <View style={styles.previewDock}>
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
            </View>
          </View>
        </View>

        {/* ── Les trois familles ── */}
        <View style={styles.familyBar}>
          {FAMILIES.map((item) => {
            const active = family === item.key;
            return (
              <Tappable
                key={item.key}
                haptic="select"
                onPress={() => setFamily(item.key)}
                style={[styles.familyTab, active && { backgroundColor: withAlpha(accent, 0.16) }]}
              >
                <Ionicons
                  name={item.icon as any}
                  size={15}
                  color={active ? accent : colors.textSecondary}
                />
                <Text style={[styles.familyText, active && { color: colors.textPrimary }]}>
                  {item.label}
                </Text>
              </Tappable>
            );
          })}
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* `style={flex}` et non seulement `contentContainerStyle` : sans
              lui, la liste se dimensionne sur son contenu et pousse la barre
              d'engagement hors de l'écran dès que la famille est longue. */}
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {family === 'colors' && (
              <>
                <Section
                  first
                  title="Couleur d'accent"
                  hint="La couleur principale : nom, boutons, parures, thème."
                >
                  <View style={styles.swatchGrid}>
                    {ACCENT_PRESETS.map((color) => (
                      <Tappable
                        key={`accent-${color}`}
                        haptic="select"
                        onPress={() => update({ accent_color: color })}
                        style={[
                          styles.swatch,
                          { backgroundColor: color },
                          draft.accent_color === color && styles.swatchActive,
                        ]}
                      >
                        {draft.accent_color === color ? (
                          <Ionicons name="checkmark" size={16} color="#000" />
                        ) : null}
                      </Tappable>
                    ))}
                  </View>
                </Section>

                <Section
                  title="Couleur secondaire"
                  hint="Le second ton des dégradés. Laissée de côté, elle reprend l'accent."
                >
                  <View style={styles.swatchGrid}>
                    {ACCENT_PRESETS.map((color) => (
                      <Tappable
                        key={`secondary-${color}`}
                        haptic="select"
                        onPress={() => update({ secondary_color: color })}
                        style={[
                          styles.swatch,
                          { backgroundColor: color },
                          draft.secondary_color === color && styles.swatchActive,
                        ]}
                      >
                        {draft.secondary_color === color ? (
                          <Ionicons name="checkmark" size={16} color="#000" />
                        ) : null}
                      </Tappable>
                    ))}
                  </View>
                </Section>
              </>
            )}

            {family === 'dressing' && (
              <>
                <Section
                  first
                  title="Thème de profil"
                  hint="Le fond habille toute la page. Ta bannière reste intacte."
                >
                  <View style={styles.chipRow}>
                    {PROFILE_THEMES.map((option) => (
                      <Choice
                        key={option.key}
                        label={option.label}
                        tint={accent}
                        active={(draft.banner_style || 'none') === option.key}
                        onPress={() => update({ banner_style: option.key as BannerStyle })}
                      />
                    ))}
                  </View>
                </Section>

                <Section title="Intensité" hint="Le même thème, plus ou moins présent.">
                  <View style={styles.chipRow}>
                    {THEME_INTENSITIES.map((option) => (
                      <Choice
                        key={option.key}
                        label={option.label}
                        tint={accent}
                        active={(draft.theme_intensity || 'normal') === option.key}
                        onPress={() => update({ theme_intensity: option.key as ThemeIntensity })}
                      />
                    ))}
                  </View>
                </Section>

                <Section
                  title="Ambiance"
                  pro={!canUseDecorations}
                  hint="Des particules qui traversent le fond, en continu."
                >
                  <View style={styles.chipRow}>
                    {PROFILE_EFFECTS.map((option) => (
                      <Choice
                        key={option.key}
                        label={option.label}
                        icon={option.icon}
                        tint={accent}
                        active={(draft.profile_effect || 'none') === option.key}
                        locked={!allows('profile_effect', option.key) && option.key !== 'none'}
                        onPress={() =>
                          option.key === 'none'
                            ? update({ profile_effect: 'none' })
                            : requireAccess('profile_effect', option.key, () =>
                                update({ profile_effect: option.key as ProfileEffect }),
                              )
                        }
                      />
                    ))}
                  </View>
                </Section>

                <Section
                  title="Parure d'avatar"
                  pro={!canUseDecorations}
                  hint="Animée en continu, aux couleurs choisies plus haut."
                >
                  <View style={styles.chipRow}>
                    {AVATAR_DECORATIONS.map((option) => (
                      <Choice
                        key={option.key}
                        label={option.label}
                        icon={option.icon}
                        tint={accent}
                        active={(draft.avatar_decoration || 'none') === option.key}
                        locked={!allows('avatar_decoration', option.key) && option.key !== 'none'}
                        onPress={() =>
                          option.key === 'none'
                            ? update({ avatar_decoration: 'none' })
                            : requireAccess('avatar_decoration', option.key, () =>
                                update({ avatar_decoration: option.key as AvatarDecoration }),
                              )
                        }
                      />
                    ))}
                  </View>
                </Section>
              </>
            )}

            {family === 'identity' && (
              <>
                <Section first title="Police du nom" pro={!canUseDecorations}>
                  <View style={styles.chipRow}>
                    {NAME_FONTS.map((option) => (
                      <Choice
                        key={option.key}
                        label={option.label}
                        tint={accent}
                        fontFamily={resolveDisplayNameFontFamily(option.key)}
                        active={(draft.name_font || 'system') === option.key}
                        locked={!allows('name_font', option.key) && option.key !== 'system'}
                        onPress={() =>
                          option.key === 'system'
                            ? update({ name_font: 'system' })
                            : requireAccess('name_font', option.key, () =>
                                update({ name_font: option.key as NameFont }),
                              )
                        }
                      />
                    ))}
                  </View>
                </Section>

                <Section title="Lumière du nom" pro={!canUseDecorations}>
                  <View style={styles.chipRow}>
                    {NAME_EFFECTS.map((option) => {
                      // « Certifié » ne suit pas le palier payant : c'est le
                      // badge qui l'ouvre. Un compte Pro non certifié ne l'a donc pas.
                      const certifOption = option.key === 'certified';
                      const unlocked =
                        option.key === 'none' ||
                        (certifOption ? canUseCertified : canUseDecorations);
                      // La pastille prend la couleur du badge : elle montre ce qu'on achète.
                      const tint = certifOption ? certifColors.from : accent;
                      return (
                        <Choice
                          key={option.key}
                          label={option.label}
                          icon={option.icon}
                          tint={tint}
                          active={(draft.name_effect || 'none') === option.key}
                          locked={!unlocked}
                          onPress={() => {
                            if (option.key === 'none') return update({ name_effect: 'none' });
                            if (certifOption) {
                              if (!canUseCertified) {
                                toast.error('Compte certifié requis', {
                                  description:
                                    "Cet effet reprend la couleur de ton badge de certification : il faut être certifié pour l'utiliser.",
                                });
                                return;
                              }
                              return update({ name_effect: 'certified' });
                            }
                            requirePro(() => update({ name_effect: option.key as NameEffect }));
                          }}
                        />
                      );
                    })}
                  </View>
                </Section>

                <Section title="Taille du pseudo" pro={!canUseDecorations}>
                  <View style={styles.chipRow}>
                    {NAME_SIZES.map((option) => (
                      <Choice
                        key={option.key}
                        label={option.label}
                        tint={accent}
                        active={(draft.name_size || 'normal') === option.key}
                        locked={!canUseDecorations && option.key !== 'normal'}
                        onPress={() =>
                          option.key === 'normal'
                            ? update({ name_size: 'normal' })
                            : requirePro(() => update({ name_size: option.key as NameSize }))
                        }
                      />
                    ))}
                  </View>
                </Section>

                <Section title="Titre" hint="Une ligne affichée juste sous ton pseudo.">
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

                  {/* Certains titres se GAGNENT et ne s'écrivent pas. On le dit
                      pendant la saisie, jamais après : découvrir au moment de
                      l'enregistrement que son titre a été refusé est la mauvaise
                      façon de l'apprendre. Le serveur reste seul juge. */}
                  {isTitleLocked(draft, draft.profile_title || '') && (
                    <Text style={styles.titleLocked}>
                      Ce titre se gagne pendant un événement — il ne peut pas être écrit.
                    </Text>
                  )}

                  {/* Les titres gagnés, posables en un tap. */}
                  {(draft.titles ?? []).length > 0 && (
                    <View style={styles.titleChips}>
                      {(draft.titles ?? []).map((title) => (
                        <Choice
                          key={title}
                          label={title}
                          tint={accent}
                          active={draft.profile_title === title}
                          onPress={() => update({ profile_title: title })}
                        />
                      ))}
                    </View>
                  )}
                </Section>

                <Section title="À propos de moi">
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
                </Section>
              </>
            )}
          </ScrollView>

          {/* ── L'engagement, collé en bas ──
              Il était au pied d'un défilement de neuf sections : il fallait
              parcourir tout l'écran pour valider un changement de couleur. */}
          <View style={styles.actionBar}>
            <Text style={styles.tierNote}>
              Palier {tier === 'pro' ? 'Pro' : tier === 'plus' ? 'Plus' : 'Gratuit'}
            </Text>
            <Tappable
              onPress={save}
              disabled={saving}
              style={[styles.saveBtn, { backgroundColor: accent }, saving && styles.saveBtnDisabled]}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
            </Tappable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  titleLocked: {
    color: colors.red,
    fontFamily: fonts.medium,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 6,
  },
  titleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  container: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },

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

  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 },

  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: withAlpha(colors.gold, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.gold, 0.4),
  },
  lockText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },

  /** Le quai de l'aperçu : hors du défilement, donc toujours à l'écran. */
  previewDock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  previewCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  previewBanner: { height: PREVIEW_BANNER, backgroundColor: colors.surfaceAlt },
  previewBody: { paddingHorizontal: 16, paddingBottom: 14, alignItems: 'center' },
  /** `relative` : les calques de parure se posent en absolu autour. */
  previewAvatarWrap: { position: 'relative', marginTop: -32, marginBottom: 8 },
  previewName: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.display },
  previewHandle: { fontSize: 14, marginTop: 2, fontFamily: fonts.semibold },

  /**
   * La barre des familles. Posée entre l'aperçu et les réglages : c'est la
   * seule navigation de l'écran, et elle doit rester lisible en un coup d'œil
   * — d'où trois onglets et pas quatre.
   */
  familyBar: {
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 16,
    padding: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  familyTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  familyText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.semibold },

  section: { marginTop: 20 },
  /** L'espacement est porté par la RANGÉE, pas par le titre : sinon la
      pastille PRO, alignée au centre, se décale de la marge du titre. */
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.semibold },
  sectionHint: { color: colors.textMuted, fontSize: 12, marginTop: -2, marginBottom: 10 },

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

  /**
   * La barre d'engagement. Posée sur un liseré plutôt que sur un fond opaque :
   * le contenu doit se voir passer dessous quand on fait défiler, sinon la
   * barre a l'air d'être une autre page collée en bas.
   */
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  saveBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.bold },
  tierNote: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium },
});
