import { callLLM, type TokenUsage } from './gemini';

function isValidStep(s: unknown): s is {
  stepOrder: number;
  title: string;
  content: string;
  targetSelector: string;
  autoAdvance: { type: string; delay: number };
  fingerprint: Record<string, any>;
  stepType: string;
} {
  if (!s || typeof s !== 'object') return false;
  const step = s as Record<string, any>;
  return (
    typeof step.stepOrder === 'number' &&
    typeof step.title === 'string' && step.title.length > 0 &&
    typeof step.content === 'string' && step.content.length > 0 &&
    typeof step.targetSelector === 'string' &&
    typeof step.stepType === 'string' && VALID_STEP_TYPES.has(step.stepType) &&
    typeof step.fingerprint === 'object' && step.fingerprint !== null
  );
}

function isPrimaryElement(el: { text?: string; ariaLabel?: string; aria?: string }): boolean {
  const val = (el.text || el.ariaLabel || el.aria || '').trim();
  return /(submit|create|add|new|save|start)/i.test(val);
}

export { isValidStep, isPrimaryElement };

function getStepRange(elementCount: number): string {
  if (elementCount < 5) return '2-4';    // pehle 2-3
  if (elementCount < 12) return '6-9';    // pehle 4-6
  return '8-12';                          // pehle 6-8
}

const STEP_TYPE_INSTRUCTIONS = `
STEP TYPES — assign the most appropriate type to each step:
- "highlight" : Default. Draw attention to element with outline + backdrop. Use for buttons, links, inputs.
- "tooltip"   : Small hover-style tip. Use for icons, labels, or secondary info elements.
- "hotspot"   : Pulsing dot on element. Use for NEW features or elements that need discovery.
- "modal"     : Full screen explanation. Use ONLY for Step 1 (orientation) or complex concepts.

STEP TYPE RULES:
- Step 1 (orient): prefer "modal" or "highlight"
- Step 2-4 (primary actions): prefer "highlight" or "hotspot"
- Step 5+ (secondary): prefer "tooltip"
- primary=true elements: prefer "hotspot" to draw attention
`;

const buildSystemPrompt = (stepRange: string) => `
You are a Senior UX Researcher & Onboarding Specialist.
Your task is to design a COMPREHENSIVE product tour that covers every meaningful
part of the page, for a first-time user.

INPUT PROVIDED:
1. PAGE CONTEXT: The URL path (e.g. "/dashboard", "/settings").
2. DOM ELEMENTS: Interactive and text elements, each with a unique scan_id.

COVERAGE GOAL (${stepRange} steps — aim for the FULL range when the page has that
many distinct things; the saved tour is reused for ALL users, and any step whose
element a particular user can't see is skipped automatically at runtime):
Step 1       : Orient the user — main title, header, or primary view.
Middle steps : Walk EVERY distinct card / section / primary action top-to-bottom
               (Create, Submit, lists, filters, analytics, settings, etc.).
Last Step    : Final action (Save / Submit / Confirm) or a clear "next step".

${STEP_TYPE_INSTRUCTIONS}

STRICT RULES:
- LOGICAL FLOW: Top-to-bottom, left-to-right reading pattern.
- BE COMPREHENSIVE: Cover EVERY distinct card, section and primary action on the
  page — do not stop at just the 3-4 most important ones. Include items that may
  be empty/absent for some users (e.g. an "Upcoming meetings" list); the runtime
  skips them when they aren't present, so it is safe to include them.
- IGNORE NOISE: NEVER select  Terms, FAQ, Help buttons.
- ZONE PRIORITY: Prefer zone="main"; you may include important header/nav actions too.
- NO DUPLICATES: Never explain the same feature twice.
- ONE PER CARD: Never create two steps for the same card / panel / list item / container. Pick the SINGLE most important element of each card (usually its primary action) — do not also add a step for its heading or its arrow.
- SCAN_ID ACCURACY: scan_id MUST exactly match an input scan_id.
- PRIMARY ACTIONS: Highlight key actions (primary=true), but always place final actions (like "Save changes", "Submit", "Confirm") as the LAST step of the tour.
- STEP COUNT: Generate up to ${stepRange} steps. Use the high end when there is that much distinct content; use fewer ONLY when the page genuinely has less.

OUTPUT FORMAT — return ONLY a raw JSON array, no prose, no markdown, no wrapper keys:
[
  {
    "scan_id": "<exact scan_id from input>",
    "title": "<step title, max 6 words>",
    "content": "<clear explanation, max 25 words>",
    "stepType": "<highlight|tooltip|hotspot|modal>"
  }
]`;

