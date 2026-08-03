import { fonts } from '../theme';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, StatusBar,
  FlatList, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, Animated, ActivityIndicator, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { API_CONFIG } from '../config/api';
import VerifiedBadge from '../components/VerifiedBadge';
import { BackButton } from '../components/ui';

// Clé de base pour le stockage local (sera suffixée avec l'ID utilisateur)
const STORAGE_KEY_PREFIX = 'pc_chat_messages_';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  ts: number;
}

interface BotProfile {
  username: string;
  full_name: string;
  avatar: string | null;
  verified?: boolean;
  verification_style?: string;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getAvatarUri(avatar: string | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http')) return avatar;
  return `${API_CONFIG.BASE_URL}/static/avatars/${avatar}`;
}

export default function PolicierCongoChatScreen({ navigation }: any) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [profile, setProfile] = useState<BotProfile>({ username: 'policiercongo', full_name: 'Policier Congo', avatar: null, verified: true, verification_style: 'default' });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const typingAnim = useRef(new Animated.Value(0)).current;
  const hasDoneInitialScroll = useRef(false);

  // Générer la clé de stockage unique par utilisateur
  const userStorageKey = `${STORAGE_KEY_PREFIX}${user?.id || 'guest'}`;

  // Charger le profil + l'historique depuis le serveur ou AsyncStorage
  useEffect(() => {
    if (!user?.id) return;

    const bootstrap = async () => {
      hasDoneInitialScroll.current = false;
      setMessages([]);

      // Charger le profil réel de PolicierCongo
      try {
        const res = await apiService.get('/api/policiercongo/chat/profile');
        if (res?.success && res.profile) {
          setProfile(res.profile);
        }
      } catch (_) {}
      setProfileLoaded(true);

      // Charger l'historique depuis le serveur d'abord
      try {
        const res = await apiService.get('/api/policiercongo/chat/history', null, true, 0);
        if (res?.success && Array.isArray(res.messages) && res.messages.length > 0) {
          const mapped = res.messages.map((m: any, i: number) => ({
            id: String(m.ts || i),
            role: m.role,
            text: m.text,
            ts: m.ts || Date.now(),
          }));
          setMessages(mapped);
          await AsyncStorage.setItem(userStorageKey, JSON.stringify(mapped));
          return;
        }
      } catch (_) {}

      // Fallback AsyncStorage
      try {
        const stored = await AsyncStorage.getItem(userStorageKey);
        if (stored) {
          setMessages(JSON.parse(stored));
          return;
        }
      } catch (_) {}

      // Message de bienvenue par défaut
      setMessages([{
        id: 'welcome',
        role: 'bot',
        text: "Wesh, qu'est-ce tu veux ? Parle vite j'ai pas ton temps.",
        ts: Date.now(),
      }]);
    };
    bootstrap();
  }, [user?.id]);

