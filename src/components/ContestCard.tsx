import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import Tappable from './ui/Tappable';
import {
  Contest,
  describeConditions,
  fetchByTweet,
  formatPrize,
  formatTimeLeft,
} from '../services/contestService';

/**
 * Carte de concours affichée sous un tweet de type `concours`, dans le fil.
 *
 * ── Pourquoi elle va chercher le concours elle-même ──────────────────────
 * Le fil est servi par plusieurs moteurs de recommandation (Node et Rust) :
 * greffer le concours dans la charge utile du fil obligerait à modifier
 * chacun d'eux et à parier qu'aucun ne sera oublié dans six mois. La carte
 * fait donc un appel, mais UNIQUEMENT pour les tweets de type `concours` —
 * qui sont rares — et met le résultat en cache le temps de la session.
 *
 * ── Compte à rebours ─────────────────────────────────────────────────────
 * Rafraîchi à la minute, pas à la seconde : une seconde qui défile sur une
 * carte de fil attire l'œil en permanence pendant qu'on lit autre chose, et
 * réveille la liste 60 fois plus souvent pour rien.
 */

/**
 * Cache de session, partagé par toutes les cartes. Sans lui, le même concours
 * est redemandé à chaque fois que la FlatList recycle la ligne — c'est-à-dire
 * à chaque aller-retour de défilement.
 */
const cache = new Map<string, Contest>();

interface Props {
  tweetId: string;
  /** Ouvre l'écran de participation. */
  onOpen: (contestId: string) => void;
}

export default function ContestCard({ tweetId, onOpen }: Props) {
  const [contest, setContest] = useState<Contest | null>(cache.get(tweetId) ?? null);
  const [, forceTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (cache.has(tweetId)) {
      setContest(cache.get(tweetId)!);
      return;
    }
    let cancelled = false;
    fetchByTweet(tweetId)
      .then((result) => {
        if (cancelled || !mounted.current || !result) return;
        cache.set(tweetId, result);
        setContest(result);
      })
      .catch(() => {
        /* Un concours introuvable laisse simplement la carte masquée. */
      });
    return () => {
      cancelled = true;
    };
  }, [tweetId]);

  // Le rebours ne tourne que tant qu'il y a quelque chose à décompter.
  const open = contest?.status === 'open';
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      if (mounted.current) forceTick((n) => n + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, [open]);

  const handlePress = useCallback(() => {
    if (contest) onOpen(contest.id);
  }, [contest, onOpen]);

  if (!contest) return null;

  const timeLeft = formatTimeLeft(contest.ends_at);
  const conditions = describeConditions(contest.conditions);
  const state = resolveState(contest, timeLeft);

  return (
    <Tappable style={[S.card, state.tone === 'closed' && S.cardClosed]} onPress={handlePress}>
      <View style={S.headRow}>
        <View style={S.badge}>
          <Ionicons name="gift" size={12} color={colors.accent} />
          <Text style={S.badgeText}>CONCOURS</Text>
        </View>
        <Text style={[S.state, state.tone === 'live' && S.stateLive]}>{state.label}</Text>
      </View>

      <Text style={S.prize}>{formatPrize(contest)}</Text>
      {contest.winners_count > 1 && <Text style={S.perWinner}>par gagnant</Text>}
      {!!contest.title && <Text style={S.title} numberOfLines={2}>{contest.title}</Text>}

      <View style={S.metaRow}>
        <Text style={S.meta}>
          {contest.winners_count > 1
            ? `${contest.winners_count} gagnants`
            : '1 gagnant'}
        </Text>
        <Text style={S.dot}>·</Text>
        <Text style={S.meta}>
          {contest.entries_count} participant{contest.entries_count > 1 ? 's' : ''}
        </Text>
      </View>

      {conditions.length > 0 && (
        <Text style={S.conditions} numberOfLines={2}>
          Pour participer : {conditions.join(' · ')}
        </Text>
      )}

      {/* Le statut du spectateur passe avant l'appel à l'action : quelqu'un
          déjà inscrit ne doit pas relire « Participer » à chaque passage. */}
      <View style={S.footer}>
        <Text style={[S.cta, state.tone === 'closed' && S.ctaMuted]}>{state.cta}</Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={state.tone === 'closed' ? colors.textMuted : colors.accent}
        />
      </View>
    </Tappable>
  );
}

/** Un seul endroit décide de ce que la carte raconte, selon l'état réel. */
function resolveState(contest: Contest, timeLeft: string | null) {
  if (contest.status === 'cancelled') {
    return { tone: 'closed' as const, label: 'Annulé', cta: 'Concours annulé' };
  }
  if (contest.status === 'closed') {
    if (contest.viewer.is_winner) {
      return { tone: 'live' as const, label: 'Terminé', cta: 'Tu as gagné — voir le résultat' };
    }
    return { tone: 'closed' as const, label: 'Terminé', cta: 'Voir les gagnants' };
  }
  // `drawing`, ou échéance passée mais cron pas encore repassé : dire que le
  // tirage arrive, pas afficher un rebours négatif ni un bouton inopérant.
  if (contest.status === 'drawing' || !timeLeft) {
    return { tone: 'live' as const, label: 'Tirage en cours', cta: 'Voir le concours' };
  }
  if (contest.viewer.is_owner) {
    return { tone: 'live' as const, label: `Fin dans ${timeLeft}`, cta: 'Suivre mon concours' };
  }
  if (contest.viewer.is_participating) {
    return { tone: 'live' as const, label: `Fin dans ${timeLeft}`, cta: 'Tu participes déjà' };
  }
  return { tone: 'live' as const, label: `Fin dans ${timeLeft}`, cta: 'Participer' };
}

/** Vide le cache d'un concours après une participation, pour que la carte
 *  reflète le nouvel état sans attendre un redémarrage. */
export function invalidateContestCache(tweetId?: string) {
  if (tweetId) cache.delete(tweetId);
  else cache.clear();
}

const S = StyleSheet.create({
  card: {
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  cardClosed: {
    backgroundColor: colors.overlaySoft,
    borderColor: colors.borderSubtle,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.accent,
  },
  state: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  stateLive: {
    color: colors.textSecondary,
  },
  prize: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  perWinner: {
    marginTop: 1,
    fontSize: 11,
    color: colors.textMuted,
  },
  title: {
    marginTop: 3,
    fontSize: 13.5,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  dot: {
    fontSize: 12,
    color: colors.textMuted,
  },
  conditions: {
    marginTop: 8,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  cta: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  ctaMuted: {
    color: colors.textMuted,
  },
});
