import { getDb } from '../db';
import { tours, userProgress, tourCost } from '../db/schema';
import { eq, and, lt, inArray } from 'drizzle-orm';
import { generateAndMapTour } from './pipeline';
import { resolveProviderModel, estimateProviderCostMicroUsd, type TokenUsage } from './gemini';
import { writeAuditLog } from './audit';

// Client billing rate ("per tour generated"). Configurable per-deploy via env in
// the smallest currency unit (e.g. paise/cents). 0 = free (e.g. while testing).
const DEFAULT_PRICE_PER_FULL_TOUR = 100; // e.g. ₹1.00 / $1.00 in smallest unit

// Records one billable + token-usage row per successful generation. Never throws
// (best-effort) so a logging failure can't break tour generation.
async function logTourGeneration(
  db: ReturnType<typeof getDb>,
  env: any,
  params: {
    projectId: string;
    contextKey: string;
    usage: TokenUsage;
    latencyMs: number;
  }
): Promise<void> {
  try {
    const { provider, model } = resolveProviderModel(env);
    await db.insert(tourCost).values({
      id: `cost_${crypto.randomUUID().replace(/-/g, '')}`,
      projectId: params.projectId,
      contextKey: params.contextKey,
      provider,
      model,
      inputTokens: params.usage.inputTokens,
      outputTokens: params.usage.outputTokens,
      providerCostMicroUsd: estimateProviderCostMicroUsd(provider, params.usage),
      billableAmount: Number(env?.PRICE_PER_FULL_TOUR ?? DEFAULT_PRICE_PER_FULL_TOUR),
      latencyMs: params.latencyMs,
      createdAt: new Date(),
    }).run();
  } catch (err) {
    console.error('[TourGeneration] Failed to write tour_cost row:', err);
  }
}

export type GenerationResult = {
  success: boolean;
  tourId?: string | null;
  stepsCount?: number;
  regenerated: boolean;
  pending?: boolean;
  source?: string;
  error?: string;
  status?: number; // HTTP status code on error
};

async function computeContentHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function computePayloadHash(domSchema: any[]): Promise<string> {
  return computeContentHash(JSON.stringify(domSchema));
}

function normalizeFingerprints(fps: any[]): string {
  return [...fps]
    .map(fp => {
      const { x, y, id, ariaLabel, aria, className, ...rest } = fp;
      const props = Object.keys(rest).sort();
      const sorted = props.map((p: string) => `${p}:${rest[p]}`).join(';');
      return `${ariaLabel || aria || ''};${sorted}`;
    })
    .sort()
    .join('|');
}

async function computeStructureHash(schema: any[]): Promise<string> {
  return computeContentHash(
    schema
      .map(item => `${item.tag}:${item.zone || 'unknown'}:${item.depth || 0}`)
      .join('|')
  );
}

async function computeCountHash(schema: any[]): Promise<string> {
  const countSignature = schema.reduce((acc: Record<string, number>, item) => {
    acc[item.tag] = (acc[item.tag] || 0) + 1;
    return acc;
  }, {});
  return computeContentHash(
    JSON.stringify(Object.entries(countSignature).sort())
  );
}

const SYNONYMS: Record<string, string> = {
  'submit': 'action',
  'send': 'action',
  'go': 'action',
  'save': 'action',
  'confirm': 'action',
  'search': 'find',
  'find': 'find',
  'filter': 'find',
  'login': 'auth',
  'signin': 'auth',
  'sign in': 'auth',
  'logout': 'auth',
  'signout': 'auth',
  'sign out': 'auth',
  'delete': 'remove',
  'remove': 'remove',
  'cancel': 'close',
  'dismiss': 'close',
  'close': 'close',
};

function normalizeSemantic(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map(word => SYNONYMS[word] || word)
    .join(' ');
}

