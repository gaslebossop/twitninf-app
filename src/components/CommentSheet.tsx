import { fonts , colors} from '../theme';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Dimensions,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ease, springs } from '../utils/gesture';
import { LIST_TUNING } from '../utils/listTuning';
import useSheetGesture from '../hooks/useSheetGesture';
// `expo-image` plutôt que `Image` de React Native : cache disque et décodage
// hors du thread JS. `transition={0}` : aucune apparition en fondu, le rendu
// reste identique.
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOffline } from '../contexts/OfflineContext';
import apiService from '../services/api';
import { Tweet } from '../types/api';
import { useAuth } from '../contexts/AuthContext';

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
  const scale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }] as const,
  }));

  const handleLike = () => {
    // Le pop part sur le thread UI : il ne dépend donc pas de l'aller-retour
    // réseau du like, qui est justement ce qui le retardait.
    scale.value = withSequence(
      withTiming(1.4, { duration: 100, easing: ease.out }),
      withTiming(1, { duration: 100, easing: ease.out }),
    );
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
        <Animated.View style={heartStyle}>
          <Ionicons name="heart" size={15} color={reply.liked ? '#fe2c55' : colors.textSecondary} />
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
  time: { color: colors.textMuted, fontSize: 11 },
  text: { color: colors.textPrimary, fontSize: 13.5, lineHeight: 19 },
  replyMention: { color: '#4F7CFF', fontWeight: '600' },
  replyBtn: { marginTop: 6 },
  replyBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  likeBtn: { alignItems: 'center', gap: 3, paddingLeft: 8, paddingTop: 2 },
  likeCount: { color: colors.textSecondary, fontSize: 11 },
});

// ─── Comment Row ───────────────────────────────────────────────────────────────

/**
 * Handler unique et stable, sur le modèle de `TweetRowAction`
 * (`components/feed/TweetRow.tsx`) : quatre closures par ligne et par rendu
 * (`onLike`, `onReplyLike`, `onReplyPress`, `onToggleReplies`) rendaient tout
 * `React.memo` posé sur `CommentRow` inopérant, puisque les props changeraient
 * quand même à chaque rendu de `CommentSheet`.
 */
export type CommentRowAction =
  | { type: 'like'; commentId: string }
  | { type: 'replyLike'; commentId: string; replyId: string }
  | { type: 'reply'; username: string; commentId: string }
  | { type: 'toggleReplies'; commentId: string };

function commentRowsEqual(
  prev: { comment: Comment; onAction: (action: CommentRowAction) => void },
  next: { comment: Comment; onAction: (action: CommentRowAction) => void },
) {
  const a = prev.comment;
  const b = next.comment;
  return (
    a.id === b.id &&
    a.likes === b.likes &&
    a.liked === b.liked &&
    a.repliesExpanded === b.repliesExpanded &&
    // Référence, pas longueur : `handleLikeComment` ne construit un nouveau
    // tableau `replies` QUE pour le commentaire dont une réponse a changé
    // (`c.replies.map(...)`) ; les autres gardent la même référence. Une
    // comparaison sur `.length` laisserait passer le like d'une réponse sans
    // que la ligne se re-rende.
    a.replies === b.replies &&
    a.text === b.text &&
    prev.onAction === next.onAction
  );
}

const CommentRow = React.memo(function CommentRow({
  comment,
  onAction,
}: {
  comment: Comment;
  onAction: (action: CommentRowAction) => void;
}) {
  const scale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }] as const,
  }));

  const handleLike = () => {
    scale.value = withSequence(
      withTiming(1.5, { duration: 120, easing: ease.out }),
      withSpring(1, springs.snappy),
    );
    onAction({ type: 'like', commentId: comment.id });
  };

  return (
    <View style={commentStyles.wrapper}>
      {comment.pinned && (
        <View style={commentStyles.pinRow}>
          <Ionicons name="pin" size={11} color={colors.textMuted} />
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
          <TouchableOpacity
            onPress={() => onAction({ type: 'reply', username: comment.user.username, commentId: comment.id })}
            style={commentStyles.replyBtn}
          >
            <Text style={commentStyles.replyBtnText}>Répondre</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleLike} style={commentStyles.likeBtn}>
          <Animated.View style={heartStyle}>
            <Ionicons name="heart" size={18} color={comment.liked ? '#fe2c55' : colors.textSecondary} />
          </Animated.View>
          <Text style={commentStyles.likeCount}>{formatLikes(comment.likes)}</Text>
        </TouchableOpacity>
      </View>

      {/* Replies toggle */}
      {comment.replies.length > 0 && (
        <TouchableOpacity
          style={commentStyles.repliesToggle}
          onPress={() => onAction({ type: 'toggleReplies', commentId: comment.id })}
        >
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
          onLike={() => onAction({ type: 'replyLike', commentId: comment.id, replyId: reply.id })}
          // `commentId: comment.id` (la racine), PAS l'id de la réponse que
          // `ReplyRow` transmet dans son deuxième argument. Comportement
          // hérité : dans l'ancien code, `onReplyPress` partagé par les deux
          // composants était `(username) => handleReplyPress(username,
          // item.id)` — une fonction n'acceptant qu'un seul paramètre, donc le
          // second argument que `ReplyRow` lui passait (`reply.id`) était
          // silencieusement ignoré par JavaScript. Répondre à une réponse
          // attribuait donc déjà la réponse au commentaire racine, jamais à la
          // réponse elle-même. Le reproduire à l'identique évite d'activer sans
          // le vouloir la branche « réponse à une réponse » de
          // `appendLocalComment`, qui n'a jamais été exercée jusqu'ici.
          onReplyPress={(username) => onAction({ type: 'reply', username, commentId: comment.id })}
        />
      ))}
    </View>
  );
}, commentRowsEqual);

