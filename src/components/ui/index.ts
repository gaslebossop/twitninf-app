export { default as ScreenBackground } from './ScreenBackground';
export { default as AppStatusBar } from './AppStatusBar';
export { default as GlassCard } from './GlassCard';
export { default as GlassHeader } from './GlassHeader';
export { default as GlassButton } from './GlassButton';
export { default as GlassIconButton } from './GlassIconButton';
export { default as SectionLabel } from './SectionLabel';
export { default as BackButton } from './BackButton';
export { default as AppLoadingScreen } from './AppLoadingScreen';
export { default as Skeleton } from './Skeleton';
export { default as AppRefreshControl } from './AppRefreshControl';
export { default as PullRefreshLogo, PULL_REFRESH_THRESHOLD } from './PullRefreshLogo';
export { default as ScreenSkeleton } from './ScreenSkeleton';
export type { ScreenSkeletonVariant } from './ScreenSkeleton';

// Retour d'action non bloquant + question bloquante. Les deux remplacent
// `Alert.alert`, qui servait indifféremment aux deux usages.
export { ToastProvider, useToast, toast } from './Toast';
export type { ToastKind, ToastOptions } from './Toast';
export { ConfirmProvider, useConfirm, confirmAsync } from './ConfirmSheet';
export type { ConfirmOptions } from './ConfirmSheet';

// Question à réponse écrite — remplace `Alert.prompt`, qui n'existait que sur iOS.
export { PromptProvider, usePrompt, promptAsync } from './PromptSheet';
export type { PromptOptions } from './PromptSheet';

// Menu d'actions unique — remplace le couple ActionSheetIOS / Alert Android.
export { ActionSheetProvider, useActionSheet, showActionSheet } from './ActionSheet';
export type { ActionSheetItem, ActionSheetOptions } from './ActionSheet';

// Zone tapable avec retour visuel et tactile — remplace `TouchableOpacity`.
export { default as Tappable } from './Tappable';

// Pastille « BETA » du programme beta — rendue UNIQUEMENT aux membres, dans
// l'en-tete des deux fils. `tone` suit la palette de l'ecran qui l'accueille.
export { default as BetaBadge } from './BetaBadge';
export type { BetaBadgeTone } from './BetaBadge';

// Écrans « rien à montrer » et « ça a échoué ».
export { default as EmptyState } from './EmptyState';
export { default as ErrorState } from './ErrorState';

// Économie lisible : le solde toujours visible, le prix écrit sur le bouton.
export { default as CoinBalancePill } from './CoinBalancePill';
export { default as CostButton } from './CostButton';
export { default as HowItWorks } from './HowItWorks';

// Célébration d'un gain — un seul geste visuel pour tous les moments qui rapportent.
export { RewardProvider, useReward, celebrateReward } from './RewardBurst';
export type { RewardOptions } from './RewardBurst';

// Alias courts — DA « Pulse ». Mêmes implémentations que ci-dessus,
// noms plus courts à utiliser dans le nouveau code d'écran.
export { default as Card } from './GlassCard';
export { default as Header } from './GlassHeader';
export { default as Button } from './GlassButton';
export { default as IconButton } from './GlassIconButton';

export { default as AppHeader, shouldShowBackButton } from './AppHeader';

// Message vocal — une seule waveform pour l'enregistrement, la relecture et
// la lecture dans le fil.
export {
  default as VoiceWaveform,
  WAVEFORM_BAR_COUNT,
  normalizeMetering,
  downsampleWaveform,
  pseudoWaveform,
  formatClock,
} from './VoiceWaveform';
export { default as VoiceRecorderPanel } from './VoiceRecorderPanel';
