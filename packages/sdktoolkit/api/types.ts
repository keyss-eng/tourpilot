export interface AITourConfig {
  apiKey: string;
  userId: string;
  contextKey: string;
  apiUrl?: string;
  // [AUTO-REGEN] Host app's UI build/version (e.g. build id or git commit). When
  // this changes, the saved tour for a page is auto-regenerated fresh. Leave
  // unset to disable auto-regen (pure freeze).
  uiVersion?: string;
  //Developer-defined exclusions — chat widget, cookie banner, sidebar etc
  excludeSelectors?: string[];
  // 
  includeZones?: ('main' | 'nav' | 'header' | 'modal' | 'body' | 'popup')[];

  // Universal SDK configurations
  skipPaths?: string[];                    // Paths where tours are never generated
  allowedPaths?: string[] | null;          // null = all paths allowed
  domIdleMs?: number;                      // waitForDomIdle timeout (default: 500)
  domIdleMaxWait?: number;                 // waitForDomIdle max wait (default: 1500)
  maxVisibleElements?: number;             // VISIBLE_CAP (default: 80)
  maxHiddenElements?: number;              // HIDDEN_CAP (default: 20)
  enableAutoAdvance?: boolean;             // Enable timer-based auto-advance
  autoAdvanceDelay?: number;               // Default delay in ms (default: 4000)
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  theme?: 'light' | 'dark' | 'auto';      // Tooltip theme
  locale?: string | Record<string, string>;                         // i18n locale for button text (default: 'en')
  watcherDebounceMs?: number;
  gateTimeoutMs?: number;
  fingerprintTimeoutMs?: number;
  fingerprintMinScore?: number;

  // Lifecycle Callbacks
  onTourStart?: (tourId: string) => void;
  onTourEnd?: (tourId: string, status: string) => void;
  onStepChange?: (tourId: string, step: number) => void;
  onError?: (error: Error) => void;        // Global error callback
}

export interface TourStep {
  id: string;
  stepOrder: number;
  title: string;
  content: string;
  targetSelector: string;
  // FIX: 'timer' added to union — pipeline.ts backend 'timer' store karta hai
  // lekin type mein sirf 'time' tha — player ka if-check kabhi match nahi karta tha
  // 'time' bhi rakha hai forward-compatibility ke liye
  autoAdvance: {
    type: 'timer' | 'time' | 'interaction' | 'wait_for';
    event?: 'click' | 'input';
    delay?: number;
  };
  fingerprint: Record<string, any>;
  isNew?: boolean;
}

export interface Tour {
  id: string;
  contextKey: string;
  versionHash: string;
  steps: TourStep[];
}

export interface FetchTourResponse {
  match: boolean;
  show: boolean;
  versionHash?: string;
  tourId?: string;
  steps?: TourStep[];
  reason?: string;
  error?: string;
  hasProgress?: boolean;
  playMode?: 'full' | 'delta';
}

export interface TelemetryPayload {
  sessionId: string;
  userId: string;
  tourId: string;
  stepIndex?: number;
  eventType: 'impression' | 'next' | 'skip' | 'complete' | 'step_view';
  metadata: Record<string, any>;
}