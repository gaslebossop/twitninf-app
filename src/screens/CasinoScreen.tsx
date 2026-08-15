import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  Platform,
  Vibration,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { colors, fonts, glow, radius } from '../theme';
import { ScreenBackground, HowItWorks, celebrateReward, AppHeader } from '../components/ui';
import SlotReel3D, { cellForSymbol } from '../components/casino/SlotReel3D';
import CasinoService, { CasinoConfig, CasinoResult, CasinoHistoryRow, WheelMode } from '../services/casinoService';
import NewEconomyService from '../services/newEconomyService';
import CurrencyService from '../services/currencyService';

type Game = 'wheel' | 'coinflip' | 'slots';

const SLOT_SYMBOL_POOL = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
const CHIP_VALUES = [1, 5, 20, 100];
const BRASS_RIM: [string, string, string, string] = ['#4A3510', '#FFD673', '#C9962B', '#7A5A17'];
const BRASS_FACE: [string, string, string] = ['#FFF4CE', '#FFD673', '#C9962B'];

/**
 * La « table » de jeu (roue / pièce / machine à sous) est délibérément
 * FIGÉE en sombre, dans les deux thèmes. Ses éléments (jetons brass, cases
 * de roue en tons profonds, fenêtre de rouleaux) sont pensés comme un vrai
 * plateau de casino : en clair, un fond thémé clair y déposait la roue sombre
 * comme un trou noir isolé sur du blanc. Seul le chrome autour (en-tête,
 * console de mise) suit le thème de l'app.
 */
const STAGE = {
  bg: '#141414',
  chipBg: 'rgba(255,255,255,0.08)',
  chipBorder: 'rgba(255,255,255,0.14)',
  textPrimary: '#FFFFFF',
  textSecondary: '#A8A8A8',
  textMuted: '#6B6B6B',
  gold: '#FFD24D',
};

const WHEEL_SPIN_MS = 4200;
const COIN_FLIP_MS = 1250;
const REEL_STOP_MS = [1300, 1850, 2450];
const REEL_CELL = 56;
const CELEBRATE_MS = 1700;

/** Le tapis mobile n'a pas de place pour un journal complet : on garde les
 *  derniers tours en bandeau (lecture instantanée entre deux mises) et le
 *  journal détaillé part dans une feuille appelée depuis l'en-tête. */
const STRIP_LENGTH = 12;

const fallbackSegments = [
  'LOSE', 'x1.2', 'LOSE', 'x1.8', 'LOSE',
  'LOSE', 'x1.2', 'LOSE', 'x4', 'LOSE',
  'x1.2', 'LOSE', 'LOSE', 'x1.8', 'LOSE',
  'x1.2', 'LOSE', 'LOSE', 'x1.2', 'LOSE',
];

const modeFallbacks: WheelMode[] = [
  { id: 'classic', label: 'Classique', hint: 'Roue equilibree, gains courts', jackpotLabel: 'x4', segments: fallbackSegments, prizes: ['x1.2', 'x1.8', 'x4'] },
  { id: 'boost', label: 'Boost', hint: 'Plus de multiplicateurs', jackpotLabel: 'x6', segments: fallbackSegments, prizes: ['x1.5', 'x2', 'x3', 'x6'] },
  { id: 'jackpot', label: 'Jackpot', hint: 'Peu de cases fortes, gros swings', jackpotLabel: 'x10', segments: fallbackSegments, prizes: ['x2', 'x5', 'x10'] },
];

/** Mêmes paires de teintes que la version web/desktop — la roue reste
 *  reconnaissable d'une plateforme à l'autre. On ne garde ici que la
 *  teinte « lit » (plus lue sur un petit écran) avec un filet de seam
 *  sombre entre les cases pour la lecture du bombé. */
const SEGMENT_TONES: Record<string, string> = {
  lose: '#241924',
  loseAlt: '#2E1F27',
  small: '#155A5C',
  mid: '#2B3A8C',
  big: '#93163A',
  jackpot: '#E5B53C',
};

function segmentTone(segment: string, index: number, jackpotLabel?: string) {
  if (segment === 'LOSE') return index % 2 === 0 ? SEGMENT_TONES.lose : SEGMENT_TONES.loseAlt;
  if (segment === jackpotLabel) return SEGMENT_TONES.jackpot;
  const value = Number(segment.replace('x', ''));
  if (value >= 3) return SEGMENT_TONES.big;
  if (value >= 1.8) return SEGMENT_TONES.mid;
  return SEGMENT_TONES.small;
}

function money(value: number, digits = 2) {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Retour haptique. `expo-haptics` n'est pas installé sur ce projet : on passe
 *  par le module `Vibration` du coeur de React Native (iOS ignore les durées
 *  et ne lit que le rythme du motif, ce qui suffit pour distinguer les cas). */
const BUZZ = {
  tap: 12,
  stop: 22,
  lose: 45,
  push: [0, 30, 70, 30] as number[],
  win: [0, 40, 60, 40, 60, 90] as number[],
  jackpot: [0, 60, 50, 60, 50, 60, 50, 180] as number[],
};

function buzz(pattern: number | number[]) {
  try {
    Vibration.vibrate(pattern as any);
  } catch {
    // vibreur indisponible (simulateur, permission refusée) — sans conséquence
  }
}

/** Point sur le cercle, 0° = midi (comme `transform: rotate()` en CSS), sens horaire. */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function wedgePath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

/** Roue segmentée en SVG — pendant du `conic-gradient` desktop, en vrais
 *  secteurs plutôt qu'en approximation par rectangles. */
function Wheel({ size, segments, jackpotLabel, rotate }: {
  size: number; segments: string[]; jackpotLabel?: string; rotate: Animated.AnimatedInterpolation<string>;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const segAngle = 360 / segments.length;
  const labelSize = Math.max(7.5, size * 0.038);

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((segment, index) => {
          const start = index * segAngle;
          const end = start + segAngle;
          return <Path key={index} d={wedgePath(cx, cy, r, start, end)} fill={segmentTone(segment, index, jackpotLabel)} />;
        })}
        {segments.map((_, index) => {
          const angle = index * segAngle;
          const inner = polar(cx, cy, r * 0.16, angle);
          const outer = polar(cx, cy, r, angle);
          return <Line key={index} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="rgba(0,0,0,0.55)" strokeWidth={1} />;
        })}
        {segments.map((segment, index) => {
          const mid = index * segAngle + segAngle / 2;
          const pos = polar(cx, cy, r * 0.78, mid);
          const isLose = segment === 'LOSE';
          const isJackpot = segment === jackpotLabel;
          return (
            <G key={index} rotation={mid} origin={`${pos.x}, ${pos.y}`}>
              <SvgText
                x={pos.x}
                y={pos.y}
                fill={isLose ? STAGE.textMuted : isJackpot ? '#2A1C03' : STAGE.textPrimary}
                fontSize={isLose ? labelSize * 0.85 : isJackpot ? labelSize * 1.12 : labelSize}
                fontWeight={isJackpot ? '900' : '800'}
                textAnchor="middle"
              >
                {isLose ? '✕' : segment.replace('x', '×')}
              </SvgText>
            </G>
          );
        })}
        {segments.map((_, index) => {
          const angle = index * segAngle;
          const pos = polar(cx, cy, r * 0.98, angle);
          return <Circle key={index} cx={pos.x} cy={pos.y} r={2.4} fill="#E8C465" stroke="rgba(0,0,0,0.4)" strokeWidth={0.5} />;
        })}
      </Svg>
    </Animated.View>
  );
}

