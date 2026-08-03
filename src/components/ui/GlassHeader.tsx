import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';
import { useHeaderMetrics } from '../../hooks/useHeaderMetrics';

interface GlassHeaderProps {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Grand titre façon héros (aligné à gauche, Jakarta ExtraBold). */
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * En-tête plat de la DA « Pulse » — fond uni, filet bas net, titre Jakarta.
 */
export default function GlassHeader({
  title,
  subtitle,
  onBack,
  right,
  large = false,
  style,
}: GlassHeaderProps) {
  const { top } = useHeaderMetrics();

  return (
    <View style={[styles.container, { paddingTop: top }, style]}>
      <View style={[styles.row, large && styles.rowLarge]}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          !large && <View style={styles.sideSpacer} />
        )}

        <View style={[styles.titleWrap, large && styles.titleWrapLarge]}>
          {title ? (
            <Text style={[styles.title, large && styles.titleLarge]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.rightWrap}>{right ?? (!large ? <View style={styles.sideSpacer} /> : null)}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    zIndex: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    height: 52,
  },
  rowLarge: {
    height: 64,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 4,
  },
  sideSpacer: {
    width: 38,
    height: 38,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  titleWrapLarge: {
    alignItems: 'flex-start',
    paddingLeft: 2,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 16,
    color: colors.textPrimary,
  },
  titleLarge: {
    fontFamily: fonts.displayHeavy,
    fontSize: 28,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  rightWrap: {
    minWidth: 38,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
