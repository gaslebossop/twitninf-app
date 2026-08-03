import { fonts } from '../theme';
import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  View,
  Text,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface FloatingActionButtonProps {
  onPress: () => void;
  icon?: string;
  label?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'accent';
}

export default function FloatingActionButton({
  onPress,
  icon = 'add',
  label,
  size = 'medium',
  variant = 'primary',
}: FloatingActionButtonProps) {
  const getSize = () => {
    switch (size) {
      case 'small':
        return { width: 48, height: 48, borderRadius: 24, iconSize: 20 };
      case 'large':
        return { width: 64, height: 64, borderRadius: 32, iconSize: 32 };
      default:
        return { width: 56, height: 56, borderRadius: 28, iconSize: 28 };
    }
  };

  const getColors = () => {
    switch (variant) {
      case 'secondary':
        return ['#3D63D9', '#3354C4'];
      case 'accent':
        return ['#4F7CFF', '#3D63D9'];
      default:
        return ['#4F7CFF', '#3D63D9'];
    }
  };

  const { width: buttonWidth, height: buttonHeight, borderRadius, iconSize } = getSize();
  const colors = getColors();

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          width: buttonWidth,
          height: buttonHeight,
          borderRadius,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Effet de lueur externe */}
      <View style={[styles.glow, { borderRadius }]} />
      
      {/* Fond principal avec gradient */}
      <LinearGradient
        colors={colors}
        style={[styles.gradient, { borderRadius }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Bordure interne avec effet de flou */}
        <BlurView intensity={20} style={[styles.innerBlur, { borderRadius: borderRadius - 2 }]} />
        
        {/* Contenu du bouton */}
        <View style={styles.content}>
          <Ionicons name={icon as any} size={iconSize} color="#ffffff" />
          {label && (
            <Text style={styles.label}>{label}</Text>
          )}
        </View>
      </LinearGradient>
      
      {/* Effet de brillance */}
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.3)', 'transparent']}
        style={[styles.shine, { borderRadius }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    elevation: 16,
    shadowColor: '#4F7CFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  glow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    backgroundColor: 'rgba(79, 124, 255, 0.25)',
    zIndex: -1,
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    position: 'relative',
  },
  innerBlur: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginTop: 2,
    textAlign: 'center',
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
});
