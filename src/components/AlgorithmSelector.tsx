import { fonts } from '../theme';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function AlgorithmSelector() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconRow}>
          <View style={styles.iconBg}>
            <Ionicons name="hardware-chip" size={28} color="#fff" />
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ACTIF</Text>
          </View>
        </View>
        <Text style={styles.title}>Moteur de recommandation</Text>
        <Text style={styles.desc}>
          Moteur Rust ultra-rapide · 12 dimensions réelles · 8 sources parallèles · Cache adaptatif
        </Text>
        <View style={styles.dims}>
          {['Engagement', 'Contenu', 'Social', 'Temporel', 'Viral', 'Personnalisation'].map(d => (
            <View key={d} style={styles.dimTag}>
              <Text style={styles.dimText}>{d}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  card: {
    backgroundColor: 'rgba(249,115,22,0.1)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#f97316',
    padding: 16,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    marginLeft: 10,
    backgroundColor: '#f97316',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800', fontFamily: fonts.bold,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 17,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#fff',
    marginBottom: 6,
  },
  desc: {
    fontSize: 13,
    color: '#c2c8d0',
    lineHeight: 18,
    marginBottom: 12,
  },
  dims: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dimTag: {
    backgroundColor: 'rgba(249,115,22,0.2)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dimText: {
    color: '#f97316',
    fontSize: 11,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
});
