import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, statusBarStyle } from '../theme';
import {
  AppHeader,
  AppRefreshControl,
  EmptyState,
  ErrorState,
  GlassButton,
  ScreenBackground,
  ScreenSkeleton,
  Tappable,
  toast,
} from '../components/ui';
import PassQrCode from '../components/PassQrCode';
import eventPassService, {
  type EventPass,
  type PassTier,
  type WalletStatus,
  STATUS_LABELS,
  TIER_LABELS,
} from '../services/eventPassService';

/**
 * Mes invitations — la place, telle qu'on la présente à l'entrée.
 *
 * ── Cet écran doit fonctionner sans réseau ────────────────────────────────
 * Une place se montre à la porte d'une salle : sous-sol, hangar, mille
 * téléphones sur la même antenne. Il lit donc son cache AVANT d'appeler le
 * serveur, et garde ce cache si l'appel échoue. Le code QR n'est pas une image
 * distante mais un dessin local, fait depuis la matrice reçue avec la place.
 *
 * ── Pourquoi le palier ne teinte que la carte ─────────────────────────────
 * Voir `PassQrCode` : une pupille de repérage en or et le code cesse d'être
 * détectable, sans que rien ne se voie à l'œil.
 */

const { width: screenWidth } = Dimensions.get('window');

/** Teinte d'un palier — pour la CARTE. Le code, lui, reste magenta. */
const TIER_TINT: Record<PassTier, string> = {
  standard: colors.accent,
  vip: colors.gold,
  staff: colors.textPrimary,
  presse: colors.cyan,
};

function isSpent(pass: EventPass): boolean {
  if (pass.status === 'revoked') return true;
  if (pass.status === 'used') return true;
  if (pass.scans_count >= pass.max_scans) return true;
  if (pass.expires_at && new Date(pass.expires_at) < new Date()) return true;
  return false;
}

/** Ce que dit l'état d'une place à son porteur, dans ses mots à lui. */
function statusLine(pass: EventPass): string {
  if (pass.status === 'revoked') return 'Annulée par l’organisation';
  if (pass.expires_at && new Date(pass.expires_at) < new Date()) return 'Date de validité dépassée';
  if (pass.status === 'used' || pass.scans_count >= pass.max_scans) return 'Déjà utilisée';
  if (pass.max_scans > 1) {
    const left = pass.max_scans - pass.scans_count;
    return `${left} entrée${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''}`;
  }
  return 'Valable — une entrée';
}

function eventLine(pass: EventPass): string {
  return [pass.event_date_label, pass.event_place].filter(Boolean).join('  ·  ');
}

/* ── Ajout au portefeuille du téléphone ────────────────────────────────────
 *
 * En dehors du `Tappable` de la carte, jamais dedans : `Tappable` reconnaît
 * son geste avec `react-native-gesture-handler`, `GlassButton` avec le
 * `Pressable` du cœur RN. Les deux systèmes emboîtés se disputent le toucher
 * de façon peu fiable — le geste extérieur peut « gagner » et ouvrir la place
 * en grand au lieu d'ajouter au portefeuille. Un frère séparé n'a pas ce
 * risque.
 *
 * Un seul bouton, jamais deux : Apple Wallet n'a de sens que sur iOS, Google
 * Wallet que sur Android. `walletStatus` (lu une fois par `GET
 * /wallet-status`) évite en plus de montrer un bouton qui échouerait à coup
 * sûr tant que les certificats ne sont pas posés sur le VPS.
 */
function WalletRow({ pass, walletStatus }: { pass: EventPass; walletStatus: WalletStatus | null }) {
  const [busy, setBusy] = useState(false);

  const showApple = Platform.OS === 'ios' && !!walletStatus?.apple;
  const showGoogle = Platform.OS === 'android' && !!walletStatus?.google;
  if (!showApple && !showGoogle) return null;

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    const res = showApple
      ? await eventPassService.fetchAppleWalletLink(pass.id)
      : await eventPassService.fetchGoogleWalletLink(pass.id);
    setBusy(false);

    if (!res.success || !res.data?.url) {
      toast.error(res.message || 'Le portefeuille est indisponible pour le moment.');
      return;
    }
    Linking.openURL(res.data.url).catch(() => {
      toast.error('Impossible d’ouvrir le portefeuille.');
    });
  };

  return (
    <View style={styles.walletRow}>
      <GlassButton
        label={showApple ? 'Ajouter à Apple Wallet' : 'Ajouter à Google Wallet'}
        icon={showApple ? 'logo-apple' : 'logo-google'}
        variant="secondary"
        loading={busy}
        onPress={handlePress}
        fullWidth
      />
    </View>
  );
}

/* ── Une place dans la liste ────────────────────────────────────────────── */

