// ---------------------------------------------------------------------------
// Status State Machine — enforces valid lifecycle transitions for user_progress.
// Prevents invalid flows (e.g. completed→started) at the API layer.
// ---------------------------------------------------------------------------

export const VALID_STATUSES = ['started', 'completed', 'dismissed', 'maybe_later', 'pending'] as const;
export type ValidStatus = typeof VALID_STATUSES[number];

// Allowed transitions: current → Set<next>
const TRANSITION_MAP: Record<ValidStatus, Set<ValidStatus>> = {
  started:     new Set(['completed', 'dismissed', 'maybe_later']),
  maybe_later: new Set(['started', 'completed', 'dismissed']),
  pending:     new Set(['started']),
  // completed/dismissed → 'pending' (legacy regen) OR 'started' (DELTA re-engage:
  // an in-place version bump added new steps this user hasn't seen, so they are
  // re-started to play the micro-tour).
  completed:   new Set(['pending', 'started']),
  dismissed:   new Set(['pending', 'started']),
};

/**
 * Returns true if transitioning from `current` to `next` is semantically valid.
 * First insert (current = null) is always allowed.
 */
export function isValidTransition(current: ValidStatus | null, next: ValidStatus): boolean {
  if (current === null) return true;           // First insert — always valid
  if (current === next) return true;           // Idempotent replay — always valid
  return TRANSITION_MAP[current]?.has(next) ?? false;
}

/**
 * Appends a status entry to the history array, capped at 20 entries.
 * Returns the new history array as a serializable object.
 */
export function appendStatusHistory(
  existingJson: string | null | undefined,
  status: ValidStatus
): { status: string; at: number }[] {
  let history: { status: string; at: number }[] = [];
  if (existingJson) {
    try { history = JSON.parse(existingJson); } catch { /* corrupt — reset */ }
  }
  history.push({ status, at: Date.now() });
  // Cap at last 20 entries to prevent unbounded growth
  return history.slice(-20);
}
