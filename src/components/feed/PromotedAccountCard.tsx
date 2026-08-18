import React, { memo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../Avatar';
import VerifiedBadge from '../VerifiedBadge';
import apiService from '../../services/api';
import { toast } from '../ui/Toast';
import { colors, fonts } from '../../theme';

export interface PromotedAccount {
  id: string;
  username: string;
  full_name?: string;
  avatar?: string | null;
  bio?: string;
  verified?: boolean;
  verification_style?: string;
  premium?: boolean;
  is_following?: boolean;
  stats?: { followers?: number; tweets?: number };
}

/**
 * Carte d'un COMPTE promu dans le fil.
 *
 * Une publicité pouvait jusqu'ici ne mettre en avant qu'un tweet ; un compte
 * promu n'en a aucun. Le passer à `TweetRow` produirait une carte de tweet
 * avec la bio en guise de texte et une rangée de boutons (aimer, répondre,
 * retweeter) qui ne visent rien. Ce qu'on montre d'un compte, c'est un
 * profil : qui il est, ce qu'il dit de lui, et de quoi s'y abonner.
 *
 * Le libellé « Sponsorisé » reprend celui de `TweetRow` — l'origine
 * publicitaire doit se lire pareil quelle que soit la forme de l'encart.
 */
function PromotedAccountCard({
  account,
  onOpen,
}: {
  account: PromotedAccount;
  /** Identifiant de la publicité — sert à comptabiliser le clic. */
  adId?: string;
  onOpen: () => void;
}) {
  const [following, setFollowing] = useState(!!account.is_following);
  const [pending, setPending] = useState(false);

  const toggleFollow = async () => {
    if (pending) return;
    const next = !following;
    // Optimiste : le bouton bascule tout de suite et revient si le serveur
    // refuse. Attendre l'aller-retour ferait douter d'avoir appuyé.
    setFollowing(next);
    setPending(true);
    try {
      const res = next
        ? await apiService.followUser(account.id)
        : await apiService.unfollowUser(account.id);
      if (!res?.success) throw new Error(res?.message || 'Action impossible');
    } catch (e: any) {
      setFollowing(!next);
      toast.error(e?.message || 'Action impossible pour le moment.');
    } finally {
      setPending(false);
    }
  };

  const followers = Number(account.stats?.followers) || 0;

  return (
    <View style={S.card}>
      <View style={S.adLabel}>
        <Ionicons name="sparkles" size={12} color="#1a1303" />
        <Text style={S.adLabelText}>Sponsorisé</Text>
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={onOpen} style={S.body}>
        <Avatar size={52} uri={account.avatar} username={account.username} />

        <View style={S.identity}>
          <View style={S.nameRow}>
            <Text style={S.name} numberOfLines={1}>
              {account.full_name || account.username}
            </Text>
            {!!account.verified && (
              <VerifiedBadge
                verificationStyle={(account.verification_style as any) || 'default'}
                size={15}
                premium={!!account.premium}
              />
            )}
          </View>
          <Text style={S.handle} numberOfLines={1}>@{account.username}</Text>
          {followers > 0 && (
            <Text style={S.followers}>
              {followers.toLocaleString()} abonné{followers > 1 ? 's' : ''}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[S.followBtn, following && S.followBtnOn]}
          onPress={toggleFollow}
          disabled={pending}
        >
          {pending ? (
            <ActivityIndicator size="small" color={following ? colors.textSecondary : colors.white} />
          ) : (
            <Text style={[S.followTxt, following && S.followTxtOn]}>
              {following ? 'Abonné' : 'Suivre'}
            </Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>

      {!!account.bio?.trim() && (
        <Text style={S.bio} numberOfLines={3}>{account.bio.trim()}</Text>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    // Même teinte que `tweetRowAd` : un encart payé se distingue du fil de la
    // même façon, qu'il porte un tweet ou un compte.
    backgroundColor: 'rgba(250, 204, 21, 0.04)',
  },
  adLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.gold,
  },
  adLabelText: {
    color: '#1a1303',
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  identity: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  handle: { fontSize: 13.5, color: colors.textSecondary, marginTop: 1 },
  followers: { fontSize: 12.5, color: colors.textMuted, marginTop: 3 },
  followBtn: {
    minWidth: 88,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  followBtnOn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  followTxt: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.white,
  },
  followTxtOn: { color: colors.textSecondary },
  bio: {
    marginTop: 12,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.textPrimary,
  },
});

export default memo(PromotedAccountCard);
