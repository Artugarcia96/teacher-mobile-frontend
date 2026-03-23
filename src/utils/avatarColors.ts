/**
 * Centralized avatar color palette.
 * Maps to CSS variables --avatar-color-1 through --avatar-color-8 in variables.css.
 */
export const AVATAR_COLORS = [
  '#15665E', '#2563EB', '#7C3AED', '#DB2777',
  '#D97706', '#059669', '#DC2626', '#0891B2',
];

/** Deterministic color for a given name string. */
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Subject / color-picker palette.
 * Shared between ClassSettings and TopicsList color pickers.
 */
export const PALETTE_COLORS = [
  '#15665E', '#2563EB', '#6C3AED', '#DB2777',
  '#D97706', '#059669', '#DC2626', '#0891B2',
];
