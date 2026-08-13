import { fonts, colors, statusBarStyle } from '../theme';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, StatusBar, Platform, ActivityIndicator, ScrollView, KeyboardAvoidingView } from 'react-native';
// `expo-image` : cache disque et décodage hors du thread JS. `transition={0}`
// pour garder exactement l'apparition d'avant.
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import { ScreenBackground, AppHeader } from '../components/ui';

export default function EditProfileScreen({ navigation }: any) {
  const { user, refreshCurrentUser } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const initialUsernameRef = useRef<string>(user?.username || '');

  useEffect(() => {
    let timeout: any;
    const value = username.trim();
    if (!value || value.toLowerCase() === (user?.username || '').toLowerCase()) {
      setUsernameAvailable(null);
      setCheckingUsername(false);
      return;
    }
    setCheckingUsername(true);
    timeout = setTimeout(async () => {
      try {
        const res = await apiService.searchUsers({ q: value, limit: 5, sort: 'relevance' } as any);
        if (res?.success) {
          const exact = (res.data?.users || []).find((u: any) => u.username?.toLowerCase() === value.toLowerCase());
          // Disponible si aucun exact match OU l'exact match est l'utilisateur courant
          const available = !exact || exact.id === user?.id;
          setUsernameAvailable(available);
        } else {
          setUsernameAvailable(null);
        }
      } catch {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [username, user?.id, user?.username]);

  useEffect(() => {
    setFullName(user?.full_name || '');
    setUsername(user?.username || '');
    setBio(user?.bio || '');
  }, [user?.id, user?.full_name, user?.username, user?.bio]);

  const performSave = async () => {
    try {
      setIsSaving(true);
      const trimmedBio = bio.trim();
      const res = await apiService.updateProfile({
        full_name: fullName.trim(),
        username: username.trim(),
        bio: trimmedBio.length > 0 ? trimmedBio : '',
      });
      if (!res.success) {
        toast.error(res.message || 'Impossible de mettre à jour le profil');
        return;
      }
      await refreshCurrentUser();
      navigation.goBack();
    } catch (e) {
      toast.error('Une erreur est survenue');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    const newUsername = username.trim();
    if (!newUsername) {
      toast.error("Le nom d’utilisateur est requis");
      return;
    }
    const hasUsernameChanged = newUsername.toLowerCase() !== (initialUsernameRef.current || '').toLowerCase();
    if ((user as any)?.verified && hasUsernameChanged) {
      confirmAsync({
        title: 'Perte de vérification',
        message: "En changeant de nom d’utilisateur, vous perdrez votre badge de vérification. Continuer ?",
        confirmLabel: 'Continuer',
        destructive: true,
      }).then((ok) => {
        if (ok) (performSave)();
      });
      return;
    }
    await performSave();
  };

  const handleChangeAvatar = async () => {
    try {
      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (libPerm.status !== 'granted') {
        toast.error('Permission requise', {
          description: 'Autorisez l\'accès à la galerie.',
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      setIsUploadingAvatar(true);
      setLocalAvatarUri(uri);
      const uploading = await apiService.uploadUserAvatar(uri);
      if (uploading.success) {
        await refreshCurrentUser();
        toast.success('Photo de profil mise à jour.');
      } else {
        toast.error(uploading.message || 'Impossible de mettre à jour la photo');
        setLocalAvatarUri(null);
      }
    } catch (e) {
      toast.error('Une erreur est survenue');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleChangeBanner = async () => {
    try {
      const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (libPerm.status !== 'granted') {
        toast.error('Permission requise', {
          description: 'Autorisez l\'accès à la galerie.',
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      setIsUploadingBanner(true);
      const uploading = await apiService.uploadUserBanner(uri);
      if (uploading.success) {
        await refreshCurrentUser();
        toast.success('Bannière mise à jour.');
      } else {
        toast.error(uploading.message || 'Impossible de mettre à jour la bannière');
      }
    } catch {
      toast.error('Une erreur est survenue');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
      <AppHeader
        navigation={navigation}
        title="Modifier le profil"
        right={
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveBtn, (isSaving || checkingUsername || usernameAvailable === false) && styles.saveBtnDisabled]}
            disabled={isSaving || checkingUsername || usernameAvailable === false}
          >
            {isSaving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.saveText}>Enregistrer</Text>}
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView style={styles.contentContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.form}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Bannière du profil</Text>
        <View style={styles.bannerPreview}>
          {(user as any)?.banner ? (
            <Image source={{ uri: (user as any).banner as string }} style={styles.bannerPreviewImg} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={(user as any).banner as string} />
          ) : (
            <View style={styles.bannerPlaceholder} />
          )}
          {isUploadingBanner && (
            <View style={styles.bannerUploadOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>
        <TouchableOpacity
          style={[styles.changePhotoBtn, isUploadingBanner && styles.changePhotoBtnDisabled, { marginBottom: 18 }]}
          onPress={handleChangeBanner}
          disabled={isUploadingBanner}
        >
          <Ionicons name="image" size={16} color="#0B0C0F" />
          <Text style={styles.changePhotoText}>Changer la bannière</Text>
        </TouchableOpacity>

        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            {localAvatarUri || (user as any)?.avatar ? (
              <Image source={{ uri: localAvatarUri || ((user as any)?.avatar as string) }} style={styles.avatarImage} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={localAvatarUri || ((user as any)?.avatar as string)} />
            ) : (
              <Text style={styles.avatarInitials}>{((user?.username as string) || 'U').charAt(0).toUpperCase()}</Text>
            )}
            {isUploadingAvatar && (
              <View style={styles.uploadOverlay}><ActivityIndicator color="#0B0C0F" /></View>
            )}
          </View>
          <TouchableOpacity style={[styles.changePhotoBtn, isUploadingAvatar && styles.changePhotoBtnDisabled]} onPress={handleChangeAvatar} disabled={isUploadingAvatar}>
            <Ionicons name="camera" size={16} color="#0B0C0F" />
            <Text style={styles.changePhotoText}>Changer la photo</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.label}>Nom complet</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Votre nom complet"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.label}>Nom d’utilisateur</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="Votre nom d’utilisateur"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />
        {username.trim().length > 0 && (
          <Text style={
            checkingUsername ? styles.usernameChecking : (usernameAvailable === false ? styles.usernameNotAvailable : styles.usernameAvailable)
          }>
            {checkingUsername ? 'Vérification du nom d\'utilisateur...' : usernameAvailable === false ? 'Nom d\'utilisateur déjà pris' : 'Nom d\'utilisateur disponible'}
          </Text>
        )}
        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={(t) => setBio(t.length > 500 ? t.slice(0, 500) : t)}
          placeholder="Quelques mots sur vous…"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.bioCount}>{bio.length}/500</Text>
      </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  contentContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  form: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 40,
  },
  bannerPreview: {
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    marginBottom: 10,
    position: 'relative',
  },
  bannerPreviewImg: {
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    flex: 1,
    minHeight: 100,
    backgroundColor: colors.surfaceAlt,
  },
  bannerUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarInitials: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  uploadOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 48,
  },
  // Pastille pleine blanche à contraste fixe : elle se pose SUR une photo
  // (bannière/avatar) dont la couleur n'est pas prévisible, donc elle ne suit
  // volontairement pas le thème clair/sombre — comme la pastille "changer la
  // photo" d'Instagram.
  changePhotoBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  changePhotoBtnDisabled: {
    backgroundColor: colors.textSecondary,
  },
  changePhotoText: {
    color: '#000000',
    fontWeight: '700', fontFamily: fonts.bold,
    fontSize: 13,
  },
  usernameChecking: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
  },
  usernameAvailable: {
    marginTop: 6,
    color: colors.success,
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  usernameNotAvailable: {
    marginTop: 6,
    color: colors.red,
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    color: colors.textPrimary,
    fontSize: 15,
  },
  bioInput: {
    minHeight: 100,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
  },
  bioCount: {
    alignSelf: 'flex-end',
    marginTop: 4,
    fontSize: 12,
    color: colors.textMuted,
  },
});
