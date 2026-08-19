import { colors, fonts, glow, withAlpha } from '../theme';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
// `SafeAreaView` de 'react-native' (au-dessus) ne fait rien sur Android — seule
// la version de react-native-safe-area-context applique un vrai inset sur les
// deux plateformes ; c'est elle qu'il faut utiliser ici, pas celle du core.
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import api from '../services/api';
import { BackButton, ScreenSkeleton } from '../components/ui';
import { toast } from '../components/ui/Toast';

// ─── TOKENS ── mappés sur la palette Pulse ──────────────────────
const C = {
  bg: colors.bg,
  surface: colors.surface,
  surfaceUp: colors.surfaceAlt,
  border: colors.borderSubtle,
  borderFocus: colors.accent,
  accent: colors.accent,
  accentDim: colors.accentMuted,
  accentMid: withAlpha(colors.accent, 0.28),
  green: colors.success,
  greenDim: colors.successMuted,
  red: colors.red,
  redDim: colors.redMuted,
  amber: colors.gold,
  amberDim: colors.warningMuted,
  t1: colors.textPrimary,
  t2: colors.textSecondary,
  t3: colors.textMuted,
  white6: colors.surfaceAlt,
  white10: colors.surface,
};

// ─── TYPES ─────────────────────────────────────────────────────
interface TargetingCategory {
  category: string;
  /** Libellé lisible du critère ; `category` est la clé technique du moteur. */
  label?: string;
  description?: string;
  values: { value: string; label?: string; user_count: number }[];
}
interface SearchUser {
  id: string; username: string; full_name: string; avatar?: string; verified?: boolean;
}
interface SearchTweet {
  id: string; content: string;
  user?: { username: string; avatar?: string };
  stats?: { likes: number; retweets: number };
}
/** Ce que la campagne met en avant : un compte, ou un tweet. */
type PromoTarget =
  | { type: 'profile'; userId: string; username: string; label: string; avatar?: string }
  | { type: 'tweet'; tweetId: string; label: string; username: string };

// ─── FIELD COMPONENT ───────────────────────────────────────────
const Field = ({
  label, value, onChangeText, placeholder, multiline, keyboardType, hint, error, icon,
}: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any;
  hint?: string; error?: string; icon?: string;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={fw.wrap}>
      <Text style={fw.label}>{label}</Text>
      <View style={[fw.box, focused && fw.boxFocused, !!error && fw.boxError]}>
        {icon && <Ionicons name={icon as any} size={18} color={focused ? C.accent : C.t3} style={fw.icon} />}
        <TextInput
          style={[fw.input, multiline && { minHeight: 90, textAlignVertical: 'top', paddingTop: 4 }]}
          placeholder={placeholder}
          placeholderTextColor={C.t3}
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {error
        ? <Text style={fw.error}>{error}</Text>
        : hint ? <Text style={fw.hint}>{hint}</Text>
          : null
      }
    </View>
  );
};
const fw = StyleSheet.create({
  wrap: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold, color: C.t2, marginBottom: 8 },
  box: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  boxFocused: { borderColor: C.accent, backgroundColor: colors.surfaceAlt },
  boxError: { borderColor: C.red },
  icon: { marginRight: 12, marginTop: 2 },
  input: { flex: 1, fontSize: 16, color: C.t1, fontWeight: '500', fontFamily: fonts.medium, lineHeight: 22 },
  hint: { fontSize: 12, color: C.t3, marginTop: 6, lineHeight: 17 },
  error: { fontSize: 12, color: C.red, marginTop: 6 },
});

