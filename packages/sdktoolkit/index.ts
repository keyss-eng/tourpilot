import { TourPlayer } from './engine/player';
import { TourState } from './engine/state';
import { ApiClient } from './api/client';
import { SPAObserver } from './engine/router';
import { validateConfig } from './utils/config';
import { DynamicContentWatcher } from './dom/mutation';
import type { AITourConfig, FetchTourResponse } from './api/types';
import { Tracker } from './telemetry/tracker';
import { ElementFinder } from './detector';
import { isElementVisible, resolveZone, querySelectorAllDeep, querySelectorDeep, safeStorage } from './dom';
import { globalKey } from './storage';
import { logger } from './utils/logger';

let activePlayer: TourPlayer | null = null;
let activeSpaObserver: SPAObserver | null = null;
let activeDynamicWatcher: DynamicContentWatcher | null = null;

const sessionDismissedTours = new Set<string>();

// Full default selector set — used until the project's Settings config loads.
const DEFAULT_INTERACTIVE_SELECTORS =
  'button, a, [role="button"], [role="link"], [onclick], [tabindex="0"], select, ' +
  'input[type="submit"], input[type="button"], input[type="checkbox"], input[type="radio"], ' +
  'input[type="range"], input[type="file"], ' +
  'summary, ' +
  '[role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], ' +
  '[role="switch"], [role="checkbox"], [role="radio"], [role="option"], ' +
  '[role="combobox"], [role="slider"], [role="spinbutton"], [role="treeitem"]';

// Selectors fetched from /config (per-project Settings). null = not loaded yet.
let runtimeSelectors: string | null = null;

// Fetch the project's actionable-element selectors from the backend. Best-effort:
// on any failure we keep the defaults so tours still work.
async function loadRuntimeSelectors(config: AITourConfig): Promise<void> {
  try {
    const base = (config.apiUrl || 'https://aitour-api.vishalkumar-9ca.workers.dev/api/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/config`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    if (!res.ok) return;
    const data = await res.json() as { selectors?: string };
    if (data?.selectors && typeof data.selectors === 'string') {
      runtimeSelectors = data.selectors;
    }
  } catch {
    /* keep defaults */
  }
}

function getStorageKey(apiKey: string, key: string): string {
  return globalKey(apiKey, key);
}

async function waitForDomIdle(ms = 500, maxWait = 1500): Promise<void> {
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout>;

    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { obs.disconnect(); resolve(); }, ms);
    });

    const root = document.querySelector('main') || document.body;
    obs.observe(root, { childList: true, subtree: true });

    setTimeout(() => { obs.disconnect(); resolve(); }, maxWait);
    timer = setTimeout(() => { obs.disconnect(); resolve(); }, ms);
  });
}

// Appends :nth-of-type(k) when a node has same-tag siblings, so repeated
// elements (e.g. identical cards / arrow buttons) don't all collapse to the
// SAME selector — which produced "Selector ... is ambiguous (N matches)" and
// highlighted the wrong element.
function nthOfTypeSuffix(node: HTMLElement): string {
  const parent = node.parentElement;
  if (!parent) return '';
  const tag = node.tagName;
  const sameTag = Array.from(parent.children).filter(c => c.tagName === tag);
  if (sameTag.length <= 1) return '';
  return `:nth-of-type(${sameTag.indexOf(node) + 1})`;
}

function buildSelector(el: HTMLElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts: string[] = [];
  let node: HTMLElement | null = el;

  while (node && node !== document.body && parts.length < 3) {
    let seg = node.tagName.toLowerCase();

    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }

    if (node.getAttribute('data-testid')) {
      seg += `[data-testid="${node.getAttribute('data-testid')}"]`;
    } else {
      if (node.className && typeof node.className === 'string') {
        const classes = [...node.classList]
          .filter(c => c.length > 0)
          .slice(0, 2)
          .map(c => CSS.escape(c));
        if (classes.length > 0) seg += `.${classes.join('.')}`;
      }
      // Disambiguate against same-tag siblings (skip for unique testid/id).
      seg += nthOfTypeSuffix(node);
    }

    parts.unshift(seg);
    node = node.parentElement;
  }

  return parts.length > 0 ? parts.join(' > ') : el.tagName.toLowerCase();
}

