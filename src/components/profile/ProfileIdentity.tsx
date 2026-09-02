import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, fonts, withAlpha } from '../../theme';
import Avatar from '../Avatar';
import VerifiedBadge from '../VerifiedBadge';
import PremiumBadge from '../PremiumBadge';
import PremiumDisplayName from '../PremiumDisplayName';
import Tappable from '../ui/Tappable';
import { STORY_GRADIENT } from '../StoryRing';
import {
  AvatarDecorationLayer,
  AvatarDecorationOrnament,
  ProfileBannerImage,
  ProfileThemeBackdrop,
  ProfileTitleChip,
} from '../ProfileDecoration';
import {
  CountUp,
  ProfileEntranceHalo,
  type ProfileEntrance,
} from '../PremiumProfileEntrance';
import {
  nameSizeScale,
  type ProfileCustomization,
} from '../../services/profileCustomizationService';

/**
 * ── L'OBJET ───────────────────────────────────────────────────────────────
 *
 * Un profil n'est pas un tableau de bord : c'est une **carte d'identité**.
 * Tout le vocabulaire de ce fichier vient de là, et pas d'un gabarit :
 *
 *   • une PHOTO, posée dans un cadre net, pas une vignette dans une carte ;
 *   • un NOM gravé — grand, serré, posé sur le fond, sans conteneur ;
 *   • des SCEAUX (certification, palier) collés au nom, parce qu'ils
 *     certifient le nom et rien d'autre ;
 *   • un REGISTRE : les chiffres en chasse fixe, séparés par des filets
 *     verticaux, alignés comme les champs d'un document ;
 *   • une MENTION DE DÉLIVRANCE : depuis quand le compte existe, et jusqu'à
 *     quand l'abonnement court. Deux faits, écrits en toutes lettres.
 *
 * ── LA SIGNATURE ──────────────────────────────────────────────────────────
 *
 * Le registre. Seul endroit de l'écran en chasse fixe, seul à porter des
 * filets verticaux, et c'est ce dont on se souvient. Tout le reste est
 * délibérément calme pour le laisser exister.
 *
 * ── CE QUI A DISPARU, ET POURQUOI ────────────────────────────────────────
 *
 * • Le fond teinté du bloc « À propos » (`withAlpha(accent, 0.14)`). Un aplat
 *   d'accent est une PEINTURE, pas une lumière : il fait « page coloriée » à
 *   n'importe quelle intensité (même leçon que `themeBudget.ts`). Il ne reste
 *   que le filet vertical, qui suffit à dire « bloc rapporté ».
 * • Les deux icônes de la ligne méta (épingle, calendrier). Un pictogramme
 *   qui accompagne un texte disant déjà la même chose n'ajoute que du bruit.
 * • Les quatre boutons entassés à droite de l'avatar. Ils sont devenus deux
 *   cibles pleine largeur et une icône — 44 pt chacune au lieu de 34.
 */

type Tier = 'free' | 'plus' | 'pro' | 'ultra';

export interface ProfileIdentityProps {
  displayName: string;
  username: string;
  avatarUri?: string | null;
  bannerUri?: string | null;
  bio?: string | null;
  city?: string | null;
  createdAt?: string | null;
  verified?: boolean;
  verificationStyle?: string;
  premium?: boolean;
  tier: Tier;
  subscriptionExpiresAt?: string | null;
  isPrivate?: boolean;
  isLive?: boolean;
  isUploading?: boolean;

  followers: number;
  following: number;
  posts: number;

  customization?: ProfileCustomization;
  /** Palette du profil habillé — accent, puis couleur secondaire. */
  accent: string;
  secondary: string;
  themed: boolean;
  hasAvatarDecoration: boolean;
  hasStories?: boolean;
  /** Teinte accordée à la pastille de certification. */
  badgeTint?: string | null;
  badgeSize: number;

  entrance: ProfileEntrance;
  /**
   * La scène d'arrivée est-elle réellement jouée ?
   *
   * `ProfileThemeBackdrop` porte son PROPRE fondu d'apparition, celui qui
   * garantit qu'un thème n'arrive jamais à moitié posé. Le style de la scène
   * est fusionné en dernier et gagne donc sur `opacity` : le passer quand la
   * scène ne joue pas remplacerait ce fondu par une valeur figée à 1, et
   * l'habillage claquerait d'un coup à la place. On ne le transmet donc que
   * lorsqu'il a quelque chose à animer.
   */
  playEntrance?: boolean;
  scrollY: SharedValue<number>;
  bannerHeight: number;
  onBannerParentLayout: (e: LayoutChangeEvent) => void;