// ─── STAT CELL ─────────────────────────────────────────────────
const StatCell = ({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) => (
  <View style={sc.wrap}>
    <View style={[sc.ico, { backgroundColor: color + '1a' }]}>
      <Ionicons name={icon as any} size={20} color={color} />
    </View>
    <Text style={sc.val}>{value}</Text>
    <Text style={sc.lbl}>{label}</Text>
  </View>
);
const sc = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', gap: 6 },
  ico: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  val: { fontSize: 19, fontWeight: '800', fontFamily: fonts.bold, color: C.t1, letterSpacing: -0.5 },
  lbl: { fontSize: 10, color: C.t3, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 0.8 },
});

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════
export default function CreateTargetingAdScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [availableTargeting, setAvailableTargeting] = useState<TargetingCategory[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [maxViews, setMaxViews] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<{ category: string; value: string }[]>([]);
  const [promoTarget, setPromoTarget] = useState<PromoTarget | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'stats'>('create');
  const [myAds, setMyAds] = useState<any[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'users' | 'tweets'>('all');
  const [searchUsers, setSearchUsers] = useState<SearchUser[]>([]);
  const [searchTweets, setSearchTweets] = useState<SearchTweet[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<any>(null);

  useEffect(() => {
    fetchTargetingOptions(); fetchMyAds(); fetchWalletBalance();
  }, []);

  const fetchWalletBalance = async () => {
    try { 
      const r = await api.get('/api/ads/balance'); 
      if (r.data && typeof r.data.balance === 'number') {
        setWalletBalance(r.data.balance); 
      } else if (typeof r.balance === 'number') {
        setWalletBalance(r.balance);
      }
    } catch { }
  };
  const fetchMyAds = async () => {
    try { const r = await api.get('/api/ads/targeted/me'); if (r.success) setMyAds(r.data || []); } catch { }
  };
  const fetchTargetingOptions = async () => {
    try {
      const r = await api.get('/api/ads/targeting/options');
      if (r.success && Array.isArray(r.data)) {
        // Trier les catégories par portée totale (somme des user_count)
        const sortedData = r.data
          .map((cat: TargetingCategory) => ({
            ...cat,
            values: [...cat.values].sort((a, b) => b.user_count - a.user_count),
            totalReach: cat.values.reduce((sum, v) => sum + (v.user_count || 0), 0)
          }))
          .sort((a: any, b: any) => b.totalReach - a.totalReach);
        
        setAvailableTargeting(sortedData);
      } else if (r.success) {
        setAvailableTargeting(r.data);
      } else {
        toast.error(r.message || 'Impossible de charger le ciblage.');
      }
    } catch { 
      toast.error('Impossible de charger les options de ciblage.'); 
    } finally { 
      setLoading(false); 
    }
  };

  const toggleGroup = (category: string, value: string) => {
    const i = selectedGroups.findIndex(g => g.category === category && g.value === value);
    if (i >= 0) { setSelectedGroups(p => p.filter((_, j) => j !== i)); return; }
    if (selectedGroups.length >= 10) { toast.info('Limite', {
      description: 'Maximum 10 segments sélectionnables.',
    }); return; }
    setSelectedGroups(p => [...p, { category, value }]);
  };
  const isSelected = (c: string, v: string) => selectedGroups.some(g => g.category === c && g.value === v);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (text.trim().length < 1) { setSearchUsers([]); setSearchTweets([]); return; }
    searchTimeout.current = setTimeout(() => doSearch(text.trim()), 400);
  };
  const doSearch = async (q: string) => {
    setSearchLoading(true);
    const params = `q=${encodeURIComponent(q)}&limit=15`;
    try {
      if (searchType !== 'tweets') {
        try { const r = await api.get(`/api/search/users?${params}`); setSearchUsers(r.success ? r.data?.users || [] : []); } catch { setSearchUsers([]); }
      } else setSearchUsers([]);
      if (searchType !== 'users') {
        try { const r = await api.get(`/api/search/tweets?${params}`); setSearchTweets(r.success ? r.data?.tweets || [] : []); } catch { setSearchTweets([]); }
      } else setSearchTweets([]);
    } finally { setSearchLoading(false); }
  };

  const selectProfile = (u: SearchUser) => {
    setPromoTarget({ type: 'profile', userId: u.id, username: u.username, label: `@${u.username}`, avatar: u.avatar });
    closeSearch();
  };
  const selectTweet = (t: SearchTweet) => {
    setPromoTarget({ type: 'tweet', tweetId: t.id, label: t.content?.substring(0, 60) || `Tweet de @${t.user?.username}`, username: t.user?.username || '' });
    closeSearch();
  };
  const closeSearch = () => { setSearchModalVisible(false); setSearchQuery(''); setSearchUsers([]); setSearchTweets([]); };

  const submitAd = async () => {
    // Une campagne met en avant quelque chose qui existe déjà sur la
    // plateforme — un tweet OU un compte — plutôt qu'un visuel créé à part :
    // c'est ce qui lui fait suivre le même classement, les mêmes règles de
    // visibilité et le même affichage que n'importe quel contenu.
    if (!promoTarget) {
      toast.error('Rien à promouvoir', {
        description: 'Choisis un tweet ou un compte à mettre en avant.',
      });
      return;
    }
    const views = parseInt(maxViews, 10);
    if (!views || views <= 0) { toast.error('Objectif invalide', {
      description: 'Saisissez un nombre de vues valide.',
    }); return; }
    const cost = views * 0.10;
    if (cost > walletBalance) { toast.error('Solde insuffisant', {
      description: `Coût estimé : ${cost.toFixed(2)} NF\nDisponible : ${walletBalance.toFixed(2)} NF`,
    }); return; }
    if (!selectedGroups.length) { toast.error('Audience requise', {
      description: 'Sélectionnez au moins un segment.',
    }); return; }
    setSubmitting(true);
    try {
      // Plus de `redirect_url` : la publicité EST le tweet ou le compte promu,
      // on y arrive en la touchant. Une redirection séparée n'avait de sens
      // que du temps du visuel créé à part.
      // Les segments choisis sont regroupés par critère : le moteur attend un
      // tableau par critère (`user_types`, `hours`, `follows_any_of`), pas une
      // liste plate de paires — voir `rust-recommender/src/ads/serving.rs`.
      const targeting: Record<string, string[]> = {};
      for (const g of selectedGroups) {
        (targeting[g.category] ||= []).push(g.value);
      }

      const res = await api.post('/api/ads/targeted', {
        target_type: promoTarget.type,
        ...(promoTarget.type === 'tweet'
          ? { tweet_id: promoTarget.tweetId }
          : { target_user_id: promoTarget.userId }),
        // Le budget EST le nombre de vues achetées : 0,10 NF l'impression.
        budget: Number((views * 0.10).toFixed(2)),
        title: campaignName.trim().slice(0, 60) || promoTarget.label.slice(0, 60) || 'Publicité',
        max_impressions_per_user: 3,
        targeting,
      });
      if (res.success) {
        // On bascule directement sur les stats — c'est là que l'utilisateur
        // voulait aller. Le toast ne fait que nommer ce qui vient de se passer.
        setActiveTab('stats'); fetchMyAds(); fetchWalletBalance();
        setCampaignName(''); setMaxViews(''); setSelectedGroups([]); setPromoTarget(null);
        toast.success('Campagne créée', { description: 'Ta publicité est maintenant active.' });
      } else toast.error(res.message || 'Erreur lors de la création.');
    } catch (e: any) {
      // Le serveur refuse pour des raisons que l'annonceur peut corriger
      // (compte privé, tweet non diffusable, solde) : les taire derrière
      // « vérifiez votre connexion » lui laissait un écran sans explication.
      const msg = e?.response?.data?.message || e?.data?.message || e?.message;
      toast.error(msg || 'Vérifiez votre connexion et réessayez.');
    }
    finally { setSubmitting(false); }
  };

  if (loading) return (
    <ScreenSkeleton variant="list" />
  );

  const views = parseInt(maxViews || '0', 10);
  const cost = views * 0.10;
  const overBudget = cost > walletBalance && views > 0;

  // ── SEARCH MODAL ─────────────────────────────────────────────
  const renderSearchModal = () => (
    <Modal visible={searchModalVisible} animationType="slide" transparent onRequestClose={closeSearch}>
      <View style={s.modalBg}>
        <View style={s.modalSheet}>
          <View style={s.modalDrag} />
          <View style={s.modalHead}>
            <View>
              <Text style={s.modalTitle}>Que promouvoir ?</Text>
              <Text style={s.modalSub}>Un compte à faire découvrir, ou un tweet à mettre en avant</Text>
            </View>
            <TouchableOpacity style={s.modalCloseBtn} onPress={closeSearch}>
              <Ionicons name="close" size={20} color={C.t2} />
            </TouchableOpacity>
          </View>

          {/* Type tabs */}
          <View style={s.typeTabs}>
            {(['all', 'users', 'tweets'] as const).map(t => (
              <TouchableOpacity key={t} style={[s.typeTab, searchType === t && s.typeTabOn]}
                onPress={() => { setSearchType(t); if (searchQuery.trim()) doSearch(searchQuery.trim()); }}>
                <Ionicons
                  name={t === 'users' ? 'person-outline' : t === 'tweets' ? 'chatbubble-outline' : 'apps-outline'}
                  size={14} color={searchType === t ? C.accent : C.t3}
                />
                <Text style={[s.typeTabTxt, searchType === t && s.typeTabTxtOn]}>
                  {t === 'all' ? 'Tout' : t === 'users' ? 'Profils' : 'Tweets'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Search input */}
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={18} color={C.t3} />
            <TextInput
              style={s.searchInput} autoFocus value={searchQuery} onChangeText={handleSearch}
              placeholder="Rechercher…" placeholderTextColor={C.t3} returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchUsers([]); setSearchTweets([]); }}>
                <Ionicons name="close-circle" size={18} color={C.t3} />
              </TouchableOpacity>
            )}
          </View>

          {searchLoading ? (
            <ScreenSkeleton variant="list" />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {searchUsers.length > 0 && (
                <>
                  <Text style={s.groupLabel}>PROFILS</Text>
                  {searchUsers.map(u => (
                    <TouchableOpacity key={u.id} style={s.resultRow} onPress={() => selectProfile(u)}>
                      <View style={s.avatar}>
                        {u.avatar
                          ? <Image source={{ uri: u.avatar }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                          : <View style={s.avatarFallback}><Text style={{ color: C.accent, fontWeight: '700', fontFamily: fonts.bold, fontSize: 16 }}>{u.username[0]?.toUpperCase()}</Text></View>
                        }
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={s.resultName}>{u.full_name || u.username}</Text>
                          {u.verified && <Ionicons name="checkmark-circle" size={15} color={C.accent} />}
                        </View>
                        <Text style={s.resultSub}>@{u.username}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={C.t3} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {searchTweets.length > 0 && (
                <>
                  <Text style={s.groupLabel}>TWEETS</Text>
                  {searchTweets.map(t => (
                    <TouchableOpacity key={t.id} style={s.resultRow} onPress={() => selectTweet(t)}>
                      <View style={s.avatarFallback}><Ionicons name="chatbubble-ellipses-outline" size={18} color={C.accent} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.resultName} numberOfLines={2}>{t.content}</Text>
                        <Text style={s.resultSub}>@{t.user?.username}{t.stats ? `  · ❤ ${t.stats.likes}` : ''}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={C.t3} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {searchQuery.length > 0 && !searchUsers.length && !searchTweets.length && (
                <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
                  <Ionicons name="search-outline" size={40} color={C.t3} />
                  <Text style={{ color: C.t2, fontSize: 16, fontWeight: '700' }}>Aucun résultat</Text>
                  <Text style={{ color: C.t3, fontSize: 13 }}>Essayez un autre terme</Text>
                </View>
              )}
              {!searchQuery.length && (
                <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
                  <Ionicons name="link-outline" size={40} color={C.t3} />
                  <Text style={{ color: C.t2, fontSize: 16, fontWeight: '700' }}>Choisissez une cible</Text>
                  <Text style={{ color: C.t3, fontSize: 13 }}>Tapez un nom ou un mot-clé</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  // ── RENDER ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />

      {/* ── HEADER ── */}
      <View style={s.header}>
        <BackButton navigation={navigation} />
        <Text style={s.headerTitle}>Publicités</Text>
        <View style={s.wallet}>
          <Text style={s.walletLabel}>Solde disponible</Text>
          <Text style={s.walletAmt}>{walletBalance.toFixed(2)} <Text style={{ fontSize: 13, color: C.t3 }}>NF</Text></Text>
        </View>
      </View>

      {/* ── TABS ── */}
      <View style={s.tabs}>
        {(['create', 'stats'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabOn]}
            onPress={() => { setActiveTab(tab); if (tab === 'stats') fetchMyAds(); }}
          >
            <Ionicons
              name={tab === 'create' ? 'add-circle-outline' : 'bar-chart-outline'}
              size={17}
              color={activeTab === tab ? C.accent : C.t3}
            />
            <Text style={[s.tabTxt, activeTab === tab && s.tabTxtOn]}>
              {tab === 'create' ? 'Créer une campagne' : 'Mes campagnes'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══ TAB: CREATE ══════════════════════════════════════ */}
      {activeTab === 'create' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Cost banner */}
          {views > 0 && (
            <View style={[s.banner, overBudget ? s.bannerRed : s.bannerBlue]}>
              <Ionicons name={overBudget ? 'warning-outline' : 'calculator-outline'} size={17} color={overBudget ? C.red : C.accent} />
              <Text style={[s.bannerTxt, { color: overBudget ? C.red : C.accent }]}>
                {overBudget
                  ? `Solde insuffisant — il vous manque ${(cost - walletBalance).toFixed(2)} NF`
                  : `Coût estimé : ${cost.toFixed(2)} NF pour ${views.toLocaleString()} vues`}
              </Text>
            </View>
          )}

          {/* Step 1 */}
          <Text style={s.step}>1  Ce que vous promouvez</Text>
          <Text style={s.segDesc}>Un tweet à mettre en avant, ou un compte à faire découvrir. Le vôtre ou celui de quelqu'un d'autre.</Text>
          {promoTarget ? (
            <View style={s.redirectCard}>
              <View style={[s.redirectIco, { backgroundColor: promoTarget.type === 'profile' ? C.accentDim : C.amberDim }]}>
                <Ionicons name={promoTarget.type === 'profile' ? 'person-outline' : 'chatbubble-ellipses-outline'} size={20} color={promoTarget.type === 'profile' ? C.accent : C.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.redirectKind}>{promoTarget.type === 'profile' ? 'Compte' : 'Tweet'}</Text>
                <Text style={s.redirectLbl} numberOfLines={1}>{promoTarget.label}</Text>
              </View>
              <TouchableOpacity style={s.ghostBtn} onPress={() => setSearchModalVisible(true)}>
                <Text style={s.ghostBtnTxt}>Changer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.ghostBtn, s.ghostBtnDanger]} onPress={() => setPromoTarget(null)}>
                <Ionicons name="trash-outline" size={15} color={C.red} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.redirectPicker} onPress={() => setSearchModalVisible(true)}>
              <Ionicons name="search-outline" size={20} color={C.t3} />
              <Text style={s.redirectPickerTxt}>Choisir un tweet ou un compte…</Text>
              <Ionicons name="chevron-forward" size={18} color={C.t3} />
            </TouchableOpacity>
          )}

          {/* Step 2 */}
          <Text style={s.step}>2  Objectif de vues</Text>
          <Field
            label="Nombre de vues cible"
            value={maxViews}
            onChangeText={setMaxViews}
            placeholder="ex : 5000"
            keyboardType="numeric"
            icon="eye-outline"
            hint="Tarif : 0,10 NF par vue"
            error={overBudget ? `Disponible : ${walletBalance.toFixed(2)} NF — coût : ${cost.toFixed(2)} NF` : undefined}
          />

          {/* Step 3 */}
          <Text style={s.step}>3  Nom de la campagne  <Text style={s.stepOpt}>(optionnel)</Text></Text>
          <Field
            label="Pour vous y retrouver"
            value={campaignName}
            onChangeText={setCampaignName}
            placeholder="ex : Lancement de septembre"
            icon="pricetag-outline"
            hint="Visible de vous seul, dans « Mes campagnes »."
          />

          {/* Step 4 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 16 }}>
            <Text style={[s.step, { marginBottom: 0, marginTop: 0 }]}>4  Audience cible</Text>
            <View style={s.badge}><Text style={s.badgeTxt}>{selectedGroups.length} / 10</Text></View>
          </View>
          <Text style={s.segDesc}>Sélectionnez les segments d'utilisateurs qui verront cette publicité.</Text>

          {/* `category` et `value` sont les clés du moteur : « follows_any_of »
              et un UUID de compte. C'est ce qui s'affichait ici — l'annonceur
              choisissait son audience dans une liste d'identifiants. On envoie
              toujours la clé, on n'affiche plus que le libellé. */}
          {availableTargeting.map((cat, i) => (
            <View key={i} style={s.catBlock}>
              <Text style={s.catLabel}>{cat.label || cat.category}</Text>
              {!!cat.description && <Text style={s.catDesc}>{cat.description}</Text>}
              <View style={s.chipRow}>
                {cat.values.map((v, j) => {
                  const sel = isSelected(cat.category, v.value);
                  return (
                    <TouchableOpacity key={j} style={[s.chip, sel && s.chipOn]} onPress={() => toggleGroup(cat.category, v.value)}>
                      {sel && <Ionicons name="checkmark" size={12} color={C.accent} style={{ marginRight: 5 }} />}
                      <Text style={[s.chipTxt, sel && s.chipTxtOn]}>{v.label || v.value}</Text>
                      <Text style={[s.chipCount, sel && { color: C.accent + '80' }]}>  {v.user_count.toLocaleString()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {/* Submit */}
          <TouchableOpacity style={[s.submitWrap, submitting && { opacity: 0.6 }]} onPress={submitAd} disabled={submitting} activeOpacity={0.85}>
            {submitting
              ? <ActivityIndicator color={colors.white} />
              : <><Ionicons name="rocket-outline" size={20} color={colors.white} /><Text style={s.submitTxt}>Lancer la campagne</Text></>
            }
          </TouchableOpacity>
        </ScrollView>
        </KeyboardAvoidingView>

      ) : (
        /* ══ TAB: STATS ══════════════════════════════════════ */
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
          {!myAds.length ? (
            <View style={s.empty}>
              <View style={s.emptyIco}><Ionicons name="bar-chart-outline" size={34} color={C.accent} /></View>
              <Text style={s.emptyTitle}>Aucune campagne</Text>
              <Text style={s.emptySub}>Créez votre première publicité{'\n'}pour voir vos statistiques ici.</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setActiveTab('create')}>
                <Text style={s.emptyBtnTxt}>Créer une campagne</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Les compteurs viennent tels quels de `/api/ads/targeted/me`. Ils
               étaient lus sous d'anciens noms (`text_content`, et des vues qui
               n'existaient plus sous ce nom) : d'où les « undefined » affichés
               à la place des chiffres, et une progression à NaN. */
            myAds.map((ad) => {
              const views = Number(ad.current_views) || 0;
              const target = Number(ad.max_views) || 0;
              const clicks = Number(ad.clicks) || 0;
              // Sans objectif connu, pas de barre plutôt qu'une barre fausse.
              const progress = target > 0 ? Math.min(100, (views / target) * 100) : null;
              const ctr = Number(ad.ctr ?? (views > 0 ? (clicks / views) * 100 : 0));
              const isActive = ad.status === 'active';
              const isProfile = ad.target_type === 'profile';
              return (
                <View key={String(ad.id)} style={s.adCard}>
                  <View style={s.adHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.adId} numberOfLines={1}>{ad.title || 'Campagne'}</Text>
                      {!!ad.target_label && (
                        <Text style={s.adPreview} numberOfLines={1}>
                          {isProfile ? ad.target_label : `« ${ad.target_label} »`}
                        </Text>
                      )}
                    </View>
                    <View style={[s.statusPill, { backgroundColor: isActive ? C.greenDim : C.white6, borderColor: isActive ? withAlpha(colors.success, 0.3) : C.border }]}>
                      <View style={[s.statusDot, { backgroundColor: isActive ? C.green : C.t3 }]} />
                      <Text style={[s.statusTxt, { color: isActive ? C.green : C.t3 }]}>{isActive ? 'Active' : 'Terminée'}</Text>
                    </View>
                  </View>

                  <View style={s.redirectTag}>
                    <Ionicons name={isProfile ? 'person-outline' : 'chatbubble-ellipses-outline'} size={12} color={C.accent} />
                    <Text style={s.redirectTagTxt}>
                      {isProfile ? 'Compte promu' : 'Tweet promu'}
                      {ad.target_author && !isProfile ? ` · @${ad.target_author}` : ''}
                    </Text>
                  </View>

                  <View style={s.statsRow}>
                    <StatCell
                      icon="eye-outline"
                      label="VUES"
                      value={target > 0 ? `${views.toLocaleString()} / ${target.toLocaleString()}` : views.toLocaleString()}
                      color={C.accent}
                    />
                    <View style={s.statDiv} />
                    <StatCell icon="hand-left-outline" label="CLICS" value={clicks.toLocaleString()} color={C.amber} />
                    <View style={s.statDiv} />
                    <StatCell icon="pulse-outline" label="CTR" value={`${ctr.toFixed(1)}%`} color={C.green} />
                  </View>

                  <View style={s.spendRow}>
                    <Text style={s.spendTxt}>
                      {(Number(ad.spent) || 0).toFixed(2)} NF dépensés sur {(Number(ad.budget) || 0).toFixed(2)} NF
                    </Text>
                  </View>

                  {isActive && progress !== null && (
                    <View style={{ marginTop: 18 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ fontSize: 12, color: C.t3, fontWeight: '600' }}>Progression</Text>
                        <Text style={{ fontSize: 12, color: C.t2, fontWeight: '700' }}>{progress.toFixed(0)}%</Text>
                      </View>
                      <View style={s.progressBg}>
                        <View style={[s.progressFill, { width: `${progress}%` as any, backgroundColor: colors.accent }]} />
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {renderSearchModal()}
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18,
  },
  back: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: C.white6, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 24, fontWeight: '800', fontFamily: fonts.bold, color: C.t1, marginLeft: 16, letterSpacing: -0.3 },
  wallet: { alignItems: 'flex-end' },
  walletLabel: { fontSize: 10, color: C.t3, fontWeight: '600', fontFamily: fonts.semibold, letterSpacing: 0.8, marginBottom: 2 },
  walletAmt: { fontSize: 18, fontWeight: '800', fontFamily: fonts.bold, color: C.t1 },

  tabs: {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 22,
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, padding: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, gap: 8,
  },
  tabOn: { backgroundColor: C.accentDim },
  tabTxt: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold, color: C.t3 },
  tabTxtOn: { color: C.accent, fontWeight: '700' },

  page: { paddingHorizontal: 20, paddingBottom: 60 },

  step: { fontSize: 19, fontWeight: '800', fontFamily: fonts.bold, color: C.t1, marginBottom: 16, marginTop: 8, letterSpacing: -0.2 },
  stepOpt: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium, color: C.t3 },
  segDesc: { fontSize: 14, color: C.t3, marginBottom: 18, lineHeight: 21 },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 15, borderRadius: 14, marginBottom: 24, borderWidth: 1,
  },
  bannerBlue: { backgroundColor: C.accentDim, borderColor: withAlpha(colors.accent, 0.3) },
  bannerRed: { backgroundColor: C.redDim, borderColor: withAlpha(colors.red, 0.3) },
  bannerTxt: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold, flex: 1, lineHeight: 20 },

  redirectPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.border,
    padding: 18, marginBottom: 24,
  },
  redirectPickerTxt: { flex: 1, fontSize: 15, color: C.t2 },
  redirectCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: withAlpha(colors.accent, 0.3),
    padding: 16, marginBottom: 24,
  },
  redirectIco: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  redirectKind: { fontSize: 11, fontWeight: '700', fontFamily: fonts.bold, color: C.t3, letterSpacing: 0.5, marginBottom: 3 },
  redirectLbl: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semibold, color: C.t1 },
  ghostBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.white6,
  },
  ghostBtnTxt: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, color: C.t2 },
  ghostBtnDanger: { borderColor: withAlpha(colors.red, 0.3), backgroundColor: C.redDim },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: C.accentDim },
  badgeTxt: { fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, color: C.accent },

  catBlock: { marginBottom: 22 },
  catLabel: { fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, color: C.t3, letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' },
  catDesc: { fontSize: 12, color: C.t3, marginBottom: 10, lineHeight: 17 },
  spendRow: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border },
  spendTxt: { fontSize: 12, color: C.t3, fontWeight: '600', fontFamily: fonts.semibold },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  chipOn: { backgroundColor: C.accentDim, borderColor: withAlpha(colors.accent, 0.4) },
  chipTxt: { fontSize: 14, color: C.t2, fontWeight: '500' },
  chipTxtOn: { color: C.t1, fontWeight: '700' },
  chipCount: { fontSize: 11, color: C.t3 },

  submitWrap: {
    marginTop: 32, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 19, gap: 10,
    backgroundColor: colors.accent,
    ...glow(colors.accent, 16),
  },
  submitTxt: { fontSize: 17, fontFamily: fonts.bold, color: colors.white, letterSpacing: 0.2 },

  empty: { alignItems: 'center', paddingTop: 70, gap: 14 },
  emptyIco: { width: 76, height: 76, borderRadius: 24, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 21, fontWeight: '800', fontFamily: fonts.bold, color: C.t1 },
  emptySub: { fontSize: 14, color: C.t3, textAlign: 'center', lineHeight: 22 },
  emptyBtn: {
    marginTop: 8, paddingHorizontal: 26, paddingVertical: 14,
    backgroundColor: C.accentDim, borderRadius: 14, borderWidth: 1, borderColor: withAlpha(colors.accent, 0.3),
  },
  emptyBtnTxt: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: C.accent },

  adCard: {
    backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border,
    padding: 20, marginBottom: 16,
  },
  adHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  adId: { fontSize: 17, fontWeight: '800', fontFamily: fonts.bold, color: C.t1, marginBottom: 4 },
  adPreview: { fontSize: 13, color: C.t3, fontStyle: 'italic' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontWeight: '700' },

  redirectTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.accentDim, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 16,
  },
  redirectTagTxt: { color: C.accent, fontSize: 12, fontWeight: '500' },

  statsRow: { flexDirection: 'row', paddingVertical: 6 },
  statDiv: { width: 1, backgroundColor: C.border, marginHorizontal: 4 },

  progressBg: { height: 5, backgroundColor: C.white6, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 4 },

  // Modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border,
    paddingHorizontal: 20, paddingBottom: 36,
    maxHeight: '88%', flex: 1, marginTop: '12%',
  },
  modalDrag: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.t3, alignSelf: 'center', marginTop: 14, marginBottom: 22 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  modalTitle: { fontSize: 21, fontWeight: '800', fontFamily: fonts.bold, color: C.t1 },
  modalSub: { fontSize: 13, color: C.t3, marginTop: 4 },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.white6, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },

  typeTabs: {
    flexDirection: 'row', backgroundColor: C.surface,
    borderRadius: 14, padding: 4, marginBottom: 16,
    borderWidth: 1, borderColor: C.border,
  },
  typeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 6 },
  typeTabOn: { backgroundColor: C.accentDim },
  typeTabTxt: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, color: C.t3 },
  typeTabTxtOn: { color: C.accent },

  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 12, marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 16, color: C.t1, fontWeight: '500' },

  groupLabel: { fontSize: 11, fontWeight: '700', fontFamily: fonts.bold, color: C.t3, letterSpacing: 1.2, marginBottom: 8, marginTop: 6 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  avatarFallback: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  resultName: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semibold, color: C.t1, marginBottom: 2 },
  resultSub: { fontSize: 12, color: C.t3 },
});