/**
 * 🧪 Une ligne du fil « 2B — Gouttière ».
 *
 * Clone de `components/feed/TweetRow.tsx`, sous drapeau `fil.refonte2b`.
 * L'original n'est pas touché : il continue de servir 99 % des comptes, et le
 * jour où l'essai est tranché, c'est ce fichier-ci qui part (ou l'autre).
 *
 * ── Ce que 2B change, et pourquoi ────────────────────────────────────────
 * Le fil d'origine range cinq icônes de 16 px sous chaque tweet. À l'échelle
 * d'un écran, cela fait vingt-cinq cibles grises qui pèsent autant que le
 * texte : rien ne ressort, et le geste le plus fréquent — aimer — n'est pas
 * plus accessible que celui qu'on ne fait jamais.
 *
 * 2B sort l'engagement du texte et le remonte dans une GOUTTIÈRE de 52 px à
 * gauche : le cœur et son compteur, empilés, forment une seule cible haute et
 * franche que le pouce trouve sans viser. Sous le texte il ne reste que ce qui
 * appelle une réponse — le nombre de réponses, et le bouton pour en écrire une.
 *
 * ── Le repost ────────────────────────────────────────────────────────────
 * Le dessin d'origine de 2B le fait purement disparaître. Ici il est REPLACÉ,
 * pas supprimé : second compteur tactile dans la gouttière, sous le cœur, plus
 * petit. Il garde ainsi un compteur visible et une cible propre, sans
 * réintroduire la rangée d'icônes que 2B existe pour supprimer.
 *
 * ── Partage, signalement, vente, suppression ─────────────────────────────
 * Tout cela vivait dans le « … » de la rangée. Le menu est désormais servi par
 * une PRESSION LONGUE sur la ligne : mêmes entrées, même feuille (`options`),
 * zéro pixel d'interface au repos.
 *
 * ── Une réponse ne ressemble pas à un post ───────────────────────────────
 * Dans le fil, un parent et sa réponse arrivent collés (le recommandeur les
 * émet adjacents). S'ils sont dessinés pareil, on lit deux tweets sans rapport
 * dont le second paraît hors sujet.
 *
 * Une réponse est donc plus PETITE, pas plus lourde. C'est le point : la
 * première version l'entourait d'un filet, d'un retrait et d'une ligne « en
 * réponse à », si bien qu'une réponse de deux lignes mangeait la moitié de
 * l'écran et qu'on n'en voyait plus qu'une à la fois. Ce qui la distingue
 * maintenant ne coûte aucune hauteur :
 *   - un chevron ↳ devant l'avatar, dans la ligne d'auteur déjà présente ;
 *   - un retrait du seul contenu (la gouttière, elle, ne bouge pas) ;
 *   - une échelle plus petite, avatar et cœur compris ;
 *   - le rail qui la relie à son parent.
 *
 * ── Un seul rail, jamais trois ───────────────────────────────────────────
 * Le rail vit UNIQUEMENT dans la gouttière, et n'existe qu'entre un parent et
 * sa réponse : `spine` sur le parent (`isThreadParent`), `spineTop` sur la
 * réponse (`isThreadChild`), rien du tout ailleurs. D'où deux règles à ne pas
 * casser :
 *   - la ligne d'une réponse ne prend AUCUN `paddingLeft` — sinon sa gouttière
 *     se décale et le rail se dédouble en deux traits parallèles ;
 *   - aucun trait n'est dessiné « pour le rythme » sur une ligne sans réponse
 *     adjacente : il pendait dans le vide sous le dernier tweet.
 *
 * ── Ce qui disparaît vraiment ────────────────────────────────────────────
 * Le compteur de vues. Il reste mesuré côté serveur, simplement plus affiché :
 * c'est un chiffre qu'on ne peut pas actionner, et 2B ne garde dans la
 * gouttière que ce qui se touche.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { retweetersLabel, retweetersOf, sameRetweeters } from '../../../utils/retweeters';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  LinearTransition,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from '../../Avatar';
import ClickableMentions from '../../ClickableMentions';
import TweetImagesPaper from './TweetImagesPaper';
import TweetVideoPaper from './TweetVideoPaper';
import TweetVoiceMessage from '../TweetVoiceMessage';
import TweetMusicCard from '../TweetMusicCard';
import TweetLanguageSwitcher from '../../TweetLanguageSwitcher';
import TranslationReveal from '../../TranslationReveal';
import { useTweetAutoTranslation } from '../../../contexts/ReadingLanguageContext';
import VerifiedBadge from '../../VerifiedBadge';
import { STORY_GRADIENT } from '../../StoryRing';
import PaidContentLock from '../../PaidContentLock';
import ContestCardPaper from './ContestCardPaper';
import LockedText from '../../LockedText';
import { certifiedNameColors, type ProfileCustomization } from '../../../services/profileCustomizationService';
import PremiumDisplayName from '../../PremiumDisplayName';
import { paper, paperFonts, isPaperDark, ps, GUTTER_W, ROW_PAD_X, ROW_GAP } from '../../../theme/paper2b';
import ReactionBurst, {
  useReactionAnimation,
  LIKE_PALETTE,
  RETWEET_PALETTE,
  SUPER_HEART_PALETTE,
} from '../ReactionBurst';
import { toast } from '../../ui/Toast';
import feedback from '../../../utils/feedback';
import { useFlag } from '../../../contexts/FeatureFlagContext';
import { FLAGS } from '../../../config/featureFlagKeys';
import { sameAuthor } from '../../../utils/sameAuthor';
import { hasRenderableContent } from '../../../utils/tweetMedia';
import {
  canSkipTruncationMeasure,
  formatCompactCount as fmtCount,
  formatRelativeDate as fmtDate,
  TRUNCATION_LINES,
} from './tweetRowText';

import type { TweetRowProps } from '../TweetRow';

export interface TweetRowGutterProps extends TweetRowProps {
  /**
   * Nom affiché de l'auteur du tweet PARENT, quand cette ligne est une
   * réponse. Résolu par l'écran, qui a la ligne précédente sous la main — la
   * charge utile du fil ne transporte pas l'auteur du parent.
   */
  replyToName?: string;
  /**
   * Ancre de la visite guidée, posée sur la GOUTTIÈRE et pas sur la ligne
   * entière : l'étape parle de cette colonne-là, éclairer tout le tweet
   * désignerait autre chose que ce que dit la bulle. Passée par l'écran, et
   * seulement sur la première ligne visible.
   */
  gutterRef?: React.Ref<View>;
  /**
   * Rang dans le fil de discussion : 0 pour un tweet racine, 1 pour sa
   * réponse, 2 pour la réponse de sa réponse… Borné à 3 par l'écran, qui suit
   * le `MAX_THREAD_DEPTH = 4` du recommandeur.
   */
  threadDepth?: number;
}

/** Anneau « déjà vu » : gris neutre, comme dans la barre de stories. */
const SEEN_STORY_RING = ['#3A3A3A', '#3A3A3A'] as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Transition de mise en page de la ligne — construite UNE FOIS, au niveau du
 * module.
 *
 * Écrite en ligne (`layout={LinearTransition.duration(180)}`), elle fabriquait
 * un descripteur d'animation neuf à chaque rendu de chaque ligne montée. La
 * documentation de Reanimated est explicite là-dessus : « Define animation
 * builders outside of components or wrap with `useMemo` ».
 */
