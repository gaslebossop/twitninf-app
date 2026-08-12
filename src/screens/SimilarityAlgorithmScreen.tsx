import { fonts , colors} from '../theme';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  SafeAreaView,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { apiService } from '../services/api';
import type { User } from '../types/api';
import { BackButton } from '../components/ui';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';

type AlgoConfig = {
  weights: Record<string, number>;
  coldStartWeights: Record<string, number>;
  interactionWeights: Record<string, number>;
  similarUsersK: number;
  discoveryWindowH: number;
  discoveryMinRatio: number;
  collabTweetLimit: number;
  freshnessHalfLifeH: number;
  trendingCacheTtlMs: number;
  velocityHighThreshold: number;
  velocityMidThreshold: number;
  maxSameAuthorWindow: number;
  authorDiversityWindow: number;
  adIntensityPct: number;
};

const defaultConfig = (): AlgoConfig => ({
  weights: { CONTENT: 0.25, COLLAB: 0.2, FOLLOW: 0.15, TRENDING: 0.12, FRESHNESS: 0.13, DISCOVERY: 0.1, LANGUAGE: 0.05 },
  coldStartWeights: { LIKES: 0.4, TRENDING: 0.15, POPULARITY: 0.15, FRESHNESS: 0.1, DIVERSITY: 0.1, LANGUAGE: 0.1 },
  interactionWeights: { post: 3, comment: 2.5, quote: 2, retweet: 1.5, like: 1 },
  similarUsersK: 50,
  discoveryWindowH: 72,
  discoveryMinRatio: 0.12,
  collabTweetLimit: 300,
  freshnessHalfLifeH: 18,
  trendingCacheTtlMs: 180000,
  velocityHighThreshold: 2,
  velocityMidThreshold: 0.5,
  maxSameAuthorWindow: 3,
  authorDiversityWindow: 15,
  adIntensityPct: 100,
});

/** Textes courts : une ligne chacun */
const HELP_WEIGHTS: Record<string, string> = {
  CONTENT: 'À quel point le sujet du tweet colle aux centres d’intérêt de la personne qui scroll.',
  COLLAB: 'Tweets aimés par des profils aux goûts proches (effet « les autres comme moi »).',
  FOLLOW: 'Combien on met en avant les gens que l’utilisateur suit.',
  TRENDING: 'Combien on met en avant ce qui buzz (likes / heure).',
  FRESHNESS: 'Combien on privilégie le récent par rapport à l’ancien.',
  DISCOVERY: 'Combien on laisse une place aux tweets peu vus (nouveaux comptes).',
  LANGUAGE: 'Combien on filtre sur la même langue que l’utilisateur.',
};

const HELP_COLD: Record<string, string> = {
  LIKES: 'Pour un tout nouveau compte : poids des tweets déjà populaires (likes).',
  TRENDING: 'Part « buzz » dans le mélange quand il n’y a pas encore d’historique.',
  POPULARITY: 'Part réservée aux auteurs déjà suivis / connus.',
  FRESHNESS: 'Importance du récent pour les nouveaux comptes.',
  DIVERSITY: 'Évite d’enchaîner les mêmes thèmes au début.',
  LANGUAGE: 'Même idée que « langue » sur le fil principal.',
};

const HELP_INTERACTION: Record<string, string> = {
  post: 'À quel point publier un tweet met à jour ses goûts.',
  comment: 'Idem pour un commentaire (souvent plus fort qu’un like).',
  quote: 'Idem pour un quote.',
  retweet: 'Idem pour un retweet.',
  like: 'Idem pour un like.',
};

const HELP_NUM: Partial<Record<keyof AlgoConfig, string>> = {
  similarUsersK: 'Nombre de « voisins » goûts utilisés pour le collab.',
  discoveryWindowH: 'Âge max (heures) pour qu’un tweet compte en « découverte ».',
  discoveryMinRatio: 'Part minimum de tweets « découverte » dans le mélange.',
  collabTweetLimit: 'Nombre max de tweets collab à scorer (perf).',
  freshnessHalfLifeH: 'Après combien d’heures un tweet « vieillit » fortement dans le score.',
  trendingCacheTtlMs: 'Durée du cache « trending » côté serveur.',
  velocityHighThreshold: 'À partir de quelle vélocité un tweet est vu comme très hot.',
  velocityMidThreshold: 'Seuil intermédiaire pour le score trending.',
  maxSameAuthorWindow: 'Combien de tweets du même auteur d’affilée avant pénalité.',
  authorDiversityWindow: 'Taille de la fenêtre pour cette règle d’enchaînement.',
  adIntensityPct: 'Intensité pubs dans le fil « Pour vous » (100 % = niveau standard, 500 % = 5x).',
};

