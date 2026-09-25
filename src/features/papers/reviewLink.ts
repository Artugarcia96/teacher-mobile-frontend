/** History state of the links from an activity to its focus review: leaving the review goes back in history (the
 * phone's back gesture then lands on the Cuaderno, never on the review again). */
export const FROM_ACTIVITY = { fromActivity: true } as const;

export function cameFromActivity(state: unknown): boolean {
  return !!(state as { fromActivity?: boolean } | null)?.fromActivity;
}