  onPressAvatar?: () => void;
  onLongPressAvatar?: () => void;
  /**
   * Absent sur le profil de quelqu'un d'autre : le chevron n'apparaît que
   * quand le pseudo mène quelque part (le sélecteur de comptes, chez soi).
   */
  onPressHandle?: () => void;
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
  /** Posé à droite du pseudo — la pastille « app native iOS », par exemple. */
  handleTrailing?: React.ReactNode;

  /** Rangée d'actions — propre à chaque écran (soi / quelqu'un d'autre). */
  actions?: React.ReactNode;
  /** Rangées posées sous les actions (appartenance, demandes en attente…). */
  footer?: React.ReactNode;
}

/**
 * Lignes de bio montrées avant le repli.
 *
 * Une bio non tronquée rend la hauteur de l'en-tête imprévisible : les
 * onglets ne se figent alors jamais au même endroit d'un profil à l'autre,
 * et un profil bavard repousse son propre contenu hors de l'écran. Quatre
 * lignes, c'est le repli d'Instagram.
 */
const BIO_LINES = 4;

/** Espace insécable : en chasse fixe il vaut une colonne, comme un chiffre. */
const NB = ' ';

/**
 * Un compte se lit exactement tant qu'il tient. En dessous de dix mille, le
 * chiffre EST l'information (« 9 847 abonnés » n'est pas « 9,8 k ») ; au-delà,
 * personne ne lit l'unité, et l'abréviation garde la colonne alignée.
 */
export function formatCount(input?: number | null): string {
  const v = Math.max(0, Math.floor(Number(input) || 0));
  if (v < 10000) return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  if (v < 1000000) return `${short(v / 1000)}${NB}k`;
  return `${short(v / 1000000)}${NB}M`;
}

/**
 * Une décimale au plus, TRONQUÉE et non arrondie, et jamais un « ,0 ».
 *
 * L'arrondi ment vers le haut : à 12 501 abonnés, `toFixed(1)` affiche
 * « 12,5 k » alors que le palier n'est pas atteint. Et « 12,0 k » pour douze
 * mille pile est une décimale qui n'apprend rien — c'est « 12 k ».
 */
function short(value: number): string {
  if (value >= 100) return String(Math.floor(value));
  const tenths = Math.floor(value * 10);
  const whole = Math.floor(tenths / 10);
  const rest = tenths % 10;
  return rest === 0 ? String(whole) : `${whole},${rest}`;
}

const TIER_LABEL: Record<Tier, string | null> = {
  free: null,
  plus: 'PLUS',
  pro: 'PRO',
  ultra: 'ULTRA',
};