type TabId = 'moteur' | 'visibilite';

type LookupUser = {
  id: string;
  username: string;
  full_name?: string | null;
  algorithmic_visibility_multiplier: number;
};

type HashtagRule = {
  id: string;
  tag_normalized: string;
  multiplier: number;
  note?: string | null;
};

function stripAt(s: string) {
  return s.trim().replace(/^@+/u, '');
}

/** Affichage d’une règle hashtag (multiplicateur serveur = % / 100) */
function formatHashtagRuleLine(mult: number): string {
  const p = Math.round(mult * 100);
  if (Math.abs(mult - 1) < 0.005) return 'Neutre (100 %)';
  if (mult < 1) return `Pénalité · ${p} % du score habituel`;
  return `Boost · ${p} % du score (×${mult.toFixed(2)})`;
}

const HASHTAG_STRENGTH_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300, 400, 500] as const;
/** Comptes : même échelle que les hashtags (0–500 %, 100 % = normal) */
const ACCOUNT_STRENGTH_PRESETS = [0, 10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 500] as const;

export default function SimilarityAlgorithmScreen() {
  const navigation = useNavigation();
  const { isSuperAdmin, loading: permLoading } = useAdminPermissions();
  const canEditEngine = isSuperAdmin;
  const [tab, setTab] = useState<TabId>('moteur');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [config, setConfig] = useState<AlgoConfig>(defaultConfig);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [visLoading, setVisLoading] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [rules, setRules] = useState<HashtagRule[]>([]);

  /** Pseudo sans @ (le @ est affiché à gauche du champ) */
  const [userSearch, setUserSearch] = useState('');
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [lookupUser, setLookupUser] = useState<LookupUser | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<User | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  /** 0–500 % : poids auteur dans le fil (100 % = normal, 500 % = ×5) */
  const [userPct, setUserPct] = useState(100);

  const [tagNew, setTagNew] = useState('');
  /** 1–500 % du score : 100 = neutre ; moins = pénalité ; jusqu’à 500 % = boost ×5 */
  const [hashtagStrengthPct, setHashtagStrengthPct] = useState(100);
  const [noteNew, setNoteNew] = useState('');
  const [rulesBusy, setRulesBusy] = useState(false);

  const loadAlgo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.getSimilarityAlgorithmAdmin();
      if (res.success && (res as any).data?.config) {
        const d = defaultConfig();
        const c = (res as any).data.config;
        setConfig({
          ...d,
          ...c,
          weights: { ...d.weights, ...c.weights },
          coldStartWeights: { ...d.coldStartWeights, ...c.coldStartWeights },
          interactionWeights: { ...d.interactionWeights, ...c.interactionWeights },
        });
        setStats((res as any).data.stats);
        setDrafts({});
      } else {
        toast.error((res as any).message || 'Impossible de charger la configuration');
      }
    } catch {
      toast.error('Connexion impossible');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVisibility = useCallback(async () => {
    setVisLoading(true);
    try {
      const [ov, tags] = await Promise.all([apiService.getShadowbanOverview(), apiService.shadowbanListHashtags()]);
      if (ov.success && (ov as any).data) setOverview((ov as any).data);
      if (tags.success && (tags as any).data) setRules((tags as any).data as HashtagRule[]);
    } catch {
      toast.error('Connexion impossible (visibilité)');
    } finally {
      setVisLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permLoading) return;
    if (canEditEngine) {
      loadAlgo();
    } else {
      setLoading(false);
      setTab('visibilite');
    }
  }, [loadAlgo, permLoading, canEditEngine]);

  useEffect(() => {
    if (tab === 'visibilite') loadVisibility();
  }, [tab, loadVisibility]);

  useEffect(() => {
    const q = stripAt(userSearch);
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const res = await apiService.searchUsers({ q, limit: 8 });
        if (res.success && (res as any).data?.users) {
          setSuggestions((res as any).data.users as User[]);
        } else {
          setSuggestions([]);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [userSearch]);

  const applyLookup = async (username: string, preview?: User | null) => {
    const u = stripAt(username);
    if (!u) return;
    setLookupBusy(true);
    setSelectedPreview(preview || null);
    try {
      const res = await apiService.shadowbanLookupUser(u);
      if (res.success && (res as any).data) {
        const d = (res as any).data as LookupUser;
        setLookupUser(d);
        const m = Number(d.algorithmic_visibility_multiplier);
        const pct = Number.isFinite(m) ? Math.round(Math.max(0, Math.min(5, m)) * 100) : 100;
        setUserPct(pct);
        setUserSearch(d.username);
        setSuggestions([]);
      } else {
        setLookupUser(null);
        setSelectedPreview(null);
        toast.error('Introuvable', {
          description: (res as any).message || 'Aucun compte avec ce pseudo.',
        });
      }
    } catch {
      toast.error('Connexion impossible');
    } finally {
      setLookupBusy(false);
    }
  };

  const saveUserVisibility = async () => {
    if (!lookupUser) return;
    const mult = Math.max(0, Math.min(5, userPct / 100));
    const res = await apiService.shadowbanSetUserVisibility(lookupUser.id, mult);
    if (res.success) {
      toast.success('Enregistré', {
        description: `@${lookupUser.username} : ${userPct} % de visibilité dans le fil auto.`,
      });
      loadVisibility();
    } else {
      toast.error((res as any).message || 'Échec');
    }
  };

  const addHashtagRule = async () => {
    const raw = stripAt(tagNew).replace(/^#+/u, '');
    if (!raw) {
      toast.info('Hashtag', {
        description: 'Indique un mot-clé (ex. actualite).',
      });
      return;
    }
    const mult = Math.max(0.01, Math.min(5, hashtagStrengthPct / 100));
    setRulesBusy(true);
    try {
      const res = await apiService.shadowbanUpsertHashtag({
        tag: raw,
        multiplier: mult,
        note: noteNew.trim() || undefined,
      });
      if (res.success) {
        setTagNew('');
        setNoteNew('');
        setHashtagStrengthPct(100);
        await loadVisibility();
      } else {
        toast.error((res as any).message || 'Échec');
      }
    } finally {
      setRulesBusy(false);
    }
  };

  const deleteRule = (id: string, tag: string) => {
    confirmAsync({
      title: 'Supprimer ?',
      message: `#${tag}`,
      confirmLabel: 'Supprimer',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
          const res = await apiService.shadowbanDeleteHashtag(id);
          if (res.success) await loadVisibility();
          else toast.error((res as any).message);
        })();
    });
  };

  const refreshAll = () => {
    if (canEditEngine) loadAlgo();
    if (tab === 'visibilite' || !canEditEngine) loadVisibility();
  };

  const wkey = (section: string, k: string) => `${section}:${k}`;
  const nkey = (k: string) => `num:${k}`;

  const commitWeight = (section: 'weights' | 'coldStartWeights' | 'interactionWeights', k: string) => {
    const key = wkey(section, k);
    const raw = drafts[key];
    setDrafts((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
    if (raw === undefined) return;
    const t = raw.replace(',', '.').trim();
    if (t === '') return;
    const num = parseFloat(t);
    if (!Number.isFinite(num)) return;
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], [k]: num },
    }));
  };

  const commitNum = (field: keyof AlgoConfig, intOnly?: boolean) => {
    const key = nkey(field);
    const raw = drafts[key];
    setDrafts((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
    if (raw === undefined) return;
    const t = raw.replace(',', '.').trim();
    if (t === '') return;
    const num = intOnly ? parseInt(t, 10) : parseFloat(t);
    if (!Number.isFinite(num)) return;
    setConfig((prev) => ({ ...prev, [field]: num } as AlgoConfig));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiService.updateSimilarityAlgorithmAdmin(config as any);
      if (res.success) {
        toast.success('Enregistré', {
          description: 'Les paramètres du moteur ont été mis à jour.',
        });
        await loadAlgo();
      } else {
        toast.error((res as any).message || 'Échec de la sauvegarde');
      }
    } catch {
      toast.error('Connexion impossible');
    } finally {
      setSaving(false);
    }
  };

  const rowWeight = (
    section: 'weights' | 'coldStartWeights' | 'interactionWeights',
    k: string,
    help: string | undefined,
    short?: string
  ) => {
    const key = wkey(section, k);
    const v = config[section][k];
    const display = drafts[key] !== undefined ? drafts[key]! : String(v);
    return (
      <View style={styles.fieldRow} key={key}>
        <View style={styles.fieldLabelWrap}>
          <Text style={styles.fieldLabel}>{k}</Text>
          {short ? <Text style={styles.fieldShort}>{short}</Text> : null}
          {help ? <Text style={styles.fieldHint}>{help}</Text> : null}
        </View>
        <TextInput
          style={styles.input}
          value={display}
          onChangeText={(t) => setDrafts((prev) => ({ ...prev, [key]: t }))}
          onBlur={() => commitWeight(section, k)}
          keyboardType="decimal-pad"
          placeholderTextColor="#5b6f83"
        />
      </View>
    );
  };

  const rowNum = (field: keyof AlgoConfig, intOnly?: boolean, short?: string) => {
    const key = nkey(field);
    const v = config[field] as number;
    const display = drafts[key] !== undefined ? drafts[key]! : String(v);
    const help = HELP_NUM[field];
    return (
      <View style={styles.fieldRow} key={field}>
        <View style={styles.fieldLabelWrap}>
          <Text style={styles.fieldLabel}>{field}</Text>
          {short ? <Text style={styles.fieldShort}>{short}</Text> : null}
          {help ? <Text style={styles.fieldHint}>{help}</Text> : null}
        </View>
        <TextInput
          style={styles.input}
          value={display}
          onChangeText={(t) => setDrafts((prev) => ({ ...prev, [key]: t }))}
          onBlur={() => commitNum(field, intOnly)}
          keyboardType="decimal-pad"
          placeholderTextColor="#5b6f83"
        />
      </View>
    );
  };

  if (permLoading || (canEditEngine && loading)) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#4F7CFF" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#0B0C0F', '#12122a']} style={StyleSheet.absoluteFillObject} />
      <View style={styles.header}>
        <BackButton navigation={navigation} />
        <Text style={styles.title}>{canEditEngine ? 'Fil « Pour vous »' : 'Visibilité du fil'}</Text>
        <TouchableOpacity onPress={refreshAll} style={styles.iconBtn}>
          <Ionicons name="refresh" size={22} color="#4F7CFF" />
        </TouchableOpacity>
      </View>

      {canEditEngine ? (
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, tab === 'moteur' && styles.tabActive]}
            onPress={() => setTab('moteur')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === 'moteur' && styles.tabTextActive]}>Formules</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'visibilite' && styles.tabActive]}
            onPress={() => setTab('visibilite')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, tab === 'visibilite' && styles.tabTextActive]}>Visibilité</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {canEditEngine && tab === 'moteur' ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {stats && (
            <View style={styles.statsBox}>
              <Text style={styles.statsText}>
                Vecteurs tweets : {stats.sizes?.tweetVectors ?? '—'} · users : {stats.sizes?.userVectors ?? '—'} · meta :{' '}
                {stats.sizes?.tweetMeta ?? '—'}
              </Text>
              <Text style={styles.statsSub}>
                Recos servies : {stats.stats?.totalRecommendations ?? 0} · cold start : {stats.stats?.coldStartServed ?? 0}
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Poids du fil</Text>
          <Text style={styles.sectionBlurb}>Plus un poids est grand, plus ce critère compte dans le score final.</Text>
          {Object.keys(config.weights).map((k) => rowWeight('weights', k, HELP_WEIGHTS[k]))}

          <Text style={styles.sectionTitle}>Nouveaux comptes (cold start)</Text>
          <Text style={styles.sectionBlurb}>Utilisé quand il manque d’historique pour deviner les goûts.</Text>
          {Object.keys(config.coldStartWeights).map((k) => rowWeight('coldStartWeights', k, HELP_COLD[k]))}

          <Text style={styles.sectionTitle}>Interactions → profil de goûts</Text>
          <Text style={styles.sectionBlurb}>Chaque action met à jour le profil ; plus le chiffre est haut, plus l’action compte.</Text>
          {Object.keys(config.interactionWeights).map((k) => rowWeight('interactionWeights', k, HELP_INTERACTION[k]))}

          <Text style={styles.sectionTitle}>Autres réglages</Text>
          {rowNum('similarUsersK', true)}
          {rowNum('discoveryWindowH', true)}
          {rowNum('discoveryMinRatio', false)}
          {rowNum('collabTweetLimit', true)}
          {rowNum('freshnessHalfLifeH', true)}
          {rowNum('trendingCacheTtlMs', true)}
          {rowNum('velocityHighThreshold')}
          {rowNum('velocityMidThreshold')}
          {rowNum('maxSameAuthorWindow', true)}
          {rowNum('authorDiversityWindow', true)}
          {rowNum('adIntensityPct', true)}

          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Enregistrer les formules</Text>}
          </TouchableOpacity>
          <Text style={styles.footerNote}>
            Superadmin. Valide chaque champ (clic hors champ) avant d’enregistrer si tu étais encore en train de taper.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!canEditEngine ? (
            <Text style={styles.adminOnlyNote}>Réservé aux super-admins : onglet formules du moteur. Ici : visibilité des comptes et hashtags.</Text>
          ) : null}
          {visLoading && !overview ? (
            <ActivityIndicator color="#4F7CFF" style={{ marginVertical: 24 }} />
          ) : null}

          {overview && (
            <View style={styles.statsBox}>
              <Text style={styles.statsText}>
                Comptes modifiés : {overview.usersWithNonDefaultMultiplier ?? '—'} · règles # : {overview.hashtagRuleRows ?? '—'}
              </Text>
            </View>
          )}

          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={22} color="#38bdf8" style={{ marginRight: 10 }} />
            <Text style={styles.infoCardText}>
              Règle le <Text style={styles.bold}>poids de ce compte dans le fil auto</Text> (reco « Pour vous ») : moins de 100 % = moins mis en
              avant, plus de 100 % = boost (jusqu’à 500 %). Le profil et les recherches ne changent pas. Tape le pseudo ou choisis dans la liste.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Compte</Text>
          <View style={styles.atRow}>
            <Text style={styles.atPrefix}>@</Text>
            <TextInput
              style={[styles.input, styles.inputAt]}
              value={userSearch}
              onChangeText={(t) => {
                const s = stripAt(t);
                setUserSearch(s);
                if (lookupUser && s !== lookupUser.username) {
                  setLookupUser(null);
                  setSelectedPreview(null);
                }
              }}
              placeholder="pseudo"
              placeholderTextColor="#5b6f83"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
            />
            <TouchableOpacity
              style={styles.goBtn}
              onPress={() => applyLookup(userSearch)}
              disabled={lookupBusy || stripAt(userSearch).length < 2}
            >
              {lookupBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.goBtnText}>OK</Text>}
            </TouchableOpacity>
          </View>
          {suggestLoading ? (
            <Text style={styles.hintMuted}>Recherche…</Text>
          ) : null}
          {suggestions.length > 0 && (!lookupUser || stripAt(userSearch) !== lookupUser.username) ? (
            <View style={styles.suggestBox}>
              {suggestions.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.suggestRow}
                  onPress={() => applyLookup(u.username, u)}
                  activeOpacity={0.7}
                >
                  {u.avatar ? (
                    <Image source={{ uri: u.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPh]}>
                      <Ionicons name="person" size={18} color="#8892a0" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestName}>@{u.username}</Text>
                    {u.full_name ? <Text style={styles.suggestSub}>{u.full_name}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#5b6f83" />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {lookupUser && (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                {selectedPreview?.avatar ? (
                  <Image source={{ uri: selectedPreview.avatar }} style={styles.avatarLg} />
                ) : (
                  <View style={[styles.avatarLg, styles.avatarPh]}>
                    <Ionicons name="person" size={28} color="#8892a0" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>@{lookupUser.username}</Text>
                  {lookupUser.full_name ? <Text style={styles.cardSub}>{lookupUser.full_name}</Text> : null}
                </View>
              </View>

              <Text style={styles.visLabel}>Poids dans le fil auto (tweets de ce compte)</Text>
              <Text style={styles.visBig}>{userPct} %</Text>
              <Text style={styles.hintMuted}>100 % = normal · 0 % = quasi absent · 500 % = boost max (×5)</Text>

              <Text style={styles.miniLabel}>Raccourcis</Text>
              <View style={[styles.presetRow, styles.hashtagPresetWrap]}>
                {ACCOUNT_STRENGTH_PRESETS.map((pct) => (
                  <TouchableOpacity
                    key={`u-${pct}`}
                    style={[styles.presetChip, styles.hashtagPresetChip, userPct === pct && styles.presetChipOn]}
                    onPress={() => setUserPct(pct)}
                  >
                    <Text style={[styles.presetChipText, userPct === pct && styles.presetChipTextOn]}>{pct} %</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.miniLabel, { marginTop: 10 }]}>Valeur précise (0 à 500)</Text>
              <TextInput
                style={styles.input}
                value={String(userPct)}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/\D/g, ''), 10);
                  if (t === '' || t === '-') return;
                  if (Number.isFinite(n)) setUserPct(Math.max(0, Math.min(500, n)));
                }}
                keyboardType="number-pad"
                placeholderTextColor="#5b6f83"
              />

              <TouchableOpacity style={styles.saveBtn} onPress={saveUserVisibility}>
                <Text style={styles.saveText}>Enregistrer pour @{lookupUser.username}</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Hashtags</Text>
          <Text style={styles.sectionBlurb}>
            Même réglage pour tous les tweets qui contiennent ce mot-clé. 100 % = aucun changement. En dessous = moins dans le fil. Au-dessus =
            boost, jusqu’à 500 % (cinq fois plus de « poids » dans le classement).
          </Text>

          <View style={styles.atRow}>
            <Text style={styles.atPrefix}>#</Text>
            <TextInput
              style={[styles.input, styles.inputAt]}
              value={tagNew}
              onChangeText={setTagNew}
              placeholder="ex. actualite"
              placeholderTextColor="#5b6f83"
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.miniLabel}>Puissance (1 % à 500 %)</Text>
          <View style={[styles.presetRow, styles.hashtagPresetWrap]}>
            {HASHTAG_STRENGTH_PRESETS.map((pct) => (
              <TouchableOpacity
                key={pct}
                style={[styles.presetChip, styles.hashtagPresetChip, hashtagStrengthPct === pct && styles.presetChipOn]}
                onPress={() => setHashtagStrengthPct(pct)}
              >
                <Text style={[styles.presetChipText, hashtagStrengthPct === pct && styles.presetChipTextOn]}>{pct} %</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hintMuted}>100 % = neutre · 500 % = boost max (×5)</Text>
          <Text style={[styles.miniLabel, { marginTop: 10 }]}>Valeur précise</Text>
          <TextInput
            style={styles.input}
            value={String(hashtagStrengthPct)}
            onChangeText={(t) => {
              const n = parseInt(t.replace(/\D/g, ''), 10);
              if (t === '') return;
              if (Number.isFinite(n)) setHashtagStrengthPct(Math.max(1, Math.min(500, n)));
            }}
            keyboardType="number-pad"
            placeholderTextColor="#5b6f83"
          />
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={noteNew}
            onChangeText={setNoteNew}
            placeholder="Note interne (optionnel)"
            placeholderTextColor="#5b6f83"
          />
          <TouchableOpacity style={[styles.saveBtn, rulesBusy && styles.saveBtnDisabled]} onPress={addHashtagRule} disabled={rulesBusy}>
            {rulesBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Ajouter ou mettre à jour</Text>}
          </TouchableOpacity>

          {rules.map((r) => (
            <View key={r.id} style={styles.ruleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ruleTag}>#{r.tag_normalized}</Text>
                <Text style={styles.ruleMeta}>
                  {formatHashtagRuleLine(r.multiplier)}
                  {r.note ? ` · ${r.note}` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => deleteRule(r.id, r.tag_normalized)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="trash-outline" size={22} color="#f4212e" />
              </TouchableOpacity>
            </View>
          ))}

          <Text style={styles.footerNote}>Admins : les changements s’appliquent tout de suite côté moteur.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.overlayMedium,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.overlayMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: colors.overlaySoft,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: 'rgba(0,212,255,0.18)',
  },
  tabText: { color: '#8892a0', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#e7e9ea' },
  scroll: { padding: 16, paddingBottom: 40 },
  statsBox: {
    backgroundColor: 'rgba(0,212,255,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.2)',
  },
  statsText: { color: '#e7e9ea', fontSize: 13 },
  statsSub: { color: '#8892a0', fontSize: 12, marginTop: 6 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
  },
  infoCardText: { flex: 1, color: '#c8e7f5', fontSize: 13, lineHeight: 19 },
  bold: { fontWeight: '700', fontFamily: fonts.bold, color: '#fff' },
  sectionTitle: { color: '#4F7CFF', fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, marginTop: 16, marginBottom: 8 },
  sectionBlurb: { color: '#8892a0', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  fieldRow: { marginBottom: 12 },
  fieldLabelWrap: { marginBottom: 4 },
  fieldLabel: { color: '#c8d1dc', fontSize: 13, fontWeight: '600' },
  fieldShort: { color: '#6b7c8f', fontSize: 11, marginTop: 2 },
  fieldHint: { color: '#5b6f83', fontSize: 11, marginTop: 4, lineHeight: 15 },
  input: {
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    color: '#fff',
    fontSize: 15,
  },
  atRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  atPrefix: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#4F7CFF',
    width: 28,
    textAlign: 'center',
  },
  inputAt: { flex: 1 },
  goBtn: {
    backgroundColor: '#4F7CFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBtnText: { color: '#fff', fontWeight: '700' },
  hintMuted: { color: '#6b7c8f', fontSize: 12, marginBottom: 8 },
  suggestBox: {
    borderWidth: 1,
    borderColor: colors.overlayMedium,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.overlayMedium,
    backgroundColor: colors.overlaySoft,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  avatarPh: {
    backgroundColor: colors.overlayMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLg: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
  suggestName: { color: '#e7e9ea', fontSize: 15, fontWeight: '600' },
  suggestSub: { color: '#8892a0', fontSize: 13, marginTop: 2 },
  card: {
    backgroundColor: colors.overlayMedium,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cardSub: { color: '#8892a0', fontSize: 14, marginTop: 2 },
  visLabel: { color: '#8892a0', fontSize: 13, marginTop: 4 },
  visBig: { color: '#4F7CFF', fontSize: 36, fontWeight: '800', fontFamily: fonts.bold, marginVertical: 6 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  hashtagPresetWrap: { marginTop: 4, marginBottom: 2 },
  hashtagPresetChip: { paddingHorizontal: 10, paddingVertical: 7 },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.overlayMedium,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  presetChipOn: {
    backgroundColor: 'rgba(29,155,240,0.35)',
    borderColor: '#4F7CFF',
  },
  presetChipText: { color: '#c8d1dc', fontSize: 13, fontWeight: '600' },
  presetChipTextOn: { color: '#fff' },
  miniLabel: { color: '#8892a0', fontSize: 12, marginBottom: 6, marginTop: 4 },
  saveBtn: {
    marginTop: 14,
    backgroundColor: '#4F7CFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontWeight: '700', fontFamily: fonts.bold, fontSize: 16 },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.overlayMedium,
  },
  ruleTag: { color: '#e7e9ea', fontSize: 15, fontWeight: '600' },
  ruleMeta: { color: '#8892a0', fontSize: 12, marginTop: 4 },
  footerNote: { color: '#5b6f83', fontSize: 11, marginTop: 14, textAlign: 'center', lineHeight: 16 },
  adminOnlyNote: {
    color: '#8892a0',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
    padding: 10,
    backgroundColor: colors.overlayMedium,
    borderRadius: 10,
  },
});
