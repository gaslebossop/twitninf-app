import { fonts , colors, statusBarStyle} from '../theme';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VerifiedBadge from '../components/VerifiedBadge';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import Avatar from '../components/Avatar';
import { ScreenBackground, AppHeader } from '../components/ui';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import { toast } from '../components/ui/Toast';
import { signInWithGAuth } from '../services/gAuthLogin';
import { resetToRoot } from '../navigation/NavigationService';

export default function AccountManagerScreen() {
  const navigation = useNavigation();
  const { user, accounts, switchAccount, clearAllAccountsAndLogout, completeGAuthLogin } = useAuth() as any;
  const [gAuthAddLoading, setGAuthAddLoading] = React.useState(false);

  const handleAddGAuthAccount = async () => {
    if (gAuthAddLoading) return;
    setGAuthAddLoading(true);
    try {
      // signInWithGAuth demande toujours le choix de compte — cet écran
      // profite juste du même chemin que le bouton de connexion normal.
      const result = await signInWithGAuth();
      if (result.type === 'cancel') return;
      if (result.type === 'error') {
        toast.error(result.message);
        return;
      }

      const session = await completeGAuthLogin(result.token, result.refreshToken);
      if (!session.success) {
        toast.error(session.message);
        return;
      }

      toast.success(result.isNewAccount ? 'Compte créé et ajouté !' : 'Compte ajouté !');
      resetToRoot();
    } catch {
      toast.error("L'ajout du compte G a échoué.");
    } finally {
      setGAuthAddLoading(false);
    }
  };

  const handleClearAllAccounts = () => {
    confirmAsync({
      title: 'Nettoyer tous les comptes',
      message: 'Êtes-vous sûr de vouloir supprimer tous les comptes et vous déconnecter ? Cette action est irréversible.',
      confirmLabel: 'Nettoyer et déconnecter',
      destructive: true,
    }).then((ok) => {
      // Pas de navigation manuelle vers 'Intro' ici : `AppNavigator` bascule
      // déjà tout seul sur le rendu conditionnel de `isAuthenticated`, qui
      // vient de passer à `false`. Naviguer en plus, juste après, arrivait
      // avant que React n'ait eu le temps de re-rendre avec ce nouvel état —
      // 'Intro' n'existait donc pas encore dans le RootStack ('MainApp' y
      // restait seul inscrit un instant de plus), d'où l'avertissement
      // « NAVIGATE not handled by any navigator » et, dans son sillage, le
      // crash « Maximum update depth exceeded » au moment où les deux
      // tentatives de bascule (la conditionnelle et celle-ci) se sont
      // télescopées.
      if (ok) (async () => {
            await clearAllAccountsAndLogout();
          })();
    });
  };

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
      <AppHeader navigation={navigation} title="Comptes" />

      <ScrollView contentContainerStyle={styles.content}>
        {accounts.map((acc: any) => {
          const isActive = user?.id === acc.id;
          return (
            <TouchableOpacity
              key={acc.id}
              style={[styles.accountRow, isActive && styles.activeAccountRow]}
              onPress={() => switchAccount(acc.id)}
              activeOpacity={0.8}
            >
              <Avatar size={40} username={acc.username} uri={acc.avatar} />
              <View style={styles.accountInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.accountUsername}>@{acc.username}</Text>
                  {acc.verified && (
                    <VerifiedBadge 
                      verificationStyle={acc.verification_style || 'default'}
                      size={14} 
                      style={{ marginLeft: 6 }}
                    />
                  )}
                </View>
                <Text style={styles.accountName} numberOfLines={1}>{acc.full_name}</Text>
              </View>
              {isActive && (
                <Ionicons name="radio-button-on" size={18} color="#4F7CFF" />
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => (navigation as any).navigate('AddAccount')}
          activeOpacity={0.85}
        >
          <Ionicons name="person-add-outline" size={18} color="#4F7CFF" />
          <Text style={styles.addButtonText}>Ajouter un compte</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.addButton, gAuthAddLoading && { opacity: 0.65 }]}
          onPress={handleAddGAuthAccount}
          activeOpacity={0.85}
          disabled={gAuthAddLoading}
        >
          <Ionicons name="link-outline" size={18} color="#4F7CFF" />
          <Text style={styles.addButtonText}>Se connecter avec un autre compte G</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.clearAllButton}
          onPress={handleClearAllAccounts}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={18} color="#ff0000" />
          <Text style={styles.clearAllButtonText}>Nettoyer tous les comptes</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  gradient: { ...StyleSheet.absoluteFillObject as any },
  content: { padding: 16 },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.overlayMedium,
    borderWidth: 1,
    borderColor: '#2f3336',
    marginBottom: 10,
  },
  activeAccountRow: { borderColor: '#4F7CFF' },
  accountInfo: { flex: 1, marginLeft: 10 },
  accountUsername: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  accountName: { color: '#536471', fontSize: 13, marginTop: 2 },
  addButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2f3336',
    backgroundColor: colors.overlayMedium
  },
  addButtonText: { color: '#4F7CFF', fontWeight: '700', fontFamily: fonts.bold, marginLeft: 8 },
  clearAllButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.3)',
    backgroundColor: 'rgba(255,0,0,0.08)'
  },
  clearAllButtonText: { color: '#ff0000', fontWeight: '700', fontFamily: fonts.bold, marginLeft: 8 },
});


