/**
 * 🚩 Drapeaux de fonctionnalité — écran d'administration.
 *
 * ── Parti pris ──
 * Une première version de cet écran exposait le modèle complet du serveur :
 * un constructeur de conditions (attribut / opérateur / valeur), les
 * variantes, le sel, l'unité de tirage. C'était fidèle et inutilisable. Le
 * serveur reste aussi riche ; l'écran, lui, ne montre plus que les quatre
 * décisions qu'on prend réellement en déployant :
 *
 *   1. C'est allumé ou éteint ?
 *   2. Pour qui ?        → une liste d'audiences prêtes, pas un formulaire.
 *   3. Pour combien ?    → un palier.
 *   4. Qui voit toujours ? → les testeurs.
 *
 * Les ciblages plus fins restent possibles par l'API. Quand l'écran en
 * rencontre un qu'il ne sait pas représenter, il le dit et **verrouille** le
 * bloc concerné plutôt que de l'écraser avec sa vision simplifiée.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '../theme';
import { Header, Tappable, EmptyState, ErrorState, HowItWorks } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import { promptAsync } from '../components/ui/PromptSheet';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { featureFlagService } from '../services/featureFlagService';
import type { FeatureFlag, FlagCondition, FlagRule } from '../types/featureFlag';

/** Paliers proposés. Les petits d'abord : c'est là qu'on passe du temps. */
const STEPS = [0, 1, 5, 10, 25, 50, 100];

/**
 * Rythmes de montée automatique. Volontairement peu nombreux : le choix utile
 * est « combien de temps j'observe avant d'élargir », pas une durée au réglage
 * fin. L'échelle parcourue est celle des paliers ci-dessus.
 */
const INTERVALS = [
  { minutes: 60, label: 'Toutes les heures' },
  { minutes: 60 * 6, label: 'Toutes les 6 heures' },
  { minutes: 60 * 24, label: 'Chaque jour' },
  { minutes: 60 * 24 * 3, label: 'Tous les 3 jours' },
];

/** Pourquoi une montée s'est arrêtée. Miroir de `featureFlagAutoRollout`. */
const HALTS: Record<string, string> = {
  flag_off: 'la fonctionnalité a été éteinte',
  manual_override: 'le palier a été changé à la main',
  targeting_changed: 'le ciblage a été découpé en plusieurs segments',
  archived: 'la fonctionnalité a été archivée',
};

/**
 * Audiences prêtes à l'emploi. Chacune se traduit en un segment côté serveur —
 * l'écran ne fait que masquer la syntaxe, il n'invente pas de mécanisme.
 */
const AUDIENCES: Array<{ id: string; label: string; hint?: string; conditions: FlagCondition[] }> = [
  { id: 'everyone', label: 'Tout le monde', conditions: [] },
  {
    id: 'verified',
    label: 'Comptes certifiés',
    conditions: [{ attribute: 'verified', operator: 'eq', value: true }],
  },
  {
    id: 'subscribers',
    label: 'Abonnés',
    hint: 'Tous les paliers payants',
    conditions: [{ attribute: 'subscription_tier', operator: 'neq', value: 'free' }],
  },
  {
    id: 'ios',
    label: 'iPhone uniquement',
    conditions: [{ attribute: 'platform', operator: 'eq', value: 'ios' }],
  },
  {
    id: 'android',
    label: 'Android uniquement',
    conditions: [{ attribute: 'platform', operator: 'eq', value: 'android' }],
  },
  {
    id: 'new',
    label: 'Nouveaux comptes',
    hint: 'Moins de 7 jours',
    conditions: [{ attribute: 'account_age_days', operator: 'lt', value: 7 }],
  },
  {
    id: 'veterans',
    label: 'Comptes anciens',
    hint: 'Plus d’un an',
    conditions: [{ attribute: 'account_age_days', operator: 'gte', value: 365 }],
  },
];