function isLayoutElement(el: HTMLElement): boolean {
  return !!(
    el.closest('nav') ||
    el.closest('footer') ||
    el.closest('[role="navigation"]') ||
    el.closest('[role="banner"]')
  );
}

const HIDDEN_CONTAINER_SELECTORS = [
  '[aria-expanded="false"]',
  '[data-state="closed"]',
  '.collapse',
  '[aria-hidden="true"]',
];

function isInsideHiddenContainer(el: HTMLElement): boolean {
  return HIDDEN_CONTAINER_SELECTORS.some(sel => {
    try { return el.closest(sel) !== null; } catch { return false; }
  });
}

async function collectDomSnapshot(
  contextKey: string,
  config: AITourConfig,
  // Optional scope: when a dynamic section opens we scan ONLY inside that
  // container (not the whole page), so the section's elements are captured
  // regardless of which zone they sit in (inline panels live in 'main', not
  // 'modal'/'popup'). Defaults to the whole document for page tours.
  root: Document | HTMLElement = document
) {
  const domIdleMs = config.domIdleMs ?? 500;
  const domIdleMaxWait = config.domIdleMaxWait ?? 1500;
  await waitForDomIdle(domIdleMs, domIdleMaxWait);


  // Selectors come from the project's Settings (fetched at init); fall back to
  // the full default set if the config wasn't loaded.
  const INTERACTIVE_SELECTORS = runtimeSelectors ?? DEFAULT_INTERACTIVE_SELECTORS;

  const rawElements = querySelectorAllDeep(INTERACTIVE_SELECTORS, root);

  // ── Phase A: Visible elements ─────────────────────────────
  const visibleElements = rawElements.filter(el => {
    const h = el as HTMLElement;
    if (!isElementVisible(h)) return false;
    if (config.excludeSelectors?.some(sel => {
      try { return h.closest(sel) !== null; } catch { return false; }
    })) return false;
    return true;
  });

  // ── Phase B: Hidden-but-present elements ────────────────────────────────────
  const visibleSet = new Set(visibleElements);
  const hiddenElements = rawElements.filter(el => {
    if (visibleSet.has(el)) return false;  // Already in Phase A
    const h = el as HTMLElement;
    // Only include hidden elements inside known container patterns
    if (!isInsideHiddenContainer(h)) return false;
    // Must have meaningful text or aria label
    const text = h.innerText?.trim() || '';
    const aria = h.getAttribute('aria-label') || (h as HTMLInputElement).placeholder || '';
    if (!text && !aria) return false;
    // Respect developer exclusions
    if (config.excludeSelectors?.some(sel => {
      try { return h.closest(sel) !== null; } catch { return false; }
    })) return false;
    return true;
  });

  logger.info(`Phase A: ${visibleElements.length} visible, Phase B: ${hiddenElements.length} hidden elements`);

  // ── Filter layout elements ────────────────────────────────
  let filteredVisible = visibleElements.filter(el => {
    const h = el as HTMLElement;
    return !isLayoutElement(h);
  });

  if (filteredVisible.length < 2) {
    logger.info(`Only ${filteredVisible.length} elements after layout filter — including nav/header as fallback`);
    filteredVisible = visibleElements;
  }

  // ── Sort priority zones ───────────────────────────────────
  const PRIORITY_ZONES = new Set(['main', 'modal', 'popup']);
  filteredVisible.sort((a, b) => {
    const aZone = resolveZone(a as HTMLElement);
    const bZone = resolveZone(b as HTMLElement);
    const aPriority = PRIORITY_ZONES.has(aZone);
    const bPriority = PRIORITY_ZONES.has(bZone);
    if (aPriority && !bPriority) return -1;
    if (!aPriority && bPriority) return 1;
    return 0;
  });

  // ── Build output: visible + hidden ─────────────
  const VISIBLE_CAP = config.maxVisibleElements ?? 80;
  const HIDDEN_CAP = config.maxHiddenElements ?? 20;

  const visibleOutput = filteredVisible
    .slice(0, VISIBLE_CAP)
    .map((el, i) => {
      const h = el as HTMLElement;
      return {
        scan_id: `elem_${i}`,
        tag: h.tagName.toLowerCase(),
        text: h.innerText?.trim().slice(0, 40) || '',
        aria: h.getAttribute('aria-label')
          || (h as HTMLInputElement).placeholder?.slice(0, 30)
          || '',
        zone: resolveZone(h),
        selector: buildSelector(h),
        visibility: 'visible' as const,
      };
    })
    .filter(el => el.text || el.aria);

  const hiddenOutput = hiddenElements
    .slice(0, HIDDEN_CAP)
    .map((el, i) => {
      const h = el as HTMLElement;
      return {
        scan_id: `hidden_${i}`,
        tag: h.tagName.toLowerCase(),
        text: h.innerText?.trim().slice(0, 40) || '',
        aria: h.getAttribute('aria-label')
          || (h as HTMLInputElement).placeholder?.slice(0, 30)
          || '',
        zone: resolveZone(h),
        selector: buildSelector(h),
        visibility: 'hidden' as const,
      };
    })
    .filter(el => el.text || el.aria);

  if (hiddenOutput.length > 0) {
    logger.info(`Including ${hiddenOutput.length} hidden elements in snapshot`);
  }

  const combined = [...visibleOutput, ...hiddenOutput];

  // ── Apply includeZones filter ──────────────────────────────────────────────
  return combined.filter(el => {
    if (!config.includeZones || config.includeZones.length === 0) return true;
    return (config.includeZones as string[]).includes(el.zone);
  });
}