function PassCard({
  pass,
  onOpen,
  walletStatus,
}: {
  pass: EventPass;
  onOpen: () => void;
  walletStatus: WalletStatus | null;
}) {
  const tint = TIER_TINT[pass.tier] || colors.accent;
  const spent = isSpent(pass);
  const qrSize = Math.min(screenWidth - 40 - 32, 260);

  return (
    <View style={styles.card}>
      <Tappable onPress={onOpen}>
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.tierLabel, { color: tint }]}>
              {(TIER_LABELS[pass.tier] || 'Place').toUpperCase()}
            </Text>
            <Text style={styles.eventName} numberOfLines={2}>{pass.event_name}</Text>
            {!!eventLine(pass) && <Text style={styles.eventMeta}>{eventLine(pass)}</Text>}
          </View>
          <View style={[styles.serialPill, { borderColor: tint }]}>
            <Text style={[styles.serialText, { color: tint }]}>
              Nº {String(pass.serial).padStart(3, '0')}
            </Text>
          </View>
        </View>

        <View style={styles.qrWrap}>
          {pass.qr ? (
            <PassQrCode matrix={pass.qr} size={qrSize} />
          ) : (
            // Sans matrice, la place reste présentable : le code imprimé se tape
            // à la main à l'entrée, le serveur l'accepte comme saisie manuelle.
            <View style={[styles.qrFallback, { width: qrSize, height: qrSize }]}>
              <Ionicons name="qr-code-outline" size={44} color={colors.textMuted} />
              <Text style={styles.qrFallbackText}>Code à lire à l’entrée</Text>
            </View>
          )}
          {spent && (
            <View style={styles.spentVeil}>
              <Text style={styles.spentText}>{STATUS_LABELS[pass.status]}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardFoot}>
          <View style={{ flex: 1 }}>
            <Text style={styles.footLabel}>CODE</Text>
            <Text style={styles.codeText}>{pass.code}</Text>
          </View>
          <View style={styles.statusChip}>
            <View style={[styles.statusDot, { backgroundColor: spent ? colors.textMuted : colors.success }]} />
            <Text style={styles.statusText}>{statusLine(pass)}</Text>
          </View>
        </View>

        <Text style={styles.openHint}>Appuie pour l’afficher en grand</Text>
      </Tappable>

      <WalletRow pass={pass} walletStatus={walletStatus} />
    </View>
  );
}

/* ── La place en grand, au moment de passer ─────────────────────────────── */

/**
 * Volontairement PAS une `<Modal>` React Native : une modale est une fenêtre
 * native séparée, sous laquelle les hôtes de toast et de confirmation de l'app
 * ne s'affichent pas. Une couche absolue dans le même arbre n'a pas ce défaut.
 */
