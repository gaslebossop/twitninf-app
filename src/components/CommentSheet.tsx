import { fonts } from '../theme';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
// `expo-image` plutôt que `Image` de React Native : cache disque et décodage
// hors du thread JS. `transition={0}` : aucune apparition en fondu, le rendu
// reste identique.
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOffline } from '../contexts/OfflineContext';
import apiService from '../services/api';
import { Tweet } from '../types/api';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CommentUser {
  id: string;
  username: string;
  avatar?: string;
  verified?: boolean;
}

export interface Comment {
  id: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
    verified?: boolean;
  };
  text: string;
  likes: number;
  liked: boolean;
  createdAt: string;
  replies: Reply[];
  repliesExpanded?: boolean;
  pinned?: boolean;
  parent_tweet_id?: string;
}

export interface Reply {
  id: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  text: string;
  likes: number;
  liked: boolean;
  createdAt: string;
  replyTo?: string;
  parent_tweet_id?: string;
}

// ─── Avatar Mini ───────────────────────────────────────────────────────────────

const MiniAvatar = ({ user, size = 36 }: { user: { id: string; username: string; avatar?: string }; size?: number }) => {
  const colors = ['#fe2c55', '#4F7CFF', '#9b59b6', '#2ecc71', '#f39c12', '#e74c3c'];
  const colorIdx = user.username ? user.username.charCodeAt(0) % colors.length : 0;
  const letter = user.username ? user.username[0].toUpperCase() : '?';

  if (user.avatar) {
    return (
      <Image
        source={{ uri: user.avatar }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        recyclingKey={user.avatar}
      />
    );
  }

  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors[colorIdx],
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#fff', fontSize: size * 0.4, fontWeight: '700' }}>{letter}</Text>
    </View>
  );
};

const formatLikes = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
};

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffInSecs = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSecs < 60) return 'maintenant';
  if (diffInSecs < 3600) return `${Math.floor(diffInSecs / 60)}min`;
  if (diffInSecs < 86400) return `${Math.floor(diffInSecs / 3600)}h`;
  return `${Math.floor(diffInSecs / 86400)}j`;
};

// ─── Reply Row ──────────────────────────────────────────────────────────────────

const ReplyRow = ({
  reply,
  onLike,
  onReplyPress,
}: {
  reply: Reply;
  onLike: () => void;
  onReplyPress: (username: string, commentId: string) => void;
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleLike = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    onLike();
  };

  return (
    <View style={replyStyles.row}>
      <MiniAvatar user={reply.user} size={30} />
      <View style={replyStyles.content}>
        <View style={replyStyles.header}>
          <Text style={replyStyles.username}>@{reply.user.username}</Text>
          <Text style={replyStyles.time}>{reply.createdAt}</Text>
        </View>
        <Text style={replyStyles.text}>
          {reply.replyTo && (
            <Text style={replyStyles.replyMention}>@{reply.replyTo} </Text>
          )}
          {reply.text}
        </Text>
        <TouchableOpacity onPress={() => onReplyPress(reply.user.username, reply.id)} style={replyStyles.replyBtn}>
          <Text style={replyStyles.replyBtnText}>Répondre</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={handleLike} style={replyStyles.likeBtn}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Ionicons name="heart" size={15} color={reply.liked ? '#fe2c55' : 'rgba(255,255,255,0.5)'} />
        </Animated.View>
        <Text style={replyStyles.likeCount}>{formatLikes(reply.likes)}</Text>
      </TouchableOpacity>
    </View>
  );
};

const replyStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 46, paddingRight: 8, marginBottom: 14 },
  content: { flex: 1, marginLeft: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  username: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  time: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  text: { color: 'rgba(255,255,255,0.88)', fontSize: 13.5, lineHeight: 19 },
  replyMention: { color: '#4F7CFF', fontWeight: '600' },
  replyBtn: { marginTop: 6 },
  replyBtnText: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600' },
  likeBtn: { alignItems: 'center', gap: 3, paddingLeft: 8, paddingTop: 2 },
  likeCount: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
});