async function fetchTourWithRetry(
  apiClient: ApiClient,
  maxPolls = 2,
  interval = 1000
): Promise<FetchTourResponse | null> {
  for (let i = 0; i < maxPolls; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, interval));
    const data = await apiClient.fetchTour();
    if (data?.match && data?.show) return data;
  }

  const pendingKey = getStorageKey(apiClient.config.apiKey, 'pending_check');
  sessionStorage.setItem(pendingKey, apiClient.config.contextKey);
  logger.info('Tour not ready after generation — will retry on next visit.');
  return null;
}

// Returns true only if the selector is a non-empty string that isn't the literal
// 'undefined' or 'null' that JS produces when coercing undefined/null in templates.
function isValidSelector(sel: unknown): sel is string {
  return typeof sel === 'string' && sel.length > 0 && sel !== 'undefined' && sel !== 'null';
}


// ─── Step Validation: Three-State Classification ────────────────────────────
// Instead of binary keep/drop, classify each step as:
//   'ready'   — target element is visible right now → play immediately
//   'gated'   — target is hidden/missing but expected → player will wait (Step Gating)
//   'invalid' — target truly doesn't exist → drop from tour
type StepValidation = {
  step: NonNullable<FetchTourResponse['steps']>[number];
  status: 'ready' | 'gated' | 'invalid';
  // The element this step actually resolved to (used to drop duplicate steps
  // that land on the same element).
  el: HTMLElement | null;
};

