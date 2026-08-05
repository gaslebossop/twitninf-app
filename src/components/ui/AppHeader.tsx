import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';
import { useHeaderMetrics } from '../../hooks/useHeaderMetrics';

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

interface AppHeaderProps {
  navigation?: any;
  title: string;
  subtitle?: string;
  badge?: string;
  right?: React.ReactNode;
  onHelp?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

function isOwnedByTab(navigation?: any) {
  return navigation?.getState?.()?.type === 'tab';
}

export function shouldShowBackButton(navigation?: any) {
  return !isOwnedByTab(navigation) && !!navigation?.canGoBack?.();
}

/** Header unique de l'app, aligné sur la Revue communautaire. */
export default function AppHeader({ navigation, title, subtitle, badge, right, onHelp, style, contentStyle }: AppHeaderProps) {
  const { top } = useHeaderMetrics();
  const showBack = shouldShowBackButton(navigation);

  return (
    <View style={[styles.header, { paddingTop: top + 10 }, style]}>
      {showBack ? (
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.sideBtn} hitSlop={hitSlop} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.sideBtnCollapsed} />
      )}

      <View style={[styles.titleBox, contentStyle]}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {badge ? (
            <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      {right ?? (onHelp ? (
        <TouchableOpacity onPress={onHelp} style={styles.sideBtn} hitSlop={hitSlop} activeOpacity={0.7}>
          <Ionicons name="help-circle-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      ) : <View style={styles.sideBtn} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sideBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sideBtnCollapsed: { width: 0, height: 40 },
  titleBox: { flex: 1, alignItems: 'center', minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '100%' },
  title: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.heading },
  subtitle: { color: colors.textMuted, fontSize: 11.5, fontFamily: fonts.regular, marginTop: 2 },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: colors.accentMuted,
  },
  badgeText: { color: colors.accentBright, fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 0.5 },
});