// ── Overlay (menu / dialog / popup) walkthrough mode ────────────────────────
// Page tours are intentionally curated ("aha moment" formula, ~6-8 steps). A
// menu/dialog is different: the user expects EVERY item, in visual order. We
// detect overlay contexts generically (no app-specific selectors): either the
// contextKey is a dynamic sub-context (buildSubContextKey always produces a
// "prefix:slug" key, which contains a colon), or most scanned elements live in
// the popup/modal zone.
function isOverlayContext(pagePath: string, schema: any[]): boolean {
  if (pagePath.includes(':')) return true;
  if (schema.length === 0) return false;
  const overlay = schema.filter(e => e.zone === 'popup' || e.zone === 'modal').length;
  return overlay >= schema.length / 2;
}

// Upper bound only — the prompt is told to use FEWER steps when the panel has
// fewer distinct things to explain (so a 6-box OTP input doesn't become 6 steps).
function getOverlayStepRange(count: number): string {
  return `${Math.min(count, 10)}`;
}

const buildOverlaySystemPrompt = (maxSteps: string) => `
You are creating a sequential walkthrough of a single menu / dialog / popup panel.

INPUT: a list of interactive elements, ALREADY in visual top-to-bottom order, each with a unique scan_id.

STRICT RULES:
- SEQUENTIAL: emit steps in the EXACT same order the elements are given. Do NOT reorder, do NOT jump around.
- GROUP REPEATS: when several controls form ONE logical input — e.g. OTP/PIN/verification-code digit boxes, identical repeated fields, star-rating icons — cover them in a SINGLE step (pick the first one's scan_id). NEVER make one step per box.
- DISTINCT ONLY: one step per DISTINCT thing the user does. Never explain the same item twice.
- SKIP TRIVIA: skip pure close/dismiss "X" icons, back arrows, separators, section labels, and Logout / Sign-out.
- DO NOT PAD: use FEWER steps when there is less to explain. ${maxSteps} is an UPPER LIMIT, not a target.
- SCAN_ID ACCURACY: every scan_id MUST exactly match an input scan_id.

${STEP_TYPE_INSTRUCTIONS}

OUTPUT FORMAT — return ONLY a raw JSON array, no prose, no markdown, no wrapper keys:
[
  {
    "scan_id": "<exact scan_id from input>",
    "title": "<step title, max 6 words>",
    "content": "<clear explanation, max 25 words>",
    "stepType": "<highlight|tooltip|hotspot|modal>"
  }
]`;

const VALID_STEP_TYPES = new Set(['highlight', 'tooltip', 'hotspot', 'modal']);

function resolveStepType(raw: string | undefined, stepOrder: number, isPrimary: boolean): string {
  if (raw && VALID_STEP_TYPES.has(raw)) return raw;
  if (stepOrder === 1) return 'modal';
  if (isPrimary) return 'hotspot';
  if (stepOrder >= 5) return 'tooltip';
  return 'highlight';
}