/**
 * Gerbe de jetons/étincelles jouée sur un gain. Toutes les particules sont
 * pilotées par une seule `Animated.Value` (0 → 1) : une seule animation
 * native, quel que soit le nombre de particules.
 */
const CONFETTI = Array.from({ length: 18 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
  return {
    key: i,
    dx: Math.cos(angle) * (70 + Math.random() * 90),
    dy: Math.sin(angle) * (70 + Math.random() * 90) - 40,
    size: 6 + Math.random() * 7,
    tint: [STAGE.gold, '#FFF4CE', colors.accent, colors.cyan][i % 4],
    spin: `${Math.round(180 + Math.random() * 540)}deg`,
  };
});

function Confetti({ anim }: { anim: Animated.Value }) {
  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      {CONFETTI.map(piece => (
        <Animated.View
          key={piece.key}
          style={[
            styles.confettiPiece,
            {
              width: piece.size,
              height: piece.size * 1.6,
              backgroundColor: piece.tint,
              opacity: anim.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, piece.dx] }) },
                { translateY: anim.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, piece.dy, piece.dy + 90] }) },
                { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', piece.spin] }) },
                { scale: anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.4, 1, 0.7] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const GAME_TABS: { id: Game; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'wheel', label: 'Roue', hint: 'Le classique', icon: 'sparkles-outline' },
  { id: 'coinflip', label: 'Pile ou face', hint: 'Peu risque', icon: 'ellipse-outline' },
  { id: 'slots', label: 'Machine', hint: 'Gros jackpot', icon: 'apps-outline' },
];

/** Pavé numérique maison. Sur mobile, ouvrir le clavier système sous un
 *  panneau de mise ancré en bas le recouvrirait : on garde la saisie dans
 *  une feuille dédiée, chiffres larges, façon terminal de caisse. */