async function validateTourElements(steps: FetchTourResponse['steps'], config: AITourConfig): Promise<StepValidation[]> {
  if (!steps) return [];

  return Promise.all(
    steps.map(async (step): Promise<StepValidation> => {
      // Pass 1: try CSS selector (fast path)
      let bySelector: HTMLElement | null = null;
      if (isValidSelector(step.targetSelector)) {
        try {
          bySelector = querySelectorDeep(step.targetSelector);
        } catch {
          console.log(`[AITour] Invalid selector "${step.targetSelector}" — skipping to fingerprint fallback.`);
        }
      } else {
        console.log(`[AITour] Step ${step.stepOrder} has no targetSelector — going straight to fingerprint.`);
      }

      if (bySelector && isElementVisible(bySelector)) {
        return { step, status: 'ready', el: bySelector };
      }

      // Pass 2: fingerprint fallback
      if (step.fingerprint && Object.keys(step.fingerprint).length > 0) {
        const byFingerprint = await ElementFinder.findByFingerprint(
          step.fingerprint,
          100, // Fast timeout for validation
          config.fingerprintMinScore
        );
        if (byFingerprint && isElementVisible(byFingerprint)) {
          return { step, status: 'ready', el: byFingerprint };
        }
      }

      // Pass 3: Element not visible — is it a known hidden-element step?
      // If fingerprint says visibility='hidden', it was intentionally included.
      // Also if element exists in DOM but is hidden, mark as gated.
      if (step.fingerprint?.visibility === 'hidden') {
        console.log(`[AITour] Step ${step.stepOrder} is gated (hidden element) — will wait at play-time.`);
        return { step, status: 'gated', el: bySelector };
      }

      // Check if element exists in DOM at all (even if hidden)
      if (bySelector) {
        console.log(`[AITour] Step ${step.stepOrder} element exists but hidden — marking as gated.`);
        return { step, status: 'gated', el: bySelector };
      }

      console.log(`[AITour] Step ${step.stepOrder} ("${step.targetSelector}") — element not found, invalid.`);
      return { step, status: 'invalid', el: null };
    })
  );
}