/**
 * « Qui passe en premier ». Un boost multiplie le palier pour un groupe : il
 * lui donne de l'avance sans jamais exclure les autres, et tout le monde
 * arrive à 100 % en même temps. C'est la différence avec une audience, qui,
 * elle, réserve la fonctionnalité au groupe choisi.
 */
const BOOSTS: Array<{ id: string; label: string; hint?: string; boost: number; conditions: FlagCondition[] }> = [
  {
    id: 'premium2',
    label: 'Les abonnés, deux fois plus vite',
    hint: 'À 10 %, ils sont 20 % à l’avoir — les autres avancent quand même',
    boost: 2,
    conditions: [{ attribute: 'premium', operator: 'eq', value: true }],
  },
  {
    id: 'premium3',
    label: 'Les abonnés, trois fois plus vite',
    boost: 3,
    conditions: [{ attribute: 'premium', operator: 'eq', value: true }],
  },
  {
    id: 'verified2',
    label: 'Les comptes certifiés, deux fois plus vite',
    boost: 2,
    conditions: [{ attribute: 'verified', operator: 'eq', value: true }],
  },
];

const REASONS: Record<string, string> = {
  archived: 'Drapeau archivé',
  kill_switch: 'Le drapeau est éteint',
  blocklist: 'Dans la liste d’exclusion',
  allowlist: 'Dans les testeurs',
  no_bucket_unit: 'Pas d’identifiant pour le tirage',
  rule_rollout_excluded: 'Dans l’audience, mais hors du palier',
  rollout_excluded: 'Hors du palier',
  rule: 'Inclus par l’audience',
  rollout: 'Inclus par le palier',
  unknown_flag: 'Drapeau inconnu',
  error: 'Erreur d’évaluation',
};

function sameConditions(a: FlagCondition[], b: FlagCondition[]): boolean {
  if (a.length !== b.length) return false;
  const normalize = (list: FlagCondition[]) =>
    list.map((c) => `${c.attribute}|${c.operator}|${String(c.value)}`).sort().join('~');
  return normalize(a) === normalize(b);
}

const isBoostRule = (rule: FlagRule): boolean =>
  typeof rule.boost === 'number' && Number.isFinite(rule.boost) && rule.boost > 0;

/** Segments à palier figé — les seuls qui définissent une audience exclusive. */
const absoluteRules = (flag: FeatureFlag): FlagRule[] => flag.rules.filter((rule) => !isBoostRule(rule));

/** Audience reconnue, ou `null` si le ciblage a été affiné hors de l'app. */
function detectAudience(flag: FeatureFlag): string | null {
  // Un boost ne restreint personne : un drapeau qui n'a que des boosts
  // s'adresse bien à tout le monde, les uns simplement plus tôt que les autres.
  const rules = absoluteRules(flag);
  if (rules.length === 0) return 'everyone';
  if (rules.length > 1) return null;
  const found = AUDIENCES.find((audience) => sameConditions(audience.conditions, rules[0].conditions));
  return found ? found.id : null;
}

/** Boost reconnu, ou `null` si aucun (ou un réglage venu de l'API). */
function detectBoost(flag: FeatureFlag): string | null {
  const boosts = flag.rules.filter(isBoostRule);
  if (boosts.length !== 1) return null;
  const found = BOOSTS.find(
    (item) => item.boost === boosts[0].boost && sameConditions(item.conditions, boosts[0].conditions)
  );
  return found ? found.id : null;
}

/** Configurations que cet écran ne sait pas représenter fidèlement. */
function isAdvanced(flag: FeatureFlag): boolean {
  return (
    detectAudience(flag) === null ||
    (flag.rules.some(isBoostRule) && detectBoost(flag) === null) ||
    flag.variants.length > 0 ||
    flag.blocklist.length > 0 ||
    flag.bucket_by !== 'user'
  );
}

