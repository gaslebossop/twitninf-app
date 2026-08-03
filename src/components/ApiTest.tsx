import { fonts } from '../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
 ScrollView,
  Alert,
} from 'react-native';
import apiService from '../services/api';

const ApiTest: React.FC = () => {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const testApiConnection = async () => {
    setIsLoading(true);
    addResult('🧪 Début du test de connexion API...');
    
    try {
      const isConnected = await apiService.testConnection();
      if (isConnected) {
        addResult('✅ Connexion API réussie');
      } else {
        addResult('❌ Échec de connexion API');
      }
    } catch (error: any) {
      addResult(`❌ Erreur de connexion: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testRegistration = async () => {
    setIsLoading(true);
    addResult('📝 Test d\'inscription...');
    
    try {
      const timestamp = Date.now();
      const userData = {
        username: `testuser_${timestamp}`,
        fullName: 'Test User',
        email: `test${timestamp}@example.com`,
        phone: `+3312345678${timestamp % 100}`,
        password: 'TestPass123!',
        platform: 'android' as const
      };

      const response = await apiService.register(userData);
      
      if (response.success) {
        addResult('✅ Inscription réussie');
        addResult(`👤 Utilisateur: ${response.data?.user?.username}`);
      } else {
        addResult(`❌ Échec d'inscription: ${response.message}`);
      }
    } catch (error: any) {
      addResult(`❌ Erreur d'inscription: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testLogin = async () => {
    setIsLoading(true);
    addResult('🔐 Test de connexion...');
    
    try {
      const credentials = {
        username: 'test@example.com',
        password: 'TestPass123!'
      };

      const response = await apiService.login(credentials);
      
      if (response.success) {
        addResult('✅ Connexion réussie');
        addResult(`🔑 Token: ${response.data?.token ? 'Présent' : 'Absent'}`);
      } else {
        addResult(`❌ Échec de connexion: ${response.message}`);
      }
    } catch (error: any) {
      addResult(`❌ Erreur de connexion: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testAll = async () => {
    clearResults();
    addResult('🚀 Début des tests complets...');
    
    await testApiConnection();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testRegistration();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testLogin();
    
    addResult('🏁 Tests terminés');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🧪 Test API TwitNin</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, styles.primaryButton]} 
          onPress={testAll}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '⏳ Tests en cours...' : '🚀 Tous les tests'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.secondaryButton]} 
          onPress={testApiConnection}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>🔗 Test Connexion</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.secondaryButton]} 
          onPress={testRegistration}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>📝 Test Inscription</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.secondaryButton]} 
          onPress={testLogin}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>🔐 Test Connexion</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, styles.clearButton]} 
          onPress={clearResults}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>🗑️ Effacer</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.resultsContainer}>
        <Text style={styles.resultsTitle}>📊 Résultats des tests:</Text>
        {testResults.length === 0 ? (
          <Text style={styles.noResults}>Aucun test effectué</Text>
        ) : (
          testResults.map((result, index) => (
            <Text key={index} style={styles.resultText}>
              {result}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold', fontFamily: fonts.bold,
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  buttonContainer: {
    marginBottom: 20,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#34C759',
  },
  clearButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  resultsContainer: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 10,
    color: '#333',
  },
  noResults: {
    fontStyle: 'italic',
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  resultText: {
    fontSize: 14,
    marginBottom: 5,
    color: '#333',
    fontFamily: 'monospace',
  },
});

export default ApiTest;
