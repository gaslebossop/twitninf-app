import { fonts } from '../theme';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VerifiedBadge from '../components/VerifiedBadge';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import Avatar from '../components/Avatar';
import { BackButton } from '../components/ui';

export default function AccountManagerScreen() {
  const navigation = useNavigation();
  const { user, accounts, switchAccount, clearAllAccountsAndLogout } = useAuth() as any;

  const handleClearAllAccounts = () => {
    Alert.alert(
      'Nettoyer tous les comptes',
      'Êtes-vous sûr de vouloir supprimer tous les comptes et vous déconnecter ? Cette action est irréversible.',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Nettoyer et déconnecter',
          style: 'destructive',
          onPress: async () => {
            await clearAllAccountsAndLogout();
            (navigation as any).navigate('Intro');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackButton navigation={navigation} />
        <Text style={styles.headerTitle}>Comptes</Text>
        <View style={styles.headerBtn} />
      </View>

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
                      animated={true}
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
          style={styles.clearAllButton}
          onPress={handleClearAllAccounts}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={18} color="#ff0000" />
          <Text style={styles.clearAllButtonText}>Nettoyer tous les comptes</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  gradient: { ...StyleSheet.absoluteFillObject as any },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, flex: 1, textAlign: 'center' },
  content: { padding: 16 },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.09)',
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
    backgroundColor: 'rgba(255,255,255,0.09)'
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


