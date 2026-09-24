import type { Support } from '../../api/types';

/** "NEAE · TDAH", "ACNEE", or null when the student has no support flags. */
export function supportLabel(s: Support | null | undefined): string | null {
  if (!s) return null;
  const parts = [s.acnee ? 'ACNEE' : s.neae ? 'NEAE' : null, s.kind || null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
