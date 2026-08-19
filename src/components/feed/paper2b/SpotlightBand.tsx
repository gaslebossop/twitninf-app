import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Avatar from '../../Avatar';
import {
  paper,
  paperFonts,
  ps,
  GUTTER_W,
  ROW_PAD_X,
  ROW_GAP,
} from '../../../theme/paper2b';
import apiService from '../../../services/api';
import type { Tweet } from '../../../types/api';

/**
 * 🧪 Le post du jour — version « 2B — Gouttière ».
 *
 * Le tweet le plus aimé d'hier, en tête du fil. Même donnée et même contrat
 * que `components/SpotlightBanner.tsx` (qui sert le fil d'origine) :
 * `GET /api/spotlight/today`, rien à afficher tant qu'il n'a pas répondu.
 *
 * ── Ce que le bandeau d'origine faisait, et pourquoi ça ne tient pas ici ──
 * Il se signalait par un filet ondulé en accent le long du bord gauche, un 📌
 * en haut à droite, une icône d'étincelles et un libellé en accent. Quatre
 * marques pour dire une seule chose. Dans 2B — un seul accent, aucun aplat, et
 * pas un filet dans tout le fil — ces quatre marques sont quatre corps
 * étrangers.
 *
 * ── Le dessin retenu : la ligne dont le compteur a gagné ─────────────────
 * Dans ce fil, une ligne est un chiffre dans la gouttière et un texte à côté.
 * Le post du jour est exactement ça : la ligne dont le chiffre est le plus
 * grand. On lui donne donc la MÊME structure, avec le compteur d'hier posé
 * dans la gouttière, en accent, à un corps qu'aucune autre ligne n'atteint.
 * Rien d'autre ne le distingue. C'est le plus gros chiffre de la page, et
 * c'est tout ce qu'il a besoin d'être.
 *
 * ── Un cran de fond, pas une carte ───────────────────────────────────────
 * La bande porte `paper.bgBand` sur toute la largeur, sans coin arrondi et
 * sans filet : le changement de ton EST la limite. Un fil qui n'a pas une
 * seule règle horizontale n'en gagnerait pas deux pour cet élément-là.
 *
 * ── Le compteur ne se touche pas ─────────────────────────────────────────
 * Aucun cœur au-dessus du chiffre, contrairement à une ligne du fil : ce
 * total est celui d'hier, pas l'état du cœur de la personne qui lit. Un cœur
 * ici serait une cible qui n'en est pas une. Le mot LIKES le dit à sa place,
 * et c'est la bande ENTIÈRE qui est tactile — vers le tweet, la seule chose
 * qu'on puisse vouloir en faire.
 */

interface SpotlightBandProps {
  /** Incrémenter cette valeur force un rechargement (pull-to-refresh du fil). */
  refreshSignal?: number;
  onOpenTweet?: (tweetId: string) => void;
  style?: StyleProp<ViewStyle>;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n || 0);
}

export default function SpotlightBand({
  refreshSignal = 0,
  onOpenTweet,
  style,
}: SpotlightBandProps) {
  const [tweet, setTweet] = useState<Tweet | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await apiService.getSpotlight();
      if (response.success && response.data) {
        setTweet(response.data.tweet);
        setLikeCount(response.data.like_count);
      } else {
        setTweet(null);
      }
    } catch {
      setTweet(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  if (loading || !tweet) return null;

  const author = tweet.author;
  const previewImage = tweet.media_urls?.[0];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[S.band, style]}
      onPress={() => onOpenTweet?.(tweet.id)}
      accessibilityRole="button"
      accessibilityLabel={`Post du jour de ${author?.full_name || author?.username || 'twitninf'}, ${likeCount} likes hier`}
    >
      {/* ── Gouttière : le compteur qui a gagné ── */}
      <View style={S.gutter}>
        <Text style={S.count}>{fmtCount(likeCount)}</Text>
        {/* Deux lignes écrites, pas un retour à la ligne subi : à 52 px, la
            coupure automatique de « LIKES HIER » dépend de la largeur de
            l'écran et finit par couper au mauvais endroit. */}
        <Text style={S.unit}>{'LIKES\nHIER'}</Text>
      </View>

      {/* ── Contenu ── */}
      <View style={S.content}>
        <Text style={S.eyebrow}>POST DU JOUR</Text>

        <View style={S.body}>
          <View style={S.textCol}>
            <View style={S.authorRow}>
              <Avatar size={ps(24)} uri={author?.avatar} username={author?.username} />
              <Text style={S.author} numberOfLines={1}>
                {author?.full_name || author?.username || 'twitninf'}
              </Text>
            </View>

            <Text style={S.preview} numberOfLines={2}>
              {tweet.content}
            </Text>
          </View>

          {previewImage ? (
            <Image source={{ uri: previewImage }} style={S.thumb} />
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  // Le gabarit d'une ligne du fil, sur un cran de fond. Les retraits sont
  // ceux de `TweetRowGutter` : la bande doit s'aligner sur les lignes qui la
  // suivent, sinon elle flotte au-dessus du fil au lieu d'en faire partie.
  band: {
    flexDirection: 'row',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(14),
    paddingBottom: ps(16),
    backgroundColor: paper.bgBand,
  },
  gutter: {
    width: GUTTER_W,
    alignItems: 'center',
  },
  // Plus gros que le compteur d'une ligne (`ps(21)`) : c'est la seule chose
  // qui dit « celui-ci a gagné ». Et le seul accent de la bande.
  count: {
    fontFamily: paperFonts.display,
    fontSize: ps(28),
    lineHeight: ps(31),
    letterSpacing: ps(-0.84),
    color: paper.accent,
  },
  unit: {
    fontFamily: paperFonts.mono,
    fontSize: ps(9),
    lineHeight: ps(12),
    letterSpacing: ps(0.6),
    color: paper.inkMeta,
    textAlign: 'center',
    marginTop: ps(3),
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  // La capitale espacée en chasse fixe est la voix des méta de 2B — la même
  // que « SPONSORISÉ » sur une ligne du fil.
  eyebrow: {
    fontFamily: paperFonts.mono,
    fontSize: ps(10),
    letterSpacing: ps(1.5),
    color: paper.inkMeta,
    marginBottom: ps(9),
  },
  body: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ps(10),
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(7),
  },
  author: {
    fontFamily: paperFonts.strong,
    fontSize: ps(16),
    letterSpacing: ps(-0.32),
    color: paper.ink,
    flexShrink: 1,
  },
  // Le corps du bloc de citation, pas celui d'un tweet : c'est un extrait
  // qu'on montre, pas un texte qu'on donne à lire en entier.
  preview: {
    fontFamily: paperFonts.body,
    fontSize: ps(15),
    lineHeight: ps(21),
    color: paper.inkSoft,
    marginTop: ps(6),
  },
  thumb: {
    width: ps(52),
    height: ps(52),
    borderRadius: ps(10),
  },
});