async function launchTour(apiClient: ApiClient, data: FetchTourResponse): Promise<void> {
  if (!data.steps || data.steps.length === 0) {
    console.warn('[AITour] No steps found in tour data. Aborting.');
    return;
  }

  // Handle delta (highlight new elements) play mode
  let stepsToUse = data.steps;
  if (data.playMode === 'delta') {
    stepsToUse = data.steps.filter(step => step.isNew);
    logger.info(`Delta mode active. Filtered steps count: ${stepsToUse.length}`);
    if (stepsToUse.length === 0) {
      logger.info('No new elements to showcase in delta mode. Auto-completing tour.');
      await apiClient.recordProgress(data.tourId!, 'completed', data.steps.length);
      return;
    }
  }

  const validations = await validateTourElements(stepsToUse, apiClient.config);
  const readyCount = validations.filter(v => v.status === 'ready').length;
  const gatedCount = validations.filter(v => v.status === 'gated').length;
  const invalidCount = validations.filter(v => v.status === 'invalid').length;

  console.log(`[AITour] Validation: ${readyCount} ready, ${gatedCount} gated, ${invalidCount} invalid`);

  // Allow the tour to start as long as there is at least one potentially valid step.
  if (readyCount + gatedCount === 0) {
    logger.info('No steps match the current UI. Skipping.');
    if ((data as any).isLegacyVersion) {
      await apiClient.recordProgress(data.tourId!, 'completed', 0);
    }
    return;
  }

  // Deduplicate steps that resolved to an element already claimed by an earlier step
  // (the LLM sometimes emits two steps for the same card/element, which looks like
  // the highlight appearing twice on one card). Keep invalid/gated steps so they
  // can be skipped or dynamically gated at play-time.
  const claimedElements = new Set<HTMLElement>();
  const validSteps = validations
    .filter(v => {
      if (v.status === 'invalid') {
        // Keep invalid steps in the tour so they can be skipped at play-time!
        return true;
      }
      if (v.el) {
        if (claimedElements.has(v.el)) {
          console.log(`[AITour] Dropping step ${v.step.stepOrder} — duplicate of an element already in the tour.`);
          return false;
        }
        claimedElements.add(v.el);
      }
      return true;
    })
    .map(v => v.step);

  if (activePlayer) {
    activePlayer.unmount();
    activePlayer = null;
  }

  const filteredData: FetchTourResponse = { ...data, steps: validSteps };

  logger.info(`Starting tour: ${filteredData.tourId}`);
  await apiClient.recordProgress(filteredData.tourId!, 'started', 0);

  const tracker = new Tracker(apiClient, apiClient.config.userId);
  const state = new TourState(filteredData.steps!, filteredData.tourId ?? undefined);

  const resumeTourIdKey = getStorageKey(apiClient.config.apiKey, 'resume_tour_id');
  let resumeTourId = safeStorage.get(resumeTourIdKey);

  if (filteredData.hasProgress === false && resumeTourId) {
    const keyStep = getStorageKey(apiClient.config.apiKey, `${resumeTourId}_resume_step`);
    const keyContext = getStorageKey(apiClient.config.apiKey, `${resumeTourId}_resume_context`);
    safeStorage.remove(keyStep);
    safeStorage.remove(keyContext);
    safeStorage.remove(resumeTourIdKey);
    resumeTourId = null;
  }

  let resumeStep: string | null = null;
  let resumeContext: string | null = null;
  let resumeStepKey = '';
  let resumeContextKey = '';

  if (resumeTourId) {
    resumeStepKey = getStorageKey(apiClient.config.apiKey, `${resumeTourId}_resume_step`);
    resumeContextKey = getStorageKey(apiClient.config.apiKey, `${resumeTourId}_resume_context`);
    resumeStep = safeStorage.get(resumeStepKey);
    resumeContext = safeStorage.get(resumeContextKey);
  }

  const serverResumeStep = (filteredData as any).lastCompletedStep;

  if (resumeStep && resumeContext === apiClient.config.contextKey) {
    state.goToStep(parseInt(resumeStep));
    if (resumeStepKey) safeStorage.remove(resumeStepKey);
    if (resumeContextKey) safeStorage.remove(resumeContextKey);
    safeStorage.remove(resumeTourIdKey);
    logger.info(`Resuming from localStorage step: ${resumeStep}`);
  } else if (serverResumeStep && serverResumeStep > 0) {
    state.goToStep(serverResumeStep);
    if (resumeStepKey) safeStorage.remove(resumeStepKey);
    if (resumeContextKey) safeStorage.remove(resumeContextKey);
    safeStorage.remove(resumeTourIdKey);
    logger.info(`Resuming from server-side step: ${serverResumeStep}`);
  }

  const player = new TourPlayer(state, apiClient.config);
  activePlayer = player;

  if (apiClient.config.onTourStart) {
    apiClient.config.onTourStart(filteredData.tourId!);
  }

  // 'impression' = the tour was shown (once per tour); 'step_view' = each step's
  // tooltip was shown. This lets the dashboard report "tours shown" vs "steps
  // shown" separately.
  let impressionTracked = false;
  player.onStepViewed = (stepOrder) => {
    if (!impressionTracked) {
      tracker.track('impression', filteredData.tourId!, { stepIndex: stepOrder });
      impressionTracked = true;
    }
    tracker.track('step_view', filteredData.tourId!, { stepIndex: stepOrder });
    // Only update progress every 3rd step or on last step to reduce API calls
    if (stepOrder % 3 === 0 || state.isLastStep()) {
      apiClient.recordProgress(filteredData.tourId!, 'started', stepOrder);
    }
  };

  player.onTourCompleted = async () => {
    activePlayer = null;
    const tourId = filteredData.tourId ?? '';
    sessionDismissedTours.add(tourId);
    const keyStep = getStorageKey(apiClient.config.apiKey, `${tourId}_resume_step`);
    const keyContext = getStorageKey(apiClient.config.apiKey, `${tourId}_resume_context`);
    const keyTourId = getStorageKey(apiClient.config.apiKey, 'resume_tour_id');
    safeStorage.remove(keyStep);
    safeStorage.remove(keyContext);
    safeStorage.remove(keyTourId);

    const totalSteps = filteredData.steps?.length ?? 0;
    await apiClient.recordProgress(filteredData.tourId!, 'completed', totalSteps);
    tracker.track('complete', filteredData.tourId!);
    tracker.destroy();

    if (apiClient.config.onTourEnd) {
      apiClient.config.onTourEnd(filteredData.tourId!, 'completed');
    }
  };

  player.onTourDismissed = async (isMaybeLater) => {
    activePlayer = null;
    const tourId = filteredData.tourId ?? '';
    const status = isMaybeLater ? 'maybe_later' : 'dismissed';
    if (!isMaybeLater) {
      sessionDismissedTours.add(tourId);
      const keyStep = getStorageKey(apiClient.config.apiKey, `${tourId}_resume_step`);
      const keyContext = getStorageKey(apiClient.config.apiKey, `${tourId}_resume_context`);
      const keyTourId = getStorageKey(apiClient.config.apiKey, 'resume_tour_id');
      safeStorage.remove(keyStep);
      safeStorage.remove(keyContext);
      safeStorage.remove(keyTourId);
      // "Don't show again" → persist a per-page flag so this tour never reappears
      // on this page (survives reloads, independent of the server's show flag).
      const ctx = apiClient.config.contextKey || window.location.pathname;
      safeStorage.set(getStorageKey(apiClient.config.apiKey, `nevershow_${ctx}`), '1');
    }

    const currentStep = state.getCurrentStepIndex?.() ?? 0;
    await apiClient.recordProgress(filteredData.tourId!, status, currentStep);
    tracker.track('skip', filteredData.tourId!);
    tracker.destroy();

    if (apiClient.config.onTourEnd) {
      apiClient.config.onTourEnd(filteredData.tourId!, status);
    }
  };

  player.play();
}

