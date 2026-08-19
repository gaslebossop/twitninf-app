import { fonts } from '../theme';
import React from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

interface IosNativeBadgeProps {
  size?: number;
  showText?: boolean;
}

export default function IosNativeBadge({ size = 18, showText = false }: IosNativeBadgeProps) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#434343']}
        style={[styles.badge, { width: size * 1.2, height: size * 1.2, borderRadius: size * 0.6 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons name="logo-apple" size={size * 0.8} color="#FFFFFF" />
      </LinearGradient>
      {showText && (
        <Text style={styles.text}>Application iOS</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  text: {
    color: '#8899a6',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500', fontFamily: fonts.medium,
  },
});
