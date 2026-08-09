import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, withAlpha, towardWhite } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { decorationColors } from '../services/profileCustomizationService';
import {
  COMPARE_FEATURES,
  PRO_ONLY_FEATURES,
  SUBSCRIPTION_FEATURES,
  TRUST_POINTS,
} from '../utils/subscriptionFeatures';
import subscriptionPricingService, {
  SubscriptionPricing,
  formatEur,
  formatNf,
} from '../services/subscriptionPricingService';

/**
 * Palette de la feuille, dérivée de la COULEUR DU PROFIL de l'utilisateur.
 *
 * L'or figé était le même pour tout le monde : sur un profil habillé en rose
 * néon, la page d'abonnement arrivait comme une pièce rapportée. Ici elle
 * reprend l'accent du compte — l'offre a l'air d'appartenir à la page depuis
 * laquelle on l'ouvre.
 *
 * Le nom `GOLD` est conservé : les 31 points de la feuille qui s'y réfèrent
 * continuent de fonctionner et suivent désormais l'accent, sans réécriture.
 */
function makePalette(accent: string, secondary?: string) {
  const base = accent || colors.gold;
  return {
    light: towardWhite(base, 0.45),
    base,
    deep: secondary || base,
    // Texte posé SUR l'accent : un or clair demande de l'encre sombre, un rose
    // saturé demande du blanc. Décidé sur la luminance, pas sur la teinte.
    ink: readableInk(base),
    soft: withAlpha(base, 0.12),
    line: withAlpha(base, 0.32),
    glow: withAlpha(base, 0.24),
  };
}

/** Luminance perçue (Rec. 709) → encre sombre au-dessus de ~0,6. */
function readableInk(hex: string): string {
  if (!hex || hex[0] !== '#') return '#120D02';
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#120D02' : '#FFFFFF';
}

type Palette = ReturnType<typeof makePalette>;

/** Logo de l'app — même source que l'écran de chargement. */
const LOGO = require('../../assets/icon.png');

/**
 * Les listes d'avantages viennent désormais du catalogue partagé
 * (`utils/subscriptionFeatures`), aligné avec l'app Windows. Elles étaient
 * auparavant recopiées ici et avaient décroché de l'offre réelle.
 */
const TRUST = TRUST_POINTS;

