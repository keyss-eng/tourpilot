import { resolveZone, querySelectorAllDeep, getAccessibleLabel } from '../dom';

export class ElementFinder {
  /**
   * Fingerprint se DOM element dhundho.
   * CSS selector fail hone par yeh fallback use hota hai.
   *
   * fingerprint = plain object (Record<string, any>)
   * JSON.parse mat karo — yeh already parsed object hai.
   */
  public static async findByFingerprint(
    fingerprint: Record<string, any>,
    timeoutMs = 4000,
    minScore = 20
  ): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      // SDK-12: Cache querySelectorAll results per tag within this findByFingerprint call.
      // For a multi-step validation pass (validateTourElements uses Promise.all),
      // the same tag (e.g. 'button') would otherwise be queried repeatedly.
      // The cache is local — never stale across separate calls.
      const queryCache = new Map<string, HTMLElement[]>();

      // 1. Pehle turant scan karo
      const immediate = this.scanDOM(fingerprint, queryCache, minScore);
      if (immediate) return resolve(immediate);

      // 2. Agar nahi mila — async DOM changes watch karo
      // (React modals, lazy components ke liye)
      // P3: scanDOM walks the DOM (querySelectorAllDeep). On a busy SPA the
      // observer fires repeatedly per interaction, so coalesce a burst of
      // mutations into a single scan per animation frame.
      let scanScheduled = false;
      const observer = new MutationObserver(() => {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => {
          scanScheduled = false;
          // Fresh cache for each scan — DOM changed so old results are stale
          const found = this.scanDOM(fingerprint, new Map<string, HTMLElement[]>(), minScore);
          if (found) {
            observer.disconnect();
            clearTimeout(timeoutId);
            resolve(found);
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
      });

      // 3. Timeout — itne time mein nahi mila toh null return karo
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  /**
   * Scores a single DOM element against the fingerprint.
   * Exposed publicly to unify scoring across finder, player, and gates.
   */
  public static scoreElement(el: HTMLElement, fingerprint: Record<string, any>): number {
    const fpText = (fingerprint.text || '').toLowerCase().trim();
    // Check both ariaLabel, aria and placeholder from fingerprint.
    const fpAria = (fingerprint.ariaLabel || fingerprint.aria || fingerprint.placeholder || '').toLowerCase().trim();
    const fpTestId = fingerprint.testId;

    let score = 0;

    // Check data-testid first (highest weight)
    if (fpTestId && el.getAttribute('data-testid') === fpTestId) {
      score += 50;
    }

    // Resolve accessible label using the dom utility helper
    const elAria = getAccessibleLabel(el).toLowerCase();
    const elPlaceholder = el.getAttribute('placeholder')?.toLowerCase() ?? '';

    // Exact aria-label match
    if (fpAria && elAria === fpAria) score += 40;

    // Exact placeholder match
    if (fpAria && elPlaceholder === fpAria) score += 35;

    // Partial aria-label match
    if (fpAria && elAria && elAria.includes(fpAria)) score += 20;

    // Partial placeholder match
    if (fpAria && elPlaceholder && elPlaceholder.includes(fpAria)) score += 15;

    // Exact text match (textContent — reliable for headings)
    const elText = (el.textContent?.trim() ?? '').toLowerCase().slice(0, 60);
    if (fpText && elText === fpText) score += 30;

    // Exact text match (innerText — for buttons/links that render differently)
    const elInnerText = (el.innerText?.trim() ?? '').toLowerCase().slice(0, 60);
    if (fpText && elInnerText === fpText) score += 28;

    // Partial match: check if element text STARTS WITH the fingerprint text
    if (fpText && elText.startsWith(fpText.substring(0, 20))) score += 15;

    // Partial text match (broad fallback)
    if (fpText && elText.includes(fpText.substring(0, 30))) score += 10;

    // Zone match bonus
    const fpZone = (fingerprint.zone || '').toLowerCase();
    if (fpZone) {
      const elZone = resolveZone(el);
      if (elZone === fpZone) score += 15;
      else if (score > 0) score -= 10; // penalize wrong-zone matches
    }

    return score;
  }

  private static scanDOM(
    fingerprint: Record<string, any>,
    queryCache = new Map<string, HTMLElement[]>(),
    minScore = 20
  ): HTMLElement | null {
    const tag = fingerprint.tag || '*';

    // SDK-12: Use cache to avoid repeated querySelectorAll for the same tag
    if (!queryCache.has(tag)) {
      queryCache.set(tag, querySelectorAllDeep(tag));
    }
    const candidates = queryCache.get(tag)!;

    let best: { el: HTMLElement; score: number } | null = null;

    for (const el of candidates) {
      const score = this.scoreElement(el, fingerprint);
      if (score >= minScore && (!best || score > best.score)) {
        best = { el, score };
      }
    }

    return best ? best.el : null;
  }
}
