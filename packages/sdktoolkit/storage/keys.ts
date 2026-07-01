// storage/keys — single source of truth for localStorage / sessionStorage key
// names. Keys are namespaced by the last 8 chars of the API key so multiple
// AITour projects on the same origin never collide. Tour-scoped keys also embed
// the tourId. Centralizing the format here keeps resume/dedupe state consistent.

export function storageSuffix(apiKey: string): string {
  return (apiKey || '').slice(-8);
}

/** Project-global key, e.g. resume_tour_id / last_user_id / pending_check. */
export function globalKey(apiKey: string, key: string): string {
  return `aitour_${storageSuffix(apiKey)}_${key}`;
}

/** Tour-scoped key, e.g. <tourId>_resume_step. */
export function tourKey(apiKey: string, tourId: string, key: string): string {
  return `aitour_${storageSuffix(apiKey)}_${tourId}_${key}`;
}
