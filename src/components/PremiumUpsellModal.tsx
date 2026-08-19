import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { colors, fonts, withAlpha } from '../theme';
import {
  SUBSCRIPTION_PLUS_FEATURES,
  SUBSCRIPTION_PRO_EXTRAS,
} from '../utils/subscriptionTier';
import subscriptionPricingService, {
  SubscriptionPricing,
  TierPrice,
  formatEur,
  formatNf,
} from '../services/subscriptionPricingService';

const { height: SCREEN_H } = Dimensions.get('window');

/** Palette Pro volontairement sobre : ivoire chaud, or mat, champagne. */
const PRO_GRADIENT = ['#FFF1B8', '#D6A94C', '#F7DC8A'] as const;
const PLUS_GRADIENT = ['#25F4EE', '#7C5CFF', '#FE2C55'] as const;

const PREMIUM_HIGHLIGHTS = [
  { icon: 'color-palette-outline', text: 'Profil signature : bannière, couleurs et thème personnalisés' },
  { icon: 'sparkles-outline', text: 'Effets animés et décorations exclusives pour ton avatar' },
  { icon: 'star-outline', text: 'Badge Premium Pro visible partout sur TwitNinf' },
  { icon: 'stats-chart-outline', text: 'Statistiques créateur pour comprendre ce qui fonctionne' },
  { icon: 'cash-outline', text: 'Outils de monétisation et boosts de publications' },
  { icon: 'rocket-outline', text: 'Nouveautés et fonctionnalités bêta en avant-première' },
];

/* ── Animations ─────────────────────────────────────────────────────────── */

/** Rotation continue : plusieurs tours par itération pour que la reprise de
    boucle (qui repasse par le JS) ne se voie jamais. */
const TURNS = 10;