function BetKeypad({ visible, initial, min, max, balance, onClose, onValidate }: {
  visible: boolean; initial: number; min: number; max: number; balance: number | null;
  onClose: () => void; onValidate: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(initial));

  useEffect(() => {
    if (visible) setDraft(String(initial));
  }, [visible, initial]);

  const parsed = Number(draft.replace(',', '.')) || 0;
  const clamped = Math.min(Math.max(parsed, min), max);
  const invalid = parsed < min || parsed > max;

  const press = (key: string) => {
    buzz(BUZZ.tap);
    setDraft(prev => {
      if (key === 'del') return prev.length <= 1 ? '0' : prev.slice(0, -1);
      if (key === '.') return prev.includes('.') ? prev : `${prev}.`;
      if (prev === '0') return key;
      return `${prev}${key}`.slice(0, 9);
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetScrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Montant de la mise</Text>
        <View style={[styles.keypadDisplay, invalid && styles.keypadDisplayInvalid]}>
          <Text style={styles.keypadDisplayValue}>{draft}</Text>
          <Text style={styles.keypadDisplayUnit}>NF</Text>
        </View>
        <Text style={styles.keypadHint}>
          {invalid ? `Hors limites — entre ${money(min)} et ${money(max)} NF` : `Solde : ${balance !== null ? money(balance) : '···'} NF`}
        </Text>

        <View style={styles.keypadGrid}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map(key => (
            <TouchableOpacity key={key} style={styles.keypadKey} onPress={() => press(key)} activeOpacity={0.7}>
              {key === 'del'
                ? <Ionicons name="backspace-outline" size={22} color={colors.textPrimary} />
                : <Text style={styles.keypadKeyText}>{key}</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.keypadPresets}>
          {[min, 10, 50, 100].filter((v, i, a) => v <= max && a.indexOf(v) === i).map(value => (
            <TouchableOpacity key={value} style={styles.keypadPreset} onPress={() => { buzz(BUZZ.tap); setDraft(String(value)); }}>
              <Text style={styles.keypadPresetText}>{money(value, 0)}</Text>
            </TouchableOpacity>
          ))}
          {balance !== null && (
            <TouchableOpacity style={styles.keypadPreset} onPress={() => { buzz(BUZZ.tap); setDraft(String(Math.min(max, balance))); }}>
              <Text style={styles.keypadPresetText}>Tapis</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.sheetPrimary} onPress={() => { buzz(BUZZ.stop); onValidate(clamped); }} activeOpacity={0.85}>
          <Text style={styles.sheetPrimaryText}>Miser {money(clamped)} NF</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function historyLabel(row: CasinoHistoryRow) {
  if (row.game === 'wheel') return row.multiplier > 0 ? `×${row.multiplier}` : 'Perdu';
  if (row.game === 'coinflip') {
    if (row.outcome === 'push') return 'Tranche';
    return row.outcome === 'win' ? (row.result === 'pile' ? 'Pile' : 'Face') : 'Perdu';
  }
  if (row.game === 'slots' && row.won && row.reels?.[0]?.label) {
    return `${row.reels[0].label}${row.reels[0].label}${row.reels[0].label}`;
  }
  return row.multiplier > 0 ? `×${row.multiplier}` : 'Perdu';
}

function historyTone(row: CasinoHistoryRow): 'win' | 'lose' | 'push' {
  if (row.game === 'coinflip' && row.outcome === 'push') return 'push';
  return row.won ? 'win' : 'lose';
}

function HistorySheet({ visible, rows, onClose }: { visible: boolean; rows: CasinoHistoryRow[]; onClose: () => void }) {
  const net = rows.reduce((sum, row) => sum + (row.netProfit ?? (row.payout - row.betAmount)), 0);
  const wins = rows.filter(row => row.won).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetScrim} onPress={onClose} />
      <View style={[styles.sheet, styles.sheetTall]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Derniers tours</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.sessionRow}>
          <View style={styles.sessionStat}>
            <Text style={styles.sessionStatLabel}>Tours</Text>
            <Text style={styles.sessionStatValue}>{rows.length}</Text>
          </View>
          <View style={styles.sessionStat}>
            <Text style={styles.sessionStatLabel}>Gagnants</Text>
            <Text style={styles.sessionStatValue}>{wins}</Text>
          </View>
          <View style={styles.sessionStat}>
            <Text style={styles.sessionStatLabel}>Bilan</Text>
            <Text style={[styles.sessionStatValue, net >= 0 ? styles.textWin : styles.textLose]}>
              {net >= 0 ? '+' : '−'}{money(Math.abs(net))}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
          {rows.length === 0 && <Text style={styles.historyEmpty}>Aucun tour pour le moment.</Text>}
          {rows.map(row => {
            const rowNet = row.netProfit ?? (row.payout - row.betAmount);
            const tone = historyTone(row);
            const icon = row.game === 'wheel' ? '◉' : row.game === 'coinflip' ? '◍' : '▤';
            return (
              <View key={row.id} style={[styles.historyRow, tone === 'win' && styles.historyRowWin, tone === 'lose' && styles.historyRowLose]}>
                <Text style={styles.historyIcon}>{icon}</Text>
                <View style={styles.historyMain}>
                  <Text style={styles.historyLabel} numberOfLines={1}>{historyLabel(row)}</Text>
                  <Text style={styles.historyBet}>{money(row.betAmount)} NF</Text>
                </View>
                <Text style={[styles.historyNet, tone === 'push' ? styles.textPush : tone === 'win' ? styles.textWin : styles.textLose]}>
                  {tone === 'push' ? '±0' : row.won ? `+${money(rowNet)}` : `−${money(row.betAmount)}`}
                </Text>
              </View>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function CasinoScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  // `BottomTabBarHeightContext` vaut `undefined` hors navigateur d'onglets
  // (l'écran est aussi poussé depuis `MainNavigator`) — pas d'exception,
  // contrairement au hook `useBottomTabBarHeight`.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const dockBottom = tabBarHeight > 0 ? tabBarHeight + 8 : Platform.OS === 'ios' ? 30 : 16;

  const [game, setGame] = useState<Game>('wheel');
  const [config, setConfig] = useState<CasinoConfig | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [displayBalance, setDisplayBalance] = useState<number | null>(null);
  const [bet, setBet] = useState(1);
  const [selectedMode, setSelectedMode] = useState('classic');
  const [coinChoice, setCoinChoice] = useState<'pile' | 'face'>('pile');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CasinoResult | null>(null);
  const [nearMiss, setNearMiss] = useState(false);
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<CasinoHistoryRow[]>([]);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const wheelAnim = useRef(new Animated.Value(0)).current;
  const wheelDegRef = useRef(0);

  const flipAnim = useRef(new Animated.Value(0)).current;
  const coinDegRef = useRef(0);
  const tossAnim = useRef(new Animated.Value(0)).current;
  const [edgeRange, setEdgeRange] = useState<{ input: number[]; output: number[] }>(() => buildEdgeRange(0, 360));

  const reelAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const [reelStrips, setReelStrips] = useState<string[][]>([['🍒', '🍒', '🍒'], ['🍋', '🍋', '🍋'], ['🔔', '🔔', '🔔']]);
  // ESSAI 3D (temporaire) — le bouton n'apparaît qu'en développement. Les deux
  // rendus partagent la même partie : c'est le même résultat serveur qui pilote
  // la bande 2D et le tambour, seul l'affichage change.
  const [use3D, setUse3D] = useState(false);
  const [reel3D, setReel3D] = useState<{ cells: number[]; key: number }>({ cells: [0, 1, 3], key: 0 });

  const celebrateAnim = useRef(new Animated.Value(0)).current;
  const [celebrating, setCelebrating] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const playPulse = useRef(new Animated.Value(1)).current;

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const countFrame = useRef<number | null>(null);
  const later = (fn: () => void, delay: number) => { timers.current.push(setTimeout(fn, delay)); };

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    if (countFrame.current !== null) cancelAnimationFrame(countFrame.current);
  }, []);

  const load = useCallback(async () => {
    try {
      const [cfg, currencyId] = await Promise.all([CasinoService.getConfig(), CurrencyService.getTwitCoinsCurrencyId()]);
      setConfig(cfg);
      setSelectedMode(cfg?.wheel?.defaultMode || 'classic');
      const [wallet, hist] = await Promise.all([
        NewEconomyService.getUserWallet(currencyId),
        CasinoService.getHistory(20),
      ]);
      const walletBalance = wallet?.wallet?.balance ?? null;
      setBalance(walletBalance);
      setDisplayBalance(walletBalance);
      setHistory(hist);
    } catch (e) {
      // silencieux au chargement initial — la mise sera de toute facon
      // rejetee par l'API si le contexte est invalide
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const modes = config?.wheel?.modes?.length ? config.wheel.modes : modeFallbacks;
  const activeMode = modes.find(m => m.id === selectedMode) || modes[0];
  const segments = activeMode?.segments?.length ? activeMode.segments : fallbackSegments;
  const segAngle = 360 / segments.length;

  const minBet = config?.minBet ?? 1;
  const maxBet = config?.maxBet ?? 1000;
  const clampBet = useCallback(
    (value: number) => Math.min(Math.max(Number((Number.isFinite(value) ? value : minBet).toFixed(2)), minBet), maxBet),
    [minBet, maxBet],
  );
  const applyBet = (value: number) => { buzz(BUZZ.tap); setBet(clampBet(value)); };

  // La mise chargée par défaut peut sortir des limites de table renvoyées
  // par l'API : on la recale dès que la config arrive.
  useEffect(() => { setBet(prev => clampBet(prev)); }, [clampBet]);

  const canAfford = balance === null || bet <= balance;
  const canPlay = !busy && !!config && bet >= minBet && canAfford;

  /** Compteur de solde animé — un solde qui « monte » après un gain rend le
   *  résultat lisible sans lire le ticket. Piloté en rAF plutôt qu'en
   *  `Animated` : la valeur doit finir dans un `<Text>`. */
  const countTo = useCallback((from: number, to: number, duration = 700) => {
    if (countFrame.current !== null) cancelAnimationFrame(countFrame.current);
    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayBalance(from + (to - from) * eased);
      if (t < 1) countFrame.current = requestAnimationFrame(step);
      else { countFrame.current = null; setDisplayBalance(to); }
    };
    countFrame.current = requestAnimationFrame(step);
  }, []);

  const pushHistory = (row: CasinoHistoryRow) => setHistory(prev => [row, ...prev].slice(0, 20));

  /** Point d'arrivée commun aux trois jeux : solde, série, retour haptique,
   *  et la mise en scène du gain (gerbe + flash) ou de la perte (secousse). */
  const settle = (res: CasinoResult, extra?: { nearMiss?: boolean }) => {
    const previousBalance = balance ?? res.newBalance;
    setResult(res);
    setBalance(res.newBalance);
    countTo(previousBalance, res.newBalance);
    setBusy(false);
    setNearMiss(!!extra?.nearMiss);

    const isPush = res.outcome === 'push';
    if (res.won && res.netProfit > 0) {
      const big = (res.multiplier ?? 0) >= 4;
      setStreak(prev => prev + 1);
      buzz(big ? BUZZ.jackpot : BUZZ.win);
      // Un gros coup mérite plus que le flash du tapis : la gerbe plein écran
      // de l'app, avec le montant en grand. Réservée aux ×4 et plus, sinon
      // elle se banalise et ne veut plus rien dire.
      if (big) {
        celebrateReward({
          amount: res.netProfit,
          label: 'Jackpot',
          multiplier: res.multiplier ? `×${res.multiplier}` : undefined,
        });
      }
      setCelebrating(true);
      celebrateAnim.setValue(0);
      Animated.timing(celebrateAnim, { toValue: 1, duration: CELEBRATE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      later(() => setCelebrating(false), CELEBRATE_MS);
    } else if (isPush) {
      buzz(BUZZ.push);
    } else {
      setStreak(0);
      buzz(BUZZ.lose);
      shakeAnim.setValue(0);
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -1, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0.6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  };

  const startPlay = () => {
    setBusy(true);
    setError('');
    setResult(null);
    setNearMiss(false);
    setCelebrating(false);
    buzz(BUZZ.tap);
    Animated.sequence([
      Animated.timing(playPulse, { toValue: 0.94, duration: 90, useNativeDriver: true }),
      // friction 4 : le bouton « Jouer » rebondissait trois fois après chaque
      // tour. 13 = amortissement critique pour la tension par défaut (40).
      Animated.spring(playPulse, { toValue: 1, friction: 13, useNativeDriver: true }),
    ]).start();
  };

  const wheelRotate = wheelAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });

  const playWheel = async () => {
    if (!canPlay) return;
    startPlay();
    try {
      const res = await CasinoService.playWheel(bet, selectedMode);
      const targetCenter = (res.segmentIndex ?? 0) * segAngle + segAngle / 2;
      const desiredAngle = ((360 - targetCenter) % 360 + 360) % 360;
      const current = ((wheelDegRef.current % 360) + 360) % 360;
      let delta = desiredAngle - current;
      if (delta <= 0) delta += 360;
      // On mémorise l'angle d'arrivée tout de suite : avec le driver natif,
      // un listener JS sur la valeur n'est pas garanti d'être à jour au tour
      // suivant, et la roue finissait par dériver d'une case.
      const next = wheelDegRef.current + 360 * 6 + delta;
      wheelDegRef.current = next;
      Animated.timing(wheelAnim, { toValue: next, duration: WHEEL_SPIN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      later(() => {
        settle(res);
        pushHistory({
          id: `${Date.now()}`, game: 'wheel', mode: res.mode, modeLabel: res.modeLabel,
          betAmount: res.bet, multiplier: res.multiplier ?? 0, won: res.won, payout: res.payout,
          netProfit: res.netProfit, createdAt: new Date().toISOString(),
        });
      }, WHEEL_SPIN_MS);
    } catch (e: any) {
      setError(e?.message || 'Pari refuse'); setBusy(false);
    }
  };

  const playCoinflip = async () => {
    if (!canPlay) return;
    startPlay();
    try {
      const res = await CasinoService.playCoinflip(bet, coinChoice);
      const targetDeg = res.outcome === 'push' ? 90 : (res.result === 'pile' ? 0 : 180);
      const current = ((coinDegRef.current % 360) + 360) % 360;
      let delta = targetDeg - current;
      if (delta <= 0) delta += 360;
      const from = coinDegRef.current;
      const nextDeg = from + 360 * 4 + delta;
      coinDegRef.current = nextDeg;
      // La tranche n'est visible qu'aux alentours de 90° et 270° : on
      // échantillonne la course entière pour piloter son opacité, sinon la
      // pièce disparaît complètement à chaque demi-tour (et un résultat
      // « tranche » ne montrait rien du tout).
      setEdgeRange(buildEdgeRange(from, nextDeg));
      Animated.timing(flipAnim, { toValue: nextDeg, duration: COIN_FLIP_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      tossAnim.setValue(0);
      Animated.sequence([
        Animated.timing(tossAnim, { toValue: 1, duration: COIN_FLIP_MS * 0.46, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(tossAnim, { toValue: 0, duration: COIN_FLIP_MS * 0.54, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();
      later(() => {
        settle(res);
        pushHistory({
          id: `${Date.now()}`, game: 'coinflip', betAmount: res.bet, multiplier: res.multiplier ?? 0,
          won: res.won, payout: res.payout, netProfit: res.netProfit, createdAt: new Date().toISOString(),
          choice: res.choice, result: res.result, outcome: res.outcome,
        });
      }, COIN_FLIP_MS);
    } catch (e: any) {
      setError(e?.message || 'Pari refuse'); setBusy(false);
    }
  };

  const playSlots = async () => {
    if (!canPlay) return;
    startPlay();
    try {
      const res = await CasinoService.playSlots(bet);
      const pool = config?.slots?.paytable?.map(e => e.label).filter(Boolean) || SLOT_SYMBOL_POOL;
      const pick = () => pool[Math.floor(Math.random() * pool.length)];
      const PADDING = 14;

      const targets = [0, 1, 2].map(i => res.reels?.[i]?.label || pick());

      // Le tambour 3D se cale sur l'`id` du symbole (`cherry`, `seven`…), pas
      // sur l'emoji : si le serveur introduit un symbole absent de la bande,
      // `cellForSymbol` renvoie null et on laisse tourner la version 2D plutôt
      // que d'afficher un rouleau qui ment sur le résultat.
      const cells3D = [0, 1, 2].map(i => cellForSymbol(res.reels?.[i]?.id ?? ''));
      if (cells3D.every((cell): cell is number => cell !== null)) {
        setReel3D(prev => ({ cells: cells3D, key: prev.key + 1 }));
      }
      // La bande repart des trois symboles actuellement visibles (le rouleau
      // est toujours au repos sur la fin de la bande précédente) : sans ça il
      // « sautait » d'un cran au démarrage au lieu de défiler. Les trois
      // symboles de queue absorbent le rebond de `Easing.back`, qui dépasse
      // la cible d'environ une case avant de se recaler — sans eux, la
      // fenêtre montrait du vide au moment de l'arrêt.
      const nextStrips: string[][] = [0, 1, 2].map((i) => {
        const visible = reelStrips[i]?.slice(-3) ?? [pick(), pick(), pick()];
        return [...visible, ...Array.from({ length: PADDING }, pick), targets[i], pick(), pick(), pick()];
      });
      setReelStrips(nextStrips);
      reelAnims.forEach(a => a.setValue(0));

      REEL_STOP_MS.forEach((duration, index) => {
        const targetIndex = 3 + PADDING; // position du symbole cible dans la bande
        const toValue = -(targetIndex - 1) * REEL_CELL;
        Animated.timing(reelAnims[index], {
          toValue, duration, easing: Easing.out(Easing.back(1.25)), useNativeDriver: true,
        }).start();
        later(() => buzz(BUZZ.stop), duration);
      });

      later(() => {
        const labels = targets;
        const twoMatch = !res.won && (labels[0] === labels[1] || labels[1] === labels[2] || labels[0] === labels[2]);
        settle(res, { nearMiss: twoMatch });
        pushHistory({
          id: `${Date.now()}`, game: 'slots', betAmount: res.bet, multiplier: res.multiplier ?? 0,
          won: res.won, payout: res.payout, netProfit: res.netProfit, createdAt: new Date().toISOString(),
          reels: res.reels,
        });
      }, REEL_STOP_MS[2] + 200);
    } catch (e: any) {
      setError(e?.message || 'Pari refuse'); setBusy(false);
    }
  };

  const play = game === 'wheel' ? playWheel : game === 'coinflip' ? playCoinflip : playSlots;
  const playLabel = busy
    ? (game === 'wheel' ? 'La roue tourne…' : game === 'coinflip' ? 'La piece tourne…' : 'Ca tourne…')
    : result
      ? 'Rejouer'
      : (game === 'wheel' ? 'Lancer la roue' : game === 'coinflip' ? 'Lancer la piece' : 'Tirer les rouleaux');

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 360], outputRange: ['180deg', '540deg'] });
  const edgeOpacity = flipAnim.interpolate({ inputRange: edgeRange.input, outputRange: edgeRange.output, extrapolate: 'clamp' });
  const tossTranslate = tossAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -46] });
  const tossShadowScale = tossAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.62] });
  const shakeTranslate = shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });

  const wheelSize = useMemo(() => Math.max(160, Math.min(width * 0.64, 244)), [width]);
  const jackpotMultiplier = game === 'wheel' ? activeMode?.jackpotLabel
    : game === 'coinflip' ? `x${config?.coinflip?.winMultiplier ?? 1.2}`
      : `x${config?.slots?.paytable?.reduce((top, e) => Math.max(top, e.multiplier), 0) ?? '—'}`;

  const outcomeTone = !result ? null : result.outcome === 'push' ? 'push' : result.won ? 'win' : 'lose';
  const strip = history.slice(0, STRIP_LENGTH);

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <AppHeader
          navigation={navigation}
          title="Casino"
          subtitle={`Jackpot ${jackpotMultiplier}`}
          badge={streak >= 2 ? `🔥 ${streak}` : undefined}
          right={(
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.historyButton} onPress={() => setHistoryOpen(true)} hitSlop={8}>
                <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.balancePill}>
                <Ionicons name="wallet-outline" size={12} color={colors.gold} />
                <Text style={styles.balancePillText}>{displayBalance !== null ? money(displayBalance) : '···'}</Text>
              </View>
            </View>
          )}
        />

        <View style={styles.gameTabs}>
          {GAME_TABS.map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.gameTab, game === tab.id && styles.gameTabActive]}
              onPress={() => { if (!busy) { buzz(BUZZ.tap); setGame(tab.id); setResult(null); setError(''); } }}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Ionicons name={tab.icon} size={16} color={game === tab.id ? '#2C1D04' : colors.textMuted} />
              <Text style={[styles.gameTabTitle, game === tab.id && styles.gameTabTitleActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {strip.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.stripScroll}
            contentContainerStyle={styles.stripInner}
          >
            {strip.map(row => {
              const tone = historyTone(row);
              return (
                <View key={row.id} style={[styles.stripDot, tone === 'win' ? styles.stripDotWin : tone === 'push' ? styles.stripDotPush : styles.stripDotLose]}>
                  <Text style={[styles.stripDotText, tone === 'win' && styles.stripDotTextWin]} numberOfLines={1}>
                    {tone === 'push' ? '=' : tone === 'win' ? `×${row.multiplier || 1}` : '✕'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        <ScrollView
          style={styles.stageScroll}
          contentContainerStyle={styles.stageScrollInner}
          showsVerticalScrollIndicator={false}
        >
          {/* Les règles n'étaient nulle part : ni l'espérance de gain, ni le
              fait que la mise part avant le résultat. Dépliée à la première
              visite, repliée ensuite. */}
          <HowItWorks
            id="casino"
            title="Les règles, en clair"
            tint={colors.gold}
            points={[
              { icon: 'wallet-outline', text: 'Ta mise est débitée au lancement, pas au résultat. Un tour perdu ne se rejoue pas.' },
              { icon: 'options-outline', text: 'Chaque mode change les chances : plus le jackpot est gros, plus les cases perdantes sont nombreuses.' },
              { icon: 'trending-up-outline', text: 'Un gain est un multiplicateur de ta mise — ×1,2 sur 100 NF rend 120 NF, pas 100 de plus.' },
              { icon: 'time-outline', text: 'Chaque tour est indépendant : une série de pertes n’augmente pas les chances du suivant.' },
            ]}
            warning="La maison est gagnante sur la durée. Ne mise que ce que tu acceptes de perdre."
            style={styles.howItWorks}
          />
          <Animated.View style={[
            styles.stage,
            outcomeTone === 'win' && styles.stageWin,
            nearMiss && styles.stageNear,
            { transform: [{ translateX: shakeTranslate }] },
          ]}>
            {game === 'wheel' && (
              <>
                <View style={styles.modeRow}>
                  {modes.map(mode => (
                    <TouchableOpacity
                      key={mode.id}
                      style={[styles.modeChip, mode.id === activeMode.id && styles.modeChipActive]}
                      onPress={() => { buzz(BUZZ.tap); setSelectedMode(mode.id); }}
                      disabled={busy}
                    >
                      <Text style={[styles.modeChipText, mode.id === activeMode.id && styles.modeChipTextActive]}>{mode.label}</Text>
                      <Text style={[styles.modeChipJackpot, mode.id === activeMode.id && styles.modeChipJackpotActive]}>{mode.jackpotLabel}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.wheelRig}>
                  <View style={styles.flapper} />
                  <LinearGradient colors={BRASS_RIM} style={[styles.wheelFrame, { width: wheelSize + 20, height: wheelSize + 20, borderRadius: (wheelSize + 20) / 2 }]}>
                    <View style={[styles.wheelInset, { width: wheelSize, height: wheelSize, borderRadius: wheelSize / 2 }]}>
                      <Wheel size={wheelSize} segments={segments} jackpotLabel={activeMode?.jackpotLabel} rotate={wheelRotate} />
                    </View>
                  </LinearGradient>
                  <LinearGradient colors={BRASS_FACE} style={styles.wheelHub}>
                    <Text style={styles.wheelHubText}>NF</Text>
                  </LinearGradient>
                </View>
              </>
            )}

            {game === 'coinflip' && (
              <>
                <View style={styles.coinChoiceRow}>
                  <TouchableOpacity style={[styles.choiceButton, coinChoice === 'pile' && styles.choiceButtonActive]} onPress={() => { buzz(BUZZ.tap); setCoinChoice('pile'); }} disabled={busy}>
                    <Text style={[styles.choiceText, coinChoice === 'pile' && styles.choiceTextActive]}>Pile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.choiceButton, coinChoice === 'face' && styles.choiceButtonActive]} onPress={() => { buzz(BUZZ.tap); setCoinChoice('face'); }} disabled={busy}>
                    <Text style={[styles.choiceText, coinChoice === 'face' && styles.choiceTextActive]}>Face</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.coinStage}>
                  <Animated.View style={[styles.coin3d, { transform: [{ translateY: tossTranslate }] }]}>
                    <Animated.View style={[styles.coinFace, { transform: [{ perspective: 900 }, { rotateY: frontRotate }] }]}>
                      <LinearGradient colors={BRASS_FACE} style={styles.coinFaceGradient}>
                        <Text style={styles.coinFaceIcon}>★</Text>
                        <Text style={styles.coinFaceSymbol}>NF</Text>
                        <Text style={styles.coinFaceLabel}>PILE</Text>
                      </LinearGradient>
                    </Animated.View>
                    <Animated.View style={[styles.coinFace, { transform: [{ perspective: 900 }, { rotateY: backRotate }] }]}>
                      <LinearGradient colors={BRASS_FACE} style={styles.coinFaceGradient}>
                        <Text style={styles.coinFaceIcon}>❦</Text>
                        <Text style={styles.coinFaceSymbol}>NF</Text>
                        <Text style={styles.coinFaceLabel}>FACE</Text>
                      </LinearGradient>
                    </Animated.View>
                    <Animated.View pointerEvents="none" style={[styles.coinEdge, { opacity: edgeOpacity }]}>
                      <LinearGradient colors={BRASS_RIM} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.coinEdgeFill} />
                    </Animated.View>
                  </Animated.View>
                  <Animated.View style={[styles.coinShadow, { transform: [{ scaleX: tossShadowScale }] }]} />
                </View>

                {config?.coinflip && (
                  <View style={styles.oddsRow}>
                    <View style={styles.oddsPill}><View style={[styles.oddsDot, { backgroundColor: colors.success }]} /><Text style={styles.oddsText}>{config.coinflip.winChance}%</Text></View>
                    <View style={styles.oddsPill}><View style={[styles.oddsDot, { backgroundColor: STAGE.textMuted }]} /><Text style={styles.oddsText}>{config.coinflip.pushChance}% tranche</Text></View>
                    <View style={styles.oddsPill}><View style={[styles.oddsDot, { backgroundColor: colors.red }]} /><Text style={styles.oddsText}>{config.coinflip.loseChance}%</Text></View>
                  </View>
                )}
              </>
            )}

            {game === 'slots' && (
              <>
                <LinearGradient colors={BRASS_RIM} style={styles.slotCabinet}>
                  <View style={styles.slotWindow}>
                    {[0, 1, 2].map(i => (
                      use3D ? (
                        <SlotReel3D
                          key={`r3d-${i}`}
                          style={styles.slotReel3D}
                          targetCell={reel3D.cells[i]}
                          spinKey={reel3D.key}
                          durationMs={REEL_STOP_MS[i]}
                        />
                      ) : (
                        <View key={i} style={styles.slotReel}>
                          <Animated.View style={{ transform: [{ translateY: reelAnims[i] }] }}>
                            {reelStrips[i].map((symbol, position) => (
                              <View key={position} style={styles.slotCell}>
                                <Text style={styles.slotSymbol}>{symbol}</Text>
                              </View>
                            ))}
                          </Animated.View>
                        </View>
                      )
                    ))}
                    <View style={[styles.slotPayline, result?.won && styles.slotPaylineHit, nearMiss && styles.slotPaylineNear]} />
                  </View>
                </LinearGradient>

                {__DEV__ && (
                  // ESSAI 3D (temporaire) : à retirer une fois la décision prise.
                  <TouchableOpacity style={styles.spike3dToggle} onPress={() => setUse3D(v => !v)}>
                    <Text style={styles.spike3dText}>{use3D ? 'Rouleaux : 3D' : 'Rouleaux : 2D'}</Text>
                  </TouchableOpacity>
                )}

                {config?.slots && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paytableScroll} contentContainerStyle={styles.paytable}>
                    {config.slots.paytable.slice().sort((a, b) => b.multiplier - a.multiplier).map(entry => (
                      <View key={entry.id} style={styles.paytableChip}>
                        <Text style={styles.paytableText}>{entry.label}{entry.label}{entry.label}</Text>
                        <Text style={styles.paytableMult}>×{entry.multiplier}</Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            {celebrating && (
              <View pointerEvents="none" style={styles.celebrateLayer}>
                <Confetti anim={celebrateAnim} />
                <Animated.Text style={[
                  styles.celebrateText,
                  {
                    opacity: celebrateAnim.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                    transform: [
                      { scale: celebrateAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.15, 1] }) },
                      { translateY: celebrateAnim.interpolate({ inputRange: [0, 1], outputRange: [10, -34] }) },
                    ],
                  },
                ]}>
                  +{money(result?.netProfit ?? 0)} NF
                </Animated.Text>
              </View>
            )}
          </Animated.View>

          <View style={styles.captionRow}>
            {result ? (
              <Text style={[
                styles.caption,
                outcomeTone === 'win' ? styles.textWin : outcomeTone === 'push' ? styles.textPush : styles.textLose,
              ]}>
                {outcomeTone === 'push'
                  ? `Tranche — mise de ${money(result.bet)} NF rendue`
                  : outcomeTone === 'win'
                    ? `${result.segment && result.segment !== 'LOSE' ? `Case ${result.segment} · ` : ''}×${result.multiplier ?? 0} · +${money(result.netProfit)} NF`
                    : `${nearMiss ? 'Si près ! ' : ''}−${money(result.bet)} NF`}
              </Text>
            ) : (
              <Text style={styles.caption}>
                {game === 'wheel' ? `Table ${activeMode.label} · jackpot ${activeMode.jackpotLabel}`
                  : game === 'coinflip' ? `Tu joues ${coinChoice === 'pile' ? 'Pile' : 'Face'}`
                    : `Aligne 3 symboles · jackpot ${jackpotMultiplier}`}
              </Text>
            )}
          </View>
        </ScrollView>

        {/* Console de mise — ancrée en bas, jamais dans le flux scrollable :
            l'enchaînement mise → lancer → relancer se fait sans jamais
            remonter l'écran, c'est ce qui manquait par rapport au desktop. */}
        <View style={[styles.dock, { paddingBottom: dockBottom }]}>
          <View style={styles.dockBetRow}>
            <TouchableOpacity style={styles.stepper} onPress={() => applyBet(bet / 2)} disabled={busy} activeOpacity={0.7}>
              <Text style={styles.stepperText}>½</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.betPill} onPress={() => { buzz(BUZZ.tap); setKeypadOpen(true); }} disabled={busy} activeOpacity={0.8}>
              <Text style={styles.betPillLabel}>Mise</Text>
              <View style={styles.betPillValueRow}>
                <Text style={[styles.betPillValue, !canAfford && styles.betPillValueBad]}>{money(bet)}</Text>
                <Text style={styles.betPillUnit}>NF</Text>
                <Ionicons name="chevron-up" size={13} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.stepper} onPress={() => applyBet(bet * 2)} disabled={busy} activeOpacity={0.7}>
              <Text style={styles.stepperText}>×2</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
            {CHIP_VALUES.filter(value => value <= maxBet).map((value, i) => (
              <TouchableOpacity key={value} style={[styles.chip, CHIP_COLORS[i]]} onPress={() => applyBet(bet + value)} disabled={busy} activeOpacity={0.75}>
                <View style={styles.chipRing} />
                <View style={styles.chipCore}><Text style={styles.chipText}>{value}</Text></View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.quickButton} onPress={() => applyBet(minBet)} disabled={busy}>
              <Text style={styles.quickButtonText}>Min</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickButton} onPress={() => applyBet(Math.min(maxBet, balance ?? maxBet))} disabled={busy}>
              <Text style={styles.quickButtonText}>Tapis</Text>
            </TouchableOpacity>
          </ScrollView>

          <Animated.View style={{ transform: [{ scale: playPulse }] }}>
            <TouchableOpacity
              style={[styles.playButton, !canPlay && styles.playButtonOff]}
              onPress={play}
              disabled={!canPlay}
              activeOpacity={0.85}
            >
              {busy
                ? <ActivityIndicator color="#1a1303" />
                : <Ionicons name={result ? 'refresh' : 'play'} size={18} color="#1a1303" />}
              <Text style={styles.playButtonText}>{playLabel}</Text>
              {!busy && <Text style={styles.playButtonAmount}>{money(bet)} NF</Text>}
            </TouchableOpacity>
          </Animated.View>

          {!!error && <Text style={styles.error} numberOfLines={2}>{error}</Text>}
          {!error && !canAfford && <Text style={styles.warn}>Solde insuffisant pour cette mise</Text>}
          {!error && canAfford && <Text style={styles.limits}>Limites de table : {money(minBet)} – {money(maxBet)} NF</Text>}
        </View>
      </View>

      <BetKeypad
        visible={keypadOpen}
        initial={bet}
        min={minBet}
        max={maxBet}
        balance={balance}
        onClose={() => setKeypadOpen(false)}
        onValidate={value => { setBet(clampBet(value)); setKeypadOpen(false); }}
      />
      <HistorySheet visible={historyOpen} rows={history} onClose={() => setHistoryOpen(false)} />
    </ScreenBackground>
  );
}

/**
 * Échantillonne l'opacité de la tranche de la pièce sur toute la course de
 * rotation : 1 quand la pièce est vue de profil (90° modulo 180), 0 de face.
 * L'exposant resserre le pic pour que la tranche n'apparaisse qu'au moment du
 * basculement, jamais par-dessus une face lisible.
 */
function buildEdgeRange(from: number, to: number) {
  const STEP = 30;
  const input: number[] = [];
  const output: number[] = [];
  for (let deg = from; deg < to; deg += STEP) {
    input.push(deg);
    output.push(Math.pow(Math.abs(Math.sin((deg * Math.PI) / 180)), 6));
  }
  input.push(to);
  output.push(Math.pow(Math.abs(Math.sin((to * Math.PI) / 180)), 6));
  return { input, output };
}

const CHIP_COLORS = [
  { backgroundColor: '#E8E8EC' },
  { backgroundColor: '#C4142E' },
  { backgroundColor: '#12704A' },
  { backgroundColor: '#1D2A63' },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyButton: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  balancePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
  },
  balancePillText: { color: colors.gold, fontFamily: fonts.bold, fontSize: 13 },

  gameTabs: { flexDirection: 'row', gap: 7, paddingHorizontal: 20, marginBottom: 10 },
  gameTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 10, paddingHorizontal: 6,
  },
  gameTabActive: { backgroundColor: STAGE.gold, borderColor: STAGE.gold },
  gameTabTitle: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 12 },
  gameTabTitleActive: { color: '#2C1D04' },

  stripScroll: { flexGrow: 0, marginBottom: 8 },
  stripInner: { paddingHorizontal: 20, gap: 5, alignItems: 'center' },
  stripDot: {
    minWidth: 30, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6, borderWidth: 1,
  },
  stripDotWin: { backgroundColor: colors.successMuted, borderColor: 'rgba(34,197,94,0.45)' },
  stripDotLose: { backgroundColor: colors.surface, borderColor: colors.border },
  stripDotPush: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
  stripDotText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 10 },
  stripDotTextWin: { color: colors.success },

  stageScroll: { flex: 1 },
  stageScrollInner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 4 },
  howItWorks: { marginBottom: 14 },

  stage: {
    borderRadius: radius.xl,
    backgroundColor: STAGE.bg, borderWidth: 1, borderColor: 'rgba(255,210,77,0.18)',
    paddingVertical: 18, paddingHorizontal: 14, alignItems: 'center', gap: 12,
  },
  stageWin: { borderColor: STAGE.gold },
  stageNear: { borderColor: 'rgba(255,210,77,0.5)' },

  modeRow: { flexDirection: 'row', gap: 7 },
  modeChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: STAGE.chipBg, borderWidth: 1, borderColor: STAGE.chipBorder, gap: 2,
  },
  modeChipActive: { backgroundColor: STAGE.gold, borderColor: STAGE.gold },
  modeChipText: { color: STAGE.textSecondary, fontFamily: fonts.bold, fontSize: 11.5 },
  modeChipTextActive: { color: '#2C1D04' },
  modeChipJackpot: { color: STAGE.textMuted, fontSize: 9, fontFamily: fonts.bold },
  modeChipJackpotActive: { color: 'rgba(44,29,4,0.7)' },

  wheelRig: { alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  flapper: {
    position: 'absolute', top: -4, zIndex: 4, width: 0, height: 0,
    borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 16,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#F3F0E6',
  },
  wheelFrame: { alignItems: 'center', justifyContent: 'center' },
  wheelInset: { overflow: 'hidden', backgroundColor: '#0B0710', alignItems: 'center', justifyContent: 'center' },
  wheelHub: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fff7ed',
  },
  wheelHubText: { fontFamily: fonts.displayHeavy, fontSize: 13, color: '#3A2708' },

  captionRow: { paddingTop: 10, paddingHorizontal: 20, minHeight: 30 },
  caption: { color: colors.textSecondary, fontSize: 12.5, textAlign: 'center', fontFamily: fonts.bold },

  coinChoiceRow: { flexDirection: 'row', gap: 8 },
  choiceButton: { paddingHorizontal: 22, paddingVertical: 8, borderRadius: 999, backgroundColor: STAGE.chipBg, borderWidth: 1, borderColor: STAGE.chipBorder },
  choiceButtonActive: { backgroundColor: STAGE.gold, borderColor: STAGE.gold },
  choiceText: { color: STAGE.textSecondary, fontFamily: fonts.bold, fontSize: 13 },
  choiceTextActive: { color: '#1a1303' },

  coinStage: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  coin3d: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center' },
  coinFace: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden',
    borderWidth: 5, borderColor: '#fff7ed',
  },
  coinFaceGradient: { flex: 1, width: '100%', borderRadius: 62, alignItems: 'center', justifyContent: 'center', gap: 1 },
  coinFaceIcon: { fontSize: 15, opacity: 0.68, color: '#6B4507', marginBottom: 1 },
  coinFaceSymbol: { fontSize: 28, fontFamily: fonts.displayHeavy, color: '#6B4507' },
  coinFaceLabel: { fontSize: 10, fontFamily: fonts.bold, color: '#6B4507', opacity: 0.72, letterSpacing: 1.5 },
  coinEdge: {
    position: 'absolute', width: 13, height: 130, borderRadius: 7, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)',
  },
  coinEdgeFill: { flex: 1 },
  coinShadow: {
    position: 'absolute', bottom: 4, width: 110, height: 16, borderRadius: 55,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  oddsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  oddsPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: STAGE.chipBg },
  oddsDot: { width: 6, height: 6, borderRadius: 3 },
  oddsText: { color: STAGE.textSecondary, fontSize: 10.5 },

  slotCabinet: { borderRadius: 18, padding: 10 },
  slotWindow: {
    flexDirection: 'row', gap: 6, borderRadius: 12, backgroundColor: '#0B070A', padding: 6, overflow: 'hidden',
  },
  slotReel: {
    width: 72, height: REEL_CELL * 3, borderRadius: 8, overflow: 'hidden',
    backgroundColor: '#1B1218', alignItems: 'center',
  },
  slotCell: { height: REEL_CELL, alignItems: 'center', justifyContent: 'center' },
  // ESSAI 3D (temporaire) — plus large que la fenêtre 2D : le tambour est un
  // objet en volume, ses bords arrondis ont besoin de place pour se voir.
  slotReel3D: { width: 94, height: REEL_CELL * 3 },
  spike3dToggle: {
    alignSelf: 'center', marginTop: 10, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: radius.sm, borderWidth: 1, borderColor: '#25F4EE',
  },
  spike3dText: { color: '#25F4EE', fontSize: 12, fontFamily: fonts.semibold },
  slotSymbol: { fontSize: 31 },
  slotPayline: {
    position: 'absolute', left: 8, right: 8, top: REEL_CELL + REEL_CELL / 2 - 1, height: 2,
    backgroundColor: 'rgba(254,44,85,0.7)', borderRadius: 2,
  },
  slotPaylineHit: { backgroundColor: STAGE.gold, height: 3 },
  slotPaylineNear: { backgroundColor: 'rgba(255,210,77,0.55)', height: 3 },

  paytableScroll: { alignSelf: 'stretch', flexGrow: 0 },
  paytable: { flexDirection: 'row', gap: 6, paddingHorizontal: 2 },
  paytableChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: STAGE.chipBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  paytableText: { color: STAGE.textSecondary, fontSize: 11.5 },
  paytableMult: { color: STAGE.gold, fontFamily: fonts.bold, fontSize: 11.5 },

  celebrateLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  confettiLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  confettiPiece: { position: 'absolute', borderRadius: 2 },
  celebrateText: {
    color: STAGE.gold, fontFamily: fonts.displayHeavy, fontSize: 32,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 },
  },

  dock: {
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: 'rgba(255,210,77,0.18)',
    paddingHorizontal: 16, paddingTop: 12, gap: 10,
  },
  dockBetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepper: {
    width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  stepperText: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 15 },
  betPill: {
    flex: 1, height: 46, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  betPillLabel: { color: colors.textMuted, fontSize: 9, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.8 },
  betPillValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  betPillValue: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 18 },
  betPillValueBad: { color: colors.red },
  betPillUnit: { color: colors.gold, fontFamily: fonts.bold, fontSize: 11 },

  chipsScroll: { flexGrow: 0 },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 },
  chip: { width: 42, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipRing: {
    position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: 999,
    borderWidth: 3, borderStyle: 'dashed', borderColor: colors.textSecondary, opacity: 0.55,
  },
  // Fixe (pas thémé) : en clair `colors.textPrimary` passe au noir, ce qui
  // rendait le disque et le texte du jeton noir sur noir — invisible.
  chipCore: { width: '58%', height: '58%', borderRadius: 999, backgroundColor: '#F3F0E6', alignItems: 'center', justifyContent: 'center' },
  chipText: { color: '#17171A', fontFamily: fonts.bold, fontSize: 11.5 },

  quickButton: {
    height: 42, minWidth: 52, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  quickButtonText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 12 },

  playButton: {
    borderRadius: 14, backgroundColor: STAGE.gold,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15,
    ...glow(STAGE.gold, 14),
  },
  playButtonOff: { backgroundColor: colors.surfaceElevated, shadowOpacity: 0, elevation: 0 },
  playButtonText: { color: '#1a1303', fontFamily: fonts.bold, fontSize: 15 },
  playButtonAmount: { color: 'rgba(26,19,3,0.6)', fontFamily: fonts.bold, fontSize: 12 },

  limits: { color: colors.textMuted, fontSize: 10.5, textAlign: 'center' },
  warn: { color: colors.gold, fontSize: 11, textAlign: 'center', fontFamily: fonts.bold },
  error: { color: colors.red, fontSize: 12, textAlign: 'center' },

  sheetScrim: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  sheetTall: { maxHeight: '78%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 16, marginBottom: 12 },
  sheetPrimary: {
    marginTop: 14, borderRadius: 14, backgroundColor: STAGE.gold,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 15,
  },
  sheetPrimaryText: { color: '#1a1303', fontFamily: fonts.bold, fontSize: 15 },
  sheetList: { marginTop: 4 },

  keypadDisplay: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14,
  },
  keypadDisplayInvalid: { borderColor: colors.red },
  keypadDisplayValue: { color: colors.textPrimary, fontFamily: fonts.displayHeavy, fontSize: 32 },
  keypadDisplayUnit: { color: colors.gold, fontFamily: fonts.bold, fontSize: 14 },
  keypadHint: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 8 },
  keypadGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 },
  keypadKey: {
    width: '31%', height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  keypadKeyText: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 20 },
  keypadPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  keypadPreset: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  keypadPresetText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 12 },

  sessionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sessionStat: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  sessionStatLabel: { color: colors.textMuted, fontSize: 10, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  sessionStatValue: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 15, marginTop: 2 },

  historyEmpty: { color: colors.textSecondary, fontSize: 13, paddingVertical: 12 },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.surface,
    borderLeftWidth: 2, borderLeftColor: 'transparent', marginBottom: 6,
  },
  historyRowWin: { borderLeftColor: colors.success },
  historyRowLose: { borderLeftColor: colors.accentBright },
  historyIcon: { color: colors.textMuted, fontSize: 13, width: 16 },
  historyMain: { flex: 1 },
  historyLabel: { color: colors.textPrimary, fontSize: 12.5, fontFamily: fonts.bold },
  historyBet: { color: colors.textMuted, fontSize: 10.5, marginTop: 1 },
  historyNet: { fontSize: 13, fontFamily: fonts.bold },

  textWin: { color: colors.success },
  textLose: { color: colors.accentBright },
  textPush: { color: colors.textSecondary },
});
