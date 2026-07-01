// ---------------------------------------------------------------------------
// [SETTINGS] Per-client "which elements get tours" config. The client toggles
// categories in the dashboard; this maps each category → CSS selectors and
// builds the final selector string the SDK uses to find actionable elements.
// ---------------------------------------------------------------------------

export type ElementCategory =
  | 'buttons'
  | 'links'
  | 'dropdowns'
  | 'checkboxes'
  | 'tabs'
  | 'inputs'
  | 'other';

export const CATEGORY_SELECTORS: Record<ElementCategory, string[]> = {
  // Broadened to catch custom/handler-based buttons (onclick, focusable divs).
  buttons: ['button', '[role="button"]', 'input[type="submit"]', 'input[type="button"]', '[onclick]', '[tabindex="0"]'],
  links: ['a', '[role="link"]'],
  dropdowns: ['select', '[role="combobox"]'],
  checkboxes: ['input[type="checkbox"]', 'input[type="radio"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]'],
  tabs: ['[role="tab"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]'],
  inputs: ['input[type="range"]', 'input[type="file"]'],
  other: ['summary', '[role="treeitem"]', '[role="option"]', '[role="slider"]', '[role="spinbutton"]'],
};

export const CATEGORY_META: { id: ElementCategory; label: string; hint: string }[] = [
  { id: 'buttons', label: 'Buttons', hint: 'Buttons & button-like controls' },
  { id: 'links', label: 'Links', hint: 'Anchor links and link roles' },
  { id: 'dropdowns', label: 'Dropdowns', hint: 'Selects & comboboxes' },
  { id: 'checkboxes', label: 'Checkboxes & toggles', hint: 'Checkboxes, radios, switches' },
  { id: 'tabs', label: 'Tabs & menus', hint: 'Tabs and menu items' },
  { id: 'inputs', label: 'Sliders & file inputs', hint: 'Range and file inputs' },
  { id: 'other', label: 'Other controls', hint: 'Summary, tree, slider roles' },
];

// Sensible defaults — the common actionable categories on; the niche ones off.
export const DEFAULT_CONFIG: Record<ElementCategory, boolean> = {
  buttons: true,
  links: true,
  dropdowns: true,
  checkboxes: true,
  tabs: true,
  inputs: false,
  other: false,
};

export function normalizeConfig(raw: unknown): Record<ElementCategory, boolean> {
  const cfg = { ...DEFAULT_CONFIG };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(DEFAULT_CONFIG) as ElementCategory[]) {
      if (typeof (raw as any)[k] === 'boolean') cfg[k] = (raw as any)[k];
    }
  }
  return cfg;
}

export function parseConfig(json: string | null | undefined): Record<ElementCategory, boolean> {
  if (!json) return { ...DEFAULT_CONFIG };
  try {
    return normalizeConfig(JSON.parse(json));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// Build the SDK selector string from the enabled categories. Always keeps at
// least buttons + links so a misconfigured project still gets a usable tour.
export function buildSelectors(config: Record<ElementCategory, boolean>): string {
  const parts: string[] = [];
  for (const cat of Object.keys(CATEGORY_SELECTORS) as ElementCategory[]) {
    if (config[cat]) parts.push(...CATEGORY_SELECTORS[cat]);
  }
  if (parts.length === 0) {
    parts.push(...CATEGORY_SELECTORS.buttons, ...CATEGORY_SELECTORS.links);
  }
  return parts.join(', ');
}