  const scrollToBottom = useCallback((animated = true) => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated });
      }, 100);
    }
  }, [messages.length]);

  useEffect(() => {
    if (messages.length === 0) return;
    if (!hasDoneInitialScroll.current) {
      hasDoneInitialScroll.current = true;
      scrollToBottom(false);
      return;
    }
    scrollToBottom(true);
  }, [messages, isLoading, scrollToBottom]);

  // Animation "typing" (3 points pulsants)
  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(typingAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(typingAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      typingAnim.stopAnimation();
      typingAnim.setValue(0);
    }
  }, [isLoading]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e: any) => {
      setKeyboardHeight(e?.endCoordinates?.height || 0);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const persistMessages = async (msgs: Message[]) => {
    try {
      await AsyncStorage.setItem(userStorageKey, JSON.stringify(msgs));
    } catch (_) {}
  };

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText.trim(),
      ts: Date.now(),
    };

    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    persistMessages(nextMsgs);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await apiService.post('/api/policiercongo/chat/message', { message: userMsg.text }, true, 0);

      if (response?.success) {
        const botMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'bot',
          text: response.message,
          ts: Date.now(),
        };
        const final = [...nextMsgs, botMsg];
        setMessages(final);
        persistMessages(final);
      } else {
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'bot',
          text: response?.message || "Reviens demain frérot, t'as atteint ta limite.",
          ts: Date.now(),
        };
        const final = [...nextMsgs, errMsg];
        setMessages(final);
        persistMessages(final);
      }
    } catch {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: 'J\'ai pas capté ton message. Serveur HS.',
        ts: Date.now(),
      };
      const final = [...nextMsgs, errMsg];
      setMessages(final);
      persistMessages(final);
    } finally {
      setIsLoading(false);
    }
  };

  const avatarUri = getAvatarUri(profile.avatar);

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isUser = item.role === 'user';
    const prevMsg = messages[index - 1];
    const showAvatar = !isUser && (!prevMsg || prevMsg.role !== 'bot');

    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowRight : styles.msgRowLeft]}>
        {/* Avatar bot à gauche */}
        {!isUser && (
          <View style={styles.botAvatarSlot}>
            {showAvatar ? (
              avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.msgAvatar} />
              ) : (
                <View style={styles.msgAvatarFallback}>
                  <Text style={styles.msgAvatarText}>PC</Text>
                </View>
              )
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>
        )}

        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
            {item.text}
          </Text>
          <Text style={[styles.bubbleTime, isUser ? styles.bubbleTimeUser : styles.bubbleTimeBot]}>
            {formatTime(item.ts)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0C0F" />

      {/* Header Instagram-like */}
      <View style={styles.header}>
        <BackButton navigation={navigation} />

        <View style={styles.headerProfile}>
          {profileLoaded ? (
            avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarFallback}>
                <Text style={styles.headerAvatarText}>PC</Text>
              </View>
            )
          ) : (
            <View style={styles.headerAvatarFallback}>
              <ActivityIndicator size="small" color="#4F7CFF" />
            </View>
          )}

          <View style={styles.headerNames}>
            <View style={styles.headerNameBadge}>
              <Text style={styles.headerDisplayName} numberOfLines={1} ellipsizeMode="tail">
                {profile.full_name || 'Policier Congo'}
              </Text>
              {profile.verified && (
                <VerifiedBadge 
                  style={profile.verification_style as any || 'default'} 
                  size={14} 
                />
              )}
            </View>
            <Text style={styles.headerUsername}>@{profile.username || 'policiercongo'}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconBtn}>
            <Ionicons name="videocam-outline" size={25} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn}>
            <Ionicons name="call-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollToBottom(hasDoneInitialScroll.current)}
          onLayout={() => scrollToBottom(false)}
        />

        {isLoading && (
          <View style={styles.typingRow}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={[styles.msgAvatar, { width: 28, height: 28, borderRadius: 14, marginRight: 8 }]} />
            ) : (
              <View style={[styles.msgAvatarFallback, { width: 28, height: 28, borderRadius: 14, marginRight: 8 }]}>
                <Text style={[styles.msgAvatarText, { fontSize: 10 }]}>PC</Text>
              </View>
            )}
            <View style={styles.typingBubble}>
              <Animated.Text style={[styles.typingDots, { opacity: typingAnim }]}>
                ●●●
              </Animated.Text>
            </View>
          </View>
        )}

        {/* Input Instagram-like */}
        <View
          style={[
            styles.inputBar,
            keyboardHeight > 0
              ? { marginBottom: Math.max(0, keyboardHeight - (Platform.OS === 'ios' ? 6 : 10)) }
              : null,
          ]}
        >
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Démarre un nouveau message"
              placeholderTextColor="#536471"
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
          </View>
          <TouchableOpacity
            onPress={handleSend}
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            disabled={!inputText.trim() || isLoading}
          >
            {inputText.trim() ? (
              <LinearGradient
                colors={['#C13584', '#833AB4', '#405DE6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendGradientBtn}
              >
                <Ionicons name="send" size={16} color="#fff" style={{ marginLeft: 1 }} />
              </LinearGradient>
            ) : (
              <Ionicons name="mic-outline" size={25} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1a1a1a',
    backgroundColor: 'transparent',
  },
  backBtn: { padding: 4, marginRight: 2 },
  headerProfile: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  headerAvatarFallback: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#262626',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  headerAvatarText: { color: '#fff', fontWeight: '700', fontFamily: fonts.bold, fontSize: 13 },
  headerNames: { flex: 1, minWidth: 0 },
  headerNameBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  headerDisplayName: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, flexShrink: 1 },
  headerUsername: { color: '#888', fontSize: 12, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn: { padding: 8 },

  // List
  listContent: { paddingVertical: 16, paddingHorizontal: 12 },

  // Message rows
  msgRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end' },
  botAvatarSlot: { width: 44, alignItems: 'flex-start' },
  msgAvatar: { width: 36, height: 36, borderRadius: 18 },
  msgAvatarFallback: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#4F7CFF',
    alignItems: 'center', justifyContent: 'center',
  },
  msgAvatarText: { color: '#fff', fontWeight: 'bold', fontFamily: fonts.bold, fontSize: 12 },

  // Bubbles
  bubble: {
    maxWidth: '72%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: '#7c3aed',
    borderBottomRightRadius: 4,
    minHeight: 46,
  },
  bubbleBot: {
    backgroundColor: '#262626',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextBot: { color: '#e7e9ea' },
  bubbleTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeUser: { color: 'rgba(255,255,255,0.65)' },
  bubbleTimeBot: { color: '#71767b' },

  // Typing
  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  typingBubble: {
    backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
  },
  typingDots: { color: '#71767b', fontSize: 18, letterSpacing: 4 },

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1a1a1a',
    backgroundColor: 'transparent',
  },
  inputWrap: {
    flex: 1,
    backgroundColor: '#121212',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    minHeight: 40,
    maxHeight: 120,
    justifyContent: 'center',
  },
  input: { color: '#e7e9ea', fontSize: 15 },
  sendBtn: { paddingBottom: 6, paddingHorizontal: 2, minWidth: 30, alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendGradientBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
