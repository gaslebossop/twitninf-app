import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, withAlpha } from '../../theme';
import { round, space, touch, type } from '../../theme/eventScale';
import type { EventArt } from '../../theme/eventArt';
import { ease } from '../../utils/gesture';
import eventsApi, { type GuestbookPost } from '../../services/eventsApi';
import Avatar from '../Avatar';
import Tappable from '../ui/Tappable';
import { toast } from '../ui/Toast';
import feedback from '../../utils/feedback';
import type { QuestView, TwEvent } from '../../types/events';

/**
 * L'onglet « Fête » — ce qui fait que la page est un lieu et pas une liste.
 *
 * ── Le diagnostic ─────────────────────────────────────────────────────────
 * Les deux premières versions du hub étaient une liste de quêtes, et rien
 * d'autre. On la parcourait une fois, on comprenait qu'il fallait cocher onze
 * cases, et on n'y revenait plus. Le décor n'y changeait rien : le problème
 * n'était pas l'habillage, c'était l'absence de contenu.
 *
 * Ce panneau apporte les deux seules choses qui donnent une raison de revenir :
 *
 * 1. **L'objectif commun**, sorti de la liste et affiché en grand. Il bouge
 *    sans qu'on fasse quoi que ce soit, parce que d'autres gens publient. On
 *    revient pour voir où il en est — ce qu'aucune quête personnelle ne
 *    provoque.
 * 2. **Le livre d'or**, écrit par les gens et différent à chaque visite.
 *
 * Les quêtes restent dans leur propre onglet. Elles sont la mécanique, pas la
 * fête.
 */

interface Props {
  event: TwEvent;
  art: EventArt;
  quests: QuestView[];
  onQuestsChanged: () => void;
}

/** Formate un grand nombre sans le rendre illisible : 4 213 → « 4 213 ». */
function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

/**
 * L'objectif commun, en grand.
 *
 * Le compteur est celui de TOUTE l'app. C'est le seul élément de l'événement
 * qui progresse pendant qu'on le regarde, et c'est exactement ce qu'on veut
 * mettre en avant : la preuve qu'il se passe quelque chose ailleurs.
 */
