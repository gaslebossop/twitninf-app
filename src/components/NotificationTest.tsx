import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { 
  registerForPushNotifications, 
  sendImmediateNotification, 
  checkNotificationStatus 
} from '../services/push';

export default function NotificationTest() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Vérifier l'état des notifications au démarrage
  useEffect(() => {
    checkNotificationStatus().then(setStatus);
  }, []);

  const handleRegisterNotifications = async () => {
    setLoading(true);
    try {
      console.log('🔔 Test - Début enregistrement notifications...');
      
      // Utiliser votre Project ID
      const projectId = '341da021-111f-4a0c-9f54-0b5f4c9c3965';
      const newToken = await registerForPushNotifications(projectId);
      
      if (newToken) {
        setToken(newToken);
        setStatus(await checkNotificationStatus());
        Alert.alert('✅ Succès', 'Notifications enregistrées avec succès !');
        console.log('🔔 Test - Token obtenu:', newToken);
      } else {
        Alert.alert('❌ Erreur', 'Impossible d\'obtenir le token');
        console.log('🔔 Test - Échec de l\'obtention du token');
      }
    } catch (error) {
      console.error('🔔 Test - Erreur:', error);
      Alert.alert('❌ Erreur', `Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      console.log('🔔 Test - Envoi notification de test...');
      await sendImmediateNotification(
        '🧪 Test Notification',
        'Cette notification devrait s\'afficher immédiatement !',
        { type: 'test', timestamp: Date.now() }
      );
      Alert.alert('✅ Succès', 'Notification de test envoyée !');
    } catch (error) {
      console.error('🔔 Test - Erreur notification:', error);
      Alert.alert('❌ Erreur', `Erreur notification: ${error.message}`);
    }
  };

  const handleCheckStatus = async () => {
    const newStatus = await checkNotificationStatus();
    setStatus(newStatus);
    console.log('🔔 Test - État mis à jour:', newStatus);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🧪 Test des Notifications</Text>
      
      {/* État actuel */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>État des Notifications:</Text>
        {status ? (
          <>
            <Text>Permissions: {status.permissions}</Text>
            <Text>Canaux Android: {status.channelsCount}</Text>
            <Text>Configuré: {status.configured ? '✅' : '❌'}</Text>
          </>
        ) : (
          <Text>Chargement...</Text>
        )}
      </View>

      {/* Token */}
      {token && (
        <View style={styles.tokenContainer}>
          <Text style={styles.tokenTitle}>Token Expo:</Text>
          <Text style={styles.tokenText} numberOfLines={2}>
            {token.substring(0, 50)}...
          </Text>
        </View>
      )}

      {/* Boutons d'action */}
      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleRegisterNotifications}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? '⏳ Enregistrement...' : '🔔 Enregistrer Notifications'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.button}
        onPress={handleTestNotification}
      >
        <Text style={styles.buttonText}>🧪 Tester Notification</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.button}
        onPress={handleCheckStatus}
      >
        <Text style={styles.buttonText}>🔄 Vérifier État</Text>
      </TouchableOpacity>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>📋 Instructions:</Text>
        <Text>1. Appuyez sur "Enregistrer Notifications"</Text>
        <Text>2. Acceptez les permissions si demandées</Text>
        <Text>3. Testez avec "Tester Notification"</Text>
        <Text>4. Vérifiez que la notification s'affiche</Text>
      </View>
    </View>
  );
}

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
  statusContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    elevation: 2,
  },
  statusTitle: {
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 10,
    color: '#333',
  },
  tokenContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    elevation: 2,
  },
  tokenTitle: {
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 10,
    color: '#333',
  },
  tokenText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#666',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold', fontFamily: fonts.bold,
    fontSize: 16,
  },
  instructions: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    elevation: 2,
  },
  instructionsTitle: {
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 10,
    color: '#333',
  },
});
