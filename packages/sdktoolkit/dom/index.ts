// ---------------------------------------------------------------------------
// Shared DOM utility functions — single source of truth for visibility checks,
// zone resolution, and HTML sanitization used across the SDK.
// ---------------------------------------------------------------------------

/**
 * Checks whether an element is currently visible in the viewport.
 * Used by: index.ts, player.ts, finder.ts, mutation.ts
 */
export function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width <= 4 || rect.height <= 4) {
    return false;
  }

  // CHANGE #1: fast path before walking the full ancestor chain.
  // getComputedStyle() forces layout, and the original code called it once
  // PER ANCESTOR on every visibility check (which runs inside MutationObserver
  // callbacks, i.e. very frequently). offsetParent is null whenever the element
  // or an ancestor has display:none (with the exception of position:fixed
  // elements, which always have a null offsetParent regardless of visibility —
  // so we skip this fast path for those and fall through to the full chain walk).
  const elStyle = window.getComputedStyle(el);
  if (elStyle.position !== 'fixed' && el.offsetParent === null) {
    return false;
  }

  let current: HTMLElement | null = el;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    // Reuse the already-computed style for `el` itself on the first iteration
    // instead of calling getComputedStyle again for the same element.
    const style = current === el ? elStyle : window.getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity || '1') < 0.1
    ) {
      return false;
    }

    if (current.tagName === 'DETAILS' && !current.hasAttribute('open')) {
      return false;
    }

    // Traverse up, penetrating Shadow DOM boundary if present
    const parentDom: Node | null = current.parentNode;
    if (parentDom instanceof HTMLElement) {
      current = parentDom;
    } else if (parentDom instanceof ShadowRoot) {
      current = parentDom.host as HTMLElement;
    } else {
      current = null;
    }
  }

  return true;
}

/**
 * Extended visibility check that also validates opacity and minimum height.
 * Used by DynamicContentWatcher for significant container detection.
 *
 * CHANGE #3: minHeight is now a configurable parameter (default 50, preserving
 * prior behavior). A hardcoded 50px threshold caused false negatives on
 * projects with legitimately short containers (e.g. single-line context
 * menus, compact toast notifications) that should still count as "visible".
 */
export function isContainerVisible(el: HTMLElement, minHeight: number = 50): boolean {
  const rect = el.getBoundingClientRect();
  return rect.height > minHeight && isElementVisible(el);
}

/**
 * Traverses upwards through shadow roots to find the closest ancestor matching the selector.
 */
function closestDeep(el: HTMLElement, selector: string): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    const match = node.closest(selector);
    if (match) return match as HTMLElement;
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? (root.host as HTMLElement) : null;
  }
  return null;
}

/**
 * Resolves which UI zone an element belongs to.
 * Used by: index.ts (snapshot), finder.ts (zone matching)
 */
export function resolveZone(h: HTMLElement): string {
  return closestDeep(h, '[role="dialog"], .modal, dialog, [data-modal]') ? 'modal' :
    closestDeep(h, '[role="menu"], .dropdown-menu, .popup, [data-dropdown]') ? 'popup' :
      closestDeep(h, 'main') ? 'main' :
        closestDeep(h, 'nav') ? 'nav' :
          closestDeep(h, 'header') ? 'header' : 'body';
}

/**
 * Escapes HTML special characters to prevent XSS when rendering
 * Gemini-generated content into the tooltip Shadow DOM.
 */
export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, c => map[c]);
}

/**
 * Resolves the accessible label of an element.
 * Checks aria-label first, then aria-labelledby, then placeholder, then title.
 */
export function getAccessibleLabel(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const ariaLabelledby = el.getAttribute('aria-labelledby');
  if (ariaLabelledby) {
    const ids = ariaLabelledby.trim().split(/\s+/);
    const labels = ids
      .map(id => {
        const root = el.getRootNode();
        let target: Element | null = null;
        if (root instanceof Document || root instanceof ShadowRoot) {
          target = root.getElementById(id);
        }
        if (!target) {
          target = document.getElementById(id);
        }
        return target?.textContent?.trim() || '';
      })
      .filter(Boolean);
    if (labels.length > 0) {
      return labels.join(' ');
    }
  }

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder.trim();

  const title = el.getAttribute('title');
  if (title) return title.trim();

  return '';
}

/**
 * Safe localStorage wrapper to prevent exceptions in restrictive environments (e.g. Safari Private Browsing)
 *
 * CHANGE #7: failures are now logged via console.debug instead of being
 * silently swallowed. Previously a quota-exceeded or private-browsing
 * failure left no trace, making "tour state isn't persisting" bugs hard to
 * diagnose in production. Kept as console.debug (not the SDK logger) to
 * avoid introducing a circular dependency between dom.ts and logger.ts.
 */
export const safeStorage = {
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      console.debug(`[AITour] safeStorage.set failed for key "${k}":`, e);
    }
  },
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      console.debug(`[AITour] safeStorage.get failed for key "${k}":`, e);
      return null;
    }
  },
  remove: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch (e) {
      console.debug(`[AITour] safeStorage.remove failed for key "${k}":`, e);
    }
  },
};

/**
 * Recursively queries elements matching the selector inside the given root,
 * penetrating open Shadow DOM roots.
 */
export function querySelectorAllDeep(selector: string, root: Document | ShadowRoot | Element = document): HTMLElement[] {
  const elements: HTMLElement[] = [];
  try {
    const direct = root.querySelectorAll<HTMLElement>(selector);
    // Index loop avoids the intermediate array from Array.from(...) + spread.
    for (let i = 0; i < direct.length; i++) elements.push(direct[i]);
  } catch {
    // Avoid syntax errors in selector queries
  }

  // P2: This shadow-host discovery walk is the expensive part (it visits every
  // element under `root`). It runs inside MutationObserver callbacks on large
  // DOMs, so we keep it allocation-free: no Array.from, no recursion-time spread.
  // Most pages have zero shadow roots, in which case this loop just confirms
  // that cheaply and returns.
  const all = root.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const sr = (all[i] as HTMLElement).shadowRoot;
    if (sr) {
      const nested = querySelectorAllDeep(selector, sr);
      for (let j = 0; j < nested.length; j++) elements.push(nested[j]);
    }
  }
  return elements;
}

/**
 * Finds the first element matching the selector inside the given root,
 * penetrating open Shadow DOM roots recursively.
 */
export function querySelectorDeep(selector: string, root: Document | ShadowRoot | Element = document): HTMLElement | null {
  try {
    const direct = root.querySelector<HTMLElement>(selector);
    if (direct) return direct;
  } catch {
    // Avoid syntax errors in selector queries
  }

  // P2: allocation-free shadow-host walk (see querySelectorAllDeep). Early-returns
  // as soon as a match is found inside a nested shadow root.
  const all = root.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const sr = (all[i] as HTMLElement).shadowRoot;
    if (sr) {
      const found = querySelectorDeep(selector, sr);
      if (found) return found;
    }
  }
  return null;
}