function CollectiveGoal({ quest, art }: { quest: QuestView; art: EventArt }) {
  const shown = quest.state.community ?? { progress: quest.state.progress, goal: quest.state.goal };
  const ratio = Math.min(1, shown.goal > 0 ? shown.progress / shown.goal : 0);
  const reached = ratio >= 1;

  const target = useDerivedValue(
    () => withTiming(ratio, { duration: 700, easing: ease.out }),
    [ratio],
  );
  const fillStyle = useAnimatedStyle(() => ({
    width: `${interpolate(target.value, [0, 1], [0, 100], Extrapolation.CLAMP)}%`,
  }));

  return (
    <View style={[S.panel, { backgroundColor: art.colors.surface, borderColor: art.colors.border }]}>
      <LinearGradient
        colors={[withAlpha(art.colors.ember, 0.1), 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={S.panelHead}>
        <Ionicons name="people" size={15} color={art.colors.festive} />
        <Text style={[S.panelTitle, { color: art.colors.festive }]}>OBJECTIF COMMUN</Text>
      </View>

      <Text style={[S.bigNumber, { fontFamily: art.fonts.display, color: art.colors.text }]}>
        {fmt(shown.progress)}
        <Text style={[S.bigNumberGoal, { color: art.colors.textMuted }]}>
          {' '}/ {fmt(shown.goal)}
        </Text>
      </Text>

      <Text style={[S.panelText, { color: art.colors.textDim }]}>{quest.description}</Text>

      <View style={[S.bigTrack, { backgroundColor: art.colors.surfaceAlt }]}>
        <Animated.View style={[S.bigFill, fillStyle]}>
          <LinearGradient
            colors={art.gradients.festive}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>

      <Text
        style={[
          S.panelFoot,
          { color: reached ? art.colors.festive : art.colors.textMuted },
        ]}
      >
        {reached
          ? `Objectif atteint — ${quest.reward.label}`
          : `Encore ${fmt(shown.goal - shown.progress)} · ${quest.reward.label}`}
      </Text>
    </View>
  );
}

export default function EventCelebration({ event, art, quests, onQuestsChanged }: Props) {
  const [posts, setPosts] = useState<GuestbookPost[]>([]);
  const [mine, setMine] = useState<GuestbookPost | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const collective = useMemo(() => quests.find((q) => q.kind === 'collective'), [quests]);

  const load = useCallback(async () => {
    const result = await eventsApi.fetchGuestbook(event.slug);
    setPosts(result.posts);
    setMine(result.mine);
    setLoading(false);
  }, [event.slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    const result = await eventsApi.postGuestbook(event.slug, message);
    setSending(false);

    if (!result.ok) {
      feedback.refuse();
      toast.error('Message non enregistré', { description: result.message });
      return;
    }

    feedback.success();
    setDraft('');
    await load();
    // Écrire valide la quête du livre d'or côté serveur : le parent doit
    // relire l'état, sinon la quête reste affichée « à faire ».
    onQuestsChanged();
  }, [draft, sending, event.slug, load, onQuestsChanged]);

  return (
    <View style={S.root}>
      {collective && <CollectiveGoal quest={collective} art={art} />}

      {/* ── Livre d'or ── */}
      <View style={[S.panel, { backgroundColor: art.colors.surface, borderColor: art.colors.border }]}>
        <View style={S.panelHead}>
          <Ionicons name="book" size={15} color={art.colors.festive} />
          <Text style={[S.panelTitle, { color: art.colors.festive }]}>LIVRE D'OR</Text>
        </View>

        {mine ? (
          // On ne montre pas un champ de saisie à qui a déjà signé : le serveur
          // refuserait, et proposer une action vouée au refus est une promesse
          // qu'on ne tient pas.
          <View style={[S.mine, { backgroundColor: withAlpha(art.colors.festive, 0.1) }]}>
            <Ionicons name="checkmark-circle" size={15} color={art.colors.festive} />
            <Text style={[S.mineText, { color: art.colors.textDim }]} numberOfLines={3}>
              Ton mot : « {mine.message} »
            </Text>
          </View>
        ) : (
          <View style={S.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Laisse un mot d'anniversaire…"
              placeholderTextColor={art.colors.textMuted}
              style={[
                S.input,
                { backgroundColor: art.colors.surfaceAlt, color: art.colors.text },
              ]}
              multiline
              maxLength={280}
            />
            <View style={S.composerFoot}>
              <Text style={[S.counter, { color: art.colors.textMuted }]}>
                {draft.trim().length}/280
              </Text>
              <Tappable
                style={[
                  S.send,
                  { backgroundColor: draft.trim() ? art.colors.festive : art.colors.surfaceAlt },
                ]}
                onPress={send}
                disabled={!draft.trim() || sending}
                haptic="select"
              >
                <Text
                  style={[
                    S.sendLabel,
                    { color: draft.trim() ? art.colors.onFestive : art.colors.textMuted },
                  ]}
                >
                  {sending ? 'Envoi…' : 'Signer'}
                </Text>
              </Tappable>
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={art.colors.festive} style={S.loader} />
        ) : posts.length === 0 ? (
          <Text style={[S.empty, { color: art.colors.textMuted }]}>
            Personne n'a encore signé. Sois le premier.
          </Text>
        ) : (
          <View style={S.posts}>
            {posts.map((post) => (
              <View key={post.id} style={[S.post, { borderTopColor: art.colors.border }]}>
                <Avatar size={30} username={post.author?.username || '?'} uri={post.author?.avatar} />
                <View style={S.postBody}>
                  <View style={S.postHead}>
                    <Text style={[S.postAuthor, { color: art.colors.text }]} numberOfLines={1}>
                      @{post.author?.username ?? 'anonyme'}
                    </Text>
                    <Text style={[S.postTime, { color: art.colors.textMuted }]}>
                      {timeAgo(post.created_at)}
                    </Text>
                  </View>
                  <Text style={[S.postText, { color: art.colors.textDim }]}>{post.message}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { gap: space.sm },

  // Meme rembourrage que les cartes de quete : c'est la regularite du
  // rembourrage, plus que sa valeur, qui se voit.
  panel: {
    borderRadius: round.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    overflow: 'hidden',
    shadowColor: '#2A1240',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.sm },
  panelTitle: { fontFamily: fonts.bold, ...type.caption, letterSpacing: 1.3 },
  panelText: { fontFamily: fonts.regular, ...type.bodySm, marginTop: space.xs },
  panelFoot: { fontFamily: fonts.semibold, ...type.bodySm, marginTop: space.sm },

  bigNumber: { ...type.display },
  bigNumberGoal: { ...type.h2 },
  bigTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: space.sm },
  bigFill: { height: '100%', borderRadius: 4, overflow: 'hidden' },

  composer: { gap: space.xs },
  input: {
    borderRadius: round.lg,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: 80,
    fontFamily: fonts.regular,
    ...type.body,
    textAlignVertical: 'top',
  },
  composerFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { fontFamily: fonts.medium, ...type.caption },
  send: {
    paddingHorizontal: space.lg,
    // 44 pt minimum, comme toute cible tactile.
    height: touch.min,
    borderRadius: round.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendLabel: { fontFamily: fonts.bold, ...type.label },

  mine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    padding: space.sm,
    borderRadius: round.lg,
  },
  mineText: { flex: 1, fontFamily: fonts.regular, ...type.bodySm },

  loader: { marginTop: space.md },
  empty: { fontFamily: fonts.regular, ...type.bodySm, textAlign: 'center', marginTop: space.md },

  posts: { marginTop: space.xs },
  post: {
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: space.sm,
    marginTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  postBody: { flex: 1 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  postAuthor: { fontFamily: fonts.semibold, ...type.bodySm },
  postTime: { fontFamily: fonts.regular, ...type.caption },
  postText: { fontFamily: fonts.regular, ...type.body, marginTop: space.xxs },
});