// ─── Comment Row ───────────────────────────────────────────────────────────────

const CommentRow = ({
  comment,
  onLike,
  onReplyLike,
  onReplyPress,
  onToggleReplies,
}: {
  comment: Comment;
  onLike: () => void;
  onReplyLike: (replyId: string) => void;
  onReplyPress: (username: string, commentId: string) => void;
  onToggleReplies: () => void;
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleLike = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.5, duration: 120, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
    ]).start();
    onLike();
  };

  return (
    <View style={commentStyles.wrapper}>
      {comment.pinned && (
        <View style={commentStyles.pinRow}>
          <Ionicons name="pin" size={11} color="rgba(255,255,255,0.4)" />
          <Text style={commentStyles.pinText}>Épinglé par l'auteur</Text>
        </View>
      )}
      <View style={commentStyles.row}>
        <MiniAvatar user={comment.user} size={36} />
        <View style={commentStyles.content}>
          <View style={commentStyles.header}>
            <Text style={commentStyles.username}>@{comment.user.username}</Text>
            {comment.user.verified && (
              <Ionicons name="checkmark-circle" size={13} color="#4F7CFF" style={{ marginLeft: 0 }} />
            )}
            <Text style={commentStyles.time}>{comment.createdAt}</Text>
          </View>
          <Text style={commentStyles.text}>{comment.text}</Text>
          <TouchableOpacity onPress={() => onReplyPress(comment.user.username, comment.id)} style={commentStyles.replyBtn}>
            <Text style={commentStyles.replyBtnText}>Répondre</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleLike} style={commentStyles.likeBtn}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Ionicons name="heart" size={18} color={comment.liked ? '#fe2c55' : 'rgba(255,255,255,0.5)'} />
          </Animated.View>
          <Text style={commentStyles.likeCount}>{formatLikes(comment.likes)}</Text>
        </TouchableOpacity>
      </View>

      {/* Replies toggle */}
      {comment.replies.length > 0 && (
        <TouchableOpacity style={commentStyles.repliesToggle} onPress={onToggleReplies}>
          <View style={commentStyles.repliesLine} />
          <Text style={commentStyles.repliesToggleText}>
            {comment.repliesExpanded
              ? 'Masquer les réponses'
              : `Voir ${comment.replies.length} réponse${comment.replies.length > 1 ? 's' : ''}`}
          </Text>
          <Ionicons
            name={comment.repliesExpanded ? 'chevron-up' : 'chevron-down'}
            size={13}
            color="#4F7CFF"
          />
        </TouchableOpacity>
      )}

      {/* Replies list */}
      {comment.repliesExpanded && comment.replies.map(reply => (
        <ReplyRow
          key={reply.id}
          reply={reply}
          onLike={() => onReplyLike(reply.id)}
          onReplyPress={onReplyPress}
        />
      ))}
    </View>
  );
};

const commentStyles = StyleSheet.create({
  wrapper: { paddingHorizontal: 16, marginBottom: 12, marginTop: 10 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6, marginLeft: 46 },
  pinText: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  content: { flex: 1, marginLeft: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  username: { color: '#fff', fontSize: 13, fontWeight: '700' },
  time: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  text: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20 },
  replyBtn: { marginTop: 8 },
  replyBtnText: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, fontWeight: '600' },
  likeBtn: { alignItems: 'center', gap: 4, paddingLeft: 10, paddingTop: 2 },
  likeCount: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  repliesToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 48, marginBottom: 12 },
  repliesLine: { width: 24, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  repliesToggleText: { color: '#4F7CFF', fontSize: 13, fontWeight: '600' },
});

// ─── CommentSheet ──────────────────────────────────────────────────────────────

