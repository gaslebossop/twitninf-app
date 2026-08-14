import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, statusBarStyle } from '../theme';
import { AppHeader, ScreenBackground } from '../components/ui';
import { useReadingLanguage } from '../contexts/ReadingLanguageContext';

interface ReadingLanguageScreenProps {
  navigation: any;
}

/**
 * Choix de la langue de lecture — page dediee depuis Reglages, remplace la
 * feuille qui remontait du bas. Le choix a la premiere connexion reste une
 * etape de demarrage a part (ReadingLanguageModal, sans onClose) : deux
 * contextes differents pour la meme preference.
 */
const ReadingLanguageScreen: React.FC<ReadingLanguageScreenProps> = ({ navigation }) => {
  const { languages, preferredLanguage, choose, saving } = useReadingLanguage();
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const select = async (code: string) => {
    setPendingCode(code);
    await choose(code);
    setPendingCode(null);
  };

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Langue de lecture" />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>
            Les publications traduites par leur auteur s'affichent directement dans cette langue.
          </Text>

          {languages.map((language) => {
            const active = preferredLanguage === language.code;
            const busy = saving && pendingCode === language.code;
            return (
              <Pressable
                key={language.code}
                style={({ pressed }) => [
                  styles.row,
                  active && styles.rowActive,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => select(language.code)}
                disabled={saving}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>{language.label}</Text>
                  {language.original && (
                    <Text style={styles.rowHint}>Langue d'origine des publications</Text>
                  )}
                </View>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : active ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
    marginBottom: 18,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  rowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  rowPressed: { opacity: 0.75 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.semibold },
  rowHint: { marginTop: 2, color: colors.textMuted, fontSize: 11, fontFamily: fonts.regular },
});

export default ReadingLanguageScreen;
