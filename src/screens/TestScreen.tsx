import { fonts } from '../theme';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const TestScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Test Écran NINFI</Text>
      <Text style={styles.subtitle}>Si vous voyez ceci, la navigation fonctionne</Text>
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Bouton de test</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FF6B35',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: 'white',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: 'white',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FF6B35',
    fontWeight: '600', fontFamily: fonts.semibold,
  },
});

export default TestScreen;