const ROW_LAYOUT = LinearTransition.duration(180);


/**
 * Rembourrages de la ligne, sortis en constantes parce que le RAIL les
 * compense par des marges négatives exactes.
 *
 * `ps()` arrondit au pixel : écrire `ps(16)` d'un côté et `ps(-16)` de l'autre
 * peut donner deux valeurs qui ne s'annulent pas tout à fait (`Math.round`
 * n'est pas symétrique sur un demi-pixel), et le rail se décrocherait d'un
 * pixel de la ligne suivante. Une seule valeur, niée, ne peut pas dériver.
 */
const ROW_PAD_BOTTOM = ps(16);
const ROW_PAD_TOP_REPLY = ps(2);

/** Le rail reste un vrai filet d'un pixel : le mettre à l'échelle le rendrait flou. */
const RAIL_W = 1;

// `fmtCount` et `fmtDate` vivent désormais dans `./tweetRowText` : ce sont des
// fonctions pures, donc testées (`tests/tweet-row-text.test.js`), et `fmtDate`
// passe par `Intl` — l'appelant la mémoïse plutôt que de la rappeler à chaque
// rendu.

const DOUBLE_TAP_MS = 280;
const VIDEO_URL_RE = /\.(mp4|mov|m3u8|webm)(\?|$)/i;

interface RowContentProps {
  tweetId: string;
  isAd: boolean;
  isReply: boolean;
  depth: number;
  isRetweet: boolean;
  /**
   * Mention deja redigee (« @a, @b et 2 autres ont reposte »). Rediger ici
   * plutot que de passer la liste evite de dupliquer les regles d'accord entre
   * les deux fils.
   */
  repostedLabel?: string | null;
  replyToName?: string;
  displayAuthor: any;
  hasActiveStory: boolean;
  storySeen: boolean;
  badgeTint?: string;
  paperCustomization?: ProfileCustomization;
  timeLabel: string;
  displayContent: string;
  displayMentions?: string[];
  mentionContext: any;
  isScrambled: boolean;
  isContentLocked: boolean;
  contentLock: any;
  translationId: string;
  translationEnabled: boolean;
  activeTranslation: any;
  onSelectTranslation: (value: any) => void;
  displayMediaUrls: string[];
  videoUrl: string | null;
  videoThumbnailUrl?: string;
  displayAudioUrl: string | null;
  displayAudioDuration: number | null;
  displaySpotifyTrack: any;
  isContest: boolean;
  isQuote: boolean;
  originalTweet: any;
  replyCount: number;
  onProfilePress: () => void;
  onReplyPress: () => void;
  onBeforeOpen: () => void;
  onVideoDuration: (ms: number) => void;
  onUnlocked: () => void;
  onOpenContest: (contestId: string) => void;
  onOpenQuote: () => void;
}

/**
 * La colonne de CONTENU d'une ligne, isolée derrière son propre `memo`.
 *
 * ── Pourquoi ce découpage ────────────────────────────────────────────────
 * Aimer un tweet change trois booléens et deux compteurs, tous dans la
 * GOUTTIÈRE. Tant que la ligne était un seul composant, chaque appui sur le
 * cœur reconstruisait aussi l'en-tête d'auteur (dont `PremiumDisplayName`, qui
 * refait ses styles), le corps du tweet, la grille d'images, la citation et le
 * pied — pour un pixel qui ne bouge pas. C'est le geste le plus fréquent du
 * fil, et le plus cher à rendre.
 *
 * Le `memo` par défaut suffit : toutes les propriétés passées ici sont soit
 * des primitives, soit des objets qui viennent tels quels du tweet, soit des
 * fonctions stables (`useCallback` côté ligne). Rien n'est reconstruit à
 * chaque rendu — c'est la condition pour que ce `memo` serve à quelque chose.
 *
 * L'état de troncature vit ICI, et pas dans la ligne : il ne concerne que
 * cette colonne, et le laisser au-dessus ferait re-rendre la gouttière à la
 * mesure du texte.
 */