interface CommentSheetProps {
  visible: boolean;
  totalCount: number;
  tweetId: string;
  onClose: () => void;
  tweetAuthorUsername?: string;
}

export const CommentSheet: React.FC<CommentSheetProps> = ({
  visible,
  totalCount,
  tweetId,
  onClose,
  tweetAuthorUsername,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [currentUser, setCurrentUser] = useState<CommentUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [currentCount, setCurrentCount] = useState(totalCount);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const { enabled: offlineEnabled, online, queueAction } = useOffline();

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // Mise à jour du compteur quand la prop change
  useEffect(() => {
    setCurrentCount(totalCount);
  }, [totalCount]);

  // Récupérer l'utilisateur actuel pour l'avatar
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await apiService.getCurrentUser();
        if (user) {
          setCurrentUser({
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            verified: user.verified,
          });
        }
      } catch (err) {
        console.log('Erreur fetch user:', err);
      }
    };
    fetchUser();
  }, []);

  // PanResponder pour le slide de fermeture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.5) {
          handleClose();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            // 2·√65 ≈ 16 : la feuille relâchée revient en butée sans
            // rebondir contre le bord de l'écran.
            tension: 65,
            friction: 16,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Animations montée/descente
  useEffect(() => {
    if (visible) {
      slideAnim.setValue(SCREEN_HEIGHT);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
      fetchComments();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const fetchComments = async () => {
    if (!tweetId) return;
    setLoading(true);
    try {
      const response = await apiService.getTweetReplies(tweetId, { nested: true, limit: 100 });
      if (response.success && response.data) {
        const allReplies = response.data.replies;
        
        // Formater tous les tweets reçus
        const allMapped = allReplies.map((t: Tweet) => ({
          id: t.id,
          parent_tweet_id: t.parent_tweet_id,
          user: {
            id: t.user_id,
            username: t.author?.username || 'inconnu',
            avatar: t.author?.avatar,
            verified: t.author?.verified,
          },
          text: t.content,
          likes: t.stats?.likes || 0,
          liked: t.user_interaction?.is_liked || false,
          createdAt: formatTime(t.createdAt || t.created_at || ''),
          replyTo: t.parentTweet?.author?.username,
          replies: [],
        }));

        // 1. Identifier les commentaires racines (réponses directes à la vidéo)
        const roots = allMapped.filter((c: any) => c.parent_tweet_id === tweetId);
        const others = allMapped.filter((c: any) => c.parent_tweet_id !== tweetId);

        // 2. Associer CHAQUE réponse à son commentaire racine respectif
        // On remonte la chaîne des parents jusqu'à trouver un root
        const rootMap: Record<string, Comment> = {};
        roots.forEach(r => { 
          r.replies = []; 
          rootMap[r.id] = r; 
        });

        others.forEach((other: any) => {
          let currentParentId = other.parent_tweet_id;
          let safetyBreak = 0;
          
          // Chercher quel root est l'ancêtre de cette réponse
          while (currentParentId && currentParentId !== tweetId && safetyBreak < 20) {
            if (rootMap[currentParentId]) {
              rootMap[currentParentId].replies.push(other);
              return;
            }
            // Remonter d'un cran
            const parent = allReplies.find((p: any) => p.id === currentParentId);
            currentParentId = parent ? parent.parent_tweet_id : null;
            safetyBreak++;
          }
        });

        // Trier les racines par date (plus récents en haut)
        roots.sort((a: any, b: any) => {
          const dateA = new Date(allReplies.find(p => p.id === a.id)?.createdAt || 0).getTime();
          const dateB = new Date(allReplies.find(p => p.id === b.id)?.createdAt || 0).getTime();
          return dateB - dateA;
        });

        // Trier les réponses au sein de chaque racine (plus anciens en haut pour la lecture fluide)
        roots.forEach(root => {
          root.replies.sort((a, b) => {
            const dateA = new Date(allReplies.find(p => p.id === a.id)?.createdAt || 0).getTime();
            const dateB = new Date(allReplies.find(p => p.id === b.id)?.createdAt || 0).getTime();
            return dateA - dateB;
          });
        });
        
        setComments(roots);
      }
    } catch (err) {
      console.error('Erreur lors de la récupération des commentaires:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setReplyingTo(null);
    setReplyingToCommentId(null);
    setInputText('');
    onClose();
  };

  const handleReplyPress = useCallback((username: string, commentId?: string) => {
    setReplyingTo(username);
    setReplyingToCommentId(commentId ?? null);
    setInputText('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  /**
   * Insère un commentaire dans l'arbre affiché — au bon endroit selon qu'on
   * répond au tweet ou à un commentaire. Partagé entre l'envoi en direct et
   * l'envoi différé hors ligne, qui doivent produire le même rendu.
   */
  const appendLocalComment = useCallback(
    (newComment: Comment) => {
      if (replyingToCommentId) {
        setComments(prev => prev.map(c => {
          if (c.id === replyingToCommentId) {
            return { ...c, replies: [...c.replies, newComment], repliesExpanded: true };
          }
          // Réponse à une réponse : rattachée au commentaire racine.
          if (c.replies.some(r => r.id === replyingToCommentId)) {
            return { ...c, replies: [...c.replies, newComment] };
          }
          return c;
        }));
      } else {
        setComments(prev => [newComment, ...prev]);
      }
      setCurrentCount(prev => prev + 1);
      inputRef.current?.blur();
    },
    [replyingToCommentId],
  );

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !tweetId) return;

    try {
      // Si c'est une réponse à un commentaire spécifique, on pourrait passer cet ID en parent_tweet_id
      // Mais ici on reste sur une logique simple : tout est une réponse au tweet vidéo
      const targetId = replyingToCommentId || tweetId;

      // Hors ligne (Pro) : le commentaire part en file et s'affiche tout de
      // suite. Le renvoyer en erreur obligerait à le réécrire au retour du
      // réseau, alors que le texte est déjà là.
      if (offlineEnabled && !online) {
        const queued = await queueAction({ type: 'reply', tweetId: targetId, content: trimmed });
        if (queued) {
          appendLocalComment({
            id: `pending_${Date.now()}`,
            parent_tweet_id: targetId,
            user: currentUser || { id: '', username: 'vous' },
            text: trimmed,
            likes: 0,
            liked: false,
            createdAt: 'en attente',
            replies: [],
          });
          setInputText('');
          setReplyingToCommentId(null);
          return;
        }
      }

      const response = await apiService.createTweet({
        content: trimmed,
        parent_tweet_id: targetId,
      });

      if (response.success && response.data) {
        const t = response.data;
        const newComment: Comment = {
          id: t.id,
          parent_tweet_id: targetId,
          user: {
            id: t.user_id,
            username: t.author?.username || 'vous',
            avatar: t.author?.avatar,
            verified: t.author?.verified,
          },
          text: t.content,
          likes: 0,
          liked: false,
          createdAt: 'maintenant',
          replies: [],
        };
        
        appendLocalComment(newComment);
        setInputText('');
        setReplyingTo(null);
        setReplyingToCommentId(null);
      }
    } catch (err) {
      console.error('Erreur lors de l\'envoi du commentaire:', err);
    }
  };

  const handleLikeComment = useCallback(async (commentId: string) => {
    try {
      const response = await apiService.likeTweet(commentId);
      if (response.success) {
        setComments(prev => prev.map(c => {
          // Si c'est le commentaire racine
          if (c.id === commentId) {
            const isLiked = !c.liked;
            return { ...c, liked: isLiked, likes: isLiked ? c.likes + 1 : c.likes - 1 };
          }
          
          // Si c'est une réponse au sein de ce commentaire
          if (c.replies && c.replies.some(r => r.id === commentId)) {
            return {
              ...c,
              replies: c.replies.map(r => {
                if (r.id !== commentId) return r;
                const isLiked = !r.liked;
                return { ...r, liked: isLiked, likes: isLiked ? r.likes + 1 : r.likes - 1 };
              })
            };
          }
          
          return c;
        }));
      }
    } catch (err) {
      console.error('Erreur lors du like:', err);
    }
  }, []);

  const handleLikeReply = useCallback(async (commentId: string, replyId: string) => {
    // Même logique de like via l'API tweetId
    await handleLikeComment(replyId);
  }, [handleLikeComment]);

  const handleToggleReplies = useCallback((commentId: string) => {
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      return { ...c, repliesExpanded: !c.repliesExpanded };
    }));
  }, []);

  const clearReply = () => {
    setReplyingTo(null);
    setReplyingToCommentId(null);
  };

  if (!visible) return null;

  return (
    <>
      <Animated.View
        style={[sheetStyles.backdrop, { opacity: backdropAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
      </Animated.View>

      <Animated.View
        style={[sheetStyles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        <View style={sheetStyles.handleBarArea} {...panResponder.panHandlers}>
          <View style={sheetStyles.handleBar} />
        </View>

        <View style={sheetStyles.header}>
          <Text style={sheetStyles.headerTitle}>
            {currentCount.toLocaleString('fr-FR')} commentaires
          </Text>
          <TouchableOpacity onPress={handleClose} style={sheetStyles.closeBtn}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 150 : 100}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1 }}>
            {loading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color="#fe2c55" size="large" />
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={item => item.id}
                style={{ flex: 1 }}
                renderItem={({ item }) => (
                  <CommentRow
                    comment={item}
                    onLike={() => handleLikeComment(item.id)}
                    onReplyLike={(replyId) => handleLikeReply(item.id, replyId)}
                    onReplyPress={(username) => handleReplyPress(username, item.id)}
                    onToggleReplies={() => handleToggleReplies(item.id)}
                  />
                )}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: 12, paddingBottom: 20 }}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => <View style={sheetStyles.separator} />}
                ListEmptyComponent={() => (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                      Soyez le premier à commenter !
                    </Text>
                  </View>
                )}
              />
            )}

            <View style={[sheetStyles.inputWrapper, { paddingBottom: insets.bottom + 8 }]}>
              {replyingTo && (
                <View style={sheetStyles.replyIndicator}>
                  <Ionicons name="return-down-forward" size={13} color="#4F7CFF" />
                  <Text style={sheetStyles.replyIndicatorText}>
                    Réponse à <Text style={{ color: '#4F7CFF', fontWeight: '700' }}>@{replyingTo}</Text>
                  </Text>
                  <TouchableOpacity onPress={clearReply} style={{ marginLeft: 'auto' }}>
                    <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                </View>
              )}

              <View style={sheetStyles.inputRow}>
                <MiniAvatar user={currentUser || { id: 'me', username: 'vous' }} size={36} />
                <View style={sheetStyles.inputContainer}>
                  <TextInput
                    ref={inputRef}
                    style={sheetStyles.input}
                    placeholder={replyingTo ? `Répondre à @${replyingTo}...` : 'Ajouter un commentaire...'}
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    maxLength={300}
                    returnKeyType="default"
                    selectionColor="#fe2c55"
                  />
                </View>
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={!inputText.trim()}
                  style={[sheetStyles.sendBtn, !inputText.trim() && { opacity: 0.35 }]}
                >
                  <Ionicons name="send" size={18} color="#fe2c55" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </>
  );
};

const sheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 100,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.72,
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 101,
    overflow: 'hidden',
  },
  handleBarArea: {
    width: '100%',
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleBar: {
    width: 36,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  separator: {
    height: 18,
  },
  inputWrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#111',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(29,155,240,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  replyIndicatorText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    maxHeight: 100,
  },
  input: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  sendBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});

export default CommentSheet;
