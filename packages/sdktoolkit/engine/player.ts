import { TourState } from './state';
import type { TourStep, AITourConfig } from '../api/types';
import { ElementFinder, ElementGate } from '../detector';
import { isElementVisible, escapeHtml, safeStorage, querySelectorAllDeep } from '../dom';
import { logger } from '../utils/logger';
import { getStrings } from '../tooltip/strings';
import { getThemeColors } from '../tooltip/theme';
import { buildTooltipCard } from '../tooltip/card';
import { buildGateCard } from '../tooltip/gate-card';
import { globalKey, tourKey } from '../storage';

export class TourPlayer {
  public static readonly TOOLTIP_WIDTH = 320;
  public static readonly TOOLTIP_HEIGHT = 200;
  // Highlight padding + colour. Navy (not bright blue) per design.
  public static readonly HL_PAD = 4;
  public static readonly HL_COLOR = '#1e3a8a';

  private state: TourState;
  private config?: AITourConfig;
  private shadowHost: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private activeTarget: HTMLElement | null = null;
  private backdropElement: HTMLElement | null = null;
  private isPaused: boolean = false;
  private targetVisibilityObserver: MutationObserver | null = null;
  // P3: coalesce a burst of mutations into a single visibility check per frame.
  private visCheckScheduled: boolean = false;
  // Throttle scroll/resize repositioning to one update per animation frame.
  private repoScheduled: boolean = false;
  private targetResizeObserver: ResizeObserver | null = null;
  private isFinishing: boolean = false;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private scrollHandler: (() => void) | null = null;
  private openedMenuTrigger: HTMLElement | null = null;
  // ── Step Gating state ──────────────────────────────────────────────────────
  private activeGate: ElementGate | null = null;
  private gateHost: HTMLElement | null = null;
  private gateRoot: ShadowRoot | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  private get isRtlLocale(): boolean {
    const localeStr = typeof this.config?.locale === 'string' ? this.config.locale : 'en';
    return ['ar', 'he', 'iw', 'fa', 'ur'].some(lang => localeStr.startsWith(lang));
  }

  public onStepViewed?: (stepOrder: number) => void;
  public onTourCompleted?: () => void;
  public onTourDismissed?: (isMaybeLater: boolean) => void;

  constructor(state: TourState, config?: AITourConfig) {
    this.state = state;
    this.config = config;
    if (config?.logLevel) {
      logger.setLevel(config.logLevel);
    }
  }

  public play() {
    this.isPaused = false;
    this.bindKeyboardNavigation();
    this.renderCurrentStep();
  }

  public pause() {
    this.isPaused = true;
    if (this.activeTimer) clearTimeout(this.activeTimer);
    const btn = this.shadowRoot?.getElementById('pause-btn');
    if (btn) btn.innerText = 'Play';
  }

  public resume() {
    this.isPaused = false;
    const step = this.state.getCurrentStep();
    if (step && this.activeTarget) {
      this.bindAutoAdvance(step, this.activeTarget);
    }
    const btn = this.shadowRoot?.getElementById('pause-btn');
    if (btn) btn.innerText = 'Pause';
  }

