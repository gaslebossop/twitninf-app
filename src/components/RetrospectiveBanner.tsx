/**
 * Entrée vers la rétrospective annuelle, sur son PROPRE profil uniquement.
 *
 * L'anneau autour de l'avatar est celui d'une story non vue : c'est le seul
 * indice dont les gens ont besoin pour comprendre qu'il y a quelque chose à
 * dérouler, et il évite d'inventer une nouvelle grammaire.
 *
 * Le composant ne rend rien hors du drapeau `profil.retrospective` — l'entrée
 * n'apparaît donc que pour les comptes de l'allowlist, et la route serveur
 * répond 404 aux autres de toute façon.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useFlag } from '../contexts/FeatureFlagContext';
import Avatar from './Avatar';
import {
  RETROSPECTIVE_FLAG,
  retrospectiveYear,
} from '../services/retrospectiveService';

interface Props {
  username?: string;
  avatar?: string | null;
}

const RetrospectiveBanner: React.FC<Props> = ({ username, avatar }) => {
  const enabled = useFlag(RETROSPECTIVE_FLAG);
  const navigation = useNavigation<any>();
  const year = retrospectiveYear();

  // Une respiration lente sur l'anneau : assez pour attirer l'œil une fois,
  // assez lente pour ne pas agiter la page.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, pulse]);

  if (!enabled) return null;

  return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('Retrospective', { year })}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir ma rétrospective ${year}`}
    >
      <Animated.View
        style={{
          transform: [
            {
              scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }),
            },
          ],
        }}
      >
        <LinearGradient
          colors={[colors.accentBright, colors.accent, colors.gold]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.ring}
        >
          <View style={s.ringInner}>
            <Avatar size={50} username={username} uri={avatar as any} />
          </View>
        </LinearGradient>
      </Animated.View>

      <View style={s.text}>
        <Text style={s.title}>Ta rétrospective {year}</Text>
        <Text style={s.subtitle}>ton année en quelques cartes</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  ring: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, marginLeft: 14 },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginTop: 2,
  },
});

export default RetrospectiveBanner;
