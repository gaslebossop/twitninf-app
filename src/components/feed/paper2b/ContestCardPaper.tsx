/**
 * 🧪 Carte de concours du fil « 2B — Gouttière ».
 *
 * Clone de `components/ContestCard.tsx` : même service, même cache, même
 * machine à états — seul le dessin change. L'original n'est pas touché, il
 * continue de servir tout le monde hors du test.
 *
 * Dans 2B, le concours est le SEUL aplat de couleur du fil. C'est délibéré :
 * l'accent rouge est réservé à l'identité (post du jour, onglet actif) et
 * l'ambre à l'argent. Un second aplat ailleurs et la carte cesse de ressortir.
 *
 * ⚠️ Le cache de session est CELUI DE L'ORIGINAL, importé, pas un second cache
 * local : les deux cartes ne coexistent jamais chez un même utilisateur, mais
 * `invalidateContestCache()` — appelé après une participation depuis l'écran
 * de concours — doit atteindre celle qui est réellement montée.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Tappable from '../../ui/Tappable';
import {
  Contest,
  fetchByTweet,
  formatPrize,
  formatTimeLeft,
} from '../../../services/contestService';
import { contestCache as cache } from '../../ContestCard';
import { paper, paperFonts, ps } from '../../../theme/paper2b';

interface Props {
  tweetId: string;
  onOpen: (contestId: string) => void;
}

export default function ContestCardPaper({ tweetId, onOpen }: Props) {
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

  // Le rebours ne tourne que tant qu'il y a quelque chose à décompter, et à la
  // minute : une seconde qui défile happe l'œil pendant qu'on lit autre chose.
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
  const state = resolveState(contest, timeLeft);
  const winners =
    contest.winners_count > 1 ? `${contest.winners_count} gagnants` : '1 gagnant';
  const entries = `${contest.entries_count} particip.`;

  return (
    <Tappable style={S.card} onPress={handlePress}>
      <View style={S.left}>
        <Text style={S.state} numberOfLines={1}>
          {state.label.toUpperCase()}
        </Text>
        <Text style={S.prize} numberOfLines={1}>
          {formatPrize(contest)}
        </Text>
        {contest.winners_count > 1 && <Text style={S.perWinner}>par gagnant</Text>}
      </View>

      <View style={S.right}>
        <Text style={S.meta}>{winners}</Text>
        <Text style={S.meta}>{entries}</Text>
        <Text style={S.cta} numberOfLines={1}>
          {state.cta} →
        </Text>
      </View>
    </Tappable>
  );
}

/**
 * Même machine à états que l'original, aux libellés près : la carte 2B est
 * étroite et l'appel à l'action y tient sur une ligne, donc les phrases
 * longues (« Tu as gagné — voir le résultat ») sont ramenées à deux mots.
 */
function resolveState(contest: Contest, timeLeft: string | null) {
  if (contest.status === 'cancelled') {
    return { label: 'Concours annulé', cta: 'voir' };
  }
  if (contest.status === 'closed') {
    if (contest.viewer.is_winner) return { label: 'Tu as gagné', cta: 'résultat' };
    return { label: 'Concours terminé', cta: 'gagnants' };
  }
  if (contest.status === 'drawing' || !timeLeft) {
    return { label: 'Tirage en cours', cta: 'suivre' };
  }
  if (contest.viewer.is_owner) {
    return { label: `Fin dans ${timeLeft}`, cta: 'mon concours' };
  }
  if (contest.viewer.is_participating) {
    return { label: `Fin dans ${timeLeft}`, cta: 'tu participes' };
  }
  return { label: `Fin dans ${timeLeft}`, cta: 'participer' };
}

const S = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(11),
    marginTop: ps(12),
    paddingVertical: ps(12),
    paddingHorizontal: ps(14),
    borderRadius: ps(14),
    backgroundColor: paper.amber,
  },
  left: {
    flexShrink: 1,
  },
  state: {
    fontFamily: paperFonts.mono,
    fontSize: ps(9),
    letterSpacing: ps(1.4),
    color: paper.onAmber,
  },
  prize: {
    fontFamily: paperFonts.display,
    fontSize: ps(26),
    letterSpacing: ps(-1),
    lineHeight: ps(28),
    marginTop: ps(4),
    color: paper.onAmber,
  },
  perWinner: {
    fontFamily: paperFonts.mono,
    fontSize: ps(9.5),
    marginTop: ps(2),
    color: paper.onAmber,
    opacity: 0.75,
  },
  right: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  meta: {
    fontFamily: paperFonts.mono,
    fontSize: ps(10),
    lineHeight: ps(16),
    color: paper.onAmber,
  },
  cta: {
    fontFamily: paperFonts.mono,
    fontSize: ps(10),
    lineHeight: ps(16),
    color: paper.onAmber,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,31,4,0.5)',
  },
});
