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
import { apiService } from '../services';
import { TweetTranslation } from '../types/api';
import { colors, fonts } from '../theme';

interface TweetLanguageSwitcherProps {
  tweetId: string;
  /** Traduction actuellement affichée par le parent — `null` = version originale. */
  active: TweetTranslation | null;
  onSelect: (translation: TweetTranslation | null) => void;
}

/**
 * Sélecteur de langue d'un tweet (« Traduction bêta »).
 *
 * Le composant ne détient QUE l'état du sélecteur (liste chargée, feuille
 * ouverte) ; la traduction retenue vit chez le parent, parce que c'est lui qui
 * décide où le texte traduit s'affiche — la carte du fil et l'écran de détail
 * ne rendent pas le contenu au même endroit.
 *
 * Les traductions sont chargées à la PREMIÈRE ouverture seulement : les faire
 * voyager avec chaque page de tweets multiplierait par onze le poids du fil.
 */
export default function TweetLanguageSwitcher({
  tweetId,
  active,
  onSelect,
}: TweetLanguageSwitcherProps) {
  const [translations, setTranslations] = useState<TweetTranslation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const open = async () => {
    setVisible(true);
    if (translations !== null || loading) return;

    setLoading(true);
    try {
      const response = await apiService.getTweetTranslations(tweetId);
      setTranslations(response?.success ? (response.data?.translations || []) : []);
    } catch (error) {
      console.warn('Traductions indisponibles:', error);
      setTranslations([]);
    } finally {
      setLoading(false);
    }
  };

  const choose = (translation: TweetTranslation | null) => {
    onSelect(translation);
    setVisible(false);
  };

  return (
    <>
      <View style={styles.bar}>
        <TouchableOpacity
          style={styles.button}
          onPress={open}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Changer la langue de ce tweet"
        >
          <Ionicons name="language" size={15} color={colors.accent} />
          <Text style={styles.buttonText}>{active ? active.label : 'Traduire'}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.accent} />
        </TouchableOpacity>

        {active && (
          <TouchableOpacity onPress={() => onSelect(null)} activeOpacity={0.7} accessibilityRole="button">
            <Text style={styles.reset}>Voir l'original</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Une traduction automatique s'annonce : le lecteur doit pouvoir
          attribuer une maladresse à la machine, pas à l'auteur. */}
      {active && <Text style={styles.notice}>Traduit automatiquement · bêta</Text>}

      {/*
        Monté SEULEMENT à l'ouverture, et pas simplement masqué par
        `visible={false}`. Ce composant est rendu une fois par ligne du fil :
        laisser un Modal natif monté par tweet empile des dizaines de vues
        superposées, ce qui fige le fil et intercepte les appuis sur les
        boutons en dessous.
      */}
      {visible && (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Langue du tweet</Text>

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : translations && translations.length === 0 ? (
              <Text style={styles.empty}>
                Les traductions de ce tweet ne sont pas encore prêtes. Réessaie dans un moment.
              </Text>
            ) : (
              <ScrollView style={styles.list}>
                <TouchableOpacity style={styles.row} onPress={() => choose(null)} activeOpacity={0.7}>
                  <Text style={styles.label}>Version originale</Text>
                  {!active && <Ionicons name="checkmark" size={17} color={colors.accent} />}
                </TouchableOpacity>

                {(translations || []).map((item) => (
                  <TouchableOpacity
                    key={item.language}
                    style={styles.row}
                    onPress={() => choose(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.label}>{item.label}</Text>
                    {active?.language === item.language && (
                      <Ionicons name="checkmark" size={17} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
  },
  buttonText: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: fonts.semibold,
  },
  reset: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.medium,
  },
  notice: {
    marginTop: 7,
    color: colors.textMuted,
    fontSize: 10.5,
    fontFamily: fonts.medium,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  sheet: {
    maxHeight: '70%',
    paddingTop: 18,
    paddingBottom: 28,
    paddingHorizontal: 20,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.surfaceAlt,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    marginBottom: 10,
    fontFamily: fonts.bold,
  },
  loading: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: 18,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
  },
  list: {
    marginTop: 4,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 14.5,
    fontFamily: fonts.medium,
  },
});