function useSpin(duration: number, enabled: boolean) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    const anim = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: duration * TURNS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [duration, enabled, value]);
  return value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * TURNS}deg`] });
}

/** Balayage lumineux qui traverse un bloc en boucle. */
function useSweep(duration: number, enabled: boolean) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(900),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [duration, enabled, value]);
  return value;
}

/* ── Fond « aurore » : trois nappes qui tournent lentement ──────────────── */

function AuroraBackdrop({ active, gradient }: { active: boolean; gradient: readonly string[] }) {
  const slow = useSpin(9000, active);
  const fast = useSpin(6000, active);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.blob, styles.blobTop, { transform: [{ rotate: slow }] }]}>
        <LinearGradient
          colors={[withAlpha(gradient[0], 0.55), withAlpha(gradient[1], 0.3), 'transparent'] as any}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View style={[styles.blob, styles.blobRight, { transform: [{ rotate: fast }] }]}>
        <LinearGradient
          colors={[withAlpha(gradient[2], 0.4), 'transparent'] as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/* ── Texte en dégradé ───────────────────────────────────────────────────── */

function GradientText({
  children,
  gradient,
  style,
}: {
  children: React.ReactNode;
  gradient: readonly string[];
  style: any;
}) {
  return (
    <MaskedView maskElement={<Text style={style}>{children}</Text>}>
      <LinearGradient colors={gradient as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }}>
        {/* Le texte transparent donne sa forme au dégradé sans se voir. */}
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

/* ── Prix qui s'incrémente ──────────────────────────────────────────────── */

/**
 * Compteur : le montant en NF monte jusqu'à sa valeur au lieu d'apparaître.
 * Pilote JS assumé (il faut lire la valeur à chaque frame pour l'afficher) —
 * une seule valeur animée, sur 700 ms, à l'ouverture de la modale.
 */
function useCountUp(target: number, enabled: boolean) {
  const [shown, setShown] = useState(0);
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled || !Number.isFinite(target) || target <= 0) {
      setShown(target || 0);
      return;
    }
    value.setValue(0);
    const id = value.addListener(({ value: v }) => setShown(v * target));
    const anim = Animated.timing(value, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      anim.stop();
      value.removeListener(id);
    };
  }, [target, enabled, value]);

  return shown;
}

/* ── Modale ─────────────────────────────────────────────────────────────── */

export default function PremiumUpsellModal({
  visible,
  onClose,
  tier,
  onTierChange,
  currentTier,
  walletBalance,
  loading,
  onPurchase,
  singleTier = false,
}: {
  visible: boolean;
  onClose: () => void;
  tier: 'plus' | 'pro';
  onTierChange: (tier: 'plus' | 'pro') => void;
  /** Palier actif de l'utilisateur : pilote le cas « mise à niveau ». */
  currentTier: 'free' | 'plus' | 'pro';
  walletBalance: number;
  loading: boolean;
  onPurchase: (tier: 'plus' | 'pro') => void;
  /** Offre Premium unifiée : masque le comparateur Plus/Pro et met Pro en avant. */
  singleTier?: boolean;
}) {
  const [pricing, setPricing] = useState<SubscriptionPricing | null>(null);
  const enter = useRef(new Animated.Value(0)).current;
  const sweep = useSweep(1600, visible);
  const gradient = tier === 'pro' ? PRO_GRADIENT : PLUS_GRADIENT;

  useEffect(() => {
    if (!visible) return;
    subscriptionPricingService.get().then(setPricing);
  }, [visible]);

  useEffect(() => {
    Animated.timing(enter, {
      toValue: visible ? 1 : 0,
      duration: visible ? 420 : 200,
      easing: visible ? Easing.out(Easing.back(1.15)) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, enter]);

  const isUpgrade = currentTier === 'plus' && tier === 'pro';
  const price: TierPrice | null = pricing ? (isUpgrade ? pricing.upgrade : pricing[tier]) : null;
  const nfAmount = price?.nf ?? 0;
  const shownNf = useCountUp(nfAmount, visible && !!price);
  const enough = walletBalance >= nfAmount;

  const features = useMemo(
    () => (singleTier
      ? PREMIUM_HIGHLIGHTS
      : tier === 'pro'
      ? [...SUBSCRIPTION_PLUS_FEATURES, ...SUBSCRIPTION_PRO_EXTRAS]
      : SUBSCRIPTION_PLUS_FEATURES),
    [singleTier, tier],
  );

  const cardStyle = {
    opacity: enter,
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
      { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
    ],
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View style={[styles.card, { maxHeight: SCREEN_H * 0.9 }, cardStyle as any]}>
          <AuroraBackdrop active={visible && !singleTier} gradient={gradient} />

          {/* Liseré dégradé : c'est lui qui « signe » la carte. */}
          <LinearGradient
            colors={[withAlpha(gradient[0], 0.9), withAlpha(gradient[1], 0.5), withAlpha(gradient[2], 0.8)] as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardBorder}
            pointerEvents="none"
          />

          <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={hitSlop}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            bounces
          >
            <View style={styles.kickerRow}>
              <LinearGradient
                colors={gradient as unknown as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.kickerBadge}
              >
                <Ionicons name={tier === 'pro' ? 'star' : 'diamond'} size={12} color="#000" />
                <Text style={styles.kickerBadgeText}>{tier === 'pro' ? 'PREMIUM PRO' : 'PLUS'}</Text>
              </LinearGradient>
              {/* La durée vient de la tarification serveur : l'écrire en dur a
                  déjà promis un mois là où la période en couvre cinq jours. */}
              <Text style={styles.kicker}>
                {pricing?.duration_days ?? 5} jours · sans reconduction
              </Text>
            </View>

            <GradientText gradient={gradient} style={styles.title}>
              {tier === 'pro' ? 'Ton profil mérite mieux.' : 'Passe en Plus'}
            </GradientText>
            <Text style={styles.subtitle}>
              {tier === 'pro'
                ? 'Débloque l’expérience TwitNinf complète : une identité qui se remarque, des outils pour progresser et tous les avantages créateurs.'
                : 'Bannière, thème de profil et badge diamant : ton profil ne ressemble plus à celui de tout le monde.'}
            </Text>

            {/* ── Prix ── */}
            <View style={styles.priceCard}>
              <LinearGradient
                colors={[withAlpha(gradient[1], 0.18), 'transparent'] as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {!price ? (
                <ActivityIndicator color={colors.textSecondary} style={{ paddingVertical: 18 }} />
              ) : price.live ? (
                <>
                  <GradientText gradient={gradient} style={styles.priceEur}>
                    {formatEur(price.eur)}
                  </GradientText>
                  <Text style={styles.priceNf}>
                    ≈ {formatNf(shownNf)} <Text style={styles.priceNfUnit}>{pricing?.currency_symbol || 'NF'}</Text>
                  </Text>
                  {!!pricing?.nf_price_eur && (
                    <Text style={styles.priceRate}>
                      Cours du jour : 1 {pricing.currency_symbol} = {formatEur(pricing.nf_price_eur)}
                    </Text>
                  )}
                  <Text style={styles.priceNote}>
                    Le prix reste {formatEur(price.eur)} : c'est le nombre de {pricing?.currency_symbol || 'NF'} qui
                    suit le cours.
                  </Text>
                </>
              ) : (
                <>
                  <GradientText gradient={gradient} style={styles.priceEur}>
                    {formatNf(shownNf)} {pricing?.currency_symbol || 'NF'}
                  </GradientText>
                  <Text style={styles.priceNote}>Débité depuis ton portefeuille intégré.</Text>
                </>
              )}
              {isUpgrade && <Text style={styles.upgradeTag}>Mise à niveau depuis Plus — tu ne paies que l'écart</Text>}
            </View>

            {/* ── Sélecteur de palier ── */}
            {!singleTier && <View style={styles.switch}>
              {(['plus', 'pro'] as const).map((key) => {
                const active = tier === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.switchItem}
                    onPress={() => onTierChange(key)}
                    activeOpacity={0.85}
                    disabled={currentTier === 'plus' && key === 'plus'}
                  >
                    {active && (
                      <LinearGradient
                        colors={gradient as unknown as [string, string, ...string[]]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFill, { borderRadius: 12, opacity: 0.22 }]}
                      />
                    )}
                    <Text style={[styles.switchLabel, active && styles.switchLabelActive]}>
                      {key === 'pro' ? 'Pro' : 'Plus'}
                    </Text>
                    <Text style={styles.switchPrice}>
                      {pricing
                        ? pricing[key].live
                          ? formatEur(pricing[key].eur)
                          : `${formatNf(pricing[key].nf)} ${pricing.currency_symbol}`
                        : '—'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>}

            {/* ── Avantages ── */}
            <View style={styles.features}>
              {features.map((feature, index) => (
                <FeatureRow
                  key={`${tier}-${index}`}
                  icon={feature.icon}
                  text={feature.text}
                  delay={index * 45}
                  color={singleTier ? colors.gold : index >= SUBSCRIPTION_PLUS_FEATURES.length ? gradient[0] : colors.cyan}
                />
              ))}
            </View>

            {/* ── Solde ── */}
            <View style={styles.balanceRow}>
              <Ionicons name="wallet-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.balanceLabel}>Ton solde</Text>
              <Text style={[styles.balanceValue, { color: enough ? colors.success : colors.red }]}>
                {formatNf(walletBalance)} {pricing?.currency_symbol || 'NF'}
              </Text>
            </View>
            {!enough && !!price && (
              <Text style={styles.missing}>
                Il te manque {formatNf(nfAmount - walletBalance)} {pricing?.currency_symbol || 'NF'}.
              </Text>
            )}

            {/* ── CTA ── */}
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={loading || !price || !enough}
              onPress={() => onPurchase(tier)}
              style={[styles.cta, (!enough || !price) && { opacity: 0.45 }]}
            >
              <LinearGradient
                colors={gradient as unknown as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {/* Balayage lumineux : il traverse le bouton en boucle. */}
              {!singleTier && <Animated.View
                pointerEvents="none"
                style={[
                  styles.ctaSweep,
                  {
                    transform: [
                      {
                        translateX: sweep.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-260, 320],
                        }),
                      },
                      { rotate: '14deg' },
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={['transparent', withAlpha('#ffffff', 0.55), 'transparent'] as any}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>}

              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Ionicons name={tier === 'pro' ? 'star' : 'diamond'} size={17} color="#000" />
                  <Text style={styles.ctaText}>
                    {isUpgrade ? 'Passer Pro' : tier === 'pro' ? 'Activer Pro' : 'Activer Plus'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.legal}>
              Paiement en {pricing?.currency_symbol || 'NF'} depuis ton portefeuille · activation immédiate ·
              aucun prélèvement carte
            </Text>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Ligne d'avantage : elle entre en décalé, ce qui fait « dérouler » la liste. */
function FeatureRow({ icon, text, delay, color }: { icon: string; text: string; delay: number; color: string }) {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(enter, {
      toValue: 1,
      duration: 380,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [delay, enter]);

  return (
    <Animated.View
      style={[
        styles.featureRow,
        {
          opacity: enter,
          transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
        },
      ]}
    >
      <View style={[styles.featureIcon, { backgroundColor: withAlpha(color, 0.14) }]}>
        <Ionicons name={icon as any} size={15} color={color} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </Animated.View>
  );
}

const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 };

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
  },

  card: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0B0B0D',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 241, 184, 0.28)',
  },
  /** Liseré : un dégradé posé en cadre, pas un fond. */
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'transparent',
    opacity: 0.28,
  },

  blob: { position: 'absolute', opacity: 0.9 },
  blobTop: { top: -180, left: -120, width: 420, height: 420, borderRadius: 210 },
  blobRight: { top: 120, right: -190, width: 380, height: 380, borderRadius: 190 },

  close: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlaySoft,
  },

  scroll: { padding: 24, paddingBottom: 28 },

  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  kickerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  kickerBadgeText: { color: '#000', fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.5 },
  kicker: { color: colors.textMuted, fontSize: 11.5, fontFamily: fonts.medium },

  title: { fontSize: 32, lineHeight: 38, fontFamily: fonts.display, color: '#FFF8E7' },
  subtitle: {
    marginTop: 8,
    color: '#B7B3AA',
    fontSize: 13.5,
    lineHeight: 20,
  },

  priceCard: {
    marginTop: 20,
    padding: 19,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(214, 169, 76, 0.3)',
    backgroundColor: 'rgba(214, 169, 76, 0.055)',
  },
  priceEur: { fontSize: 42, lineHeight: 48, fontFamily: fonts.display, color: colors.textPrimary },
  priceNf: { marginTop: 3, color: '#FFF8E7', fontSize: 18, fontFamily: fonts.semibold },
  priceNfUnit: { color: colors.textSecondary, fontSize: 14 },
  priceRate: { marginTop: 6, color: colors.textMuted, fontSize: 12 },
  priceNote: { marginTop: 8, color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  upgradeTag: {
    marginTop: 10,
    color: colors.gold,
    fontSize: 12,
    fontFamily: fonts.semibold,
  },

  switch: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  switchItem: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: withAlpha(colors.black, 0.25),
  },
  switchLabel: { color: colors.textSecondary, fontSize: 15, fontFamily: fonts.semibold },
  switchLabelActive: { color: colors.textPrimary },
  switchPrice: { marginTop: 2, color: colors.textMuted, fontSize: 12.5 },

  features: { marginTop: 22, gap: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, color: '#D2CEC4', fontSize: 13.5, lineHeight: 19 },

  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.overlayMedium,
  },
  balanceLabel: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  balanceValue: { fontSize: 15, fontFamily: fonts.bold },
  missing: { marginTop: 6, color: colors.red, fontSize: 12 },

  cta: {
    marginTop: 16,
    height: 54,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  ctaSweep: { position: 'absolute', top: -30, bottom: -30, width: 70 },
  ctaText: { color: '#000', fontSize: 16, fontFamily: fonts.bold },

  legal: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
