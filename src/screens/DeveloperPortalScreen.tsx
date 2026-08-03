import { colors, fonts, glow } from '../theme';
import { ScreenBackground, BackButton } from '../components/ui';
import React, { useState, useEffect } from 'react';
import { View as ViewComponent, Text as TextComponent, StyleSheet as StyleSheetComponent, TouchableOpacity as TouchableOpacityComponent, ScrollView as ScrollViewComponent, TextInput as TextInputComponent, Alert as AlertComponent, ActivityIndicator as ActivityIndicatorComponent, Dimensions, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const { width } = Dimensions.get('window');

export default function DeveloperPortalScreen({ navigation }: any) {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Form State
  const [appName, setAppName] = useState('');
  const [appDesc, setAppDesc] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/developer');
      if (res.success) {
        setApps(res.data);
      }
    } catch (error) {
      console.error(error);
      AlertComponent.alert('Erreur', 'Impossible de charger vos applications.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApp = async () => {
    if (!appName.trim()) {
      AlertComponent.alert('Erreur', 'Le nom de l\'application est requis.');
      return;
    }
    
    try {
      setSubmitting(true);
      const payload = {
        name: appName,
        description: appDesc,
        redirect_uris: redirectUri ? [redirectUri] : []
      };
      const res = await api.post('/api/developer', payload);
      if (res.success) {
        AlertComponent.alert('Succès', 'Application créée avec succès!');
        setAppName('');
        setAppDesc('');
        setRedirectUri('');
        setShowCreateForm(false);
        fetchApps();
      }
    } catch (error: any) {
      console.error(error);
      AlertComponent.alert('Erreur', error.response?.data?.message || 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteApp = async (id: string) => {
    AlertComponent.alert(
      'Confirmation',
      'Êtes-vous sûr de vouloir supprimer cette application? Ceci révoquera tous les tokens des utilisateurs.',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Supprimer', 
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/developer/${id}`);
              fetchApps();
            } catch (error) {
              AlertComponent.alert('Erreur', 'Impossible de supprimer l\'application.');
            }
          }
        }
      ]
    );
  };

  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setString(text);
    AlertComponent.alert('Copié', `${label} copié dans le presse-papier.`);
  };

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.container}>
      <ViewComponent style={styles.header}>
        <BackButton navigation={navigation} />
        <TextComponent style={styles.headerTitle}>Portail Développeur</TextComponent>
        <ViewComponent style={{width: 36}} />
      </ViewComponent>

      <ScrollViewComponent contentContainerStyle={styles.content}>
        
        <ViewComponent style={styles.infoCard}>
          <Ionicons name="code-slash" size={32} color={colors.accent} style={{marginBottom: 10}} />
          <TextComponent style={styles.infoTitle}>Twitninf Developer API</TextComponent>
          <TextComponent style={styles.infoText}>
            Créez des applications qui interagissent avec Twitninf. Obtenez un accès exclusif avec l'OAuth 2.0 pour gérer des tweets, analyser le fil de recommandation, et bien plus.
          </TextComponent>
        </ViewComponent>

        <TouchableOpacityComponent 
          style={styles.createButton}
          onPress={() => setShowCreateForm(!showCreateForm)}
        >
          <Ionicons name={showCreateForm ? "close" : "add"} size={20} color={colors.textPrimary} />
          <TextComponent style={styles.createButtonText}>
            {showCreateForm ? "Annuler" : "Créer une Application"}
          </TextComponent>
        </TouchableOpacityComponent>

        {showCreateForm && (
          <ViewComponent style={styles.formContainer}>
            <TextComponent style={styles.formTitle}>Nouvelle App</TextComponent>
            
            <TextInputComponent
              style={styles.input}
              placeholder="Nom de l'application"
              placeholderTextColor={colors.textMuted}
              value={appName}
              onChangeText={setAppName}
            />
            
            <TextInputComponent
              style={[styles.input, { height: 80 }]}
              placeholder="Description détaillée..."
              placeholderTextColor={colors.textMuted}
              multiline
              value={appDesc}
              onChangeText={setAppDesc}
            />
            
            <TextInputComponent
              style={styles.input}
              placeholder="URI de redirection OAuth (ex: https://monapp.com/callback)"
              placeholderTextColor={colors.textMuted}
              value={redirectUri}
              onChangeText={setRedirectUri}
              autoCapitalize="none"
              keyboardType="url"
            />
            
            <TouchableOpacityComponent 
              style={styles.submitButton}
              onPress={handleCreateApp}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicatorComponent color={colors.textPrimary} />
              ) : (
                <TextComponent style={styles.submitButtonText}>Enregistrer</TextComponent>
              )}
            </TouchableOpacityComponent>
          </ViewComponent>
        )}

        <TextComponent style={styles.sectionTitle}>Vos Applications ({apps.length})</TextComponent>

        {loading ? (
          <ActivityIndicatorComponent size="large" color={colors.accent} style={{marginTop: 50}} />
        ) : apps.length === 0 ? (
          <ViewComponent style={styles.emptyContainer}>
            <TextComponent style={styles.emptyText}>Vous n'avez pas encore créé d'application.</TextComponent>
          </ViewComponent>
        ) : (
          apps.map((app) => (
            <ViewComponent key={app.id} style={styles.appCard}>
              <ViewComponent style={styles.appHeader}>
                <TextComponent style={styles.appName}>{app.name}</TextComponent>
                <ViewComponent style={[styles.statusBadge, { backgroundColor: app.is_active ? colors.successMuted : colors.redMuted }]}>
                  <TextComponent style={[styles.statusText, { color: app.is_active ? colors.success : colors.red }]}>
                    {app.is_active ? 'Active' : 'Inactive'}
                  </TextComponent>
                </ViewComponent>
              </ViewComponent>
              
              {app.description && <TextComponent style={styles.appDesc}>{app.description}</TextComponent>}
              
              <ViewComponent style={styles.credentialsContainer}>
                <ViewComponent style={styles.credentialRow}>
                  <TextComponent style={styles.credentialLabel}>Client ID</TextComponent>
                  <TouchableOpacityComponent 
                    style={styles.credentialValueBox}
                    onPress={() => copyToClipboard(app.client_id, 'Client ID')}
                  >
                    <TextComponent style={styles.credentialValue} numberOfLines={1} ellipsizeMode="middle">
                      {app.client_id}
                    </TextComponent>
                    <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacityComponent>
                </ViewComponent>
                
                <ViewComponent style={styles.credentialRow}>
                  <TextComponent style={styles.credentialLabel}>Client Secret</TextComponent>
                  <TouchableOpacityComponent 
                    style={styles.credentialValueBox}
                    onPress={() => copyToClipboard(app.client_secret, 'Client Secret')}
                  >
                    <TextComponent style={styles.credentialValue} numberOfLines={1} ellipsizeMode="middle">
                      {/** Masquage partiel du secret **/}
                      {app.client_secret.substring(0, 8)}••••••••••••••••••••••••
                    </TextComponent>
                    <Ionicons name="copy-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacityComponent>
                </ViewComponent>
              </ViewComponent>

              <ViewComponent style={styles.appActions}>
                <TouchableOpacityComponent 
                  style={styles.actionButtonDanger}
                  onPress={() => handleDeleteApp(app.id)}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.red} style={{marginRight: 4}} />
                  <TextComponent style={styles.actionButtonTextDanger}>Révoquer</TextComponent>
                </TouchableOpacityComponent>
              </ViewComponent>
            </ViewComponent>
          ))
        )}
      </ScrollViewComponent>
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheetComponent.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  content: {
    padding: 15,
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  infoTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 8,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  createButton: {
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 20,
    ...glow(colors.accent, 14),
  },
  createButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginLeft: 8,
  },
  formContainer: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 16,
    marginBottom: 25,
  },
  formTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginBottom: 15,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 10,
    color: colors.textPrimary,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 15,
    fontSize: 15,
  },
  submitButton: {
    backgroundColor: colors.success,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800', fontFamily: fonts.bold,
    marginBottom: 15,
    marginTop: 10,
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  appCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 15,
  },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  appName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  appDesc: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 15,
  },
  credentialsContainer: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  credentialRow: {
    marginBottom: 8,
  },
  credentialLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  credentialValueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  credentialValue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: 'monospace',
    flex: 1,
  },
  appActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 12,
  },
  actionButtonDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.redMuted,
    borderRadius: 8,
  },
  actionButtonTextDanger: {
    color: colors.red,
    fontSize: 14,
    fontWeight: 'bold', fontFamily: fonts.bold,
  }
});
