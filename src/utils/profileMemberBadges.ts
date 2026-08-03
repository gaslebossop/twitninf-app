import { canUseFeature, effectiveSubscriptionTier, type SubscriptionTier } from './subscriptionTier';

export const MEMBER_BADGE_STORAGE_KEY = 'selectedBadge';

export type MemberBadgeId = string;

export type MemberBadgeDef = {
  id: MemberBadgeId;
  label: string;
  /** Nom Ionicons */
  icon: string;
  colors: [string, string, string];
  minTier: 'plus' | 'pro';
};

/** Badges affichés à côté du pseudo (Plus / Pro). */
export const MEMBER_BADGE_OPTIONS: MemberBadgeDef[] = [
  { id: 'diamond', label: 'Diamant', icon: 'diamond', colors: ['#f59e0b', '#f97316', '#ea580c'], minTier: 'plus' },
  { id: 'flame', label: 'Flamme', icon: 'flame', colors: ['#ef4444', '#f97316', '#fbbf24'], minTier: 'plus' },
  { id: 'flash', label: 'Éclair', icon: 'flash', colors: ['#38bdf8', '#6366f1', '#a78bfa'], minTier: 'plus' },
  { id: 'heart', label: 'Cœur', icon: 'heart', colors: ['#ec4899', '#f472b6', '#fda4af'], minTier: 'plus' },
  { id: 'color-wand', label: 'Créatif', icon: 'color-wand', colors: ['#22c55e', '#14b8a6', '#06b6d4'], minTier: 'plus' },
  { id: 'musical-notes', label: 'Son', icon: 'musical-notes', colors: ['#8b5cf6', '#a855f7', '#d946ef'], minTier: 'plus' },
  { id: 'star', label: 'Étoile', icon: 'star', colors: ['#FFC107', '#FF9800', '#F57C00'], minTier: 'pro' },
  { id: 'trophy', label: 'Trophée', icon: 'trophy', colors: ['#ca8a04', '#eab308', '#fde047'], minTier: 'pro' },
  { id: 'planet', label: 'Planète', icon: 'planet', colors: ['#4338ca', '#6366f1', '#c084fc'], minTier: 'pro' },
  { id: 'rocket', label: 'Fusée', icon: 'rocket', colors: ['#0369a1', '#0ea5e9', '#38bdf8'], minTier: 'pro' },
  { id: 'infinite', label: 'Infini', icon: 'infinite', colors: ['#0f766e', '#14b8a6', '#5eead4'], minTier: 'pro' },
  { id: 'sparkles', label: 'Éclat', icon: 'sparkles', colors: ['#be185d', '#ec4899', '#fbcfe8'], minTier: 'pro' },
];

const byId = new Map(MEMBER_BADGE_OPTIONS.map((b) => [b.id, b]));

export function defaultMemberBadgeId(tier: SubscriptionTier): MemberBadgeId {
  if (tier === 'pro') return 'star';
  return 'diamond';
}

export function badgeAllowedForTier(tier: SubscriptionTier, badge: MemberBadgeDef): boolean {
  return canUseFeature(tier, badge.minTier);
}

export function clampMemberBadgeId(raw: string | null | undefined, isPremium: boolean, subscriptionTier?: string | null): MemberBadgeId {
  const tier = effectiveSubscriptionTier(!!isPremium, subscriptionTier);
  if (!isPremium || tier === 'free') return 'diamond';
  const id = (raw && byId.has(raw) ? raw : defaultMemberBadgeId(tier)) as MemberBadgeId;
  const def = byId.get(id);
  if (!def) return defaultMemberBadgeId(tier);
  if (!badgeAllowedForTier(tier, def)) return defaultMemberBadgeId(tier);
  return def.id;
}

export function getMemberBadgeDef(id: MemberBadgeId): MemberBadgeDef | undefined {
  return byId.get(id);
}