const RowContent = memo(function RowContent({
  tweetId,
  isAd,
  isReply,
  depth,
  isRetweet,
  repostedLabel,
  replyToName,
  displayAuthor,
  hasActiveStory,
  storySeen,
  badgeTint,
  paperCustomization,
  timeLabel,
  displayContent,
  displayMentions,
  mentionContext,
  isScrambled,
  isContentLocked,
  contentLock,
  translationId,
  translationEnabled,
  activeTranslation,
  onSelectTranslation,
  displayMediaUrls,
  videoUrl,
  videoThumbnailUrl,
  displayAudioUrl,
  displayAudioDuration,
  displaySpotifyTrack,
  isContest,
  isQuote,
  originalTweet,
  replyCount,
  onProfilePress,
  onReplyPress,
  onBeforeOpen,
  onVideoDuration,
  onUnlocked,
  onOpenContest,
  onOpenQuote,
}: RowContentProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [measured, setMeasured] = useState<boolean | undefined>(undefined);

  /**
   * Un texte trop court pour tenir en plus de quatre lignes n'a rien à
   * mesurer (voir `canSkipTruncationMeasure`) : on lui épargne la seconde
   * mise en forme hors écran ET le rendu supplémentaire qu'elle provoque.
   */
  const needsMeasure = !canSkipTruncationMeasure(displayContent);
  const isTruncated = needsMeasure ? measured : false;

  const handleToggleExpand = useCallback(() => setIsExpanded((v) => !v), []);

  const handleTextLayout = useCallback((e: any) => {
    setMeasured((e?.nativeEvent?.lines?.length ?? 0) > TRUNCATION_LINES);
  }, []);

  React.useEffect(() => { setMeasured(undefined); }, [displayContent]);

  // Le retrait des réponses est le SEUL style variable de cette colonne : le
  // recalculer en objet littéral à chaque rendu invalide aussi la comparaison
  // de style côté natif.
  const contentStyle = useMemo(
    () => (depth > 0 ? [S.content, { paddingLeft: ps(13) * depth }] : S.content),
    [depth],
  );

  const bodyStyle = isReply ? S.bodyReply : S.body;

  const body = !displayContent ? null : isScrambled ? (
    <LockedText
      text={displayContent}
      style={bodyStyle}
      numberOfLines={isExpanded ? undefined : TRUNCATION_LINES}
      price={contentLock?.price_twc}
      compact
    />
  ) : (
    <ClickableMentions
      text={displayContent}
      mentions={displayMentions}
      style={bodyStyle}
      numberOfLines={isExpanded ? undefined : TRUNCATION_LINES}
      tweetId={tweetId}
      contextData={mentionContext}
    />
  );

  return (
    <View style={contentStyle}>
      {isRetweet && !!repostedLabel && (
        <View style={S.repostedBy}>
          <Ionicons name="repeat" size={ps(12)} color={paper.inkMeta} />
          <Text style={S.repostedByText} numberOfLines={1}>{repostedLabel}</Text>
        </View>
      )}

      {isAd && <Text style={S.adLabel}>SPONSORISÉ</Text>}

      <View style={S.authorRow}>
        {/* Le chevron dit « réponse » sans coûter une ligne. La version
            précédente écrivait « EN RÉPONSE À <nom> » en toutes lettres :
            une ligne entière, tronquée neuf fois sur dix, pour nommer un
            tweet qui est juste au-dessus. */}
        {isReply && (
          <Ionicons
            name="return-down-forward"
            size={ps(15)}
            color={paper.inkMeta}
            style={S.replyChevron}
            accessibilityLabel={replyToName ? `En réponse à ${replyToName}` : 'Réponse'}
          />
        )}
        <TouchableOpacity
          onPress={onProfilePress}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 4 }}
        >
          {hasActiveStory ? (
            <LinearGradient
              colors={(storySeen ? SEEN_STORY_RING : STORY_GRADIENT) as unknown as [string, string, ...string[]]}
              start={{ x: 0.85, y: 0.05 }}
              end={{ x: 0.15, y: 0.95 }}
              style={S.avatarStoryGradient}
            >
              <View style={S.avatarStoryGap}>
                <Avatar size={ps(22)} username={displayAuthor?.username || 'U'} uri={(displayAuthor as any)?.avatar} />
              </View>
            </LinearGradient>
          ) : (
            <Avatar size={ps(isReply ? 20 : 26)} username={displayAuthor?.username || 'U'} uri={(displayAuthor as any)?.avatar} />
          )}
        </TouchableOpacity>

        {/* Enveloppe retrécissable OBLIGATOIRE : `numberOfLines` ne tronque
            que si la boîte est contrainte. Les effets « dégradé » et
            « reflet » rendent un `MaskedView`, dont la largeur naturelle est
            celle du texte entier — le `flexShrink` posé sur `baseStyle` ne
            l'atteint pas, il ne descend que sur le `Text` intérieur. Sans
            cette vue, un nom long poussait le badge et l'heure hors écran. */}
        <View style={S.authorNameWrap}>
        <PremiumDisplayName
          text={displayAuthor?.full_name || 'Utilisateur'}
          baseStyle={isReply ? S.authorNameReply : S.authorName}
          isPremium={!!(displayAuthor as any)?.premium}
          subscriptionTierRaw={(displayAuthor as any)?.subscription_tier}
          fontId="system"
          effectId="none"
          numberOfLines={1}
          customization={paperCustomization}
          verified={!!(displayAuthor as any)?.verified}
          verificationStyle={(displayAuthor as any)?.verification_style || 'default'}
        />
        </View>
        {(displayAuthor as any)?.verified && (
          <View style={S.verifiedWrap}>
            <VerifiedBadge
              verificationStyle={(displayAuthor as any)?.verification_style || 'default'}
              size={ps(13)}
              animated={false}
              tint={badgeTint}
            />
          </View>
        )}
        <Text style={S.time}>{timeLabel}</Text>
      </View>

      {/* Un tweet publie en image seule, ou un retweet dont l'original n'a
          pas de legende, n'a pas de texte a rendre. Sans cette garde, la
          ligne dessinait un bloc de texte vide : un interligne fantome entre
          l'en-tete et l'image, la ou il ne doit rien y avoir.

          `TranslationReveal` n'enveloppe le corps QUE s'il y a vraiment une
          traduction à révéler : monté à vide sur chaque ligne, il ajoutait
          deux vues, trois `Animated.Value` et un `onLayout` qui déclenche un
          rendu supplémentaire — pour une animation qui ne joue jamais chez un
          lecteur qui lit dans sa propre langue. */}
      {!!body && (
        // `!isScrambled` : un texte brouillé n'a jamais été enveloppé par la
        // révélation, et il ne doit pas commencer à l'être.
        !isScrambled && activeTranslation?.language ? (
          <TranslationReveal tweetId={translationId} language={activeTranslation.language}>
            {body}
          </TranslationReveal>
        ) : (
          body
        )
      )}

      {/* Mesure de troncature : une seule fois par ligne, en local. */}
      {!!displayContent && needsMeasure && measured === undefined && (
        <Text
          style={[bodyStyle, S.hiddenMeasure]}
          onTextLayout={handleTextLayout}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {displayContent}
        </Text>
      )}

      {isTruncated && (
        <TouchableOpacity style={S.seeMoreBtn} onPress={handleToggleExpand} activeOpacity={0.7}>
          <Text style={S.seeMoreText}>{isExpanded ? 'Voir moins' : 'Voir plus'}</Text>
        </TouchableOpacity>
      )}

      {!isContentLocked && displayMediaUrls.length > 0 && (
        <TweetImagesPaper urls={displayMediaUrls} onBeforeOpen={onBeforeOpen} />
      )}

      {!isContentLocked && !!videoUrl && (
        <TweetVideoPaper
          /* L'identifiant de la LIGNE, pas celui du tweet d'origine d'un
             retweet : c'est celui-là que la liste déclare visible, et donc le
             seul que la scène (`videoStage`) sait reconnaître. */
          tweetId={tweetId}
          videoUrl={videoUrl}
          thumbnailUrl={videoThumbnailUrl}
          onBeforeOpen={onBeforeOpen}
          onDuration={onVideoDuration}
        />
      )}

      {!isContentLocked && !!displayAudioUrl && (
        <TweetVoiceMessage audioUrl={displayAudioUrl} durationSeconds={displayAudioDuration} onBeforeOpen={onBeforeOpen} />
      )}

      {!isContentLocked && !!displaySpotifyTrack && (
        <TweetMusicCard track={displaySpotifyTrack} onBeforeOpen={onBeforeOpen} />
      )}

      {translationEnabled && (
        <TweetLanguageSwitcher
          tweetId={translationId}
          active={activeTranslation as any}
          onSelect={onSelectTranslation}
        />
      )}

      {isContentLocked && (
        <PaidContentLock
          lock={contentLock}
          compact
          onUnlocked={onUnlocked}
        />
      )}

      {isContest && (
        <ContestCardPaper
          tweetId={tweetId}
          onOpen={onOpenContest}
        />
      )}

      {isQuote && !!originalTweet && (
        <TouchableOpacity
          activeOpacity={0.85}
          style={S.quote}
          onPress={onOpenQuote}
        >
          <View style={S.quoteAuthorRow}>
            <Avatar size={ps(16)} username={originalTweet.author?.username || 'U'} uri={originalTweet.author?.avatar} />
            <Text style={S.quoteAuthorName} numberOfLines={1}>
              {originalTweet.author?.full_name || 'Utilisateur'}
            </Text>
            <Text style={S.quoteAuthorHandle} numberOfLines={1}>@{originalTweet.author?.username}</Text>
          </View>
          <Text style={S.quoteText} numberOfLines={3}>{originalTweet.content}</Text>
        </TouchableOpacity>
      )}

      {/* Pied de ligne : ce qui appelle une réponse, et rien d'autre. */}
      {!isAd && (
        <View style={[S.footer, isReply && S.footerReply]}>
          <Text style={S.replies}>
            {replyCount > 0
              ? `${fmtCount(replyCount)} réponse${replyCount > 1 ? 's' : ''}`
              : 'Aucune réponse'}
          </Text>
          <TouchableOpacity
            style={S.replyPill}
            onPress={onReplyPress}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={S.replyPillText}>Répondre</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

function TweetRowGutter({
  tweet,
  index,
  isThreadParent,
  isThreadChild,
  onAction,
  contextData,
  storyUserIds,
  unseenStoryUserIds,
  replyToName,
  threadDepth,
  gutterRef,
}: TweetRowGutterProps) {
  // Conditionne tout le geste, comme dans la ligne d'origine : rien à
  // proposer à qui n'est pas dans le palier.
  const superHeartEnabled = useFlag(FLAGS.SUPER_HEART);

  /**
   * L'éclat de réaction n'est MONTÉ qu'une fois qu'un doigt s'est posé sur un
   * compteur — jamais au repos.
   *
   * ── Ce que ça coûtait ────────────────────────────────────────────────
   * `ReactionBurst` s'ancre sur une vue de 0 × 0 et dessine tout en absolu :
   * disque, anneaux, et une particule par point, chacune portant son propre
   * `useAnimatedStyle`. Une ligne en montait TROIS (cœur, Super Cœur à 16
   * particules et halo, repost), soit une quarantaine de vues animées et
   * autant de « mappers » Reanimated — tous à opacité 0, sur chaque ligne du
   * fil, en permanence. Or chaque `useAnimatedStyle` s'enregistre comme
   * auditeur sur les valeurs partagées qu'il lit, et le registre des mappers
   * est retrié à chaque montage ou démontage : avec sept lignes en fenêtre,
   * le simple fait de faire défiler faisait apparaître et disparaître ~300
   * animations invisibles. Software Mansion donne d'ailleurs ~100 composants
   * animés simultanés comme limite pratique sur un Android d'entrée de gamme.
   *
   * ── Pourquoi l'armement arrive à temps ───────────────────────────────
   * Il est déclenché sur `onPressIn` (doigt posé), pas sur `onPress` : le
   * montage a donc toute la durée de l'appui pour se faire, et l'éclat ne
   * démarre de toute façon qu'après `withDelay(30)`. Le ressort de l'icône,
   * lui, n'a jamais été conditionné : il reste instantané.
   */
  const [burstArmed, setBurstArmed] = useState(false);
  const armBurst = useCallback(() => setBurstArmed(true), []);

  // ── Valeurs d'animation : thread UI, jamais dans le state React ──────────
  const like = useReactionAnimation();
  const superLike = useReactionAnimation(false, 850);
  const retweet = useReactionAnimation(true);
  const bigHeart = useSharedValue(0);
  const pressed = useSharedValue(0);

  const lastTapRef = useRef(0);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockPressUntilRef = useRef(0);

  const isAd = !!(tweet as any).is_ad;
  const isRetweet = !!((tweet as any).is_retweet || (tweet as any).tweet_type === 'retweet');
  const isQuote = !!((tweet as any).is_quote || (tweet as any).tweet_type === 'quote');
  const isContest = (tweet as any).tweet_type === 'concours';
  const originalTweet = (tweet as any)?.originalTweet || null;
  const retweeter = tweet.author;

  // Plusieurs comptes suivis peuvent avoir reposte le meme tweet : l'API les
  // empile sur une seule ligne au lieu d'en servir une par personne.
  const repostedLabel = React.useMemo(
    () => (isRetweet ? retweetersLabel(retweetersOf(tweet), 'reposté') : null),
    [isRetweet, tweet],
  );

  const displayAuthor = isRetweet && originalTweet?.author ? originalTweet.author : tweet.author;
  const displayAuthorId = displayAuthor?.id ? String(displayAuthor.id) : '';
  const hasActiveStory = !!displayAuthorId && !!storyUserIds?.has(displayAuthorId);
  const storySeen = hasActiveStory && !unseenStoryUserIds?.has(displayAuthorId);
  /**
   * Teinte de la pastille de certification — calculée SEULEMENT pour un
   * compte certifié, et mémoïsée. C'est la seule consommatrice, et
   * `certifiedNameColors` passe par le service des styles de certification :
   * la rappeler à chaque rendu pour l'immense majorité des comptes, qui ne
   * sont pas certifiés, était du travail jeté.
   */
  const isVerifiedAuthor = !!(displayAuthor as any)?.verified;
  const displayBadgeTint = useMemo(
    () =>
      isVerifiedAuthor
        ? certifiedNameColors(
            (displayAuthor as any)?.verification_style,
            (displayAuthor as any)?.profile_customization as ProfileCustomization | undefined,
          ).from
        : undefined,
    [isVerifiedAuthor, displayAuthor],
  );
  const sourceContent = isRetweet && originalTweet?.content ? originalTweet.content : tweet.content;
  const displayMentions = isRetweet && originalTweet?.mentions ? originalTweet.mentions : tweet.mentions;

  /**
   * Images jointes — même source que le texte : sur un retweet pur, elles
   * appartiennent au tweet d'origine. Un tweet vidéo range `media_urls` comme
   * `[url_vidéo, url_miniature]`, d'où la séparation.
   */
  /**
   * ⚠️ La dépendance de ce `useMemo` est le TABLEAU `media_urls`, jamais
   * l'objet `tweet`.
   *
   * L'écran met le like à jour par étalement superficiel
   * (`{ ...tweet, stats, user_interaction }`) : `tweet` change d'identité à
   * chaque cœur posé, `media_urls` non. Dépendre de `tweet` refabriquait donc
   * `displayMediaUrls` à chaque like — un tableau neuf, donc une propriété
   * neuve pour la grille d'images, donc tout le sous-arbre média re-rendu pour
   * un geste qui ne le concerne pas. C'est exactement ce que le découpage en
   * `RowContent` cherche à empêcher, et c'est cette ligne-ci qui décide s'il
   * sert à quelque chose.
   */
  const mediaSource: any = isRetweet && originalTweet ? originalTweet : tweet;
  const rawMediaUrls = mediaSource?.media_urls;
  const displaySpotifyTrack = mediaSource?.spotify_track || null;
  const displayAudioUrl = typeof mediaSource?.audio_url === 'string' ? mediaSource.audio_url : null;
  const displayAudioDuration =
    typeof mediaSource?.audio_duration === 'number' ? mediaSource.audio_duration : null;

  const { displayMediaUrls, videoUrl, videoThumbnailUrl } = React.useMemo(() => {
    const urls = Array.isArray(rawMediaUrls) ? rawMediaUrls : [];
    const strings = urls.filter((url: unknown): url is string => typeof url === 'string');
    const video = strings.find((url: string) => VIDEO_URL_RE.test(url));
    if (!video) {
      return { displayMediaUrls: strings, videoUrl: null as string | null, videoThumbnailUrl: undefined as string | undefined };
    }
    const rest = strings.filter((url: string) => url !== video);
    return { displayMediaUrls: [] as string[], videoUrl: video, videoThumbnailUrl: rest[0] };
  }, [rawMediaUrls]);

  const translationSource = isRetweet && originalTweet ? originalTweet : tweet;
  const {
    active: activeTranslation,
    setActive: setActiveTranslation,
    displayedContent,
  } = useTweetAutoTranslation({
    id: String(translationSource?.id || tweet.id),
    content: sourceContent,
    translation_enabled: !!(translationSource as any)?.translation_enabled,
  });
  const displayContent = displayedContent || sourceContent;

  /**
   * `setActive` est une flèche recréée à chaque rendu par le hook de
   * traduction. Passée telle quelle à la colonne de contenu, elle suffirait à
   * casser son `memo` — donc à annuler tout ce découpage. On la range dans une
   * référence et on n'expose qu'une enveloppe stable.
   */
  const setActiveTranslationRef = useRef(setActiveTranslation);
  setActiveTranslationRef.current = setActiveTranslation;
  const onSelectTranslation = useCallback((value: any) => {
    setActiveTranslationRef.current(value);
  }, []);

  const contentLock = (isRetweet && originalTweet
    ? (originalTweet as any).paid_content
    : (tweet as any).paid_content) || null;
  const isContentLocked = !!contentLock && !contentLock.has_access;
  const isScrambled = isContentLocked && !contentLock.preview_text;
  const displayCreatedAt =
    isRetweet && (originalTweet?.created_at || originalTweet?.createdAt)
      ? originalTweet.created_at || originalTweet.createdAt
      : tweet.created_at || (tweet as any).createdAt;

  /**
   * Horodatage calculé UNE fois par tweet, pas à chaque rendu.
   *
   * Au-delà d'un jour, `fmtDate` appelle `toLocaleDateString`, donc `Intl` :
   * de très loin l'appel le plus cher d'un rendu de ligne, et il était refait
   * à chaque like, à chaque mesure de troncature, à chaque arrivée de
   * traduction. Rien n'est perdu au passage : le libellé n'était de toute
   * façon rafraîchi que par accident, quand un rendu se produisait — aucune
   * horloge ne le remet à l'heure ni avant ni après.
   */
  const timeLabel = useMemo(
    () => fmtDate(displayCreatedAt || new Date().toISOString()),
    [displayCreatedAt],
  );

  const isLiked = !!tweet.user_interaction?.is_liked;
  const isRetweeted = !!tweet.user_interaction?.is_retweeted;
  const isSuperLiked = !!tweet.user_interaction?.is_super_liked;

  const replyCount = tweet.stats?.replies || 0;

  /**
   * Personnalisation du pseudo, corrigée pour le fond papier CLAIR.
   *
   * DEUX effets posent un halo d'ombre derrière le nom : « Néon » (`glow`) et
   * « Certifié » (`certified`, qui ajoute la lueur du badge — voir `NameHalo`
   * dans `ProfileDecoration`). Ces halos sont calibrés pour un fond sombre ;
   * sur le papier ils saturent, les ombres des lettres voisines se recouvrent
   * et le nom se noie dans un aplat de couleur. Et « Certifié » n'est pas un
   * cas rare : c'est l'effet de tous les comptes certifiés.
   *
   * Les deux sont ramenés au « Dégradé », qui partage exactement le même
   * masque de couleur SANS la couche de halo : le compte garde donc les
   * couleurs qu'il a choisies (et payées), le nom redevient lisible, et la
   * certification reste dite par le badge juste à côté.
   *
   * En papier sombre, rien à corriger : c'est le fond pour lequel ces effets
   * ont été dessinés, ils passent tels quels.
   */
  const paperCustomization = React.useMemo(() => {
    const custom = (displayAuthor as any)?.profile_customization as ProfileCustomization | undefined;
    if (!custom || isPaperDark) return custom;
    if (custom.name_effect !== 'glow' && custom.name_effect !== 'certified') return custom;
    return { ...custom, name_effect: 'gradient' as const };
  }, [displayAuthor]);

  /**
   * Une réponse se dessine à ~85 % du parent. Les tailles d'icône sont des
   * NOMBRES, pas des styles : `ReactionBurst` cale tout son éclat (anneaux,
   * distance des particules, diamètre des points) sur `iconSize`, donc lui
   * passer la même valeur qu'à l'icône garde l'animation centrée.
   */
  /**
   * Le retrait CROÎT avec le rang : sans ça, une réponse de réponse se
   * dessinait exactement comme une réponse simple et un fil de quatre
   * paraissait plat — quatre tweets côte à côte, sans qui répond à qui.
   * La gouttière, elle, ne bouge jamais : les compteurs restent sur une seule
   * colonne (c'est tout l'intérêt), et le rail reste droit sur la chaîne.
   */
  const depth = Math.min(Math.max(threadDepth ?? (isThreadChild ? 1 : 0), 0), 3);
  const isReply = depth > 0;
  /**
   * Cœur et repost ont EXACTEMENT le même gabarit — icône comme compteur.
   * Deux tailles différentes se lisaient comme un défaut d'alignement, pas
   * comme une hiérarchie. Ce qui les distingue est la couleur une fois posés
   * (accent pour le cœur, vert pour le repost), jamais la taille.
   */
  const iconSize = ps(isReply ? 21 : 30);

  // ── Animations ──────────────────────────────────────────────────────────
  const playLike = useCallback((wasLiked: boolean) => { like.play(!wasLiked); }, [like]);

  const playBigHeart = useCallback(() => {
    bigHeart.value = 0;
    bigHeart.value = withTiming(1, { duration: 900 });
  }, [bigHeart]);

  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bigHeart.value, [0, 0.12, 0.7, 1], [0, 0.95, 0.9, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(
          bigHeart.value,
          [0, 0.15, 0.3, 0.6, 1],
          [0.2, 1.22, 0.95, 1.02, 0.7],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const rowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pressed.value, [0, 1], [1, 0.94]),
  }));

  // ── Interactions ────────────────────────────────────────────────────────
  const blockRowPress = useCallback((ms = 380) => {
    blockPressUntilRef.current = Date.now() + ms;
  }, []);

  const refuseLocked = useCallback(() => {
    blockRowPress();
    feedback.refuse();
    toast.info('Contenu réservé', {
      description: `Débloque ce contenu pour ${contentLock?.price_twc ?? ''} NF avant d'interagir avec lui.`.replace('  ', ' '),
    });
  }, [blockRowPress, contentLock]);

  const handleLikePress = useCallback(() => {
    if (isContentLocked) return refuseLocked();
    blockRowPress();
    // `like()` et pas `tap()` : dans la gouttière, le doigt recouvre l'icône
    // qu'il touche — sans retour tactile on ne sait pas si le geste est passé.
    if (!isLiked) feedback.like();
    playLike(isLiked);
    onAction({ type: 'like', tweetId: tweet.id });
  }, [isContentLocked, refuseLocked, blockRowPress, playLike, isLiked, onAction, tweet.id]);

  const handleSuperLikeLongPress = useCallback(() => {
    if (!superHeartEnabled) return;
    if (isContentLocked) return refuseLocked();
    if (isSuperLiked) return;
    blockRowPress();
    feedback.reward();
    like.play(true);
    superLike.play(true);
    onAction({ type: 'superlike', tweetId: tweet.id });
  }, [superHeartEnabled, isContentLocked, refuseLocked, isSuperLiked, blockRowPress, like, superLike, onAction, tweet.id]);

  const handleRetweetPress = useCallback(() => {
    if (isContentLocked) return refuseLocked();
    blockRowPress();
    if (!isRetweeted) feedback.like();
    retweet.play(!isRetweeted);
    onAction({ type: 'retweet', tweetId: tweet.id });
  }, [isContentLocked, refuseLocked, blockRowPress, retweet, isRetweeted, onAction, tweet.id]);

  const handleReplyPress = useCallback(() => {
    if (isContentLocked) return refuseLocked();
    blockRowPress();
    onAction({ type: 'reply', tweetId: tweet.id });
  }, [isContentLocked, refuseLocked, blockRowPress, onAction, tweet.id]);

  /**
   * Pression longue sur la ligne — le « … » de l'ancien fil.
   *
   * `blockRowPress` d'abord : sans lui, le relâchement du doigt après le menu
   * est compté comme un appui simple et le tweet s'ouvre derrière la feuille.
   */
  const handleRowLongPress = useCallback(() => {
    if (isAd) return;
    blockRowPress(600);
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
    feedback.select();
    onAction({ type: 'options', tweetId: tweet.id });
  }, [isAd, blockRowPress, onAction, tweet.id]);

  const handleRowPress = useCallback(() => {
    if (isAd) {
      onAction({ type: 'open', tweetId: tweet.id, payload: { isAd: true, tweet } });
      return;
    }
    if (Date.now() < blockPressUntilRef.current) return;

    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_MS;
    // Armé dès le PREMIER appui : un double-tap laisse jusqu'à 280 ms entre
    // les deux, l'éclat a donc tout le temps de se monter avant d'être joué.
    // Un appui simple ouvre le tweet, donc démonte la ligne — armer là ne
    // coûte rien.
    if (!isDoubleTap) armBurst();
    lastTapRef.current = now;

    if (isDoubleTap) {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
      if (isContentLocked) return;
      playBigHeart();
      if (!isLiked) {
        feedback.like();
        playLike(false);
        onAction({ type: 'like', tweetId: tweet.id });
      }
      return;
    }

    navTimerRef.current = setTimeout(() => {
      navTimerRef.current = null;
      onAction({ type: 'open', tweetId: tweet.id });
    }, 260);
  }, [isAd, isContentLocked, isLiked, onAction, playBigHeart, playLike, tweet, armBurst]);

  /**
   * Les rappels passés à la colonne de contenu sont TOUS stables : c'est ce
   * qui rend son `memo` utile. Écrits en flèches dans le JSX, ils changeaient
   * d'identité à chaque rendu de la ligne et la colonne se serait re-rendue
   * malgré tout — c'est exactement le piège que la mémoïsation est censée
   * éviter.
   */
  const handleProfilePress = useCallback(() => {
    onAction({ type: 'profile', tweetId: tweet.id, payload: { author: displayAuthor, index } });
  }, [onAction, tweet.id, displayAuthor, index]);

  const handleVideoDuration = useCallback((ms: number) => {
    onAction({ type: 'videoDuration', tweetId: String(tweet.id), payload: ms });
  }, [onAction, tweet.id]);

  const handleUnlocked = useCallback(() => {
    onAction({ type: 'open', tweetId: tweet.id });
  }, [onAction, tweet.id]);

  const handleOpenContest = useCallback((contestId: string) => {
    onAction({ type: 'openContest', tweetId: tweet.id, payload: { contestId } });
  }, [onAction, tweet.id]);

  const handleOpenQuote = useCallback(() => {
    onAction({ type: 'openQuote', tweetId: originalTweet?.id });
  }, [onAction, originalTweet]);

  /**
   * Contexte de suivi des mentions : un objet littéral dans le JSX en aurait
   * fabriqué un neuf à chaque rendu, ce qui suffit à casser la comparaison de
   * la colonne de contenu.
   */
  const mentionContext = useMemo(
    () => ({ ...contextData, position: index, author_id: displayAuthor?.id }),
    [contextData, index, displayAuthor?.id],
  );

  // Hôtes de l'éclat : mêmes valeurs qu'avant, mais l'objet de style ne change
  // plus d'identité d'un rendu à l'autre.
  const burstHostStyle = useMemo(
    () => [S.burstHost, { width: iconSize, height: iconSize }],
    [iconSize],
  );
  const burstHostSmallStyle = useMemo(
    () => [S.burstHostSmall, { width: iconSize, height: iconSize }],
    [iconSize],
  );

  const handleRowPressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: 90 });
  }, [pressed]);
  const handleRowPressOut = useCallback(() => {
    pressed.value = withTiming(0, { duration: 140 });
  }, [pressed]);

  React.useEffect(() => () => {
    if (navTimerRef.current) clearTimeout(navTimerRef.current);
  }, []);

  // Garde de rendu : `tweet.content` truthy jetait ici tout retweet pur (son
  // texte vit sur `originalTweet`) et tout tweet publie en image seule — alors
  // meme que tout le reste de ce composant sait deja les rendre
  // (`sourceContent`, `displayMediaUrls`). Voir `utils/feed.ts`.
  if (!hasRenderableContent(tweet)) return null;

  return (
    <AnimatedPressable
      layout={ROW_LAYOUT}
      style={[S.row, isReply && S.rowReply, rowStyle]}
      onPressIn={handleRowPressIn}
      onPressOut={handleRowPressOut}
      onPress={handleRowPress}
      onLongPress={handleRowLongPress}
      delayLongPress={420}
    >
      {/* Cœur plein écran du double-tap. En accent, pas en blanc : sur du
          papier, un cœur blanc n'existe pas.

          Monté avec l'éclat (`burstArmed`), donc au premier appui et pas au
          repos : c'est une vue en recouvrement total portant un glyphe de
          90 px, à opacité nulle tant que personne n'a double-tapé. Le premier
          appui d'un double-tap l'arme (voir `handleRowPress`), et l'animation
          part de l'opacité 0 pendant sa première centaine de millisecondes —
          le montage a donc largement le temps. */}
      {burstArmed && (
        <Animated.View pointerEvents="none" style={[S.bigHeartOverlay, bigHeartStyle]}>
          <Ionicons name="heart" size={ps(90)} color={paper.accent} />
        </Animated.View>
      )}

      {/* ── Gouttière ── */}
      <View style={S.gutter} ref={gutterRef} collapsable={false}>
        {isThreadChild && <View style={S.spineTop} />}

        <TouchableOpacity
          style={S.counter}
          onPress={handleLikePress}
          // Seulement si le palier peut vraiment poser un Super Cœur : un
          // `onLongPress` posé qui ne fait rien (`handleSuperLikeLongPress`
          // sort tout de suite quand `!superHeartEnabled`) avale quand même
          // le relâchement — un `TouchableOpacity` qui a déclenché son
          // `onLongPress` n'appelle plus `onPress` derrière. Un appui tenu ne
          // serait-ce qu'un peu (le doigt recouvre l'icône dans la
          // gouttière, voir plus haut) posait donc un like qui ne partait
          // jamais, sans rien à l'écran pour le dire.
          onLongPress={superHeartEnabled ? handleSuperLikeLongPress : undefined}
          // Monte l'éclat au POSÉ du doigt, pas au relâchement : voir
          // `burstArmed`. Ne déclenche rien d'autre, et surtout pas de like.
          onPressIn={armBurst}
          delayLongPress={420}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
          accessibilityLabel={isLiked ? 'Retirer le j’aime' : 'Aimer ce tweet'}
        >
          <View style={burstHostStyle}>
            {burstArmed && (
              <ReactionBurst progress={like.progress} palette={LIKE_PALETTE} iconSize={iconSize} />
            )}
            {/* L'éclat du Super Cœur est le plus lourd de tous (halo, deux
                anneaux supplémentaires, seize particules) et il ne peut PAS
                se produire hors du palier : le monter pour un compte qui n'a
                pas le drapeau était du décor invisible et impossible à
                déclencher. */}
            {burstArmed && superHeartEnabled && (
              <ReactionBurst
                progress={superLike.progress}
                palette={SUPER_HEART_PALETTE}
                iconSize={iconSize * 2.1}
                particleCount={16}
                halo
              />
            )}
            <Animated.View style={like.iconStyle}>
              <Ionicons
                name={isLiked ? 'heart' : 'heart-outline'}
                size={iconSize}
                color={isSuperLiked ? paper.amber : isLiked ? paper.accent : paper.ink}
              />
            </Animated.View>
          </View>
          <Text style={[S.countMain, isReply && S.countMainReply, isLiked && S.countOn]}>
            {fmtCount(tweet.stats?.likes || 0)}
          </Text>
        </TouchableOpacity>

        {/* Repost — replacé ici plutôt que supprimé (voir l'en-tête du
            fichier). Plus petit que le cœur : c'est un geste plus rare. */}
        {!isAd && (
          <TouchableOpacity
            style={S.counterSmall}
            onPress={handleRetweetPress}
            onPressIn={armBurst}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
            accessibilityLabel={isRetweeted ? 'Annuler le repost' : 'Reposter ce tweet'}
          >
            <View style={burstHostSmallStyle}>
              {burstArmed && (
                <ReactionBurst progress={retweet.progress} palette={RETWEET_PALETTE} iconSize={iconSize} />
              )}
              <Animated.View style={retweet.iconStyle}>
                <Ionicons
                  name={isRetweeted ? 'repeat' : 'repeat-outline'}
                  size={iconSize}
                  color={isRetweeted ? paper.reposted : paper.ink}
                />
              </Animated.View>
            </View>
            <Text style={[S.countSub, isReply && S.countSubReply, isRetweeted && S.countSubOn]}>
              {fmtCount(tweet.stats?.retweets || 0)}
            </Text>
          </TouchableOpacity>
        )}

        {/* Rail — dessiné SEULEMENT quand une réponse suit immédiatement.
            Le rendre systématiquement « pour le rythme » laissait un trait
            pendre dans le vide sous chaque tweet sans réponse. */}
        {isThreadParent && <View style={S.spine} />}
      </View>

      {/* ── Contenu ──
          Isolé derrière son propre `memo` (voir `RowContent`) : un like ne
          touche que la gouttière, il ne doit pas reconstruire l'en-tête
          d'auteur, le corps du tweet ni la grille d'images. */}
      <RowContent
        tweetId={String(tweet.id)}
        isAd={isAd}
        isReply={isReply}
        depth={depth}
        isRetweet={isRetweet}
        repostedLabel={repostedLabel}
        replyToName={replyToName}
        displayAuthor={displayAuthor}
        hasActiveStory={hasActiveStory}
        storySeen={storySeen}
        badgeTint={displayBadgeTint}
        paperCustomization={paperCustomization}
        timeLabel={timeLabel}
        displayContent={displayContent}
        displayMentions={displayMentions}
        mentionContext={mentionContext}
        isScrambled={isScrambled}
        isContentLocked={isContentLocked}
        contentLock={contentLock}
        translationId={String(translationSource?.id || tweet.id)}
        translationEnabled={!!(translationSource as any)?.translation_enabled}
        activeTranslation={activeTranslation}
        onSelectTranslation={onSelectTranslation}
        displayMediaUrls={displayMediaUrls}
        videoUrl={videoUrl}
        videoThumbnailUrl={videoThumbnailUrl}
        displayAudioUrl={displayAudioUrl}
        displayAudioDuration={displayAudioDuration}
        displaySpotifyTrack={displaySpotifyTrack}
        isContest={isContest}
        isQuote={isQuote}
        originalTweet={originalTweet}
        replyCount={replyCount}
        onProfilePress={handleProfilePress}
        onReplyPress={handleReplyPress}
        onBeforeOpen={blockRowPress}
        onVideoDuration={handleVideoDuration}
        onUnlocked={handleUnlocked}
        onOpenContest={handleOpenContest}
        onOpenQuote={handleOpenQuote}
      />
    </AnimatedPressable>
  );
}