async function computeSemanticHash(schema: any[]): Promise<string> {
  const semanticSchema = schema.map(item => ({
    tag: item.tag,
    text: normalizeSemantic(item.text || ''),
    zone: item.zone,
  }));
  return computeContentHash(JSON.stringify(semanticSchema));
}


async function pruneOldTours(db: any, projectId: string, contextKey: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db.delete(tours)
    .where(and(
      eq(tours.projectId, projectId),
      eq(tours.contextKey, contextKey),
      eq(tours.isActive, false),
      lt(tours.createdAt, thirtyDaysAgo)
    ))
    .run();
}


function getStepsCount(tour: { totalSteps: number | null; stepsJson?: string }): number {
  if (tour.totalSteps !== null && tour.totalSteps !== undefined) return tour.totalSteps;
  try { return JSON.parse(tour.stepsJson || '[]').length; } catch { return 0; }
}

async function reactivateTour(
  db: ReturnType<typeof getDb>,
  kv: KVNamespace,
  kvCacheKey: string,
  projectId: string,
  contextKey: string,
  matchedTour: { id: string; totalSteps: number | null },
  payloadHash: string
): Promise<void> {
  const deactivateQuery = db.update(tours)
    .set({ isActive: false })
    .where(and(
      eq(tours.projectId, projectId),
      eq(tours.contextKey, contextKey),
      eq(tours.isActive, true)
    ));
  const activateQuery = db.update(tours)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(tours.id, matchedTour.id));

  await db.batch([deactivateQuery, activateQuery]);

  await db.update(userProgress)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(and(
      eq(userProgress.tourId, matchedTour.id),
      inArray(userProgress.status, ['completed', 'dismissed'])
    ))
    .run();

  await kv.put(kvCacheKey, JSON.stringify({
    tourId: matchedTour.id,
    stepsCount: getStepsCount(matchedTour as any),
    payloadHash,
  }), { expirationTtl: 3600 });
}

