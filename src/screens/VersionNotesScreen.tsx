import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, statusBarStyle, withAlpha } from '../theme';
import { AppHeader, ScreenBackground } from '../components/ui';
import { APP_VERSION } from '../services/clientIdentity';
import { PATCH_NOTES } from '../data/patchNotes';

interface VersionNotesScreenProps {
  navigation: any;
}

/**
 * Historique complet des notes de version — remplace l'ancienne feuille qui
 * remontait du bas depuis les réglages. Une vraie page, comme le reste des
 * écrans accessibles depuis Réglages, pas une popup.
 */
const VersionNotesScreen: React.FC<VersionNotesScreenProps> = ({ navigation }) => {
  return (
    <ScreenBackground>
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Notes de version" subtitle={`Version ${APP_VERSION}`} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {PATCH_NOTES.map((note, index) => (
            // Cle sur la VERSION, pas sur la date : deux sorties le meme jour
            // se seraient ecrasees dans la liste.
            <View key={note.version} style={styles.entry}>
              <View style={styles.stampRow}>
                {/* La version d'abord, en chasse fixe : c'est l'identifiant de
                    la sortie, la date n'en est que le reperage. Les deux
                    etaient absents l'un de l'autre — l'ecran affichait des
                    dates sans jamais dire a quelle version elles
                    correspondaient. */}
                <Text style={styles.version}>{note.version}</Text>
                {index === 0 && (
                  <View style={styles.currentPill}>
                    <Text style={styles.currentPillText}>Version installée</Text>
                  </View>
                )}
              </View>
              <Text style={styles.date}>{note.date}</Text>
              <Text style={styles.entryTitle}>{note.title}</Text>
              {note.items.map((item) => (
                <View key={item} style={styles.itemRow}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.itemText}>{item}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  entry: { marginBottom: 26 },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  version: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  currentPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: withAlpha(colors.accent, 0.16),
  },
  currentPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  date: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  entryTitle: {
    fontSize: 17,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  itemRow: { flexDirection: 'row', marginBottom: 7, paddingRight: 4 },
  bullet: { color: colors.accent, fontSize: 14, marginRight: 8, lineHeight: 19 },
  itemText: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 19 },
});

export default VersionNotesScreen;