/**
 * Ne re-rend que si quelque chose de visible a changé. Le comparateur ne
 * regarde PAS `stats.views` : 2B ne les affiche plus, et les compter comme un
 * changement visible re-rendrait chaque ligne à chaque passage du suivi
 * d'impressions.
 */
function areEqual(prev: TweetRowGutterProps, next: TweetRowGutterProps) {
  const a = prev.tweet;
  const b = next.tweet;
  return (
    a.id === b.id &&
    a.stats?.likes === b.stats?.likes &&
    a.stats?.retweets === b.stats?.retweets &&
    a.stats?.replies === b.stats?.replies &&
    a.user_interaction?.is_liked === b.user_interaction?.is_liked &&
    a.user_interaction?.is_retweeted === b.user_interaction?.is_retweeted &&
    a.user_interaction?.is_super_liked === b.user_interaction?.is_super_liked &&
    a.content === b.content &&
    // Un retweet pur n'a pas de texte propre : le sien vit sur l'original.
    // Sans cette ligne, une correction du tweet d'origine ne remontait
    // jamais dans le fil de ceux qui l'ont reposté.
    (a as any).originalTweet?.content === (b as any).originalTweet?.content &&
    // La mention « untel a retweeté » est bâtie sur `retweeters`, que l'API
    // recalcule à chaque chargement : quelqu'un d'autre a pu reposter depuis.
    // Sans cette comparaison, la ligne garderait l'ancienne mention — le tweet
    // n'a pas changé d'identité, donc rien d'autre ne la ferait rejouer.
    sameRetweeters((a as any).retweeters, (b as any).retweeters) &&
    // Le verrou payant décide de TOUT le rendu de la colonne de contenu
    // (texte brouillé, médias masqués, pavé d'achat). Un déverrouillage qui
    // n'était pas comparé laissait la ligne montrer son cadenas alors que
    // l'accès venait d'être acheté.
    ((a as any).paid_content?.has_access ?? null) ===
      ((b as any).paid_content?.has_access ?? null) &&
    // L'auteur peut changer d'habillage (avatar, pseudo, premium, pastille)
    // sans que le tweet change d'identité. Sur un retweet pur, l'auteur
    // affiché est celui du tweet d'origine (voir `displayAuthor`) : les deux
    // sont donc à comparer.
    sameAuthor(a.author, b.author) &&
    sameAuthor((a as any).originalTweet?.author, (b as any).originalTweet?.author) &&
    prev.index === next.index &&
    prev.isThreadParent === next.isThreadParent &&
    prev.isThreadChild === next.isThreadChild &&
    prev.onAction === next.onAction &&
    prev.contextData === next.contextData &&
    prev.storyUserIds === next.storyUserIds &&
    prev.unseenStoryUserIds === next.unseenStoryUserIds &&
    prev.replyToName === next.replyToName &&
    prev.threadDepth === next.threadDepth &&
    // L'ancre de la visite guidée : elle n'est posée que sur la première
    // ligne. Elle suit l'index, donc elle ne change en pratique jamais sans
    // lui — mais l'omettre laissait le comparateur incomplet, et un
    // comparateur incomplet est un bug qui attend son cas limite.
    prev.gutterRef === next.gutterRef
  );
}