function FullScreenPass({ pass, onClose }: { pass: EventPass; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const qrSize = Math.min(screenWidth - 48, 380);

  return (
    <View style={[styles.fullscreen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      {/* Fond clair et barre d'état sombre : le contraste du code passe avant
          la DA de l'app, c'est ce que le lecteur de la porte va viser. */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.fullscreenHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fullEvent} numberOfLines={2}>{pass.event_name}</Text>
          {!!eventLine(pass) && <Text style={styles.fullMeta}>{eventLine(pass)}</Text>}
        </View>
        <Tappable style={styles.closeButton} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color="#0A0A0A" />
        </Tappable>
      </View>

      <ScrollView
        contentContainerStyle={styles.fullscreenBody}
        showsVerticalScrollIndicator={false}
      >
        {pass.qr ? (
          <PassQrCode matrix={pass.qr} size={qrSize} />
        ) : (
          <Text style={styles.fullNoQr}>
            Cette place n’a pas de code à afficher. Donne le code ci-dessous à l’entrée.
          </Text>
        )}

        <Text style={styles.fullCode}>{pass.code}</Text>

        <View style={styles.fullFooter}>
          <Text style={styles.fullFooterLabel}>INVITÉ·E</Text>
          <Text style={styles.fullFooterValue}>{pass.guest_name || 'Invité·e'}</Text>
          <Text style={[styles.fullFooterLabel, { marginTop: 14 }]}>PLACE</Text>
          <Text style={styles.fullFooterValue}>Nº {String(pass.serial).padStart(3, '0')}</Text>
        </View>

        <Text style={styles.fullHint}>
          Monte la luminosité de l’écran si le lecteur peine à lire le code.
        </Text>
      </ScrollView>
    </View>
  );
}

/* ── Écran ──────────────────────────────────────────────────────────────── */

export default function MyPassesScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [passes, setPasses] = useState<EventPass[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Vrai quand ce qui est affiché vient du cache, pas du serveur. */
  const [stale, setStale] = useState(false);
  const [opened, setOpened] = useState<EventPass | null>(null);
  /** `null` tant que la réponse n'est pas là : aucun bouton ne s'affiche entre-temps. */
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);

  useEffect(() => {
    eventPassService.fetchWalletStatus().then((res) => {
      if (res.success && res.data) setWalletStatus(res.data);
    });
  }, []);

  const load = useCallback(async (fromRefresh = false) => {
    if (!fromRefresh) setLoading(true);

    // Le cache d'abord : à la porte, une liste qui s'affiche tout de suite vaut
    // mieux qu'une liste juste qui arrive après l'appel réseau qui n'aboutira
    // pas. Le serveur corrige ensuite, s'il répond.
    if (!fromRefresh) {
      const cached = await eventPassService.cachedMine();
      if (cached) {
        setPasses(cached);
        setStale(true);
        setLoading(false);
      }
    }

    const res = await eventPassService.fetchMine();
    if (res.success) {
      setPasses(res.data || []);
      setStale(false);
      setError(null);
    } else {
      const cached = await eventPassService.cachedMine();
      if (cached) {
        setPasses(cached);
        setStale(true);
        setError(null);
      } else {
        setError(res.message || 'Lecture impossible.');
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  /** Les places encore utilisables d'abord : c'est celle-là qu'on cherche. */
  const ordered = useMemo(() => {
    if (!passes) return [];
    return [...passes].sort((a, b) => Number(isSpent(a)) - Number(isSpent(b)));
  }, [passes]);

  const body = () => {
    if (loading && !passes) return <ScreenSkeleton variant="list" />;

    if (error && !passes) {
      return <ErrorState detail={error} onRetry={() => load()} />;
    }

    if (!ordered.length) {
      return (
        <EmptyState
          icon="ticket-outline"
          title="Aucune invitation"
          message="Les places qui te sont attribuées apparaîtront ici, prêtes à être présentées à l’entrée."
          secondaryAction={{ label: 'Actualiser', onPress: () => load() }}
        />
      );
    }

    return (
      <FlatList
        data={ordered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PassCard pass={item} onOpen={() => setOpened(item)} walletStatus={walletStatus} />
        )}
        contentContainerStyle={[styles.listInner, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={stale ? (
          <View style={styles.staleBanner}>
            <Ionicons name="cloud-offline-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.staleText}>
              Hors ligne — tes places restent valables, elles sont lues sur cet appareil.
            </Text>
          </View>
        ) : null}
      />
    );
  };

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        <AppHeader
          navigation={navigation}
          title="Mes invitations"
          subtitle="Les places à présenter à l’entrée"
        />

        {body()}
      </View>

      {opened && <FullScreenPass pass={opened} onClose={() => setOpened(null)} />}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  listInner: { paddingHorizontal: 20, paddingTop: 4 },

  staleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 12, marginBottom: 14,
  },
  staleText: { color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 16 },

  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 16, marginBottom: 16,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tierLabel: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 2 },
  eventName: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 19, marginTop: 4, lineHeight: 24 },
  eventMeta: { color: colors.textMuted, fontSize: 12.5, marginTop: 4 },
  serialPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  serialText: { fontFamily: fonts.bold, fontSize: 11.5 },

  qrWrap: { alignItems: 'center', marginTop: 16 },
  qrFallback: {
    alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.lg,
  },
  qrFallbackText: { color: colors.textMuted, fontSize: 12 },
  // Voile SOMBRE et opaque : une place consommée ne doit pas rester scannable
  // par accident, et un voile translucide laisse le lecteur lire à travers.
  spentVeil: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, opacity: 0.94, borderRadius: radius.lg,
  },
  spentText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 15, letterSpacing: 0.5 },

  cardFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 16 },
  footLabel: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 1.8 },
  codeText: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 17, letterSpacing: 1.5, marginTop: 3 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: colors.textSecondary, fontSize: 11.5, flexShrink: 1 },

  openHint: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 12 },

  walletRow: { marginTop: 14 },

  fullscreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
  },
  fullscreenHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  fullEvent: { color: '#0A0A0A', fontFamily: fonts.bold, fontSize: 20, lineHeight: 25 },
  fullMeta: { color: '#5A5A5A', fontSize: 13, marginTop: 3 },
  closeButton: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDEDED',
  },
  fullscreenBody: { alignItems: 'center', paddingTop: 24, paddingBottom: 12 },
  fullNoQr: { color: '#5A5A5A', fontSize: 14, textAlign: 'center', paddingHorizontal: 12 },
  fullCode: {
    color: '#0A0A0A', fontFamily: fonts.bold, fontSize: 24,
    letterSpacing: 3, marginTop: 22,
  },
  fullFooter: { alignSelf: 'stretch', marginTop: 26 },
  fullFooterLabel: { color: '#8A8A8A', fontFamily: fonts.bold, fontSize: 10, letterSpacing: 2 },
  fullFooterValue: { color: '#0A0A0A', fontFamily: fonts.bold, fontSize: 18, marginTop: 3 },
  fullHint: { color: '#8A8A8A', fontSize: 12, textAlign: 'center', marginTop: 26, lineHeight: 17 },
});