const commentStyles = StyleSheet.create({
  wrapper: { paddingHorizontal: 16, marginBottom: 12, marginTop: 10 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6, marginLeft: 46 },
  pinText: { color: colors.textMuted, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  content: { flex: 1, marginLeft: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  username: { color: '#fff', fontSize: 13, fontWeight: '700' },
  time: { color: colors.textMuted, fontSize: 12 },
  text: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  replyBtn: { marginTop: 8 },
  replyBtnText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
  likeBtn: { alignItems: 'center', gap: 4, paddingLeft: 10, paddingTop: 2 },
  likeCount: { color: colors.textSecondary, fontSize: 12 },
  repliesToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 48, marginBottom: 12 },
  repliesLine: { width: 24, height: 1, backgroundColor: colors.overlayStrong },
  repliesToggleText: { color: '#4F7CFF', fontSize: 13, fontWeight: '600' },
});

// Sortis au niveau module : une flèche inline donnerait un TYPE neuf à chaque
// rendu de `CommentSheet`. React compare les composants par identité, donc
// `FlatList` démontait puis remontait le séparateur et le message vide à
// chaque frappe dans le compositeur, au lieu de les laisser en place.
/**
 * Plafond de commentaires demandé au serveur.
 *
 * Ce n'est PAS une taille de page : la feuille reçoit une liste plate de
 * réponses imbriquées et reconstruit l'arbre elle-même (chaque réponse remonte
 * la chaîne de ses parents jusqu'à sa racine). Paginer cette liste orphelinerait
 * toute réponse dont la racine tomberait sur une autre page — descendre le
 * plafond aggraverait donc le problème au lieu de le corriger.
 *
 * La vraie pagination doit venir du serveur, sur les commentaires RACINES,
 * avec leurs réponses attachées. En attendant, le plafond reste à 100 mais
 * il ne tronque plus en silence : voir `truncated` ci-dessous.
 */
const COMMENTS_FETCH_LIMIT = 100;

/** Se dit quand le serveur a plus de réponses que le plafond n'en a demandé. */
const TruncatedNotice = () => (
  <View style={sheetStyles.truncatedNotice}>
    <Text style={sheetStyles.truncatedNoticeText}>
      Seuls les {COMMENTS_FETCH_LIMIT} premiers commentaires sont affichés.
    </Text>
  </View>
);

const Separator = () => <View style={sheetStyles.separator} />;
const EmptyComments = () => (
  <View style={{ padding: 40, alignItems: 'center' }}>
    <Text style={{ color: colors.textMuted, fontSize: 13 }}>
      Soyez le premier à commenter !
    </Text>
  </View>
);

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
  const [truncated, setTruncated] = useState(false);
  const [currentUser, setCurrentUser] = useState<CommentUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [currentCount, setCurrentCount] = useState(totalCount);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const sheetHeight = Math.min(windowHeight * (windowHeight < 700 ? 0.82 : 0.74), windowHeight - insets.top - 12);
  const closeDistance = Math.max(96, sheetHeight * 0.18);
  const { enabled: offlineEnabled, online, queueAction } = useOffline();

  /**
   * Fermeture réelle : on remet le champ à zéro et on prévient le parent.
   *
   * Appelée par le hook UNE FOIS la feuille sortie de l'écran. C'est ce qui
   * répare un défaut de longue date : `if (!visible) return null` démontait le
   * composant à l'instant où le parent basculait `visible`, si bien que
   * l'animation de sortie écrite plus bas n'a jamais eu l'occasion de jouer —
   * la feuille disparaissait d'un coup. Maintenant elle descend, PUIS le
   * parent est prévenu.
   */
  const finishClose = useCallback(() => {
    setReplyingTo(null);
    setReplyingToCommentId(null);
    setInputText('');
    onClose();
  }, [onClose]);

  const { gesture, sheetStyle, scrimStyle, open, close } = useSheetGesture({
    onClosed: finishClose,
    travel: sheetHeight,
    dismissDistance: closeDistance,
  });

  // Mise à jour du compteur quand la prop change
  useEffect(() => {
    setCurrentCount(totalCount);
  }, [totalCount]);

  // L'utilisateur actuel, pour l'avatar du composeur.
  /**
   * `useAuth()` plutôt qu'un `getCurrentUser()` réseau : `AuthContext` détient
   * déjà l'utilisateur courant, et ce composant en est un descendant. C'était
   * un aller-retour complet, à chaque ouverture, pour une donnée en mémoire.
   */
  const { user: authUser } = useAuth();
  useEffect(() => {
    if (!authUser?.id) return;
    setCurrentUser({
      id: authUser.id,
      username: authUser.username,
      avatar: (authUser as any)?.avatar,
      verified: authUser.verified,
    });
  }, [authUser]);

  // Montée à l'ouverture. La descente, elle, est déclenchée par `close()` :
  // elle doit précéder le changement de `visible`, pas le suivre.
  useEffect(() => {
    if (!visible) return;
    open();
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const fetchComments = async () => {
    if (!tweetId) return;
    setLoading(true);
    try {
      const response = await apiService.getTweetReplies(tweetId, {
        nested: true,
        limit: COMMENTS_FETCH_LIMIT,
      });
      if (response.success && response.data) {
        // `pagination.hasMore` était reçu, typé, et jeté : au-delà du plafond,
        // la feuille affichait une vue tronquée sans jamais le dire.
        setTruncated(!!response.data.pagination?.hasMore);
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

  /** Bouton « fermer » et voile : ils lancent la sortie, ils ne la court-circuitent pas. */
  const handleClose = close;

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

  /**
   * Handler unique et stable pour `CommentRow`, sur le modèle de
   * `TweetRow`/`TweetRowGutter`. Les quatre handlers ci-dessus sont eux-mêmes
   * déjà stables (`useCallback` à dépendances vides ou stables), donc CE
   * handler l'est aussi — `React.memo(CommentRow, commentRowsEqual)` compare
   * `onAction` par référence, et cette référence ne change jamais entre deux
   * rendus de `CommentSheet`.
   */
  const handleCommentAction = useCallback((action: CommentRowAction) => {
    switch (action.type) {
      case 'like':
        handleLikeComment(action.commentId);
        break;
      case 'replyLike':
        handleLikeReply(action.commentId, action.replyId);
        break;
      case 'reply':
        handleReplyPress(action.username, action.commentId);
        break;
      case 'toggleReplies':
        handleToggleReplies(action.commentId);
        break;
    }
  }, [handleLikeComment, handleLikeReply, handleReplyPress, handleToggleReplies]);

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => <CommentRow comment={item} onAction={handleCommentAction} />,
    [handleCommentAction],
  );

  const commentKeyExtractor = useCallback((item: Comment) => item.id, []);

  const clearReply = () => {
    setReplyingTo(null);
    setReplyingToCommentId(null);
  };

  if (!visible) return null;

  return (
    <>
      <Animated.View
        style={[sheetStyles.backdrop, scrimStyle]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
      </Animated.View>

      <Animated.View
        style={[
          sheetStyles.sheet,
          { height: sheetHeight, maxHeight: windowHeight - insets.top - 8 },
          sheetStyle,
        ]}
      >
        {/* Le geste reste sur la POIGNÉE seule, comme avant : la feuille est
            pleine d'une liste de commentaires, et un glissé attrapé n'importe
            où lui volerait son défilement. */}
        <GestureDetector gesture={gesture}>
          <View style={sheetStyles.handleBarArea}>
            <View style={sheetStyles.handleBar} />
          </View>
        </GestureDetector>

        <View style={sheetStyles.header}>
          <Text style={sheetStyles.headerTitle}>
            {currentCount.toLocaleString('fr-FR')} commentaires
          </Text>
          <TouchableOpacity onPress={handleClose} style={sheetStyles.closeBtn}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
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
                keyExtractor={commentKeyExtractor}
                style={{ flex: 1 }}
                renderItem={renderComment}
                // La requête demande jusqu'à 100 commentaires d'un bloc, chacun
                // portant ses réponses imbriquées. Sur les défauts de React
                // Native la fenêtre en gardait une bonne part montée — c'est ce
                // réglage qui décide combien de lignes une frappe fait
                // travailler, et donc ce qui borne le coût.
                {...LIST_TUNING}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: windowWidth < 360 ? 8 : 12, paddingBottom: insets.bottom + 20 }}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={Separator}
                ListEmptyComponent={EmptyComments}
                ListFooterComponent={truncated ? TruncatedNotice : null}
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
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
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
                    placeholderTextColor={colors.textMuted}
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
  truncatedNotice: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  truncatedNoticeText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
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
    backgroundColor: colors.overlayStrong,
    borderRadius: 2.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.overlayMedium,
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
    borderTopColor: colors.overlayMedium,
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
    color: colors.textSecondary,
    fontSize: 12.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: colors.overlayMedium,
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
