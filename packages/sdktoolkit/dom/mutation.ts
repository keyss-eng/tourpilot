import { isContainerVisible, isElementVisible, querySelectorAllDeep, querySelectorDeep } from './index';
import { logger } from '../utils/logger';

function isTourElement(el: HTMLElement | null): boolean {
  let current: HTMLElement | null = el;
  while (current) {
    if (
      current.id === 'aitour-shadow-host' ||
      current.id === 'aitour-gate-host' ||
      (current.classList && (
        current.classList.contains('aitour-card') ||
        current.classList.contains('aitour-gate')
      ))
    ) {
      return true;
    }
    const root = current.getRootNode();
    current = root instanceof ShadowRoot ? (root.host as HTMLElement) : current.parentElement;
  }
  return false;
}

// CHANGE #1: generic, framework-agnostic root detection. Instead of guessing
// app-specific IDs (#app, #root, etc. — which only match certain frameworks
// and miss others like Next.js's #__next, Vue, Angular, custom setups), this
// finds the single top-level element under <body> if there is exactly one.
// That works as a reasonable observation root regardless of framework.
function detectAppRoot(): Element | null {
  const bodyChildren = Array.from(document.body.children).filter(
    (el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META'].includes(el.tagName)
  );
  if (bodyChildren.length === 1) return bodyChildren[0];
  return null;
}

// CHANGE #6: options object lets any consuming project configure the watcher
// without touching SDK internals — true "drop-in, zero project changes"
// behavior, with an escape hatch for projects with non-standard structure.
export interface DynamicContentWatcherOptions {
  debounceMs?: number;
  /** Extra CSS selectors to check as candidate root containers, project-specific. */
  additionalRootSelectors?: string[];
  /** Extra CSS selector (comma-separated) to treat as "significant" elements. */
  additionalSignificantSelector?: string;
}

export class DynamicContentWatcher {

  private observers: MutationObserver[] = [];

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private currentSubContext: string | null = null;

  // The container element backing currentSubContext. Lets us distinguish "the
  // overlay I'm tracking actually closed" from unrelated page churn.
  private currentContainer: HTMLElement | null = null;

  private onAppear: (subContextKey: string, container: HTMLElement) => void;

  private onDisappear: () => void;

  private debounceMs: number;

  // CHANGE #6: stored config from options.
  private additionalRootSelectors: string[];

  private additionalSignificantSelector: string;

  // CHANGE #7: track whether we're in body-fallback mode so we can scope
  // down the MutationObserver config for performance.
  private isBodyFallback: boolean = false;

  // CHANGE #8: bound reference so the beforeunload listener can be removed
  // in destroy() — otherwise it would leak across multiple watch()/destroy() cycles.
  private boundUnloadCleanup: () => void;

  constructor(
    onAppear: (subContextKey: string, container: HTMLElement) => void,
    onDisappear: () => void,
    options: DynamicContentWatcherOptions = {}
  ) {
    this.onAppear = onAppear;
    this.onDisappear = onDisappear;
    this.debounceMs = options.debounceMs ?? 600;
    this.additionalRootSelectors = options.additionalRootSelectors ?? [];
    this.additionalSignificantSelector = options.additionalSignificantSelector ?? '';
    this.boundUnloadCleanup = () => this.destroy();
  }

  public watch(baseContextKey: string) {
    if (this.observers.length) this.destroy();

    const handler = (mutations: MutationRecord[]) => {
      let triggerAppear = false;
      let triggerDisappear = false;
      // Attribute-driven (visibility-toggled) significant element changed — the
      // appear-vs-hide decision is deferred to the debounced re-scan, because a
      // CSS transition means the element's instantaneous opacity is unreliable
      // at the exact mutation tick.
      let triggerRecheck = false;

      for (const mutation of mutations) {

        // ── Type 0: Inner content of the tracked overlay changed ──────────────
        // A modal can switch between sub-views WITHOUT adding a new dialog node
        // (e.g. "Edit profile" → "Change phone number" → "Verify current phone").
        // Re-key on any mutation inside the tracked container so each sub-view
        // gets its own context/tour. (buildSubContextKey reads the live heading;
        // if it's unchanged the debounce dedupes — subKey === currentSubContext.)
        if (
          this.currentContainer &&
          mutation.target instanceof Node &&
          this.currentContainer.contains(mutation.target)
        ) {
          triggerRecheck = true;
        }

        // ── Type 1: Node add/remove (modals jo DOM mein aate jaate hain) ──────
        if (mutation.type === 'childList') {
          for (const node of Array.from(mutation.addedNodes)) {
            if (this.isSignificantNode(node)) triggerAppear = true;
          }
          for (const node of Array.from(mutation.removedNodes)) {
            if (this.isSignificantNode(node)) triggerDisappear = true;
          }
        }

        // ── Type 2: Attribute change (CSS class/state toggle wale dropdowns) ──
        // These cover containers that are ALWAYS mounted and merely toggled
        // visible via class/style/aria-hidden/hidden (e.g. a `role="menu"`
        // dropdown that flips opacity). We do NOT decide appear-vs-hide here:
        // during a CSS transition the element's opacity is mid-interpolation,
        // so an instantaneous isContainerVisible() call is unreliable. Instead
        // we flag a re-scan and let the debounced check (which runs after the
        // transition settles) decide via findVisibleContainer().
        if (mutation.type === 'attributes') {
          const el = mutation.target as HTMLElement;
          const attr = mutation.attributeName;
          if (
            (attr === 'class' ||
              attr === 'style' ||
              attr === 'data-state' ||
              attr === 'aria-hidden' ||
              attr === 'hidden') &&
            this.isSignificantElement(el)
          ) {
            triggerRecheck = true;
          }
        }
      }

      // ── Appear / attribute re-check ──
      // Both the "significant node was inserted" and "significant container was
      // toggled via attribute" paths resolve through one debounced re-scan.
      // findVisibleContainer() is the single source of truth for what's actually
      // on screen after the dust (and any CSS transition) settles.
      if (triggerAppear || triggerRecheck) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        this.debounceTimer = setTimeout(() => {
          // Only known overlays (modal / menu / dialog / dropdown / drawer).
          const container = this.findVisibleContainer();

          if (container) {
            const subKey = this.buildSubContextKey(baseContextKey, container);
            if (subKey === this.currentSubContext) return;

            this.currentSubContext = subKey;
            this.currentContainer = container;
            logger.info(`Dynamic content appeared: ${subKey}`);
            this.onAppear(subKey, container);
          } else if (this.currentSubContext) {
            // Nothing relevant visible now. Only close if the section we were
            // ACTUALLY tracking is gone/hidden — ignore unrelated page churn so
            // an in-progress section tour is never killed mid-way.
            if (
              this.currentContainer &&
              document.contains(this.currentContainer) &&
              isElementVisible(this.currentContainer)
            ) {
              return;
            }
            logger.info(`Dynamic content removed: ${this.currentSubContext}`);
            this.currentSubContext = null;
            this.currentContainer = null;
            this.onDisappear();
          }
        }, this.debounceMs);
      }

      // ── Disappear trigger (explicit removal of a known overlay node) ──
      if (triggerDisappear && !triggerAppear && !triggerRecheck && this.currentSubContext) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        logger.info(`Dynamic content removed: ${this.currentSubContext}`);
        this.currentSubContext = null;
        this.currentContainer = null;
        this.onDisappear();
      }
    };

    // CHANGE #1 + #6: collect candidate targets without hardcoded app-specific
    // guesses. Common portal conventions (modal-root, Radix, data-portals)
    // are still checked since those are library conventions, not app-specific
    // IDs. Project-specific overrides come from additionalRootSelectors.
    // The generic single-child-of-body detector replaces the old #app/#root/main guesses.
    const rawTargets: (Element | null)[] = [
      document.getElementById('modal-root'),
      document.querySelector('[data-portals]'),        // React portal container
      document.querySelector('[data-radix-portal]'),   // Radix UI portals
      ...this.additionalRootSelectors.map((sel) => {
        try {
          return document.querySelector(sel);
        } catch {
          logger.debug(`Invalid additionalRootSelectors entry, skipping: ${sel}`);
          return null;
        }
      }),
      detectAppRoot(),
    ];

    // Deduplicate
    const validTargets = rawTargets.filter(Boolean) as Element[];
    const deduped = validTargets.filter(
      (t) => !validTargets.some((other) => other !== t && other.contains(t))
    );

    // CHANGE #2: fallback to body is expected/normal behavior for a generic
    // SDK running on an unknown project structure — log at debug level with
    // neutral wording instead of info-level "problem"-sounding text.
    this.isBodyFallback = deduped.length === 0;
    if (deduped.length === 0) {
      deduped.push(document.body);
      logger.debug('Using document.body as observation root (no specific portal containers detected).');
    }

    // We observe attributes EVEN in the body-fallback case. Always-mounted
    // containers that toggle visibility via class/aria-hidden (the most common
    // dropdown/menu pattern — e.g. a `role="menu"` whose opacity flips) produce
    // NO childList mutation, so without attribute observation they are invisible
    // to the watcher on any app whose structure forces the body fallback.
    //
    // The original perf concern (CHANGE #7) is mitigated three ways:
    //   1. A tight attributeFilter — only these 5 attributes wake the handler.
    //   2. The per-mutation work is just isSignificantElement() (cheap role/tag
    //      /classList checks); the expensive scan is debounced.
    //   3. findVisibleContainer() runs once per debounce window, not per record.
    const observeConfig: MutationObserverInit = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-state', 'aria-hidden', 'hidden'],
    };

    for (const target of deduped) {
      const obs = new MutationObserver(handler);
      obs.observe(target, observeConfig);
      this.observers.push(obs);
    }

    // CHANGE #8: safety net for consumers that don't have a framework
    // lifecycle hook to call destroy() from (e.g. plain script-tag usage).
    // Removed in destroy() to avoid leaking listeners across watch() calls.
    window.addEventListener('beforeunload', this.boundUnloadCleanup, { once: true });
  }


  // ─── Helpers ──────────────────────────────────────────────────────────────

  private isSignificantNode(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    if (isTourElement(el)) return false;

    if (this.isSignificantElement(el)) return true;

    const rootToCheck = el.shadowRoot || el;
    const baseSelector = '[role="dialog"], [role="menu"], dialog, .modal, [data-modal]';
    // CHANGE #6: merge in any project-specific "significant" selector.
    const selector = this.additionalSignificantSelector
      ? `${baseSelector}, ${this.additionalSignificantSelector}`
      : baseSelector;

    return !!querySelectorDeep(selector, rootToCheck);
  }

  private isSignificantElement(el: HTMLElement): boolean {
    if (isTourElement(el)) return false;
    const role = el.getAttribute?.('role') || '';
    const tag = el.tagName?.toLowerCase() || '';

    const builtIn = (
      role === 'dialog' ||
      role === 'menu' ||
      role === 'menubar' ||
      role === 'navigation' ||          // ARIA nav landmarks (drawers, sidebars)
      tag === 'dialog' ||
      el.classList?.contains('modal') ||
      el.classList?.contains('dropdown-menu') ||
      el.classList?.contains('popup') ||
      el.classList?.contains('drawer') ||  // Navigation drawers
      el.classList?.contains('offcanvas') ||  // Bootstrap 5 offcanvas
      el.classList?.contains('sidebar') ||  // Sidebar panels
      el.classList?.contains('nav-panel') ||  // Custom nav panels
      el.hasAttribute?.('data-modal') ||
      el.hasAttribute?.('data-dropdown') ||
      el.hasAttribute?.('data-drawer')           // Custom drawer attribute
    );

    if (builtIn) return true;

    // CHANGE #6: project-specific override — lets a consuming project flag
    // its own custom container class/attribute as "significant" without
    // forking the SDK.
    if (this.additionalSignificantSelector) {
      try {
        return el.matches(this.additionalSignificantSelector);
      } catch {
        return false;
      }
    }

    return false;
  }

  private findVisibleContainer(): HTMLElement | null {
    // ✅ FIX Bug 3: Added .modal, .popup, .dropdown-menu class selectors and
    // Radix portal children — previously only role/data attributes were checked,
    // so class-toggled dropdowns (Bootstrap, custom) were never found here.
    const selectors = [
      '[role="dialog"]',
      '[role="menu"]',
      'dialog[open]',
      '[data-modal]',
      '[data-dropdown]',
      '.modal',
      '.popup',
      '.dropdown-menu',
    ];

    // CHANGE #5: collect ALL visible candidates across selectors instead of
    // returning the first match found. With stacked/overlapping overlays
    // (e.g. a dropdown opened on top of a modal), the first DOM-order match
    // isn't necessarily the active/topmost one — prefer highest z-index.
    const allCandidates: HTMLElement[] = [];

    for (const selector of selectors) {
      const candidates = querySelectorAllDeep(selector);
      for (const el of candidates) {
        if (!isTourElement(el) && isContainerVisible(el)) {
          allCandidates.push(el);
        }
      }
    }

    if (allCandidates.length === 0) return null;
    if (allCandidates.length === 1) return allCandidates[0];

    return allCandidates.reduce((top, current) => {
      const topZ = parseInt(getComputedStyle(top).zIndex, 10) || 0;
      const curZ = parseInt(getComputedStyle(current).zIndex, 10) || 0;
      return curZ > topZ ? current : top;
    });
  }

  private buildSubContextKey(baseKey: string, container: HTMLElement): string {
    // Determine if the popup belongs to a global layout element (navbar, sidebar, header)
    // Checking activeElement helps if the popup is rendered in a React portal appended to <body>
    // Prefix decided from the container's OWN type/location (deterministic — no
    // flaky document.activeElement).
    //   • A modal / dialog is app-level UI (profile, notifications, change-phone)
    //     launched from the global navbar — the SAME panel on every route, so it
    //     is GLOBAL. This gives it ONE stable key (global:edit-profile) so it
    //     never regenerates or re-shows when you revisit it from another route.
    //     (Distinct sub-views still differ via their heading slug, e.g.
    //     global:change-phone-number.)
    //   • Header / nav / aside containers (the menu itself) are global too.
    //   • Everything else (in-page content) stays scoped to the current route.
    const isModal = !!container.closest('[role="dialog"], dialog, .modal, [data-modal]');
    const isGlobal = isModal || !!container.closest('header, nav, aside, [data-global-tour]');

    const prefix = isGlobal ? 'global' : baseKey;

    // 1. Developer-defined ID (sabse reliable)
    const dataId = container.getAttribute('data-tour-id') ||
      container.getAttribute('data-modal-id');
    if (dataId) return `${prefix}:${this.slug(dataId)}`;

    const role = container.getAttribute('role') || '';

    // 2. Modal / Dialog — heading se naam lo
    if (role === 'dialog' || container.tagName.toLowerCase() === 'dialog') {
      const heading = container
        .querySelector('h1, h2, h3, [role="heading"]')
        ?.textContent?.trim();
      if (heading) return `${prefix}:${this.slug(heading)}`;
      return `${prefix}:modal`;
    }

    // 3. aria-label se naam
    const ariaLabel = container.getAttribute('aria-label');
    if (ariaLabel) return `${prefix}:${this.slug(ariaLabel)}`;

    // 4. Heading se naam
    const heading = container
      .querySelector('h1, h2, h3, h4, [role="heading"]')
      ?.textContent?.trim();
    if (heading) return `${prefix}:${this.slug(heading)}`;

    // 5. Last resort — first actionable element's label, so two different
    // inline sections don't both collapse to the generic ":popup" key (which
    // would make them share/overwrite each other's generated tour).
    const firstAction = container
      .querySelector('button, a[href]')
      ?.textContent?.trim();
    if (firstAction) return `${prefix}:${this.slug(firstAction)}`;

    return `${prefix}:popup`;
  }

  private slug(text: string): string {
    const slugged = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .substring(0, 30);
    // CHANGE #9: avoid producing an empty-string slug (e.g. from emoji-only
    // or punctuation-only headings), which would otherwise create a
    // dangling "prefix:" key that could collide with other empty keys.
    return slugged || 'unnamed';
  }

  public destroy() {
    for (const obs of this.observers) {
      obs.disconnect();
    }
    this.observers = [];

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.currentSubContext = null;
    this.currentContainer = null;
    this.isBodyFallback = false;

    // CHANGE #8: clean up the safety-net listener so repeated watch()/destroy()
    // cycles (e.g. SPA route changes) don't accumulate duplicate listeners.
    window.removeEventListener('beforeunload', this.boundUnloadCleanup);
  }
}