/**
 * Palier effectif : celui de l'audience quand il y en a une. Un boost, lui,
 * est relatif au palier global — ce n'est donc jamais lui qu'on lit ni qu'on
 * fait monter.
 */
function effectiveStep(flag: FeatureFlag): number {
  const rules = absoluteRules(flag);
  if (rules.length === 0) return flag.rollout_percentage;
  return rules[0].percentage ?? 100;
}

/** Une montée est « en cours » tant que personne ne l'a arrêtée. */
function planRunning(flag: FeatureFlag | null): boolean {
  const plan = flag?.auto_rollout;
  return Boolean(plan && plan.enabled && !plan.halted_at && !plan.completed_at);
}

/** Prochain cran de l'échelle au-dessus du palier courant. */
function nextStepAbove(current: number): number | null {
  return STEPS.find((value) => value > current) ?? null;
}

/** « dans 3 h », « dans 2 jours ». Assez précis pour une échéance de palier. */
function whenFromNow(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes <= 1) return 'dans un instant';
  if (minutes < 60) return `dans ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `dans ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'demain' : `dans ${days} jours`;
}

/** État de la montée en une phrase, ou `null` si aucun plan n'existe. */
function planStatus(flag: FeatureFlag | null): string | null {
  const plan = flag?.auto_rollout;
  if (!plan || !flag) return null;

  if (plan.completed_at) return 'Montée terminée : le dernier palier est atteint.';
  if (plan.halted_at) {
    return `Montée arrêtée — ${HALTS[plan.halted_reason || ''] || 'intervention manuelle'}. Réactive-la pour repartir du palier actuel.`;
  }
  if (!plan.next_at) return null;

  const target = nextStepAbove(effectiveStep(flag));
  if (target === null) return 'Montée armée, mais il n’y a pas de palier plus haut.';
  return `Prochain palier : ${target} % ${whenFromNow(plan.next_at)}.`;
}

function summarize(flag: FeatureFlag): string {
  if (flag.archived_at) return 'Archivé';
  if (!flag.enabled) {
    return flag.allowlist.length > 0 ? `Éteint · ${flag.allowlist.length} testeurs en attente` : 'Éteint';
  }

  const audienceId = detectAudience(flag);
  const audience = AUDIENCES.find((item) => item.id === audienceId);
  const who = audience ? audience.label.toLowerCase() : 'ciblage personnalisé';
  const step = effectiveStep(flag);
  const testers = flag.allowlist.length > 0 ? ` + ${flag.allowlist.length} testeurs` : '';

  const climbing = planRunning(flag) ? ' · monte seule' : '';
  // Générique : le boost ne vise pas forcément les abonnés.
  const boosted = flag.rules.some(isBoostRule) ? ' · avec priorité' : '';

  if (step === 0) {
    return `Testeurs seulement${flag.allowlist.length > 0 ? ` (${flag.allowlist.length})` : ''}${climbing}`;
  }
  if (step === 100 && audienceId === 'everyone') return `Tout le monde${testers}`;
  return `${step} % — ${who}${testers}${boosted}${climbing}`;
}

// ══════════════════════════ Liste ══════════════════════════