  private createBackdrop() {
    if (!this.backdropElement) {
      this.backdropElement = document.createElement('div');
      this.backdropElement.id = 'aitour-backdrop';
      this.backdropElement.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483640 !important;
        pointer-events: none !important;
        transition: opacity 0.3s ease !important;
      `;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.style.cssText = 'position: absolute; left: 0; top: 0; pointer-events: none;';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'rgba(0, 0, 0, 0.6)');
      path.setAttribute('fill-rule', 'evenodd');
      path.style.cssText = 'pointer-events: auto;';

      svg.appendChild(path);
      this.backdropElement.appendChild(svg);
      document.body.appendChild(this.backdropElement);
    }
  }

  private removeBackdrop() {
    if (this.backdropElement && this.backdropElement.parentNode) {
      this.backdropElement.parentNode.removeChild(this.backdropElement);
      this.backdropElement = null;
    }
  }

  private async renderCurrentStep() {
    const step = this.state.getCurrentStep();
    if (!step) return;

    try {
      await this._doRenderStep(step);
    } catch (err) {
      logger.error('renderCurrentStep crashed — unmounting to restore host page styles:', err);
      this.unmount();
    }
  }

  private async _doRenderStep(step: TourStep) {
    if (this.isFinishing || this.isPaused) return;

    this.clearActiveStepUI();

    // ── Step 1: Try to resolve the element immediately ──────────────────────
    const targetElement = await this.resolveElement(step);

    if (this.isFinishing || this.isPaused) return;

    if (targetElement && this.isElVisible(targetElement)) {
      // FAST PATH: Element is visible — render normally
      this.renderStepOnTarget(step, targetElement);
      return;
    }

    // ── Step 2: Element not visible — enter Step Gating mode ────────────────
    // Show a "waiting" UI and watch the DOM with MutationObserver.
    if (step.fingerprint?.visibility === 'hidden' || targetElement) {
      logger.info(`Step ${step.stepOrder} target not visible — entering gate mode`);

      this.showGateUI(step);

      this.activeGate = new ElementGate(this.config);
      // Don't hang on a hidden/missing element — skip quickly so a tour with a
      // few non-visible steps doesn't feel stuck on "Waiting for you...".
      const gateTimeout = this.config?.gateTimeoutMs ?? 5000;
      const resolved = await this.activeGate.waitForElement(
        step,
        (sel) => this.getSafeSelector(sel),
        gateTimeout
      );

      if (this.isFinishing || this.isPaused) {
        if (this.activeGate) { this.activeGate.cleanup(); this.activeGate = null; }
        this.clearGateUI();
        return;
      }

      this.clearGateUI();

      if (resolved) {
        logger.info(`Gate resolved for step ${step.stepOrder} — element appeared`);
        this.renderStepOnTarget(step, resolved);
      } else {
        logger.info(`Gate timed out for step ${step.stepOrder} — skipping`);
        this.handleNext();
      }
      return;
    }

    // ── Step 3: Element truly doesn't exist — skip ──────────────────────────
    logger.warn(`Element not found for step ${step.stepOrder}. Skipping.`);
    this.handleNext();
  }

  private clearActiveStepUI() {
    if (this.shadowHost?.parentNode) {
      this.shadowHost.parentNode.removeChild(this.shadowHost);
    }
    this.shadowHost = null;
    this.shadowRoot = null;
    this.removeHighlight();
    // Drop the old cutout immediately so the previous step's "hole" doesn't
    // linger (e.g. after a click navigates and the next element is still being
    // resolved / gated). The next step sets a fresh cutout when it renders.
    this.hideBackdropCutout();
    this.clearScrollHandler();
  }

  // Reset the backdrop to a full (hole-less) overlay so no stale highlight shows.
  private hideBackdropCutout() {
    const path = this.backdropElement?.querySelector('path');
    if (path) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      path.setAttribute('d', `M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z`);
    }
  }


  // ── Render step on a resolved visible target ───────────────────────────────
  private renderStepOnTarget(step: TourStep, targetElement: HTMLElement) {
    // Transition smoothly: clear old step's DOM right before showing the new one
    this.clearActiveStepUI();

    this.activeTarget = targetElement;
    this.createBackdrop();

    this.activeTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });

    this.shadowHost = document.createElement('div');
    this.shadowHost.id = 'aitour-shadow-host';
    this.shadowHost.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(this.shadowHost);
    this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });

    // Draw the Highlight Ring inside our Shadow DOM
    const rect = targetElement.getBoundingClientRect();
    const pad = TourPlayer.HL_PAD;
    const ring = document.createElement('div');
    ring.id = 'aitour-highlight-ring';
    // NOTE: no position transition — a transition makes the ring "chase" the
    // element while scrolling (visible jitter). It must stick tight to the rect.
    ring.style.cssText = `
      position: fixed;
      top: ${rect.top - pad}px;
      left: ${rect.left - pad}px;
      width: ${rect.width + pad * 2}px;
      height: ${rect.height + pad * 2}px;
      border: 3px solid ${TourPlayer.HL_COLOR};
      border-radius: 8px;
      box-shadow: 0 0 12px 4px rgba(30, 58, 138, 0.35);
      pointer-events: none;
      z-index: 2147483646;
    `;
    this.shadowRoot.appendChild(ring);

    // Update backdrop SVG path cutout
    const path = this.backdropElement?.querySelector('path');
    if (path) {
      path.setAttribute('d', this.getSvgPathForHighlight(rect));
    }

    this.drawTooltip(step, targetElement);

    if (!this.isPaused) {
      this.bindAutoAdvance(step, targetElement);
    }

    if (this.onStepViewed) {
      this.onStepViewed(step.stepOrder);
    }

    this.startTargetVisibilityObserver(step, targetElement);
    this.startTargetResizeObserver(targetElement);

    // Reposition periodically for a short duration to ensure alignment during smooth scroll
    const runReposition = () => this.repositionHighlightAndTooltip();
    setTimeout(runReposition, 50);
    setTimeout(runReposition, 150);
    setTimeout(runReposition, 300);
    setTimeout(runReposition, 500);
  }

  // ── Element visibility check ───────────────────────────────────────────────
  private isElVisible(el: HTMLElement): boolean {
    return isElementVisible(el);
  }

  private startTargetVisibilityObserver(step: TourStep, targetElement: HTMLElement) {
    this.stopTargetVisibilityObserver();

    this.targetVisibilityObserver = new MutationObserver(() => {
      if (this.isPaused || this.isFinishing) return;
      // P3: SPA re-renders fire this observer dozens of times per interaction.
      // isElementVisible() forces layout, so collapse a burst into one rAF check
      // instead of running it per mutation record.
      if (this.visCheckScheduled) return;
      this.visCheckScheduled = true;
      requestAnimationFrame(() => {
        this.visCheckScheduled = false;
        if (this.isPaused || this.isFinishing || !this.targetVisibilityObserver) return;
        if (!document.body.contains(targetElement) || !isElementVisible(targetElement)) {
          logger.info(`Active target element disappeared for step ${step.stepOrder} — entering gate mode`);
          this.stopTargetVisibilityObserver();
          this.removeHighlight();
          this._doRenderStep(step);
        }
      });
    });

    this.targetVisibilityObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-state']
    });
  }

  private stopTargetVisibilityObserver() {
    if (this.targetVisibilityObserver) {
      this.targetVisibilityObserver.disconnect();
      this.targetVisibilityObserver = null;
    }
    this.visCheckScheduled = false;
  }

  private getSafeSelector(selector: string | undefined): string | null {
    if (!selector || selector === 'undefined' || selector === 'null') return null;
    // Only escape brackets that are part of a class name (e.g. .text-[22px])
    // This prevents breaking attribute selectors like [aria-expanded="false"]
    return selector.replace(/\.([a-zA-Z0-9_-]+)\[([^\]]+)\]/g, '.$1\\[$2\\]');
  }

  private async resolveElement(step: TourStep): Promise<HTMLElement | null> {
    // ✅ Guard: skip querySelector if selector is missing/invalid
    let elementsBySelector: NodeListOf<Element> | null = null;
    const safeSelector = this.getSafeSelector(step.targetSelector);
    if (safeSelector) {
      try {
        elementsBySelector = document.querySelectorAll(safeSelector);
      } catch {
        logger.warn(`Invalid selector "${safeSelector}" — using fingerprint fallback.`);
      }
    }

    if (elementsBySelector?.length === 1) {
      return elementsBySelector[0] as HTMLElement;
    }
    if (elementsBySelector && elementsBySelector.length > 1) {
      logger.info(`Selector "${step.targetSelector}" is ambiguous (${elementsBySelector.length} matches).`);
    }

    const fingerprintMatch = await ElementFinder.findByFingerprint(
      step.fingerprint,
      100, // Fast timeout at play-time
      this.config?.fingerprintMinScore
    );

    // ✅ FIX: If fingerprint fails but we have ambiguous CSS matches, score them to find the best candidate!
    // This prevents highlighting wrong or tiny border elements when selectors are ambiguous.
    if (!fingerprintMatch && elementsBySelector && elementsBySelector.length > 0) {
      let bestMatch: HTMLElement | null = null;
      let bestScore = -1;
      const minScore = this.config?.fingerprintMinScore ?? 20;

      for (const el of Array.from(elementsBySelector) as HTMLElement[]) {
        if (!isElementVisible(el)) continue;

        const score = ElementFinder.scoreElement(el, step.fingerprint);

        if (score >= minScore && score > bestScore) {
          bestScore = score;
          bestMatch = el;
        }
      }

      if (bestMatch && bestScore > 0) {
        logger.info(`Using best fingerprint-scored match among ambiguous selectors.`);
        return bestMatch;
      }

      // Fallback: use first visible match among ambiguous selectors
      const firstVisible = Array.from(elementsBySelector).find(el => isElementVisible(el as HTMLElement)) as HTMLElement | undefined;
      if (firstVisible) {
        logger.info(`Using first visible match of ambiguous selector.`);
        return firstVisible;
      }

      logger.info(`Using first match of ambiguous selector.`);
      return elementsBySelector[0] as HTMLElement;
    }

    return fingerprintMatch;
  }

  // ── Step Gating UI ─────────────────────────────────────────────────────────
  private showGateUI(step: TourStep) {
    this.clearGateUI();
    this.createBackdrop();

    this.gateHost = document.createElement('div');
    this.gateHost.id = 'aitour-gate-host';
    this.gateHost.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(this.gateHost);
    this.gateRoot = this.gateHost.attachShadow({ mode: 'open' });

    const strings = this.getStrings();
    const colors = this.getThemeColors();

    const gateCard = document.createElement('div');
    gateCard.innerHTML = buildGateCard({
      colors,
      theme: this.config?.theme,
      stepNumber: this.state.getStepNumber(),
      title: step.title,
      content: step.content,
      strings,
    });

    this.gateRoot.appendChild(gateCard);

    // RTL support
    const gateCardEl = this.gateRoot.querySelector('.aitour-gate') as HTMLElement;
    if (gateCardEl) {
      gateCardEl.setAttribute('dir', this.isRtlLocale ? 'rtl' : 'ltr');
    }

    // Focus management
    const gateNextBtn = gateCard.querySelector('#gate-next-btn') as HTMLElement | null;
    if (gateNextBtn) {
      gateNextBtn.focus();
    }

    // Scoped tab trap
    gateCard.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusables = Array.from(gateCard.querySelectorAll('button, [tabindex="0"]')) as HTMLElement[];
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = this.gateRoot?.activeElement;

        if (e.shiftKey) {
          if (active === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (active === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    });

    gateCard.querySelector('#gate-skip-btn')?.addEventListener('click', () => {
      this.clearGateUI();
      this.handleSkip();
    });
    gateCard.querySelector('#gate-next-btn')?.addEventListener('click', () => {
      if (this.activeGate) { this.activeGate.cleanup(); this.activeGate = null; }
      this.clearGateUI();
      this.handleNext();
    });
  }

  private clearGateUI() {
    if (this.gateHost?.parentNode) {
      this.gateHost.parentNode.removeChild(this.gateHost);
    }
    this.gateHost = null;
    this.gateRoot = null;
  }

  private bindAutoAdvance(step: TourStep, target: HTMLElement) {
    // Commented out to ensure the tour only advances when the user clicks the 'Next' button
    /*
    this.clearAutoAdvance();
    this.abortController = new AbortController();

    if (step.autoAdvance.type === 'interaction' && step.autoAdvance.event) {
      target.addEventListener(step.autoAdvance.event, () => {
        if (!this.isPaused) setTimeout(() => this.handleNext(), 300);
      }, { signal: this.abortController.signal });
    }

    if (step.autoAdvance.type === 'timer' || step.autoAdvance.type === 'time') {
      const defaultDelay = this.config?.autoAdvanceDelay ?? 4000;
      const delay = typeof step.autoAdvance.delay === 'number' ? step.autoAdvance.delay : defaultDelay;
      if (this.config?.enableAutoAdvance !== false) {
        this.activeTimer = setTimeout(() => {
          if (!this.isPaused) this.handleNext();
        }, delay);
      }
    }
    */
  }

  private clearAutoAdvance() {
    if (this.activeTimer) clearTimeout(this.activeTimer);
    if (this.abortController) this.abortController.abort();
    this.activeTimer = null;
    this.abortController = null;
  }

  private clearScrollHandler() {
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler, { capture: true });
      window.removeEventListener('resize', this.scrollHandler);
      this.scrollHandler = null;
    }
  }

  private drawTooltip(step: TourStep, targetElement: HTMLElement) {
    const rect = targetElement.getBoundingClientRect();
    const { top, left } = this.computeTooltipPosition(rect);
    const tooltip = document.createElement('div');
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-label', 'Product Tour');
    tooltip.setAttribute('aria-live', 'polite');

    const strings = this.getStrings();
    const colors = this.getThemeColors();

    // Derive cur / tot step from the "cur / tot" label for the progress bar.
    const stepLabel = this.state.getStepNumber();
    const segMatch = String(stepLabel).match(/(\d+)\s*\/\s*(\d+)/);
    const curStep = segMatch ? parseInt(segMatch[1], 10) : 1;
    const totStep = segMatch ? parseInt(segMatch[2], 10) : 1;

    tooltip.innerHTML = buildTooltipCard({
      colors,
      theme: this.config?.theme,
      width: TourPlayer.TOOLTIP_WIDTH,
      top,
      left,
      curStep,
      totStep,
      title: step.title,
      content: step.content,
      strings,
      isFirst: this.state.isFirstStep(),
      isLast: this.state.isLastStep(),
    });

    this.shadowRoot?.appendChild(tooltip);

    // RTL support
    const cardEl = tooltip.querySelector('#aitour-card') as HTMLElement | null;
    if (cardEl) {
      cardEl.setAttribute('dir', this.isRtlLocale ? 'rtl' : 'ltr');
    }

    // Focus management
    const nextBtn = tooltip.querySelector('#next-btn') as HTMLElement | null;
    if (nextBtn) {
      nextBtn.focus();
    }

    // Scoped tab trap
    tooltip.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusables = Array.from(tooltip.querySelectorAll('button, [tabindex="0"]')) as HTMLElement[];
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = this.shadowRoot?.activeElement;

        if (e.shiftKey) {
          if (active === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (active === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    });

    tooltip.querySelector('#next-btn')?.addEventListener('click', () => this.handleNext());
    tooltip.querySelector('#back-btn')?.addEventListener('click', () => this.handlePrev());
    tooltip.querySelector('#skip-btn')?.addEventListener('click', () => this.handleSkip());
    const dontShowBtn = tooltip.querySelector('#dont-show-btn') as HTMLElement | null;
    dontShowBtn?.addEventListener('click', () => {
      // "Don't show again" should immediately close the tour AND mark it as a
      // permanent dismiss — no second "Dismiss" click needed. Setting aria-pressed
      // tells handleSkip() to take the permanent-dismiss path (never-show flag).
      dontShowBtn.setAttribute('aria-pressed', 'true');
      this.handleSkip();
    });

    this.clearScrollHandler();
    this.scrollHandler = () => {
      // One reposition per frame — keeps the ring glued to the element while
      // scrolling without layout thrash or jitter.
      if (this.repoScheduled) return;
      this.repoScheduled = true;
      requestAnimationFrame(() => {
        this.repoScheduled = false;
        this.repositionHighlightAndTooltip();
      });
    };
    window.addEventListener('scroll', this.scrollHandler, { capture: true, passive: true });
    window.addEventListener('resize', this.scrollHandler, { passive: true });
  }

  private handleNext() {
    if (this.isFinishing) return;

    const nextStep = this.state.peekNextStep();
    if (this.openedMenuTrigger) {
      let nextTarget: Element | null = null;
      try {
        const safeNextSelector = this.getSafeSelector(nextStep?.targetSelector);
        nextTarget = safeNextSelector ? document.querySelector(safeNextSelector) : null;
      } catch { /* invalid selector — treat as not inside menu */ }
      const isNextInsideMenu = nextTarget?.closest(
        '[role="menu"], [aria-orientation="vertical"]'
      );
      if (!isNextInsideMenu) {
        this.openedMenuTrigger.click();
        this.openedMenuTrigger = null;
      }
    }

    const btn = this.shadowRoot?.getElementById('next-btn') as HTMLButtonElement | null;
    if (btn) {
      btn.innerText = '...';
      btn.disabled = true;
    }

    this.clearAutoAdvance();
    // Do NOT remove highlight here, keep it smoothly until next step renders
    const hasMore = this.state.next();

    if (hasMore) {
      const currentStep = this.state.getCurrentStep();
      if (currentStep) {
        safeStorage.set(this.getStorageKey('resume_step'), currentStep.stepOrder.toString());
        safeStorage.set(this.getStorageKey('resume_context'), this.config?.contextKey || window.location.pathname);
        safeStorage.set(this.getStorageKey('resume_tour_id'), this.state.getTourId() ?? '');
      }
      if (this.config?.onStepChange && currentStep) {
        this.config.onStepChange(this.state.getTourId() ?? '', currentStep.stepOrder);
      }
      this.renderCurrentStep();
    } else {
      this.isFinishing = true;
      if (this.openedMenuTrigger) {
        this.openedMenuTrigger.click();
        this.openedMenuTrigger = null;
      }
      safeStorage.remove(this.getStorageKey('resume_step'));
      safeStorage.remove(this.getStorageKey('resume_context'));
      safeStorage.remove(this.getStorageKey('resume_tour_id'));
      if (this.onTourCompleted) this.onTourCompleted();
      this.unmount();
    }
  }

  private handlePrev() {
    if (this.isFinishing) return;
    this.clearAutoAdvance();
    const hasPrev = this.state.prev();
    if (hasPrev) {
      const currentStep = this.state.getCurrentStep();
      if (currentStep) {
        safeStorage.set(this.getStorageKey('resume_step'), currentStep.stepOrder.toString());
        safeStorage.set(this.getStorageKey('resume_context'), this.config?.contextKey || window.location.pathname);
        safeStorage.set(this.getStorageKey('resume_tour_id'), this.state.getTourId() ?? '');
      }
      if (this.config?.onStepChange && currentStep) {
        this.config.onStepChange(this.state.getTourId() ?? '', currentStep.stepOrder);
      }
      this.renderCurrentStep();
    }
  }

  private handleSkip() {
    if (this.isFinishing) return;
    this.isFinishing = true;
    this.clearAutoAdvance();
    this.removeHighlight();

    // "Don't show again" toggled (aria-pressed) → permanent dismiss (won't reappear
    // for this project/user). Otherwise → temporary: save resume point so it returns.
    const dontShowAgain =
      (this.shadowRoot?.querySelector('#dont-show-btn') as HTMLElement | null)?.getAttribute('aria-pressed') === 'true';

    if (dontShowAgain) {
      if (this.onTourDismissed) this.onTourDismissed(false); // false = permanent dismiss
      this.unmount();
      return;
    }

    const currentStep = this.state.getCurrentStep();
    if (currentStep) {
      safeStorage.set(this.getStorageKey('resume_step'), currentStep.stepOrder.toString());
      safeStorage.set(this.getStorageKey('resume_context'), this.config?.contextKey || window.location.pathname);
      safeStorage.set(this.getStorageKey('resume_tour_id'), this.state.getTourId() ?? '');
    }

    if (this.onTourDismissed) this.onTourDismissed(true); // true = isMaybeLater
    this.unmount();
  }

  public dismiss() {
    if (this.isFinishing) return;
    this.isFinishing = true;
    this.clearAutoAdvance();
    this.removeHighlight();
    if (this.onTourDismissed) this.onTourDismissed(false); // false = not Maybe Later, permanent dismiss
    this.unmount();
  }

  private removeHighlight() {
    this.stopTargetResizeObserver();
    this.activeTarget = null;
  }

  private bindKeyboardNavigation() {
    this.unbindKeyboardNavigation();
    this.keydownHandler = (e: KeyboardEvent) => {
      if (this.isPaused || this.isFinishing) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.dismiss();
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.handlePrev();
      }
    };
    window.addEventListener('keydown', this.keydownHandler);
  }

  private unbindKeyboardNavigation() {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  private getStrings() {
    return getStrings(this.config);
  }

  private getThemeColors() {
    return getThemeColors(this.config);
  }

  private getStorageKey(key: string): string {
    const apiKey = this.config?.apiKey || '';
    if (key === 'resume_tour_id' || key === 'last_user_id' || key === 'pending_check') {
      return globalKey(apiKey, key);
    }
    const tourId = this.state.getTourId() || 'default_tour';
    return tourKey(apiKey, tourId, key);
  }

  public unmount(saveResumeState = false) {
    if (saveResumeState) {
      const currentStep = this.state.getCurrentStep();
      if (currentStep) {
        safeStorage.set(this.getStorageKey('resume_step'), currentStep.stepOrder.toString());
        safeStorage.set(this.getStorageKey('resume_context'), this.config?.contextKey || window.location.pathname);
        safeStorage.set(this.getStorageKey('resume_tour_id'), this.state.getTourId() ?? '');
      }
    }
    this.stopTargetVisibilityObserver();
    this.unbindKeyboardNavigation();
    this.clearAutoAdvance();
    this.removeBackdrop();
    // Clean up Step Gating state
    if (this.activeGate) { this.activeGate.cleanup(); this.activeGate = null; }
    this.clearGateUI();
    if (this.openedMenuTrigger) {
      this.openedMenuTrigger.click();
      this.openedMenuTrigger = null;
    }
    this.clearActiveStepUI();
  }

  private getSvgPathForHighlight(rect: DOMRect, rx = 8): string {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pad = TourPlayer.HL_PAD;
    const x = rect.left - pad;
    const y = rect.top - pad;
    const width = rect.width + pad * 2;
    const height = rect.height + pad * 2;

    const outer = `M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z`;

    const r = Math.min(rx, width / 2, height / 2);
    const inner = `M ${x + r},${y} ` +
      `L ${x + width - r},${y} ` +
      `A ${r},${r} 0 0 1 ${x + width},${y + r} ` +
      `L ${x + width},${y + height - r} ` +
      `A ${r},${r} 0 0 1 ${x + width - r},${y + height} ` +
      `L ${x + r},${y + height} ` +
      `A ${r},${r} 0 0 1 ${x},${y + height - r} ` +
      `L ${x},${y + r} ` +
      `A ${r},${r} 0 0 1 ${x + r},${y} Z`;

    return `${outer} ${inner}`;
  }

  private computeTooltipPosition(rect: DOMRect): { top: number; left: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw <= 600;
    const tooltipWidth = isMobile ? (vw - 24) : Math.min(TourPlayer.TOOLTIP_WIDTH, vw - 24);
    // Mobile cards are more compact (smaller text/padding), so estimate smaller height.
    const tooltipHeight = isMobile ? 160 : TourPlayer.TOOLTIP_HEIGHT;
    const gap = 12;

    const clampX = (x: number) => isMobile ? 12 : Math.min(Math.max(12, x), vw - tooltipWidth - 12);
    const clampY = (y: number) => Math.min(Math.max(8, y), vh - tooltipHeight - 8);

    // Horizontal anchor for the below/above placements (RTL aligns to the
    // target's right edge, LTR to its left edge).
    const anchorX = isMobile ? 12 : (this.isRtlLocale ? rect.right - tooltipWidth : rect.left);

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const spaceRight = vw - rect.right;
    const spaceLeft = rect.left;

    // 1. Below, 2. Above — preferred (keeps tooltip out of the highlighted box).
    if (spaceBelow >= tooltipHeight + 20) {
      return { top: rect.bottom + gap, left: clampX(anchorX) };
    }
    if (spaceAbove >= tooltipHeight + 20) {
      return { top: rect.top - tooltipHeight - gap, left: clampX(anchorX) };
    }
    // 3. Beside the target (for tall targets that fill the viewport vertically)
    //    so the card never lands ON the highlighted element.
    //    Skip side placement on mobile — no room for a side-by-side card.
    if (!isMobile && spaceRight >= tooltipWidth + 20) {
      return { top: clampY(rect.top), left: rect.right + gap };
    }
    if (!isMobile && spaceLeft >= tooltipWidth + 20) {
      return { top: clampY(rect.top), left: rect.left - tooltipWidth - gap };
    }
    // 4. Last resort — pin to the bottom of the viewport (least overlap).
    return { top: vh - tooltipHeight - 8, left: clampX(anchorX) };
  }

  private startTargetResizeObserver(targetElement: HTMLElement) {
    this.stopTargetResizeObserver();
    this.targetResizeObserver = new ResizeObserver(() => {
      this.repositionHighlightAndTooltip();
    });
    this.targetResizeObserver.observe(targetElement);
  }

  private stopTargetResizeObserver() {
    if (this.targetResizeObserver) {
      this.targetResizeObserver.disconnect();
      this.targetResizeObserver = null;
    }
  }

  private repositionHighlightAndTooltip() {
    if (!this.activeTarget) return;

    const rect = this.activeTarget.getBoundingClientRect();
    const pad = TourPlayer.HL_PAD;

    const path = this.backdropElement?.querySelector('path');
    if (path) {
      path.setAttribute('d', this.getSvgPathForHighlight(rect));
    }

    const ring = this.shadowRoot?.getElementById('aitour-highlight-ring');
    if (ring) {
      ring.style.top = `${rect.top - pad}px`;
      ring.style.left = `${rect.left - pad}px`;
      ring.style.width = `${rect.width + pad * 2}px`;
      ring.style.height = `${rect.height + pad * 2}px`;
    }

    const card = this.shadowRoot?.getElementById('aitour-card');
    if (card) {
      const { top, left } = this.computeTooltipPosition(rect);
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
    }
  }
}