// ── Live page-delta detection (REMOVED) ─────────────────────────────────────

async function startTourForRoute(
  apiClient: ApiClient,
  contextKey: string,
  config: AITourConfig
): Promise<void> {
  // Configurable route gate
  const allowed = config.allowedPaths;
  if (allowed && !allowed.includes(contextKey)) {
    logger.info(`Route "${contextKey}" skipped — not in allowedPaths config.`);
    return;
  }

  // "Don't show again" was clicked here before — never show on this page.
  if (safeStorage.get(getStorageKey(config.apiKey, `nevershow_${contextKey}`)) === '1') {
    logger.info(`Tour permanently hidden by user for ${contextKey}.`);
    return;
  }

  if (activePlayer) {
    activePlayer.unmount();
    activePlayer = null;
  }

  const pendingKey = getStorageKey(config.apiKey, 'pending_check');
  const pendingContext = sessionStorage.getItem(pendingKey);
  if (pendingContext && pendingContext === contextKey) {
    sessionStorage.removeItem(pendingKey);
    const data = await apiClient.fetchTour();
    if (data?.match && data?.show) {
      await launchTour(apiClient, data);
      return;
    }
  }

  let data = await apiClient.fetchTour();
  if (data?.tourId && sessionDismissedTours.has(data.tourId)) {
    logger.info(`Tour "${data.tourId}" was dismissed in this session. Skipping.`);
    return;
  }

  const skipPaths = config.skipPaths || [];
  if (!data || !data.match) {
    if (skipPaths.includes(contextKey)) return;

    logger.info(`No tour for ${contextKey} — auto-generating...`);
    const elements = await collectDomSnapshot(contextKey, config);

    if (elements.length === 0) {
      logger.warn('DOM snapshot returned no elements. Aborting.');
      return;
    }

    const payload = elements;
    const generated = await apiClient.requestTourGeneration(contextKey, payload);
    if (!generated) return;

    if (generated.pending) {
      sessionStorage.setItem(pendingKey, contextKey);
      logger.info('Generation in progress by another request — deferring.');
      return;
    }

    if (!generated.regenerated) return;

    const newData = await fetchTourWithRetry(apiClient);
    if (newData?.match && newData?.show) {
      await launchTour(apiClient, newData);
    }
    return;
  }

  if (!data.show) {
    const resumeTourIdKey = getStorageKey(config.apiKey, 'resume_tour_id');
    const resumeTourId = safeStorage.get(resumeTourIdKey);

    if (resumeTourId) {
      const resumeStepKey = getStorageKey(config.apiKey, `${resumeTourId}_resume_step`);
      const resumeContextKey = getStorageKey(config.apiKey, `${resumeTourId}_resume_context`);
      const resumeStep = safeStorage.get(resumeStepKey);
      const resumeContext = safeStorage.get(resumeContextKey);

      if (resumeStep && resumeContext === contextKey) {
        logger.info(`Tour was permanently dismissed for ${contextKey}. Clearing stale resumeStep.`);
        safeStorage.remove(resumeStepKey);
        safeStorage.remove(resumeContextKey);
        safeStorage.remove(resumeTourIdKey);
      }
    }

    if (skipPaths.includes(contextKey)) return;

    logger.info('Tour completed/skipped previously. UI change regeneration is permanently DISABLED to save tokens.');
    return;
  }

  if ((data as any).userStatus === 'pending') {
    logger.info('Page updated since last visit — showing refreshed tour.');
  }

  await launchTour(apiClient, data);
}