export default function FeatureFlagsAdminScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isAdmin, isSuperAdmin, loading: permissionsLoading } = useAdminPermissions();

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<FeatureFlag | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      const result = await featureFlagService.adminList(false);
      setFlags(result.flags);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Le détail n'est pas un écran de la pile : le retour matériel Android doit
  // donc revenir à la liste, pas quitter l'administration d'un coup.
  useEffect(() => {
    if (editing === null) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditing(null);
      return true;
    });
    return () => subscription.remove();
  }, [editing]);

  if (permissionsLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!isAdmin && !isSuperAdmin) {
    return (
      <View style={styles.screen}>
        <Header title="Fonctionnalités" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="lock-closed-outline"
          title="Réservé aux administrateurs"
          message="Le déploiement progressif n’est accessible qu’à l’équipe."
        />
      </View>
    );
  }

  /**
   * Le détail remplace la liste, il n'est PAS rendu dans une `<Modal>`.
   *
   * Les primitives de l'app (feuille d'action, confirmation, invite, toast)
   * sont des vues posées au-dessus de l'arbre applicatif : une modale React
   * Native rend dans sa propre fenêtre native et les masque intégralement.
   * Le sélecteur « Pour qui » s'ouvrait donc derrière la modale et paraissait
   * mort — tout comme l'auraient fait la confirmation d'archivage et l'invite
   * de test.
   */
  if (editing !== null) {
    return (
      <FlagDetail
        flag={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="Fonctionnalités"
        onBack={() => navigation.goBack()}
        right={
          <Tappable onPress={() => setEditing('new')} style={styles.headerAction}>
            <Ionicons name="add" size={24} color={colors.accent} />
          </Tappable>
        }
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : failed ? (
        <ErrorState title="Chargement impossible" onRetry={load} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.accent}
            />
          }
        >
          <HowItWorks
            id="feature-flags-admin"
            title="Comment ça marche"
            points={[
              { icon: 'person-add-outline', text: 'Mets-toi dans les testeurs : tu vois la fonctionnalité, personne d’autre.' },
              { icon: 'trending-up-outline', text: 'Puis monte par paliers. Monter n’enlève jamais la fonctionnalité à quelqu’un qui l’avait.' },
              { icon: 'timer-outline', text: 'Ou laisse-la monter seule : un palier par intervalle, arrêt immédiat dès que tu interviens.' },
            ]}
          />

          {flags.length === 0 ? (
            <EmptyState
              icon="flag-outline"
              title="Aucune fonctionnalité"
              message="Crée-en une pour livrer du code éteint et l’ouvrir progressivement."
              action={{ label: 'Créer', icon: 'add', onPress: () => setEditing('new') }}
            />
          ) : (
            flags.map((flag) => (
              <Tappable key={flag.key} style={styles.row} onPress={() => setEditing(flag)} haptic="select">
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: flag.enabled ? colors.success : colors.textMuted },
                  ]}
                />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {flag.name}
                  </Text>
                  <Text style={styles.rowSummary} numberOfLines={1}>
                    {summarize(flag)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Tappable>
            ))
          )}
        </ScrollView>
      )}

    </View>
  );
}

// ══════════════════════════ Détail ══════════════════════════