export default memo(TweetRowGutter, areEqual);

// ─── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(14),
    paddingBottom: ROW_PAD_BOTTOM,
    backgroundColor: paper.bg,
    // Dernier maillon de la chaîne : l'éclat déborde aussi vers le haut et le
    // bas de la ligne, et le cœur plein écran du double-tap fait `ps(90)`.
    overflow: 'visible',
  },
  // Une réponse se colle à son parent. Le retrait est porté par le CONTENU
  // (`contentReply`), jamais par la ligne : décaler la ligne décalerait aussi
  // la gouttière, et le rail cesserait d'être droit.
  rowReply: {
    paddingTop: ROW_PAD_TOP_REPLY,
  },

  bigHeartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  // ── Gouttière ──
  // L'éclat du super-cœur fait `ps(30) * 2.1 = ps(63)` de large, la gouttière
  // `ps(52)` : elle le rogne donc à son tour, même hôte dégagé. C'est propre
  // à 2B — dans le fil d'origine, l'éclat est au milieu d'une rangée large.
  gutter: {
    width: GUTTER_W,
    alignItems: 'center',
    overflow: 'visible',
  },
  // Amorce d'une réponse : elle remonte dans le rembourrage haut de la ligne
  // pour rejoindre le rail du parent, qui descend jusqu'au bord bas.
  spineTop: {
    width: RAIL_W,
    height: ROW_PAD_TOP_REPLY,
    marginTop: -ROW_PAD_TOP_REPLY,
    marginBottom: ps(4),
    backgroundColor: paper.gutterLine,
  },
  counter: {
    alignItems: 'center',
    gap: ps(2),
  },
  counterSmall: {
    alignItems: 'center',
    gap: ps(1),
    marginTop: ps(10),
  },
  // ⚠️ `overflow: 'visible'` est OBLIGATOIRE sur toute la chaîne qui porte un
  // `ReactionBurst`. Le composant s'ancre sur une vue de 0 × 0 et dessine
  // TOUT en dehors d'elle : anneaux à `iconSize * 2.1`, particules à
  // `iconSize * 1.15`. Sur Android, une vue rogne ses enfants par défaut —
  // sans cette ligne l'éclat est découpé à la taille de l'icône, il ne reste
  // que le petit ressort du cœur, et le geste paraît n'avoir rien déclenché.
  // (La ligne d'origine le déclare aussi, pour la même raison.)
  burstHost: {
    width: ps(19),
    height: ps(19),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  burstHostSmall: {
    width: ps(16),
    height: ps(16),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  countMain: {
    fontFamily: paperFonts.display,
    fontSize: ps(21),
    lineHeight: ps(25),
    letterSpacing: ps(-0.63),
    color: paper.ink,
  },
  countMainReply: {
    fontSize: ps(15),
    lineHeight: ps(18),
    letterSpacing: ps(-0.45),
  },
  countOn: {
    color: paper.accent,
  },
  // Même corps, même famille, même encre que le compteur du cœur : au repos
  // les deux compteurs de la gouttière doivent former une colonne régulière.
  countSub: {
    fontFamily: paperFonts.display,
    fontSize: ps(21),
    lineHeight: ps(25),
    letterSpacing: ps(-0.63),
    color: paper.ink,
  },
  countSubReply: {
    fontSize: ps(15),
    lineHeight: ps(18),
    letterSpacing: ps(-0.45),
  },
  countSubOn: {
    color: paper.reposted,
  },
  // Descend des compteurs jusqu'au bord bas de la ligne (`marginBottom`
  // négatif = le rembourrage de la ligne) pour rejoindre l'amorce de la
  // réponse qui suit.
  spine: {
    flex: 1,
    width: RAIL_W,
    minHeight: ps(16),
    marginTop: ps(8),
    marginBottom: -ROW_PAD_BOTTOM,
    backgroundColor: paper.gutterLine,
  },

  // ── Contenu ──
  content: {
    flex: 1,
    minWidth: 0,
  },
  repostedBy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(5),
    marginBottom: ps(7),
  },
  repostedByText: {
    fontFamily: paperFonts.mono,
    fontSize: ps(12),
    color: paper.inkMeta,
    flexShrink: 1,
  },
  adLabel: {
    fontFamily: paperFonts.mono,
    fontSize: ps(10),
    letterSpacing: ps(1.5),
    color: paper.inkMeta,
    marginBottom: ps(7),
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(7),
  },
  replyChevron: {
    marginRight: ps(-2),
  },
  authorNameWrap: {
    flexShrink: 1,
    // `minWidth: 0` : sans lui, un enfant de flexbox refuse de descendre sous
    // sa largeur intrinsèque et `flexShrink` reste sans effet.
    minWidth: 0,
  },
  avatarStoryGradient: {
    width: ps(30),
    height: ps(30),
    borderRadius: ps(15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStoryGap: {
    width: ps(26),
    height: ps(26),
    borderRadius: ps(13),
    backgroundColor: paper.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Semi-bold, comme le mot-marque de l'en-tête : le Bold rendait les pseudos
  // aussi lourds que le corps du tweet, alors qu'ils ne font que l'annoncer.
  authorName: {
    fontFamily: paperFonts.strong,
    fontSize: ps(18),
    letterSpacing: ps(-0.36),
    color: paper.ink,
    flexShrink: 1,
  },
  authorNameReply: {
    fontFamily: paperFonts.strong,
    fontSize: ps(16),
    letterSpacing: ps(-0.32),
    color: paper.ink,
    flexShrink: 1,
  },
  verifiedWrap: {
    marginLeft: ps(-2),
  },
  time: {
    fontFamily: paperFonts.mono,
    fontSize: ps(12),
    color: paper.inkMeta,
    marginLeft: 'auto',
    paddingLeft: ps(6),
  },
  // Corps en Medium, pas en Book : sur le fond papier, le Book paraissait
  // délavé à côté des noms en Archivo Bold et des compteurs de la gouttière.
  body: {
    fontFamily: paperFonts.bodyStrong,
    fontSize: ps(19),
    lineHeight: ps(28),
    color: paper.ink,
    marginTop: ps(9),
  },
  bodyReply: {
    fontFamily: paperFonts.bodyStrong,
    fontSize: ps(16),
    lineHeight: ps(23),
    color: paper.ink,
    marginTop: ps(6),
  },
  hiddenMeasure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    zIndex: -1,
  },
  seeMoreBtn: {
    marginTop: ps(5),
    alignSelf: 'flex-start',
  },
  seeMoreText: {
    fontFamily: paperFonts.mono,
    fontSize: ps(12.5),
    color: paper.accent,
  },

  quote: {
    marginTop: ps(11),
    padding: ps(11),
    borderRadius: ps(12),
    borderWidth: 1,
    borderColor: paper.hairline,
  },
  quoteAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(6),
  },
  quoteAuthorName: {
    fontFamily: paperFonts.display,
    fontSize: ps(13.5),
    letterSpacing: ps(-0.27),
    color: paper.ink,
    flexShrink: 1,
  },
  quoteAuthorHandle: {
    fontFamily: paperFonts.mono,
    fontSize: ps(10),
    color: paper.inkMeta,
    flexShrink: 1,
  },
  quoteText: {
    fontFamily: paperFonts.body,
    fontSize: ps(16),
    lineHeight: ps(23),
    color: paper.inkSoft,
    marginTop: ps(6),
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(12),
    marginTop: ps(11),
  },
  footerReply: {
    marginTop: ps(8),
  },
  replies: {
    fontFamily: paperFonts.mono,
    fontSize: ps(12.5),
    color: paper.inkMeta,
  },
  replyPill: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: paper.outline,
    borderRadius: ps(9),
    paddingVertical: ps(5),
    paddingHorizontal: ps(11),
  },
  replyPillText: {
    fontFamily: paperFonts.bodyStrong,
    fontSize: ps(15),
    color: paper.ink,
  },
});
