/**
 * Types pour le système d'événements fonctionnels
 */

export interface FunctionalEvent {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  priority: number;
  target_pages: string[];
  features: Record<string, any>;
  start_date?: string;
  end_date?: string;
  auto_activate: boolean;
  icon: string;
  banner_message?: string;
  notification_message?: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  creator?: {
    id: string;
    username: string;
    full_name: string;
  };
}

export interface FunctionalEventFeatures {
  [key: string]: any;
}

export interface FunctionalEventContextType {
  // État des événements
  activeEvents: FunctionalEvent[];
  isLoading: boolean;
  hasActiveEvents: boolean;

  // Actions
  refreshActiveEvents: () => Promise<void>;
  getActiveEventsForPage: (pageName: string) => Promise<FunctionalEvent[]>;
  getActiveFeaturesForPage: (pageName: string) => Promise<FunctionalEventFeatures>;
  isFeatureActive: (featureName: string, pageName: string) => Promise<boolean>;
  getFeatureValue: (featureName: string, pageName: string, defaultValue?: any) => Promise<any>;
  
  // Pour les admins
  activateEvent: (id: string, deactivateOthers?: boolean) => Promise<boolean>;
  deactivateEvent: (id: string) => Promise<boolean>;
  createEvent: (eventData: Partial<FunctionalEvent>) => Promise<FunctionalEvent | null>;
  updateEvent: (id: string, updateData: Partial<FunctionalEvent>) => Promise<FunctionalEvent | null>;
  deleteEvent: (id: string) => Promise<boolean>;
  getAllEvents: () => Promise<FunctionalEvent[]>;
  initializeDefaultEvents: () => Promise<FunctionalEvent[]>;
}

export interface FunctionalEventBannerProps {
  events: FunctionalEvent[];
  onPress?: () => void;
  style?: any;
}

export interface FunctionalEventManagementProps {
  onEventCreated?: (event: FunctionalEvent) => void;
  onEventUpdated?: (event: FunctionalEvent) => void;
  onEventDeleted?: (eventId: string) => void;
}