function FlagDetail({
  flag,
  onClose,
  onSaved,
}: {
  flag: FeatureFlag | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isNew = flag === null;
  const advanced = flag ? isAdvanced(flag) : false;

  const [key, setKey] = useState(flag?.key || '');
  const [name, setName] = useState(flag?.name || '');
  const [enabled, setEnabled] = useState(flag?.enabled ?? false);
  const [audienceId, setAudienceId] = useState(flag ? detectAudience(flag) || 'everyone' : 'everyone');
  const [boostId, setBoostId] = useState<string | null>(flag ? detectBoost(flag) : null);
  const [step, setStep] = useState(flag ? effectiveStep(flag) : 0);
  const [testers, setTesters] = useState((flag?.allowlist || []).join(', '));
  const [saving, setSaving] = useState(false);

  const running = planRunning(flag);
  const [autoOn, setAutoOn] = useState(running);
  // Nommé `intervalMinutes` et non `interval` : un `setInterval` local
  // masquerait la fonction globale du même nom dans tout le composant.
  const [intervalMinutes, setIntervalMinutes] = useState(
    flag?.auto_rollout?.interval_minutes || 60 * 24
  );

  const audience = useMemo(
    () => AUDIENCES.find((item) => item.id === audienceId) || AUDIENCES[0],
    [audienceId]
  );

  // Décrit le plan tel qu'il est EN BASE, pas l'état des commandes ci-dessus :
  // c'est ce qui se passera si on quitte l'écran sans enregistrer.
  const statusLine = planStatus(flag);

  /**
   * Applique l'état du bloc « Monter toute seule », APRÈS l'enregistrement.
   *
   * Cet ordre est délibéré : le serveur arrête toute montée dont le palier
   * bouge à la main, donc armer avant d'enregistrer un nouveau palier ferait
   * arrêter le plan dans la foulée. Armé après, il part du palier qu'on vient
   * d'écrire.
   *
   * On ne réarme QUE si quelque chose a changé — réarmer repousse la prochaine
   * échéance d'un intervalle entier, et un simple « OK » quotidien suffirait
   * alors à empêcher la montée d'avoir jamais lieu.
   */
  const reconcileAutoRollout = async (savedKey: string) => {
    const stepChanged = !isNew && step !== effectiveStep(flag!);
    const intervalChanged = intervalMinutes !== flag?.auto_rollout?.interval_minutes;

    try {
      if (autoOn && (!running || stepChanged || intervalChanged)) {
        await featureFlagService.adminSetAutoRollout(savedKey, {
          enabled: true,
          steps: STEPS.filter((value) => value > 0),
          interval_minutes: intervalMinutes,
        });
      } else if (!autoOn && running) {
        // Seulement si une montée tournait vraiment : un plan déjà arrêté doit
        // garder son motif d'arrêt, c'est lui qui explique l'écran.
        await featureFlagService.adminSetAutoRollout(savedKey, { enabled: false });
      }
    } catch (error: any) {
      // Le drapeau, lui, est bien enregistré : on le dit sans faire croire à
      // un échec global.
      toast.info('Montée automatique non armée', { description: error?.message });
    }
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Il faut un nom');
      return;
    }
    if (isNew && !/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(key.trim())) {
      toast.error('Clé invalide', { description: 'Minuscules et points, par exemple : fil.nouveau_classement' });
      return;
    }

    const allowlist = testers
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    // Un ciblage affiné hors de l'app n'est jamais réécrit par cet écran : on
    // n'envoie alors ni l'audience ni le palier de segment, seulement ce que
    // l'écran sait représenter.
    // Le segment boosté passe AVANT le segment d'audience : le moteur retient
    // le premier segment qui matche, donc placer le boost derrière le rendrait
    // inatteignable pour quiconque appartient déjà à l'audience.
    const boost = BOOSTS.find((item) => item.id === boostId);
    const boostRule = boost
      ? [{ id: 'boost', label: boost.label, boost: boost.boost, conditions: boost.conditions }]
      : [];

    const targeting = advanced
      ? { rollout_percentage: step }
      : audience.id === 'everyone'
      ? { rules: boostRule, rollout_percentage: step }
      : {
          // Un boost est relatif au palier GLOBAL : combiné à une audience
          // exclusive, il se calculerait sur un palier resté à 0. L'écran ne
          // propose donc le boost que sur « tout le monde ».
          rollout_percentage: 0,
          rules: [
            {
              id: 'audience',
              label: audience.label,
              percentage: step,
              conditions: audience.conditions,
            },
          ],
        };

    setSaving(true);
    try {
      const payload = { name: name.trim(), enabled, allowlist, ...targeting };
      let savedKey: string;
      if (isNew) {
        const created = await featureFlagService.adminCreate({
          ...payload,
          key: key.trim().toLowerCase(),
        } as any);
        savedKey = created.key;
        toast.success('Créé');
      } else {
        savedKey = flag!.key;
        await featureFlagService.adminUpdate(flag!.key, payload as any);
        toast.success('Enregistré');
      }

      await reconcileAutoRollout(savedKey);
      onSaved();
    } catch (error: any) {
      toast.error(error?.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const simulate = async () => {
    const username = await promptAsync({
      title: 'Tester pour qui ?',
      message: 'La réponse dit aussi pourquoi.',
      placeholder: '@pseudo',
      icon: 'flask-outline',
    });
    if (!username || !flag) return;

    try {
      const result = await featureFlagService.adminSimulate(flag.key, {
        username: username.replace(/^@/, ''),
      });
      const reason = REASONS[result.decision.reason || ''] || result.decision.reason || '';
      if (result.decision.enabled) toast.success(`${username} la voit`, { description: reason });
      else toast.info(`${username} ne la voit pas`, { description: reason });
    } catch (error: any) {
      toast.error(error?.message || 'Test impossible');
    }
  };

  const archive = async () => {
    if (!flag) return;
    const ok = await confirmAsync({
      title: `Archiver « ${flag.name} » ?`,
      message: 'La fonctionnalité disparaît de la liste et n’est plus évaluée.',
      confirmLabel: 'Archiver',
      destructive: true,
    });
    if (!ok) return;

    try {
      await featureFlagService.adminArchive(flag.key, false);
      toast.success('Archivé');
      onSaved();
    } catch (error: any) {
      toast.error(error?.message || 'Archivage impossible');
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title={isNew ? 'Nouvelle fonctionnalité' : name || flag!.key}
        onBack={onClose}
        right={
          <Tappable onPress={save} disabled={saving} style={styles.headerAction}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.saveText}>OK</Text>
            )}
          </Tappable>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.block}>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Nom de la fonctionnalité"
            placeholderTextColor={colors.textMuted}
          />
          {isNew ? (
            <TextInput
              style={styles.keyInput}
              value={key}
              onChangeText={setKey}
              placeholder="fil.nouveau_classement"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : (
            <Text style={styles.keyStatic}>{flag!.key}</Text>
          )}
        </View>

        <View style={styles.block}>
          <View style={styles.switchRow}>
            <Text style={styles.blockTitle}>Activée</Text>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={enabled ? colors.accent : colors.textMuted}
            />
          </View>
          <Text style={styles.hint}>Éteinte, personne ne la voit — pas même les testeurs.</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Pour qui</Text>
          {advanced ? (
            <>
              <View style={styles.lockedRow}>
                <Ionicons name="lock-closed-outline" size={16} color={colors.warning} />
                <Text style={styles.lockedText}>Ciblage personnalisé</Text>
              </View>
              <Text style={styles.hint}>
                Ce drapeau a été affiné hors de l’application. L’écran ne le modifie pas pour ne pas
                l’écraser — passe par l’API pour y toucher.
              </Text>
            </>
          ) : (
            // Liste dépliée plutôt qu'un menu : les sept choix tiennent à
            // l'écran, et on voit ce qui est sélectionné sans rien ouvrir.
            AUDIENCES.map((item) => {
              const selected = item.id === audience.id;
              return (
                <Tappable
                  key={item.id}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => setAudienceId(item.id)}
                  haptic="select"
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={selected ? colors.accent : colors.textMuted}
                  />
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                      {item.label}
                    </Text>
                    {item.hint ? <Text style={styles.hint}>{item.hint}</Text> : null}
                  </View>
                </Tappable>
              );
            })
          )}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Combien — {step} %</Text>
          <View style={styles.steps}>
            {STEPS.map((value) => (
              <Tappable
                key={value}
                onPress={() => setStep(value)}
                style={[styles.step, step === value && styles.stepActive]}
                haptic="tap"
              >
                <Text style={[styles.stepText, step === value && styles.stepTextActive]}>{value}%</Text>
              </Tappable>
            ))}
          </View>
          <Text style={styles.hint}>
            {step === 0
              ? 'Seuls les testeurs ci-dessous la voient.'
              : `${step} % des comptes concernés, tirés de façon stable : monter ne l’enlève à personne.`}
          </Text>
        </View>

        {!advanced && audience.id === 'everyone' && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Qui passe en premier</Text>
            {[{ id: null, label: 'Personne en particulier', hint: undefined }, ...BOOSTS].map((item) => {
              const selected = item.id === boostId;
              return (
                <Tappable
                  key={item.id || 'none'}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => setBoostId(item.id)}
                  haptic="select"
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={selected ? colors.accent : colors.textMuted}
                  />
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                      {item.label}
                    </Text>
                    {item.hint ? <Text style={styles.hint}>{item.hint}</Text> : null}
                  </View>
                </Tappable>
              );
            })}
            <Text style={styles.hint}>
              Ils prennent de l’avance, ils ne sont pas les seuls servis : les autres montent au même
              rythme, en dessous, et tout le monde arrive à 100 % ensemble.
            </Text>
          </View>
        )}

        <View style={styles.block}>
          <View style={styles.switchRow}>
            <Text style={styles.blockTitle}>Monter toute seule</Text>
            <Switch
              value={autoOn}
              onValueChange={setAutoOn}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={autoOn ? colors.accent : colors.textMuted}
            />
          </View>

          {autoOn ? (
            <>
              {INTERVALS.map((item) => {
                const selected = item.minutes === intervalMinutes;
                return (
                  <Tappable
                    key={item.minutes}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => setIntervalMinutes(item.minutes)}
                    haptic="select"
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selected ? colors.accent : colors.textMuted}
                    />
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                      {item.label}
                    </Text>
                  </Tappable>
                );
              })}
              <Text style={styles.hint}>
                Un palier de plus à chaque fois, jusqu’à 100 %. Le premier changement a lieu au bout
                d’un intervalle, pas tout de suite.
              </Text>
              <Text style={styles.hint}>
                Éteindre la fonctionnalité ou changer le palier à la main arrête la montée — elle ne
                repart pas seule.
              </Text>
            </>
          ) : (
            <Text style={styles.hint}>
              Le palier ne bougera que si quelqu’un y revient. Active pour élargir la portée par
              paliers, sans avoir à y penser.
            </Text>
          )}

          {statusLine ? (
            <View style={styles.statusRow}>
              <Ionicons
                name={flag?.auto_rollout?.halted_at ? 'warning-outline' : 'time-outline'}
                size={15}
                color={flag?.auto_rollout?.halted_at ? colors.warning : colors.textSecondary}
              />
              <Text style={styles.statusText}>{statusLine}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.block}>
          <Text style={styles.blockTitle}>Testeurs</Text>
          <TextInput
            style={styles.input}
            value={testers}
            onChangeText={setTesters}
            placeholder="@toi, @collegue"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            multiline
          />
          <Text style={styles.hint}>Ils la voient toujours, même à 0 %.</Text>
        </View>

        {!isNew && (
          <View style={styles.footerActions}>
            <Tappable style={styles.footerButton} onPress={simulate} haptic="select">
              <Ionicons name="flask-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.footerButtonText}>Tester sur un compte</Text>
            </Tappable>
            <Tappable style={styles.footerButton} onPress={archive} haptic="select">
              <Ionicons name="archive-outline" size={16} color={colors.red} />
              <Text style={[styles.footerButtonText, { color: colors.red }]}>Archiver</Text>
            </Tappable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ══════════════════════════ Styles ══════════════════════════

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },

  headerAction: { paddingHorizontal: 8, paddingVertical: 6 },
  saveText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.accent },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.textPrimary },
  rowSummary: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },

  block: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 14,
    gap: 8,
  },
  blockTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  nameInput: { fontFamily: fonts.display, fontSize: 18, color: colors.textPrimary, paddingVertical: 4 },
  keyInput: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    paddingVertical: 4,
  },
  keyStatic: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentMuted },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.textSecondary },
  optionLabelSelected: { fontFamily: fonts.semibold, color: colors.textPrimary },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  statusText: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },

  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockedText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.warning },

  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  step: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  stepText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textSecondary },
  stepTextActive: { color: colors.accent },

  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },

  footerActions: { gap: 8, marginTop: 6 },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  footerButtonText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textSecondary },
});