export async function generateAndMapTour(
  env: any,
  rawDomSchema: any[],
  pagePath: string = 'app-page'
) {
  console.log(`[Pipeline] Processing ${rawDomSchema.length} elements for: ${pagePath}`);

  // 1. Pruning
  const cleanSchema = rawDomSchema.map(el => {
    const text = el.text?.trim() || '';
    const ariaLabel = el.ariaLabel?.trim() || el.aria?.trim() || '';
    const placeholder = el.placeholder?.trim() || '';

    const pruned: any = {
      scan_id: el.scan_id,
      tag: el.tag,
    };

    if (text) pruned.text = text.slice(0, 30);
    if (ariaLabel) pruned.ariaLabel = ariaLabel.slice(0, 30);
    if (placeholder) pruned.placeholder = placeholder.slice(0, 30);

    if (el.zone && el.zone !== 'unknown' && el.zone !== 'body') {
      pruned.zone = el.zone;
    }

    if (isPrimaryElement(el)) {
      pruned.primary = true;
    }

    return pruned;
  });

  // 2. Filter empty
  const filteredSchema = cleanSchema.filter(el => el.text || el.ariaLabel || el.placeholder);

  if (filteredSchema.length === 0) {
    throw new Error('No meaningful elements found in DOM schema');
  }

  // 3. Detect overlay (menu/dialog/popup) vs page context — picks the prompt.
  const overlay = isOverlayContext(pagePath, filteredSchema);

  // 4. Sort — for PAGE tours, surface the main zone first (curated flow). For
  // OVERLAY tours we MUST preserve the original top-to-bottom order so the
  // walkthrough is sequential.
  if (!overlay) {
    filteredSchema.sort((a, b) => {
      if (a.zone === 'main' && b.zone !== 'main') return -1;
      if (a.zone !== 'main' && b.zone === 'main') return 1;
      return 0;
    });
  }

  // 5. Smart step count — overlay covers every item; page uses the curated range.
  const stepRange = overlay
    ? getOverlayStepRange(filteredSchema.length)
    : getStepRange(filteredSchema.length);
  const systemPrompt = overlay
    ? buildOverlaySystemPrompt(stepRange)
    : buildSystemPrompt(stepRange);
  console.log(`[Pipeline] ${overlay ? 'OVERLAY' : 'PAGE'} context — ${filteredSchema.length} elements → step range: ${stepRange}`);

  // 6. LLM input
  const llmInput = JSON.stringify({
    page_context: pagePath,
    elements: filteredSchema,
  });

  // 7. Gemini call with retry loop
  let generatedStepsRaw: any;
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const maxLlmAttempts = 2;
  for (let attempt = 1; attempt <= maxLlmAttempts; attempt++) {
    try {
      const llmResult = await callLLM(systemPrompt, llmInput, env);
      generatedStepsRaw = llmResult.data;
      usage = llmResult.usage;
      break;
    } catch (err) {
      if (attempt === maxLlmAttempts) throw err;
      console.warn(`[Pipeline] LLM attempt ${attempt} failed, retrying...`, err);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 7. Parse
  let generatedSteps: any[] = [];
  try {
    if (typeof generatedStepsRaw === 'string') {
      const cleaned = generatedStepsRaw.replace(/```json\n?|\n?```/g, '').trim();
      generatedSteps = JSON.parse(cleaned);
    } else {
      generatedSteps = generatedStepsRaw;
    }

    if (!Array.isArray(generatedSteps) && typeof generatedSteps === 'object') {
      const firstArray = Object.values(generatedSteps).find(v => Array.isArray(v));
      if (firstArray) generatedSteps = firstArray as any[];
    }
  } catch {
    console.error('[Pipeline] JSON Parse Error. Raw:', generatedStepsRaw);
    throw new Error('Gemini returned invalid JSON format.');
  }

  if (!Array.isArray(generatedSteps) || generatedSteps.length === 0) {
    throw new Error('Gemini returned empty or non-array tour steps');
  }

  // 8. Map back to DOM elements
  const finalizedTour = generatedSteps
    .map((step: any, index: number) => {
      const originalElement = rawDomSchema.find(el => el.scan_id === step.scan_id);

      if (!originalElement) {
        console.warn(`[Pipeline] Skipping — unknown scan_id: ${step.scan_id}`);
        return null;
      }

      const isPrimary = isPrimaryElement(originalElement);

      return {
        stepOrder: index + 1,
        title: step.title,
        content: step.content,
        stepType: resolveStepType(step.stepType, index + 1, isPrimary),
        targetSelector: originalElement.selector,
        zone: originalElement.zone || 'unknown',
        autoAdvance: {
          type: 'timer',
          event: null,
          delay: 4000,
        },
        fingerprint: {
          tag: originalElement.tag,
          text: originalElement.text,
          ariaLabel: originalElement.ariaLabel || originalElement.aria || '',
          testId: originalElement.testId || null,
          zone: originalElement.zone,
        },
      };
    })
    .filter(Boolean);

  if (finalizedTour.length === 0) {
    throw new Error('All steps had invalid scan_ids');
  }

  const schemaValidSteps = finalizedTour.filter(isValidStep);
  if (schemaValidSteps.length === 0) {
    throw new Error('All steps failed schema validation');
  }
  if (schemaValidSteps.length < finalizedTour.length) {
    console.warn(
      `[Pipeline] ${finalizedTour.length - schemaValidSteps.length} step(s) dropped after validation`
    );
  }

  // Hard safety ceiling — even if the LLM ignores the range, a tour can never
  // balloon into a skip-heavy mess. Overlay (menu/dialog) tours may need a few
  // more items than a curated page tour.
  const MAX_STEPS = overlay ? 10 : 8;
  const cappedSteps = schemaValidSteps
    .slice(0, MAX_STEPS)
    .map((s: any, i: number) => ({ ...s, stepOrder: i + 1 }));

  return { steps: cappedSteps, usage };
}