/** « 0,50 € » — deux décimales forcées pour un prix par jour crédible. */
const formatEurPrecise = (value: number) =>
  `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default function PremiumCheckoutSheet({
  visible,
  onClose,
  currentTier,
  walletBalance,
  walletLoading,
  walletError,
  onRetryWallet,
  loading,
  onPurchase,
}: {
  visible: boolean;
  onClose: () => void;
  currentTier: 'free' | 'plus' | 'pro';
  walletBalance: number;
  walletLoading: boolean;
  walletError: boolean;
  onRetryWallet: () => void | Promise<void>;
  loading: boolean;
  /** Reçoit le palier choisi : la feuille ne vend plus uniquement Pro. */
  onPurchase: (tier: 'plus' | 'pro') => void;
}) {
  const insets = useSafeAreaInsets();
  const [pricing, setPricing] = useState<SubscriptionPricing | null>(null);
  const [priceError, setPriceError] = useState(false);

  const isUpgrade = currentTier === 'plus';

  // Palette reprise du profil de l'utilisateur (voir `makePalette`).
  const { user: authUser } = useAuth() as any;
  const [accent, secondary] = decorationColors(
    (authUser as any)?.profile_customization || null,
  );
  const GOLD = useMemo(() => makePalette(accent, secondary), [accent, secondary]);
  const styles = useMemo(() => makeStyles(GOLD), [GOLD]);

  /**
   * Palier que l'utilisateur achète.
   *
   * Il était figé sur `pro` : impossible de prendre Plus, alors que l'API
   * tarifie bien les deux. Un abonné Plus, lui, ne peut que monter vers Pro —
   * proposer Plus à quelqu'un qui l'a déjà n'aurait aucun sens.
   */
  const [selectedTier, setSelectedTier] = useState<'plus' | 'pro'>('pro');
  useEffect(() => {
    if (visible) setSelectedTier('pro');
  }, [visible]);
  const buyingTier: 'plus' | 'pro' = isUpgrade ? 'pro' : selectedTier;

  const loadPrice = async () => {
    setPricing(null);
    setPriceError(false);
    const next = await subscriptionPricingService.get();
    setPricing(next);
    setPriceError(!(isUpgrade ? next.upgrade.live : next[selectedTier].live));
  };

  useEffect(() => {
    if (visible) void loadPrice();
  }, [visible, selectedTier]);

  const price = pricing ? (isUpgrade ? pricing.upgrade : pricing[selectedTier]) : null;
  const priceIsLive = Boolean(price?.live);
  const requiredNf = priceIsLive ? Number(price?.nf || 0) : 0;
  const walletReady = !walletLoading && !walletError;
  const enough = priceIsLive && walletReady && walletBalance >= requiredNf;
  const missing = Math.max(0, requiredNf - walletBalance);
  // Repli sur la période standard de l'offre, jamais sur un mois.
  const days = pricing?.duration_days || 5;
  const perDay = priceIsLive && days > 0 ? Number(price?.eur || 0) / days : null;
  const symbol = pricing?.currency_symbol || 'NF';
  const coverage = requiredNf > 0 ? Math.min(1, Math.max(0, walletBalance / requiredNf)) : 0;

  // ── Animations ────────────────────────────────────────────────────
  // Le Modal reste monté le temps de la sortie : l'ouverture ET la fermeture
  // sont pilotées ici (aucun état intermédiaire visible).
  const [mounted, setMounted] = useState(visible);
  const enter = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(enter, {
        toValue: 1,
        damping: 20,
        stiffness: 190,
        mass: 0.85,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(enter, {
      toValue: 0,
      duration: 190,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible]);

  // Boucles décoratives : halo qui dérive, reflet du CTA.
  useEffect(() => {
    if (!mounted) return;
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(sweep, {
            toValue: 1,
            duration: 6500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(sweep, {
            toValue: 0,
            duration: 6500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(shine, {
            toValue: 1,
            duration: 1500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(1900),
        ])
      ),
    ];
    loops.forEach(l => l.start());
    return () => {
      loops.forEach(l => l.stop());
      shine.setValue(0);
    };
  }, [mounted]);

  // Remplissage de la jauge de portefeuille (largeur → pas de driver natif).
  useEffect(() => {
    Animated.timing(fill, {
      toValue: coverage,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [coverage]);

  const sheetStyle = useMemo(
    () => ({
      opacity: enter,
      transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }],
    }),
    []
  );

  const ctaDisabled = !enough || loading || priceError;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity: enter }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View style={[styles.sheet, sheetStyle]}>
          {/* Liseré or : la première chose qu'on voit arriver du bas. */}
          <LinearGradient
            colors={[GOLD.deep, GOLD.light, GOLD.base]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topAccent}
          />
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.brand}>
              <Image source={LOGO} style={styles.brandLogo} resizeMode="contain" />
              <Text style={styles.brandText}>TWITNINF PRO</Text>
            </View>
            <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ── Héros : halo animé EN FOND, jamais posé par-dessus le texte ── */}
            <View style={styles.hero}>
              <View style={styles.heroBackdrop} pointerEvents="none">
                <LinearGradient
                  colors={[withAlpha(GOLD.base, 0.18), withAlpha(GOLD.deep, 0.07), 'transparent']}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Animated.View
                  style={[
                    styles.heroSweep,
                    {
                      transform: [
                        {
                          translateX: sweep.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-160, 200],
                          }),
                        },
                        { rotate: '18deg' },
                      ],
                    },
                  ]}
                >
                  <LinearGradient
                    colors={['transparent', withAlpha(GOLD.base, 0.1), 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </View>

              <View style={styles.emblem}>
                {/* Le logo de l'app plutôt qu'une étoile générique : c'est la
                    marque qu'on achète, pas une décoration. Aucun fond derrière :
                    le PNG est transparent, un cadre plein le dénaturait. */}
                <Image source={LOGO} style={styles.emblemLogo} resizeMode="contain" />
              </View>

              <Text style={styles.title}>
                Plus qu’un badge.{'\n'}
                <Text style={styles.titleAccent}>Une vraie présence.</Text>
              </Text>

              <Text style={styles.subtitle}>
                {isUpgrade
                  ? 'Passe au palier complet : tout le pack visuel et créateur de TwitNinf.'
                  : 'Tout ce qu’il faut pour te démarquer et faire grandir ton compte.'}
              </Text>
            </View>

            {/* ── Prix ── */}
            <View style={styles.priceCard}>
              {!price ? (
                <ActivityIndicator color={GOLD.base} style={styles.priceLoader} />
              ) : priceIsLive ? (
                <>
                  <View style={styles.priceMain}>
                    <View style={styles.priceLeft}>
                      <Text style={styles.eurPrice}>{formatEur(price.eur)}</Text>
                      <Text style={styles.priceUnit}>pour {days} jours</Text>
                    </View>
                    {perDay !== null && (
                      <View style={styles.perDay}>
                        <Text style={styles.perDayValue}>{formatEurPrecise(perDay)}</Text>
                        <Text style={styles.perDayLabel}>par jour</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.nfLine}>
                    <Text style={styles.nfLabel}>Débité aujourd’hui</Text>
                    <Text style={styles.nfPrice}>
                      {formatNf(requiredNf)} {symbol}
                    </Text>
                  </View>

                  {!!pricing?.nf_price_eur && (
                    <Text style={styles.rate}>
                      Conversion automatique · 1 {symbol} = {formatEur(pricing.nf_price_eur)}
                    </Text>
                  )}
                  {isUpgrade && (
                    <View style={styles.upgradeChip}>
                      <Ionicons name="trending-up" size={12} color={GOLD.base} />
                      <Text style={styles.upgradeChipText}>
                        Mise à niveau : tu ne paies que la différence
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.priceUnavailable}>
                  <Ionicons name="cloud-offline-outline" size={22} color={GOLD.base} />
                  <View style={styles.priceUnavailableCopy}>
                    <Text style={styles.unavailableTitle}>Cours {symbol} indisponible</Text>
                    <Text style={styles.unavailableText}>Aucun ancien prix ne sera utilisé.</Text>
                  </View>
                  <TouchableOpacity onPress={loadPrice} hitSlop={8}>
                    <Text style={styles.retry}>Réessayer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── Portefeuille + jauge de couverture ── */}
            <View style={styles.wallet}>
              <View style={styles.walletTop}>
                <View style={styles.walletLabel}>
                  <Ionicons name="wallet-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.walletText}>Ton solde {symbol}</Text>
                </View>
                {walletLoading ? (
                  <ActivityIndicator size="small" color={GOLD.base} />
                ) : walletError ? (
                  <TouchableOpacity style={styles.walletRetry} onPress={() => void onRetryWallet()}>
                    <Text style={styles.walletRetryText}>Réessayer</Text>
                    <Ionicons name="refresh" size={13} color={GOLD.base} />
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.walletValue, enough ? styles.walletEnough : styles.walletLow]}>
                    {formatNf(walletBalance)} {symbol}
                  </Text>
                )}
              </View>

              {priceIsLive && walletReady && (
                <>
                  <View style={styles.gauge}>
                    <Animated.View
                      style={[
                        styles.gaugeFill,
                        {
                          width: fill.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    >
                      <LinearGradient
                        colors={enough ? [colors.success, '#7BE8A8'] : [GOLD.deep, GOLD.base]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </Animated.View>
                  </View>
                  <Text style={enough ? styles.gaugeOk : styles.gaugeMissing}>
                    {enough
                      ? 'Solde suffisant — activation en un geste.'
                      : `Il te manque ${formatNf(missing)} ${symbol}.`}
                  </Text>
                </>
              )}
              {walletError && (
                <Text style={styles.gaugeMissing}>Impossible de charger le portefeuille {symbol}.</Text>
              )}
            </View>

            {/* ── Choix du palier ──
                Masqué pour un abonné Plus : sa seule option est de monter
                vers Pro, un sélecteur à deux cases n'aurait rien à proposer. */}
            {!isUpgrade && (
              <View style={styles.tierPicker}>
                {(['plus', 'pro'] as const).map(tier => {
                  const active = selectedTier === tier;
                  const tierPrice = pricing?.[tier];
                  return (
                    <Pressable
                      key={tier}
                      onPress={() => setSelectedTier(tier)}
                      style={[styles.tierCard, active && styles.tierCardActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <View style={styles.tierCardHead}>
                        <Ionicons
                          name={tier === 'pro' ? 'star' : 'diamond'}
                          size={14}
                          color={active ? GOLD.base : colors.textMuted}
                        />
                        <Text style={[styles.tierName, active && styles.tierNameActive]}>
                          {tier === 'pro' ? 'PRO' : 'PLUS'}
                        </Text>
                      </View>
                      <Text style={[styles.tierPrice, active && styles.tierPriceActive]}>
                        {tierPrice?.live ? `${Number(tierPrice.eur).toLocaleString('fr-FR')} €` : '—'}
                      </Text>
                      <Text style={styles.tierHint}>
                        {tier === 'pro' ? 'Tout, hors ligne compris' : 'L\'essentiel'}
                      </Text>
                      {active && (
                        <View style={styles.tierTick}>
                          <Ionicons name="checkmark" size={11} color={GOLD.ink} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* ── Comparatif sur les TROIS paliers ──
                Deux colonnes (Gratuit / Pro) ne montraient pas ce que Plus
                apporte déjà, alors que c'est le palier d'entrée : l'écart
                Gratuit → Plus est le seul que voit un non-abonné. */}
            <View style={styles.compare}>
              <View style={styles.compareHead}>
                <Text style={styles.compareHeadLabel}>Ce qui change</Text>
                <Text style={styles.compareHeadFree}>Gratuit</Text>
                <Text style={styles.compareHeadPlus}>PLUS</Text>
                <View style={styles.compareHeadPro}>
                  <Text style={styles.compareHeadProText}>PRO</Text>
                </View>
              </View>
              {COMPARE_FEATURES.map((feature, index) => (
                <View
                  key={feature.title}
                  style={[
                    styles.compareRow,
                    index === COMPARE_FEATURES.length - 1 && styles.compareRowLast,
                  ]}
                >
                  <Text style={styles.compareLabel} numberOfLines={2}>{feature.title}</Text>
                  <View style={styles.compareCell}>
                    <View style={styles.compareCross}>
                      <Ionicons name="close" size={13} color={colors.textMuted} />
                    </View>
                  </View>
                  <View style={styles.compareCell}>
                    {feature.minTier === 'plus' ? (
                      <View style={styles.comparePlusCheck}>
                        <Ionicons name="checkmark" size={13} color={colors.accent} />
                      </View>
                    ) : (
                      <View style={styles.compareCross}>
                        <Ionicons name="close" size={13} color={colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <View style={styles.compareCell}>
                    <LinearGradient
                      colors={[GOLD.light, GOLD.base]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.compareCheck}
                    >
                      <Ionicons name="checkmark" size={13} color={GOLD.ink} />
                    </LinearGradient>
                  </View>
                </View>
              ))}
            </View>

            {/* ── Détail des avantages ──
                Tirés du catalogue partagé : les listes recopiées à la main
                avaient déjà décroché de ce que l'abonnement débloque vraiment. */}
            <Text style={styles.sectionTitle}>
              {isUpgrade ? 'Ce que Pro ajoute' : 'Ce que tu débloques'}
            </Text>
            <View style={styles.benefits}>
              {(isUpgrade ? PRO_ONLY_FEATURES : SUBSCRIPTION_FEATURES).map(item => (
                <View style={styles.benefit} key={item.title}>
                  <View style={[styles.benefitIcon, item.minTier === 'pro' && styles.benefitIconPro]}>
                    <Ionicons
                      name={item.icon as any}
                      size={17}
                      color={item.minTier === 'pro' ? GOLD.base : colors.accent}
                    />
                  </View>
                  <View style={styles.benefitCopy}>
                    <View style={styles.benefitTitleRow}>
                      <Text style={styles.benefitTitle}>{item.title}</Text>
                      {!isUpgrade && item.minTier === 'pro' && (
                        <View style={styles.proOnlyTag}>
                          <Text style={styles.proOnlyTagText}>PRO</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.benefitText}>{item.text}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* ── Réassurance ── */}
            <View style={styles.trust}>
              {TRUST.map(item => (
                <View style={styles.trustRow} key={item.text}>
                  <Ionicons name={item.icon as any} size={13} color={colors.success} />
                  <Text style={styles.trustText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* ── CTA collant ── */}
          <View style={[styles.footer, { paddingBottom: Math.max(14, insets.bottom) }]}>
            <Animated.View
              style={{
                transform: [
                  { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.975] }) },
                ],
              }}
            >
              <Pressable
                disabled={ctaDisabled}
                onPress={() => onPurchase(buyingTier)}
                onPressIn={() =>
                  Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 40 }).start()
                }
                onPressOut={() =>
                  Animated.spring(press, { toValue: 0, useNativeDriver: true, speed: 40 }).start()
                }
                style={[styles.cta, ctaDisabled && styles.ctaDisabled]}
              >
                <LinearGradient
                  colors={[GOLD.light, GOLD.base, GOLD.deep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                {/* Reflet qui balaie le bouton toutes les ~3 s. */}
                {!ctaDisabled && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.ctaShine,
                      {
                        transform: [
                          {
                            translateX: shine.interpolate({
                              inputRange: [0, 1],
                              outputRange: [-140, 460],
                            }),
                          },
                          { rotate: '16deg' },
                        ],
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </Animated.View>
                )}

                {loading ? (
                  <ActivityIndicator color={GOLD.ink} />
                ) : (
                  <>
                    <Text style={styles.ctaText}>
                      {!priceIsLive
                        ? 'Prix indisponible'
                        : !walletReady
                          ? 'Vérification du solde…'
                          : !enough
                            ? `Il te manque ${formatNf(missing)} ${symbol}`
                            : `${isUpgrade ? 'Passer Pro' : buyingTier === 'pro' ? 'Devenir Pro' : 'Devenir Plus'} · ${formatNf(requiredNf)} ${symbol}`}
                    </Text>
                    {enough && !priceError && (
                      <Ionicons name="arrow-forward" size={17} color={GOLD.ink} />
                    )}
                  </>
                )}
              </Pressable>
            </Animated.View>
            <Text style={styles.legal}>
              Paiement depuis ton portefeuille {symbol} · activation immédiate · résiliable à tout moment
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/**
 * Fabrique de styles : la feuille dépend de la palette du profil, elle ne peut
 * donc plus être un objet figé au chargement du module. Le paramètre s'appelle
 * `GOLD` pour que les règles existantes restent valides telles quelles.
 */
const makeStyles = (GOLD: Palette) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '94%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: GOLD.line,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  topAccent: { height: 3, width: '100%' },
  handle: {
    width: 40,
    height: 4,
    marginTop: 10,
    alignSelf: 'center',
    borderRadius: 4,
    backgroundColor: colors.borderStrong,
  },

  header: {
    height: 54,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1.4,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },

  scroll: { flexShrink: 1 },
  content: { paddingBottom: 20 },

  hero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    overflow: 'hidden',
  },
  heroBackdrop: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  heroSweep: { position: 'absolute', top: -60, bottom: -60, left: 0, width: 190 },
  emblem: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 16,
    color: colors.textPrimary,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.9,
    fontFamily: fonts.displayHeavy,
  },
  titleAccent: { color: GOLD.base },
  subtitle: {
    marginTop: 10,
    maxWidth: 330,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },

  priceCard: {
    minHeight: 128,
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GOLD.line,
    backgroundColor: GOLD.soft,
  },
  priceLoader: { marginVertical: 38 },
  priceMain: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  priceLeft: { flexShrink: 1 },
  eurPrice: {
    color: GOLD.light,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1.4,
    fontFamily: fonts.displayHeavy,
  },
  priceUnit: { marginTop: 4, color: colors.textSecondary, fontSize: 12, fontFamily: fonts.medium },
  perDay: {
    alignItems: 'flex-end',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD.line,
    backgroundColor: colors.bg,
  },
  perDayValue: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.bold },
  perDayLabel: { marginTop: 1, color: colors.textMuted, fontSize: 10, fontFamily: fonts.medium },
  nfLine: {
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GOLD.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nfLabel: { color: colors.textSecondary, fontSize: 12.5, fontFamily: fonts.regular },
  nfPrice: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.bold },
  rate: { marginTop: 7, color: colors.textMuted, fontSize: 10.5, fontFamily: fonts.regular },
  upgradeChip: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: withAlpha(GOLD.base, 0.14),
  },
  upgradeChipText: { color: GOLD.base, fontSize: 11, fontFamily: fonts.semibold },
  priceUnavailable: { flex: 1, minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12 },
  priceUnavailableCopy: { flex: 1 },
  unavailableTitle: { color: colors.textPrimary, fontSize: 13.5, fontFamily: fonts.semibold },
  unavailableText: { marginTop: 3, color: colors.textMuted, fontSize: 11.5 },
  retry: { color: GOLD.base, fontSize: 12.5, fontFamily: fonts.bold },

  wallet: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  walletTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  walletLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletText: { color: colors.textSecondary, fontSize: 12.5, fontFamily: fonts.medium },
  walletValue: { fontSize: 14.5, fontFamily: fonts.bold },
  walletEnough: { color: colors.success },
  walletLow: { color: colors.textPrimary },
  walletRetry: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  walletRetryText: { color: GOLD.base, fontSize: 12, fontFamily: fonts.bold },
  gauge: {
    height: 6,
    marginTop: 12,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  gaugeFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  gaugeOk: { marginTop: 8, color: colors.success, fontSize: 11.5, fontFamily: fonts.medium },
  gaugeMissing: { marginTop: 8, color: colors.textSecondary, fontSize: 11.5, fontFamily: fonts.medium },

  compare: {
    marginHorizontal: 20,
    marginTop: 22,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  compareHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  compareHeadLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 10.5,
    letterSpacing: 0.8,
    fontFamily: fonts.bold,
  },
  compareHeadFree: {
    width: 46,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 10.5,
    letterSpacing: 0.5,
    fontFamily: fonts.semibold,
  },
  compareHeadPro: {
    width: 46,
    alignItems: 'center',
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: withAlpha(GOLD.base, 0.16),
  },
  compareHeadProText: { color: GOLD.base, fontSize: 10.5, letterSpacing: 0.9, fontFamily: fonts.bold },

  // ── Sélecteur de palier ──
  brandLogo: { width: 28, height: 28 },
  emblemLogo: { width: 96, height: 96 },
  tierPicker: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 18 },
  tierCard: {
    flex: 1,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tierCardActive: { borderColor: GOLD.line, backgroundColor: GOLD.soft },
  tierCardHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tierName: { color: colors.textMuted, fontSize: 11, letterSpacing: 1, fontFamily: fonts.bold },
  tierNameActive: { color: GOLD.base },
  tierPrice: { marginTop: 6, color: colors.textPrimary, fontSize: 19, fontFamily: fonts.displayHeavy },
  tierPriceActive: { color: GOLD.light },
  tierHint: { marginTop: 1, color: colors.textMuted, fontSize: 10.5, fontFamily: fonts.regular },
  tierTick: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD.base,
  },
  // Plus porte l'accent de marque, Pro l'or : deux paliers payants qu'on ne
  // doit pas confondre d'un coup d'œil.
  compareHeadPlus: {
    width: 46,
    textAlign: 'center',
    color: colors.accent,
    fontSize: 10.5,
    letterSpacing: 0.9,
    fontFamily: fonts.bold,
  },
  comparePlusCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentMuted,
  },
  benefitTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  benefitIconPro: { borderColor: GOLD.line, backgroundColor: GOLD.soft },
  proOnlyTag: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    backgroundColor: withAlpha(GOLD.base, 0.16),
  },
  proOnlyTagText: { color: GOLD.base, fontSize: 8.5, letterSpacing: 0.7, fontFamily: fonts.bold },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  compareRowLast: { borderBottomWidth: 0 },
  // Trois colonnes au lieu de deux : elles sont resserrées à 46 pour laisser
  // au libellé de quoi tenir sur un écran étroit.
  compareLabel: { flex: 1, color: colors.textPrimary, fontSize: 12.5, fontFamily: fonts.medium, paddingRight: 6 },
  compareCell: { width: 46, alignItems: 'center' },
  compareCross: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  compareCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionTitle: {
    marginTop: 24,
    marginHorizontal: 20,
    marginBottom: 12,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.heading,
  },
  benefits: { marginHorizontal: 20, gap: 11 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: withAlpha(colors.accent, 0.28),
    backgroundColor: colors.accentSoft,
  },
  benefitCopy: { flex: 1 },
  benefitTitle: { color: colors.textPrimary, fontSize: 13.5, fontFamily: fonts.semibold },
  benefitText: { marginTop: 2, color: colors.textSecondary, fontSize: 11.5, lineHeight: 16 },

  trust: {
    marginHorizontal: 20,
    marginTop: 22,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    gap: 9,
  },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  trustText: { flex: 1, color: colors.textSecondary, fontSize: 11.5, fontFamily: fonts.regular },

  footer: {
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  cta: {
    height: 54,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    overflow: 'hidden',
  },
  ctaDisabled: { opacity: 0.42 },
  ctaShine: { position: 'absolute', top: -30, bottom: -30, width: 90 },
  ctaText: { color: GOLD.ink, fontSize: 15, fontFamily: fonts.bold },
  legal: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
});