export async function generateTourWithGuards(params: {
  db: ReturnType<typeof getDb>;
  kv: KVNamespace;
  env: any;
  projectId: string;
  contextKey: string;
  domSchema: any[];
  elementFingerprints?: any[];
  source: 'sdk' | 'crawler';
  versionHash?: string; // optional crawler pre-computed version hash
  uiVersion?: string | null; // host app's UI build version (auto-regen trigger)
  waitUntil?: (promise: Promise<any>) => void;
}): Promise<GenerationResult> {
  const { db, kv, env, projectId, contextKey, domSchema, elementFingerprints, source, versionHash: passedVersionHash, waitUntil } = params;
  const incomingUiVersion = params.uiVersion ?? null;

  // 1. Length validation to prevent malicious bloated payloads
  if (domSchema.length > 200) {
    return { success: false, error: 'domSchema exceeds maximum of 200 elements', regenerated: false, status: 400 };
  }

  // 2. Stripping control characters & prompt injection keywords
  const INJECTION_PATTERNS = /(?:ignore|system\s*prompt|forget|disregard)\b|instructions?\s+(?:for|to)\s+(?:the\s+)?(?:ai|model|assistant)/i;
  const sanitizedSchema = domSchema
    .map((item: any) => ({
      ...item,
      text: typeof item.text === 'string'
        ? item.text.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 60)
        : '',
      aria: typeof item.aria === 'string'
        ? item.aria.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 40)
        : '',
    }))
    .filter((item: any) =>
      !INJECTION_PATTERNS.test(item.text) && !INJECTION_PATTERNS.test(item.aria)
    );

  const payloadHash = await computePayloadHash(sanitizedSchema);

  // Guard 0: KV Cache
  const kvCacheKey = `tour_cache_${projectId}_${encodeURIComponent(contextKey)}`;
  const kvCached = await kv.get(kvCacheKey);

  if (kvCached) {
    try {
      const cached = JSON.parse(kvCached);
      if (cached.payloadHash === payloadHash) {
        // Double check if the tour actually exists in D1
        const tourExists = await db.select({ id: tours.id })
          .from(tours)
          .where(eq(tours.id, cached.tourId))
          .get();

        if (tourExists) {
          return {
            success: true,
            tourId: cached.tourId,
            stepsCount: cached.stepsCount,
            regenerated: false,
            source: 'kv_cache',
          };
        } else {
          // Stale cache — delete it
          await kv.delete(kvCacheKey);
        }
      }
    } catch {
      // Corrupt KV cache — proceed
    }
  }

  // KV Lock logic
  const lockKey = `gen_lock_${projectId}_${encodeURIComponent(contextKey)}`;
  const inFlight = await kv.get(lockKey);

  if (inFlight) {
    return { success: true, tourId: null, regenerated: false, pending: true };
  }

  await kv.put(lockKey, '1', { expirationTtl: 90 });

  try {
    // ── P1: ONE D1 round-trip instead of up to 7 ─────────────────────────────
    // Previously Guards 1-7 each ran their own sequential `.get()` against the
    // tours table (7 serial network hops to D1 — the dominant latency cost in a
    // Worker). Since every guard only filters on (projectId, contextKey) plus a
    // single hash column, we can fetch all candidate tours for this context once
    // and match the hashes in memory. `totalSteps` is pre-computed on the row so
    // we never need stepsJson here (it's fetched lazily only for partial-regen).
    let candidateTours = await db.select({
      id: tours.id,
      versionHash: tours.versionHash,
      versionHashWithFp: tours.versionHashWithFp,
      structureHash: tours.structureHash,
      countHash: tours.countHash,
      semanticHash: tours.semanticHash,
      payloadHash: tours.payloadHash,
      zoneHashesJson: tours.zoneHashesJson,
      totalSteps: tours.totalSteps,
      uiVersion: tours.uiVersion,
      isActive: tours.isActive,
    })
      .from(tours)
      .where(and(
        eq(tours.projectId, projectId),
        eq(tours.contextKey, contextKey)
      ))
      .all();

    // The single active tour for this context (used by version/zone guards + insert).
    let legacyActive = candidateTours.find(t => t.isActive) ?? null;

    // ── [AUTO-REGEN] UI-version invalidation ─────────────────────────────────
    // If the active tour was built for a DIFFERENT ui version (developer shipped
    // a UI change), drop it so a FRESH tour is generated below (replace, not
    // accumulate). Only triggers when uiVersion is actually provided by the SDK;
    // otherwise behaviour is unchanged (pure freeze).
    if (legacyActive && incomingUiVersion !== null && (legacyActive.uiVersion ?? null) !== incomingUiVersion) {
      const staleId = legacyActive.id;
      await db.delete(tours).where(eq(tours.id, staleId)).run();
      await kv.delete(kvCacheKey);
      candidateTours = candidateTours.filter(t => t.id !== staleId);
      legacyActive = null;
    }

    const existingTour = legacyActive;

    const hitCache = (
      tour: { id: string; totalSteps: number | null },
      source: string
    ): GenerationResult => ({
      success: true,
      tourId: tour.id,
      stepsCount: getStepsCount(tour as any),
      regenerated: false,
      source,
    });

    // Guard 1: payloadHash Match (exact same payload already generated)
    const payloadMatch = candidateTours.find(t => t.payloadHash === payloadHash);
    if (payloadMatch) {
      if (!payloadMatch.isActive) {
        await reactivateTour(db, kv, kvCacheKey, projectId, contextKey, payloadMatch, payloadHash);
        return {
          success: true,
          tourId: payloadMatch.id,
          stepsCount: getStepsCount(payloadMatch as any),
          regenerated: true,
          source: 'payload_cache_reactivated',
        };
      }
      await kv.put(kvCacheKey, JSON.stringify({
        tourId: payloadMatch.id,
        stepsCount: getStepsCount(payloadMatch as any),
        payloadHash,
      }), { expirationTtl: 3600 });
      return hitCache(payloadMatch, 'payload_cache');
    }

    // Guard 1.5: Freeze active tour if DOM schema is a subset of the active tour's payload
    if (existingTour) {
      const activeFull = await db.select({
        payloadJson: tours.payloadJson,
        stepsJson: tours.stepsJson,
      }).from(tours).where(eq(tours.id, existingTour.id)).get();

      let knownSchema: any[] = [];
      try { knownSchema = JSON.parse(activeFull?.payloadJson || '[]'); } catch { knownSchema = []; }
      const knownKeys = new Set(knownSchema.map(item => `${item.tag}:${item.text}:${item.zone || ''}`));
      const newElements = sanitizedSchema.filter(item => !knownKeys.has(`${item.tag}:${item.text}:${item.zone || ''}`));

      if (newElements.length === 0) {
        await kv.put(kvCacheKey, JSON.stringify({
          tourId: existingTour.id,
          stepsCount: getStepsCount(existingTour as any),
          payloadHash,
        }), { expirationTtl: 3600 });
        return hitCache(existingTour as any, 'existing_active');
      }
    }

    // Guard 2: versionHash Match (same logical structure)
    const hashableSchema = sanitizedSchema.map((item: any) => ({
      tag: item.tag,
      text: item.text?.slice(0, 40) || '',
      aria: item.aria?.slice(0, 30) || item.ariaLabel?.slice(0, 30) || '',
      zone: item.zone,
    }));
    const calculatedVersionHash = await computeContentHash(JSON.stringify(hashableSchema));
    const versionHash = passedVersionHash || calculatedVersionHash;

    const versionMatch = candidateTours.find(t => t.versionHash === versionHash);
    if (versionMatch) {
      if (!versionMatch.isActive) {
        await reactivateTour(db, kv, kvCacheKey, projectId, contextKey, versionMatch, payloadHash);
        return {
          success: true,
          tourId: versionMatch.id,
          stepsCount: getStepsCount(versionMatch as any),
          regenerated: true,
          source: 'version_cache_reactivated',
        };
      }
      return hitCache(versionMatch, 'version_cache');
    }

    // Guard 3: versionHashWithFp Match (layout/fingerprint-aware)
    let versionHashWithFp: string | null = null;
    if (elementFingerprints && Array.isArray(elementFingerprints)) {
      const fpsString = normalizeFingerprints(elementFingerprints);
      const hashableWithFp =
        hashableSchema
          .map((item: any) => `${item.tag};${item.text};${item.aria};${item.zone}`)
          .join('|') + `|FPS:${fpsString.slice(0, 60)}`;

      versionHashWithFp = await computeContentHash(hashableWithFp);

      const existingTourWithFp = candidateTours.find(t => t.versionHashWithFp === versionHashWithFp);
      if (existingTourWithFp) {
        if (!existingTourWithFp.isActive) {
          await reactivateTour(db, kv, kvCacheKey, projectId, contextKey, existingTourWithFp, payloadHash);
          return {
            success: true,
            tourId: existingTourWithFp.id,
            stepsCount: getStepsCount(existingTourWithFp as any),
            regenerated: true,
            source: 'layout_cache_reactivated',
          };
        }
        return hitCache(existingTourWithFp, 'layout_cache');
      }
    }

    // Guard 4: structureHash Match
    const structureHash = await computeStructureHash(sanitizedSchema);
    const structureMatch = candidateTours.find(t => t.structureHash === structureHash);
    if (structureMatch) {
      if (!structureMatch.isActive) {
        await reactivateTour(db, kv, kvCacheKey, projectId, contextKey, structureMatch, payloadHash);
        return {
          success: true,
          tourId: structureMatch.id,
          stepsCount: getStepsCount(structureMatch as any),
          regenerated: true,
          source: 'structure_cache_reactivated',
        };
      }
      return hitCache(structureMatch, 'structure_cache');
    }

    // Guard 5: zoneHash Match / Partial Zone Regeneration
    const zoneMap: Record<string, any[]> = {};
    sanitizedSchema.forEach(item => {
      const zone = item.zone || 'unknown';
      if (!zoneMap[zone]) zoneMap[zone] = [];
      zoneMap[zone].push({ tag: item.tag, text: item.text, aria: item.aria });
    });

    const zoneHashes: Record<string, string> = {};
    for (const [zone, items] of Object.entries(zoneMap)) {
      zoneHashes[zone] = await computeContentHash(JSON.stringify(items));
    }

    const existingZoneHashes: Record<string, string> = legacyActive
      ? (() => {
        try { return JSON.parse((legacyActive as any).zoneHashesJson || '{}'); }
        catch { return {}; }
      })()
      : {};

    const changedZones = Object.keys(zoneHashes).filter(
      zone => zoneHashes[zone] !== existingZoneHashes[zone]
    );

    if (changedZones.length === 0 && legacyActive) {
      return hitCache(legacyActive, 'zone_cache');
    }

    let finalizedSteps: any[];
    let generationSource: 'sdk' | 'crawler' | 'partial_regen' = source;
    let genUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const fullGenStart = Date.now();

    if (changedZones.length === 1 && legacyActive) {
      generationSource = 'partial_regen';
      const changedZoneItems = sanitizedSchema.filter(
        item => changedZones.includes(item.zone || 'unknown')
      );
      const partialGen = await generateAndMapTour(env, changedZoneItems, contextKey);
      const newZoneSteps = partialGen.steps;
      genUsage = partialGen.usage;
      // Lazily fetch the active tour's stepsJson — only needed on this rare path,
      // so it stays out of the hot-path bulk query above.
      const activeRow = await db.select({ stepsJson: tours.stepsJson })
        .from(tours)
        .where(eq(tours.id, legacyActive.id))
        .get();
      const oldSteps: any[] = JSON.parse(activeRow?.stepsJson || '[]');
      const unchangedSteps = oldSteps.filter(
        step => !changedZones.includes(step.zone || 'unknown')
      );
      finalizedSteps = [...unchangedSteps, ...newZoneSteps];
    } else {
      // Guard 6: countHash Match
      const countHash = await computeCountHash(sanitizedSchema);
      const countMatch = candidateTours.find(t => t.countHash === countHash);
      if (countMatch) {
        if (!countMatch.isActive) {
          await reactivateTour(db, kv, kvCacheKey, projectId, contextKey, countMatch, payloadHash);
          return {
            success: true,
            tourId: countMatch.id,
            stepsCount: getStepsCount(countMatch as any),
            regenerated: true,
            source: 'count_cache_reactivated',
          };
        }
        return hitCache(countMatch, 'count_cache');
      }

      // Guard 7: semanticHash Match
      const semanticHash = await computeSemanticHash(sanitizedSchema);
      const semanticMatch = candidateTours.find(t => t.semanticHash === semanticHash);
      if (semanticMatch) {
        if (!semanticMatch.isActive) {
          await reactivateTour(db, kv, kvCacheKey, projectId, contextKey, semanticMatch, payloadHash);
          return {
            success: true,
            tourId: semanticMatch.id,
            stepsCount: getStepsCount(semanticMatch as any),
            regenerated: true,
            source: 'semantic_cache_reactivated',
          };
        }
        return hitCache(semanticMatch, 'semantic_cache');
      }

      // No match — Call LLM to map/generate full tour
      const fullGen = await generateAndMapTour(env, sanitizedSchema, contextKey);
      finalizedSteps = fullGen.steps;
      genUsage = fullGen.usage;
    }

    // Insert new active tour
    const tourId = `tour_${crypto.randomUUID().replace(/-/g, '')}`;
    const previousTour = legacyActive;

    // Compare steps with the previous tour to flag brand new elements/selectors
    if (previousTour) {
      try {
        const prevRow = await db.select({ stepsJson: tours.stepsJson })
          .from(tours)
          .where(eq(tours.id, previousTour.id))
          .get();
        if (prevRow?.stepsJson) {
          const oldSteps = JSON.parse(prevRow.stepsJson);
          if (Array.isArray(oldSteps)) {
            const oldSelectors = new Set(
              oldSteps
                .map((s: any) => s.targetSelector)
                .filter((sel: unknown): sel is string => typeof sel === 'string' && sel.length > 0)
            );
            finalizedSteps = finalizedSteps.map((step: any) => {
              const isNew = !oldSelectors.has(step.targetSelector);
              return { ...step, isNew };
            });
          }
        }
      } catch (err) {
        console.error('[TourGeneration] Error matching new steps for delta:', err);
      }
    }

    const countHashForInsert = await computeCountHash(sanitizedSchema);
    const semanticHashForInsert = await computeSemanticHash(sanitizedSchema);

    const updateQuery = previousTour ?
      db.update(tours)
        .set({ isActive: false, replacedBy: tourId })
        .where(and(
          eq(tours.projectId, projectId),
          eq(tours.contextKey, contextKey),
          eq(tours.isActive, true)
        )) :
      db.update(tours)
        .set({ isActive: false })
        .where(and(
          eq(tours.projectId, projectId),
          eq(tours.contextKey, contextKey)
        ));

    const insertQuery = db.insert(tours).values({
      id: tourId,
      projectId,
      contextKey,
      versionHash,
      versionHashWithFp,
      structureHash,
      zoneHashesJson: JSON.stringify(zoneHashes),
      countHash: countHashForInsert,
      semanticHash: semanticHashForInsert,
      stepsJson: JSON.stringify(finalizedSteps),
      elementFingerprints: elementFingerprints ? JSON.stringify(elementFingerprints) : null,
      payloadJson: JSON.stringify(sanitizedSchema),
      payloadHash,
      isActive: true,
      replacedBy: null,
      generationSource,
      totalSteps: finalizedSteps.length,
      uiVersion: incomingUiVersion,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.batch([updateQuery, insertQuery]);

    // [BILLING] one billable + cost row, plus a human-readable audit event.
    const fullLog = Promise.all([
      logTourGeneration(db, env, {
        projectId, contextKey,
        usage: genUsage, latencyMs: Date.now() - fullGenStart,
      }),
      writeAuditLog(db, {
        projectId, action: 'generate', entity: 'tour', tourId,
        page: contextKey, steps: finalizedSteps.length,
      }),
    ]);
    if (waitUntil) waitUntil(fullLog); else await fullLog;

    // Warm cache
    await kv.put(kvCacheKey, JSON.stringify({
      tourId,
      stepsCount: finalizedSteps.length,
      payloadHash,
    }), { expirationTtl: 3600 });

    // Mark previous user progress to pending so updated tour renders
    if (previousTour) {
      await db.update(userProgress)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(and(
          eq(userProgress.tourId, previousTour.id),
          inArray(userProgress.status, ['completed', 'dismissed'])
        ))
        .run();
    }

    if (waitUntil) {
      waitUntil(pruneOldTours(db, projectId, contextKey));
    } else {
      await pruneOldTours(db, projectId, contextKey);
    }

    return {
      success: true,
      tourId,
      stepsCount: finalizedSteps.length,
      regenerated: true,
    };

  } catch (error: any) {
    const errorMsg = error.message || 'Tour generation failed';
    const payloadHashForErr = payloadHash || 'unknown';

    // Record the failure as an audit event (errors live in audit_log now).
    const logPromise = writeAuditLog(db, {
      projectId, action: 'error', entity: 'tour',
      page: contextKey, message: errorMsg.slice(0, 300), payloadHash: payloadHashForErr,
    });

    if (waitUntil) {
      waitUntil(logPromise);
    } else {
      await logPromise;
    }

    return {
      success: false,
      error: errorMsg,
      regenerated: false,
      status: 500
    };
  } finally {
    await kv.delete(lockKey);
  }
}
