import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, statusBarStyle, themePreviews } from '../theme';
import type { ThemeName } from '../theme';
import { AppHeader, ScreenBackground } from '../components/ui';
import { toast } from '../components/ui/Toast';
import {
  loadThemePreference,
  saveThemeAndReload,
  type ThemePreference,
} from '../theme/themePreference';

/**
 * Aperçu d'un thème : une maquette miniature de l'app, peinte avec la palette
 * du thème concerné.
 *
 * Rendu en vues natives plutôt qu'en image : une capture d'écran se périmerait
 * à la première retouche de la palette, alors que cette maquette lit les mêmes
 * jetons que l'application et reste donc juste par construction.
 */
function ThemePreview({ name }: { name: ThemeName }) {
  const p = themePreviews[name];

  return (
    <View style={[styles.preview, { backgroundColor: p.bg, borderColor: p.border }]}>
      {/* En-tête */}
      <View style={styles.previewHeader}>
        <View style={[styles.previewDot, { backgroundColor: p.accent }]} />
        <View style={[styles.previewBar, { backgroundColor: p.textPrimary, width: 42 }]} />
        <View style={{ flex: 1 }} />
        <View style={[styles.previewBar, { backgroundColor: p.textMuted, width: 14 }]} />
      </View>

      {/* Publication */}
      <View style={[styles.previewCard, { backgroundColor: p.surface, borderColor: p.border }]}>
        <View style={styles.previewRow}>
          <View style={[styles.previewAvatar, { backgroundColor: p.accent }]} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={[styles.previewBar, { backgroundColor: p.textPrimary, width: '55%' }]} />
            <View style={[styles.previewBar, { backgroundColor: p.textMuted, width: '35%' }]} />
          </View>
        </View>
        <View style={{ gap: 4, marginTop: 8 }}>
          <View style={[styles.previewBar, { backgroundColor: p.textSecondary, width: '92%' }]} />
          <View style={[styles.previewBar, { backgroundColor: p.textSecondary, width: '70%' }]} />
        </View>
        <View style={[styles.previewRow, { marginTop: 10, gap: 14 }]}>
          <View style={[styles.previewPill, { backgroundColor: p.accentMuted }]} />
          <View style={[styles.previewPill, { backgroundColor: p.overlayMedium }]} />
          <View style={[styles.previewPill, { backgroundColor: p.overlayMedium }]} />
        </View>
      </View>

      {/* Bouton d'action */}
      <View style={[styles.previewButton, { backgroundColor: p.accent }]}>
        <View style={[styles.previewBar, { backgroundColor: p.onAccent, width: 34 }]} />
      </View>

      {/* Barre d'onglets */}
      <View style={[styles.previewTabs, { borderTopColor: p.border, backgroundColor: p.bgElevated }]}>
        <View style={[styles.previewTab, { backgroundColor: p.accent }]} />
        <View style={[styles.previewTab, { backgroundColor: p.textMuted }]} />
        <View style={[styles.previewTab, { backgroundColor: p.textMuted }]} />
        <View style={[styles.previewTab, { backgroundColor: p.textMuted }]} />
      </View>
    </View>
  );
}

interface Props {
  navigation: any;
}

const ThemeScreen: React.FC<Props> = ({ navigation }) => {
  const [current, setCurrent] = useState<ThemePreference | null>(null);
  const [applying, setApplying] = useState<ThemePreference | null>(null);

  React.useEffect(() => {
    loadThemePreference().then(setCurrent);
  }, []);

  const choose = async (preference: ThemePreference) => {
    if (applying || preference === current) return;
    setApplying(preference);

    const reloaded = await saveThemeAndReload(preference);
    if (!reloaded) {
      // Le rechargement automatique n'existe pas partout (Expo Go, build de
      // production sans mises à jour). Le choix est bien enregistré, il ne
      // manque que le redémarrage.
      setApplying(null);
      setCurrent(preference);
      toast.info('Thème enregistré', {
        description: "Ferme puis rouvre l'application pour l'appliquer.",
      });
    }
    // Si le rechargement part, l'écran disparaît : rien à faire de plus.
  };

  const options: { key: ThemeName; label: string; hint: string }[] = [
    { key: 'dark', label: 'Sombre', hint: 'Noir profond, magenta électrique' },
    { key: 'light', label: 'Clair', hint: 'Fond blanc, contrastes appuyés' },
  ];

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Thème" />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            Choisis l'apparence de l'application. Les deux aperçus ci-dessous utilisent les
            vraies couleurs de chaque thème.
          </Text>

          <View style={styles.previewRowOuter}>
            {options.map((option) => {
              const selected = current === option.key;
              const busy = applying === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => choose(option.key)}
                  activeOpacity={0.85}
                  disabled={!!applying}
                >
                  <ThemePreview name={option.key} />

                  <View style={styles.optionFooter}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionLabel}>{option.label}</Text>
                      <Text style={styles.optionHint} numberOfLines={2}>
                        {option.hint}
                      </Text>
                    </View>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={selected ? colors.accent : colors.textMuted}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.systemRow, current === 'system' && styles.systemRowSelected]}
            onPress={() => choose('system')}
            activeOpacity={0.85}
            disabled={!!applying}
          >
            <Ionicons name="phone-portrait-outline" size={20} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.optionLabel}>Suivre le système</Text>
              <Text style={styles.optionHint}>
                L'apparence choisie dans les réglages de l'appareil
              </Text>
            </View>
            {applying === 'system' ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons
                name={current === 'system' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={current === 'system' ? colors.accent : colors.textMuted}
              />
            )}
          </TouchableOpacity>

          <Text style={styles.note}>
            L'application redémarre pour appliquer le thème : les styles de tous les écrans
            sont construits une seule fois au lancement.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  intro: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.regular,
    lineHeight: 20,
  },

  previewRowOuter: { flexDirection: 'row', gap: 12 },

  option: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
    gap: 10,
  },
  optionSelected: { borderColor: colors.accent },

  optionFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionLabel: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.bold },
  optionHint: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },

  // ── Maquette d'aperçu ──────────────────────────────────────────────
  preview: {
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 8,
    gap: 8,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewDot: { width: 12, height: 12, borderRadius: 6 },
  previewBar: { height: 5, borderRadius: 3 },
  previewCard: { borderRadius: 8, borderWidth: 1, padding: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewAvatar: { width: 18, height: 18, borderRadius: 9 },
  previewPill: { height: 6, width: 18, borderRadius: 3 },
  previewButton: {
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTabs: {
    marginTop: 'auto',
    marginHorizontal: -8,
    marginBottom: -8,
    paddingVertical: 8,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  previewTab: { width: 14, height: 5, borderRadius: 3 },

  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  systemRowSelected: { borderColor: colors.accent },

  note: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.regular,
    lineHeight: 17,
    marginTop: 4,
  },
});

export default ThemeScreen;