function monthYear(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

function dayMonth(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

/**
 * Le cadre de la photo. Tapable seulement quand il y a quelque chose à ouvrir
 * — une story chez soi, une story chez l'autre. Une cible qui s'enfonce sous
 * le doigt sans rien faire promet une action qui n'existe pas.
 */
function AvatarSlot({
  tappable, onPress, onLongPress, label, children,
}: {
  tappable: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  if (!tappable) return <View style={S.avatarSlot}>{children}</View>;
  return (
    <Tappable
      onPress={onPress}
      onLongPress={onLongPress}
      scaleTo={0.97}
      style={S.avatarSlot}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
    >
      {children}
    </Tappable>
  );
}

/** Un champ du registre. Inerte quand il ne mène nulle part — comme Instagram. */
function Field({
  value,
  label,
  onPress,
}: {
  value: React.ReactNode;
  label: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      {value}
      <Text style={S.fieldLabel} numberOfLines={1}>{label}</Text>
    </>
  );
  if (!onPress) return <View style={S.field}>{body}</View>;
  return (
    <Tappable
      style={S.field}
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {body}
    </Tappable>
  );
}

export default function ProfileIdentity(props: ProfileIdentityProps) {
  const {
    displayName, username, avatarUri, bannerUri, bio, city, createdAt,
    verified, verificationStyle, premium, tier, subscriptionExpiresAt,
    isPrivate, isLive, isUploading,
    followers, following, posts,
    customization, accent, secondary, themed, hasAvatarDecoration, hasStories,
    badgeTint, badgeSize, entrance, playEntrance, scrollY, bannerHeight, onBannerParentLayout,
    onPressAvatar, onLongPressAvatar, onPressHandle, handleTrailing,
    onPressFollowers, onPressFollowing, actions, footer,
  } = props;

  /**
   * Étirement de la bannière au dépassement. Le contenu est déjà descendu de
   * `-scrollY` : sans compensation, une bande vide s'ouvre au-dessus de la
   * photo. La bannière grandit donc du même nombre de pixels, ancrée par le
   * BAS (`transformOrigin` dans la feuille de styles) — l'arête basse ne
   * bouge pas d'un pixel, l'avatar qui la chevauche reste à sa place.
   *
   * Android n'a pas de rebond : `scrollY` n'y devient jamais négatif et
   * l'échelle reste à 1. Aucune branche de plateforme n'est nécessaire.
   */
  const stretch = useAnimatedStyle(() => {
    const over = -scrollY.value;
    if (over <= 0) return { transform: [{ scale: 1 }] };
    return { transform: [{ scale: (bannerHeight + over) / Math.max(1, bannerHeight) }] };
  });

  /**
   * L'echelle du nom est une option PAYANTE (normal → géant). Elle multiplie
   * le corps ET l'interligne : ne monter que le corps ferait chevaucher un
   * nom sur deux lignes à la taille « Géant ».
   */
  const nameScale = nameSizeScale(customization);
  const nameStyle = React.useMemo(
    () => ({ ...S.name, fontSize: S.name.fontSize * nameScale, lineHeight: S.name.lineHeight * nameScale }),
    [nameScale],
  );

  /**
   * Détection du repli. Les deux plateformes ne rendent pas le même compte
   * de lignes : iOS n'expose que les lignes VISIBLES (donc moins que le
   * texte complet), Android les expose toutes (donc plus que la limite). On
   * teste les deux, sinon le « Plus » manque sur l'une des deux.
   */
  const bioText = bio?.trim();
  const [bioExpanded, setBioExpanded] = useState(false);
  const [bioClipped, setBioClipped] = useState(false);
  const onBioLayout = useCallback((e: any) => {
    if (bioExpanded || bioClipped || !bioText) return;
    const lines: Array<{ text: string }> = e?.nativeEvent?.lines || [];
    if (!lines.length) return;
    const shown = lines.map((l) => l.text).join('').replace(/…\s*$/, '').trim();
    if (lines.length > BIO_LINES || shown.length < bioText.length) setBioClipped(true);
  }, [bioExpanded, bioClipped, bioText]);

  const avatarTappable = !!onPressAvatar || !!onLongPressAvatar;

  const joined = monthYear(createdAt);
  const tierLabel = TIER_LABEL[tier];
  const until = dayMonth(subscriptionExpiresAt);
  const about = customization?.about_me?.trim();

  return (
    <View style={S.hero}>
      {/*
        Le thème premium se peint DERRIÈRE tout le profil et déborde sous le
        hero. Premier enfant, donc jamais par-dessus la bannière.
      */}
      <ProfileThemeBackdrop
        customization={customization}
        bannerHeight={bannerHeight}
        style={playEntrance ? entrance.theme : undefined}
      />

      {/* ── Bannière ────────────────────────────────────────────────────── */}
      <View style={S.bannerSlot} onLayout={onBannerParentLayout}>
        <Reanimated.View
          style={[
            S.bannerClip,
            { height: bannerHeight },
            themed && S.bannerClipThemed,
            stretch,
          ]}
        >
          <RNAnimated.View style={[StyleSheet.absoluteFill as any, entrance.banner]}>
            {bannerUri
              ? <ProfileBannerImage uri={bannerUri} themed={themed} />
              : (!themed && <View style={S.bannerEmpty} />)}
          </RNAnimated.View>

          {/*
            Le fondu du bas. Une photo de bannière s'arrête aujourd'hui sur une
            arête franche, et c'est elle qui fait « bloc collé » plutôt que
            « page ». Le dégradé la dissout dans le fond.

            Il ne sort QUE s'il y a une photo ET aucun thème : sur un profil
            habillé, c'est la matière du thème qui fait cette jonction, et
            poser un aplat de `colors.bg` par-dessus la détruirait.
          */}
          {!!bannerUri && !themed && (
            <LinearGradient
              colors={['transparent', withAlpha(colors.bg, 0.55), colors.bg]}
              locations={[0, 0.72, 1]}
              style={S.bannerScrim}
              pointerEvents="none"
            />
          )}
        </Reanimated.View>
      </View>

      {/* ── Photo + registre ────────────────────────────────────────────── */}
      <View style={S.identityRow}>
        <RNAnimated.View style={entrance.avatar}>
          <AvatarSlot
            tappable={avatarTappable}
            onPress={onPressAvatar}
            onLongPress={onLongPressAvatar}
            label={hasStories ? 'Voir la story' : 'Changer la photo de profil'}
          >
            <ProfileEntranceHalo
              size={AVATAR_OUTER}
              customization={customization}
              active={entrance.staging}
            />
            {hasStories && !hasAvatarDecoration && (
              <LinearGradient
                colors={STORY_GRADIENT as unknown as [string, string, ...string[]]}
                start={{ x: 0.85, y: 0.05 }}
                end={{ x: 0.15, y: 0.95 }}
                style={S.storyRing}
                pointerEvents="none"
              />
            )}
            <AvatarDecorationLayer customization={customization} size={AVATAR_OUTER} />
            {hasAvatarDecoration ? (
              <LinearGradient
                colors={[accent, secondary] as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[S.avatarFrame, isLive && S.avatarFrameLive]}
              >
                <Avatar size={AVATAR_SIZE} username={username} uri={avatarUri as any} />
                {isUploading && (
                  <View style={S.uploading}><ActivityIndicator color="#fff" size="small" /></View>
                )}
              </LinearGradient>
            ) : (
              <View style={[S.avatarFrame, isLive && S.avatarFrameLive]}>
                <Avatar size={AVATAR_SIZE} username={username} uri={avatarUri as any} />
                {isUploading && (
                  <View style={S.uploading}><ActivityIndicator color="#fff" size="small" /></View>
                )}
              </View>
            )}
            <AvatarDecorationOrnament customization={customization} size={AVATAR_OUTER} />
            {isLive && <View style={S.liveTag}><Text style={S.liveTagText}>LIVE</Text></View>}
          </AvatarSlot>
        </RNAnimated.View>

        {/*
          Le registre. Aligné sur le BAS de la rangée pour retomber sous
          l'arête de la bannière : posé au milieu, il se lirait à moitié sur
          une photo quelconque, donc à moitié pas du tout.
        */}
        <RNAnimated.View style={[S.register, entrance.line(5)]}>
          <Field
            label="ABONNÉS"
            onPress={onPressFollowers}
            value={<CountUp value={followers} active={entrance.staging} format={formatCount} style={S.fieldValue} />}
          />
          <Field
            label="SUIVIS"
            onPress={onPressFollowing}
            value={<CountUp value={following} active={entrance.staging} format={formatCount} style={S.fieldValue} />}
          />
          <Field
            label="POSTS"
            value={<CountUp value={posts} active={entrance.staging} format={formatCount} style={S.fieldValue} />}
          />
        </RNAnimated.View>
      </View>

      {/* ── Nom, sceaux, mentions ───────────────────────────────────────── */}
      <View style={S.body}>
        <RNAnimated.View style={[S.nameRow, entrance.name]}>
          <View style={S.nameSlot}>
            <PremiumDisplayName
              text={displayName}
              baseStyle={nameStyle}
              isPremium={!!premium}
              subscriptionTierRaw={tier === 'free' ? undefined : tier}
              fontId="system"
              effectId="none"
              customization={customization}
              verified={!!verified}
              verificationStyle={verificationStyle as any}
            />
          </View>
          {!!verified && (
            <View style={S.seal}>
              <VerifiedBadge
                verificationStyle={(verificationStyle as any) || 'default'}
                size={badgeSize}
                animated
                tint={badgeTint as any}
              />
            </View>
          )}
          {!!premium && (
            <View style={S.seal}>
              <PremiumBadge
                type="small"
                animated
                size={badgeSize}
                subscriptionTier={tier}
                tint={verified ? (badgeTint as any) : null}
              />
            </View>
          )}
        </RNAnimated.View>

        <RNAnimated.View style={[S.handleRow, entrance.line(0)]}>
          {onPressHandle ? (
            <Tappable
              style={S.handleTap}
              onPress={onPressHandle}
              scaleTo={0.97}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Changer de compte"
            >
              <Text style={S.handle} numberOfLines={1}>@{username}</Text>
              <Ionicons name="chevron-down" size={13} color={colors.textMuted} style={S.handleChevron} />
            </Tappable>
          ) : (
            <Text style={[S.handle, S.handlePlain]} numberOfLines={1}>@{username}</Text>
          )}
          {handleTrailing}
          {!!isPrivate && (
            <View style={S.privateTag}>
              <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
              <Text style={S.privateText}>Privé</Text>
            </View>
          )}
        </RNAnimated.View>

        <RNAnimated.View style={entrance.line(1)}>
          <ProfileTitleChip customization={customization} />
        </RNAnimated.View>

        {!!bioText && (
          <RNAnimated.View style={entrance.line(2)}>
            <Text
              style={S.bio}
              numberOfLines={bioExpanded ? undefined : BIO_LINES}
              onTextLayout={onBioLayout}
            >
              {bioText}
            </Text>
            {bioClipped && !bioExpanded && (
              <Tappable
                style={S.bioMore}
                onPress={() => setBioExpanded(true)}
                scaleTo={0.97}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Afficher toute la bio"
              >
                <Text style={S.bioMoreLabel}>Plus</Text>
              </Tappable>
            )}
          </RNAnimated.View>
        )}

        {!!about && (
          <RNAnimated.View style={[S.about, { borderLeftColor: accent }, entrance.line(3)]}>
            <Text style={[S.fieldTag, S.aboutLabel]}>À PROPOS</Text>
            <Text style={S.aboutText}>{about}</Text>
          </RNAnimated.View>
        )}

        {/*
          Mention de délivrance. Une seule ligne, sans icône : « Kinshasa » et
          « Membre depuis sept. 2025 » se suffisent, et deux pictogrammes pour
          deux faits déjà écrits ne feraient qu'ajouter du bruit.
        */}
        {(!!city?.trim() || !!joined) && (
          <RNAnimated.View style={[S.issueRow, entrance.line(4)]}>
            {!!city?.trim() && (
              <Text style={S.issueText} numberOfLines={1}>{city.trim()}</Text>
            )}
            {/* Le point ne sort QUE s'il sépare réellement deux choses. Il
                restait quand la date manquait, et un profil sans date de
                création affichait « Jtejureville · », un séparateur qui ne
                séparait rien. */}
            {!!city?.trim() && !!joined && <Text style={S.issueText}>·</Text>}
            {!!joined && (
              <Text style={S.issueText} numberOfLines={1}>
                Membre depuis <Text style={S.issueStamp}>{joined}</Text>
              </Text>
            )}
          </RNAnimated.View>
        )}

        {/*
          L'appartenance, écrite plutôt que décorée. Discord met un bijou,
          Telegram met une phrase : c'est la phrase qui vieillit bien, et elle
          dit ce qu'aucune pastille ne dit — jusqu'à quand.
          `subscription_expires_at` peut être NULL sur un mandat de
          reconduction : on affiche alors le palier seul, jamais une date
          inventée.
        */}
        {!!tierLabel && (
          <RNAnimated.View style={[S.membership, entrance.line(5)]}>
            <Text style={S.fieldTag}>ABONNEMENT</Text>
            <Text style={S.membershipValue} numberOfLines={1}>
              <Text style={S.membershipTier}>{tierLabel}</Text>
              {!!until && ` · jusqu'au ${until}`}
            </Text>
          </RNAnimated.View>
        )}

        {!!actions && (
          <RNAnimated.View style={[S.actions, entrance.line(6)]}>{actions}</RNAnimated.View>
        )}

        {footer}
      </View>
    </View>
  );
}

export const AVATAR_SIZE = 84;
export const AVATAR_BORDER = 4;
export const AVATAR_OUTER = AVATAR_SIZE + AVATAR_BORDER * 2;
/**
 * Moitié de l'avatar sur la bannière — et non 58 % comme avant. Le registre
 * est aligné sur le bas de cette rangée : à 58 %, sa ligne haute mordait
 * encore sur la photo.
 */
export const AVATAR_OVERLAP = Math.round(AVATAR_OUTER * 0.5);

const GUTTER = 16;

const S = StyleSheet.create({
  hero: { position: 'relative', width: '100%', overflow: 'visible' },

  bannerSlot: { width: '100%' },
  bannerClip: {
    width: '100%',
    backgroundColor: colors.surface,
    overflow: 'hidden',
    // Ancre de l'étirement : le bas de la bannière ne bouge jamais.
    transformOrigin: '50% 100%',
  },
  bannerClipThemed: { backgroundColor: 'transparent' },
  bannerEmpty: { ...(StyleSheet.absoluteFillObject as any), backgroundColor: colors.surface },
  bannerScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 88 },

  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: GUTTER,
    marginTop: -AVATAR_OVERLAP,
    zIndex: 6,
    elevation: 8,
  },
  avatarSlot: { position: 'relative' },
  storyRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: AVATAR_OUTER / 2 + 3,
  },
  avatarFrame: {
    borderRadius: AVATAR_OUTER / 2,
    padding: AVATAR_BORDER,
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  avatarFrameLive: { backgroundColor: colors.accent },
  uploading: {
    ...(StyleSheet.absoluteFillObject as any),
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTag: {
    position: 'absolute',
    bottom: -2,
    alignSelf: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  liveTagText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.5 },

  // ── Le registre ───────────────────────────────────────────────────────
  register: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    gap: 18,
  },
  field: {
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    minHeight: 44,
    flexShrink: 1,
  },
  fieldValue: {
    fontFamily: fonts.bold,
    fontSize: 19,
    lineHeight: 23,
    letterSpacing: -0.3,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  fieldLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.9,
    color: colors.textMuted,
    marginTop: 2,
  },
  /**
   * Le libellé de champ du document — ABONNÉS, SUIVIS, POSTS, À PROPOS,
   * ABONNEMENT. C'est le SEUL niveau de l'écran en capitales espacées : deux
   * niveaux de capitales sur une même page se lisent comme un catalogue, et
   * des capitales sans supplément de chasse forment une barre d'encre pleine
   * (d'où les 0,9 px, soit +8 % sur un corps de 11).
   */
  fieldTag: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.9,
    color: colors.textMuted,
  },


  // ── Corps ─────────────────────────────────────────────────────────────
  body: { paddingHorizontal: GUTTER, paddingTop: 12, zIndex: 4 },
  /**
   * PAS de `flexWrap`. Les sceaux certifient le nom : ils doivent rester sur
   * sa ligne. Avec un retour à la ligne, un nom long (taille « Géant », corps
   * doublé) poussait la pastille premium seule sur la ligne suivante, où elle
   * se lisait comme un élément égaré. C'est le nom qui cède la place — il a
   * `flexShrink` pour ça, et X comme Instagram font pareil.
   */
  nameRow: { flexDirection: 'row', alignItems: 'center', overflow: 'visible' },
  nameSlot: { flexShrink: 1, minWidth: 0, marginRight: 4, overflow: 'visible' },
  name: {
    fontFamily: fonts.bold,
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  seal: { marginLeft: 5 },

  handleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 8 },
  handleTap: { flexDirection: 'row', alignItems: 'center', minHeight: 28, flexShrink: 1 },
  handle: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20, color: colors.textSecondary },
  handleChevron: { marginLeft: 3 },
  handlePlain: { flexShrink: 1 },
  privateTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  privateText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.textMuted },

  bio: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
    marginTop: 12,
  },
  bioMore: { alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' },
  bioMoreLabel: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.textSecondary },

  about: { marginTop: 12, paddingLeft: 12, borderLeftWidth: 2 },
  aboutLabel: { marginBottom: 4 },
  aboutText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textSecondary },

  issueRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 12, gap: 6 },
  issueText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  issueStamp: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  membership: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  membershipValue: {
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: colors.textMuted,
  },
  membershipTier: { fontFamily: fonts.bold, color: colors.textPrimary },

  actions: { marginTop: 24 },
});
