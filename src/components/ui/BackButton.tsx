import React from 'react';
import { TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

interface BackButtonProps {
  navigation: any;
  style?: StyleProp<ViewStyle>;
}

/**
 * Bouton retour UNIQUE de l'app — style repris tel quel de MessagesScreen
 * (icône nue, sans fond ni bordure). Toutes les autres pages avaient chacune
 * leur propre variante (tailles, fonds, icônes différentes) ; celui-ci est
 * la seule source désormais.
 *
 * Ne s'affiche PAS si l'écran est ouvert comme onglet de la navbar : revenir
 * en arrière n'a alors aucun sens. Seul le type du navigateur qui possède
 * CET écran fait foi — `navigation.canGoBack()` seul remonte jusqu'à un
 * navigateur parent et peut renvoyer vrai à tort sur un onglet.
 * Sur les écrans de navbar, on ne réserve plus une fausse place invisible :
 * la flèche est réellement absente. Les headers qui ont besoin d'un centrage
 * strict doivent utiliser `AppHeader`, qui gère explicitement ses colonnes.
 */
export default function BackButton({ navigation, style }: BackButtonProps) {
  const isTabScreen = navigation?.getState?.()?.type === 'tab';
  const canGoBack = !isTabScreen && !!navigation?.canGoBack?.();

  if (!canGoBack) {
    return null;
  }

  return (
    <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hitSlop} style={[styles.button, style]}>
      <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
});
