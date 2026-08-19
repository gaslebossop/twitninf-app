import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useReadingLanguage } from '../contexts/ReadingLanguageContext';
import StartupStepPage from './StartupStepPage';
import { colors, fonts } from '../theme';

interface ReadingLanguageModalProps {
  visible: boolean;
  /** Absent = modale d'accueil : on ne peut pas la fermer sans choisir. */
  onClose?: () => void;
}

/**
 * Choix de la langue de lecture.
 *
 * Sert deux fois : à la première connexion (sans bouton de fermeture — le
 * choix est court et se change ensuite dans les paramètres), et depuis les
 * paramètres (fermable).
 */
export default function ReadingLanguageModal({ visible, onClose }: ReadingLanguageModalProps) {
  const { languages, preferredLanguage, choose, saving } = useReadingLanguage();
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  /**
   * Rien de monté tant que la modale est fermée.
   *
   * Ce composant est branché à la racine de l'app (choix à la première
   * connexion) : un Modal natif laissé monté en `visible={false}` y pose une
   * vue transparente au-dessus de toute l'application, qui avale les appuis
   * sans rien afficher.
   */
  if (!visible) return null;

  const select = async (code: string) => {
    setPendingCode(code);
    const saved = await choose(code);
    setPendingCode(null);
    if (saved) onClose?.();
  };

  const rows = languages.map((language) => {
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
  });

  // Sans `onClose`, c'est l'étape de démarrage : une page plein écran dans
  // l'esthétique du reste de l'app. Depuis les réglages, ça reste une feuille
  // qui remonte du bas, cohérente avec les autres sélecteurs de cet écran.
  if (!onClose) {
    return (
      <StartupStepPage
        visible={visible}
        icon="language"
        title="Dans quelle langue veux-tu lire ?"
        subtitle="Les publications traduites par leur auteur s'afficheront directement dans cette langue. Tu pourras en changer à tout moment dans les paramètres."
      >
        {rows}
      </StartupStepPage>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => onClose?.()}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.icon}>
              <Ionicons name="language" size={22} color={colors.accent} />
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Dans quelle langue veux-tu lire ?</Text>
          <Text style={styles.subtitle}>
            Les publications traduites par leur auteur s'afficheront directement dans cette langue.
            Tu pourras en changer à tout moment dans les paramètres.
          </Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {rows}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '82%',
    paddingTop: 16,
    paddingBottom: 26,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surfaceAlt,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.accentMuted,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 21,
    letterSpacing: -0.4,
    fontFamily: fonts.display,
  },
  subtitle: {
    marginTop: 7,
    marginBottom: 14,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
  },
  list: {
    flexGrow: 0,
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
  rowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  rowPressed: {
    opacity: 0.75,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
  rowHint: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.regular,
  },
});