async function startTourForDynamicContent(
  apiClient: ApiClient,
  subContextKey: string,
  config: AITourConfig,
  container?: HTMLElement
): Promise<void> {
  // A section the user just opened takes priority over whatever is running
  // (e.g. a page tour still in progress) — the walkthrough should follow what
  // the user is now looking at. unmount() silently clears it (no dismiss event).
  if (activePlayer) {
    activePlayer.unmount();
    activePlayer = null;
  }
  const allowed = config.allowedPaths;
  if (allowed && !allowed.some(p => subContextKey.startsWith(p))) {
    logger.info(`Dynamic context "${subContextKey}" skipped — not in allowedPaths.`);
    return;
  }

  // "Don't show again" was clicked for this context before — never show it again.
  if (safeStorage.get(getStorageKey(config.apiKey, `nevershow_${subContextKey}`)) === '1') {
    logger.info(`Dynamic tour permanently hidden by user for ${subContextKey}.`);
    return;
  }
  logger.info(`Dynamic tour check: ${subContextKey}`);

  const isAborted = () => container && !isElementVisible(container);

  await new Promise(r => setTimeout(r, 600));
  if (isAborted()) {
    logger.info(`Dynamic container for ${subContextKey} is no longer visible. Aborting tour check.`);
    return;
  }

  const subClient = new ApiClient({
    ...apiClient.config,
    contextKey: subContextKey
  });

  // Scope the scan to the opened container itself — no zone whitelist needed,
  // since the container already bounds what the user is looking at. (The old
  // includeZones:['modal','popup'] filter dropped inline sections that live in
  // the 'main' zone, producing "No elements in dynamic content".)
  const dynamicConfig: AITourConfig = {
    ...config,
    includeZones: []
  };

  const data = await subClient.fetchTour();
  if (isAborted()) return;

  if (data?.tourId && sessionDismissedTours.has(data.tourId)) {
    logger.info(`Tour "${data.tourId}" was dismissed in this session. Skipping.`);
    return;
  }

  const pendingKey = getStorageKey(config.apiKey, 'pending_check');
  if (!data || !data.match) {
    const elements = await collectDomSnapshot(subContextKey, dynamicConfig, container ?? document);
    if (elements.length === 0) {
      logger.info('No elements in dynamic content. Skipping.');
      return;
    }
    if (isAborted()) return;

    const payload = elements;
    const generated = await subClient.requestTourGeneration(subContextKey, payload);

    if (!generated) return;
    if (isAborted()) return;

    if (generated.pending) {
      sessionStorage.setItem(pendingKey, subContextKey);
      return;
    }
    if (!generated.regenerated) return;

    const newData = await fetchTourWithRetry(subClient);
    if (isAborted()) return;

    if (newData?.match && newData?.show) await launchTour(subClient, newData);
    return;
  }

  if (!data.show) {
    logger.info(`Tour completed/skipped previously for ${subContextKey}. UI change regeneration is permanently DISABLED to save tokens.`);
    return;
  }

  await launchTour(subClient, data);
}

