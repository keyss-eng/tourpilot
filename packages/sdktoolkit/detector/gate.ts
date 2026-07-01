import type { TourStep, AITourConfig } from '../api/types';
import { ElementFinder } from './finder';
import { isElementVisible, querySelectorAllDeep } from '../dom';

// ─── ElementGate ─────────────────────────────────────────────────────────────
// MutationObserver-based element waiter. Watches the DOM for a step's target
// element to become visible. Resolves when found, or null on timeout.
// The SDK NEVER auto-clicks anything — it purely observes.
export class ElementGate {
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private config?: AITourConfig;

  constructor(config?: AITourConfig) {
    this.config = config;
  }

  async waitForElement(
    step: TourStep,
    getSafeSelector: (sel: string | undefined) => string | null,
    timeoutMs: number = 15000
  ): Promise<HTMLElement | null> {
    // 1. Immediate check — maybe it became visible while gate UI was rendering
    const immediate = this.findVisibleTarget(step, getSafeSelector);
    if (immediate) return immediate;

    // 2. MutationObserver-based waiting
    return new Promise((resolve) => {
      // P3: findVisibleTarget runs a (potentially deep) DOM scan + visibility
      // checks. Coalesce mutation bursts into one scan per frame.
      let scanScheduled = false;
      this.observer = new MutationObserver(() => {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => {
          scanScheduled = false;
          if (!this.observer) return;
          const found = this.findVisibleTarget(step, getSafeSelector);
          if (found) {
            this.cleanup();
            resolve(found);
          }
        });
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-hidden', 'data-state', 'hidden']
      });

      this.timer = setTimeout(() => {
        this.cleanup();
        resolve(null);
      }, timeoutMs);
    });
  }

  private findVisibleTarget(
    step: TourStep,
    getSafeSelector: (sel: string | undefined) => string | null
  ): HTMLElement | null {
    // Try CSS selector first
    const safeSelector = getSafeSelector(step.targetSelector);
    if (safeSelector) {
      try {
        const el = document.querySelector(safeSelector) as HTMLElement | null;
        if (el && this.isVisible(el)) return el;
      } catch { /* invalid selector */ }
    }

    // Try fingerprint (synchronous scan only — no waiting inside waiting)
    if (step.fingerprint && Object.keys(step.fingerprint).length > 0) {
      const tag = step.fingerprint.tag || '*';
      const candidates = querySelectorAllDeep(tag);
      const minScore = this.config?.fingerprintMinScore ?? 20;
      let best: { el: HTMLElement; score: number } | null = null;

      for (const el of candidates) {
        if (!this.isVisible(el)) continue;
        const score = ElementFinder.scoreElement(el, step.fingerprint);
        if (score >= minScore && (!best || score > best.score)) {
          best = { el, score };
        }
      }
      if (best) return best.el;
    }

    return null;
  }

  private isVisible(el: HTMLElement): boolean {
    return isElementVisible(el);
  }

  cleanup() {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }
}
