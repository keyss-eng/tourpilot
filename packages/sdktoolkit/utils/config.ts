import type { AITourConfig } from '../api/types';

export function validateConfig(config: Partial<AITourConfig>): AITourConfig {
  if (!config.apiKey) {
    throw new Error('[AITour] Initialization failed: Missing "apiKey".');
  }
  if (!config.userId) {
    throw new Error('[AITour] Initialization failed: Missing "userId".');
  }
  if (!config.contextKey) {
    throw new Error('[AITour] Initialization failed: Missing "contextKey".');
  }

  return {
    apiKey:     config.apiKey,
    userId:     config.userId,
    contextKey: config.contextKey,
    apiUrl:     config.apiUrl || 'https://aitour-api.vishalkumar-9ca.workers.dev/api/v1',
    excludeSelectors: config.excludeSelectors ?? [],
    // ✅ Default is [] (empty = no zone filtering — scan all zones).
    includeZones: config.includeZones ?? [],
    skipPaths: config.skipPaths ?? ['/', '/login', '/auth', '/logout', '/register', '/signup'],
    allowedPaths: config.allowedPaths ?? null,
    domIdleMs: typeof config.domIdleMs === 'number' ? config.domIdleMs : 500,
    domIdleMaxWait: typeof config.domIdleMaxWait === 'number' ? config.domIdleMaxWait : 1500,
    maxVisibleElements: typeof config.maxVisibleElements === 'number' ? config.maxVisibleElements : 80,
    maxHiddenElements: typeof config.maxHiddenElements === 'number' ? config.maxHiddenElements : 20,
    enableAutoAdvance: config.enableAutoAdvance ?? true,
    autoAdvanceDelay: typeof config.autoAdvanceDelay === 'number' ? config.autoAdvanceDelay : 4000,
    logLevel: config.logLevel ?? 'info',
    theme: config.theme ?? 'light',
    locale: config.locale ?? 'en',
    watcherDebounceMs: typeof config.watcherDebounceMs === 'number' ? config.watcherDebounceMs : 600,
    gateTimeoutMs: typeof config.gateTimeoutMs === 'number' ? config.gateTimeoutMs : 15000,
    fingerprintTimeoutMs: typeof config.fingerprintTimeoutMs === 'number' ? config.fingerprintTimeoutMs : 4000,
    fingerprintMinScore: typeof config.fingerprintMinScore === 'number' ? config.fingerprintMinScore : 20,
    onTourStart: config.onTourStart,
    onTourEnd: config.onTourEnd,
    onStepChange: config.onStepChange,
    onError: config.onError,
  };
}