export const AITour = {
  async init(rawConfig: Partial<AITourConfig>) {
    const config = validateConfig(rawConfig);
    logger.setLevel(config.logLevel ?? 'info');

    if (activeSpaObserver) { activeSpaObserver.destroy(); activeSpaObserver = null; }
    if (activeDynamicWatcher) { activeDynamicWatcher.destroy(); activeDynamicWatcher = null; }
    if (activePlayer) { activePlayer.unmount(); activePlayer = null; }

    const apiClient = new ApiClient(config);

    const lastUserKey = getStorageKey(config.apiKey, 'last_user_id');
    const lastUser = safeStorage.get(lastUserKey);
    if (lastUser && lastUser !== config.userId) {
      sessionStorage.removeItem(getStorageKey(config.apiKey, 'pending_check'));
      const resumeTourIdKey = getStorageKey(config.apiKey, 'resume_tour_id');
      const resumeTourId = safeStorage.get(resumeTourIdKey);
      if (resumeTourId) {
        safeStorage.remove(getStorageKey(config.apiKey, `${resumeTourId}_resume_step`));
        safeStorage.remove(getStorageKey(config.apiKey, `${resumeTourId}_resume_context`));
      }
      safeStorage.remove(resumeTourIdKey);
    }
    safeStorage.set(lastUserKey, config.userId);

    await loadRuntimeSelectors(config);
    await waitForDomIdle(config.domIdleMs, config.domIdleMaxWait);
    await startTourForRoute(apiClient, config.contextKey, config);

    // CHANGE: DynamicContentWatcher's constructor now takes a
    // DynamicContentWatcherOptions object as its 3rd argument instead of a
    // raw debounceMs number, so config.watcherDebounceMs must be wrapped.
    activeDynamicWatcher = new DynamicContentWatcher(
      (subContextKey, container) => startTourForDynamicContent(apiClient, subContextKey, config, container),
      () => { if (activePlayer) { activePlayer.dismiss(); activePlayer = null; } },
      { debounceMs: config.watcherDebounceMs }
    );
    activeDynamicWatcher.watch(config.contextKey);

    activeSpaObserver = new SPAObserver(
      async (newPath: string) => {
        if (activePlayer) { activePlayer.unmount(); activePlayer = null; }
        if (activeDynamicWatcher) { activeDynamicWatcher.destroy(); }

        config.contextKey = newPath;
        apiClient.config.contextKey = newPath;

        // CHANGE: same wrapping fix applied here, since this is the second
        // place a DynamicContentWatcher is constructed (on SPA route change).
        activeDynamicWatcher = new DynamicContentWatcher(
          (subContextKey, container) => startTourForDynamicContent(apiClient, subContextKey, config, container),
          () => { if (activePlayer) { activePlayer.dismiss(); activePlayer = null; } },
          { debounceMs: config.watcherDebounceMs }
        );
        activeDynamicWatcher.watch(newPath);

        await startTourForRoute(apiClient, newPath, config);
      },
      () => {
        if (activePlayer) {
          logger.info('Route change initiated — immediately unmounting active player to prevent step skipping');
          activePlayer.unmount(true); // Save progress before unmounting
          activePlayer = null;
        }
      }
    );

    activeSpaObserver.listen();
  },

  destroy(apiKey?: string) {
    if (activeSpaObserver) { activeSpaObserver.destroy(); activeSpaObserver = null; }
    if (activeDynamicWatcher) { activeDynamicWatcher.destroy(); activeDynamicWatcher = null; }
    if (activePlayer) { activePlayer.unmount(); activePlayer = null; }
    if (apiKey) {
      sessionStorage.removeItem(getStorageKey(apiKey, 'pending_check'));
      safeStorage.remove(getStorageKey(apiKey, 'last_user_id'));
      const resumeTourIdKey = getStorageKey(apiKey, 'resume_tour_id');
      const resumeTourId = safeStorage.get(resumeTourIdKey);
      if (resumeTourId) {
        safeStorage.remove(getStorageKey(apiKey, `${resumeTourId}_resume_step`));
        safeStorage.remove(getStorageKey(apiKey, `${resumeTourId}_resume_context`));
      }
      safeStorage.remove(resumeTourIdKey);
    }
  },

  pauseTour() {
    activePlayer?.pause();
  },

  resumeTour() {
    activePlayer?.resume();
  },

  skipTour() {
    activePlayer?.dismiss();
  },

  isActive(): boolean {
    return activePlayer !== null;
  }
};

// When loaded directly in a browser via a <script> tag (CDN/IIFE build), expose
// the SDK as `window.AITour` so clients can call `AITour.init(...)` without any
// import. No-op under SSR / module bundlers (guarded by `typeof window`).
if (typeof window !== 'undefined') {
  (window as any).AITour = AITour;
}