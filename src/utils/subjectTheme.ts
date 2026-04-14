/**
 * Build CSS custom-property overrides so that a page uses the subject's color
 * as its primary accent instead of the default green.
 *
 * Returns a CSSProperties object to spread on the page's IonContent (or root div).
 * When `color` is undefined/null the function returns undefined (= no override).
 */
export function subjectThemeStyle(color: string | undefined | null): React.CSSProperties | undefined {
  if (!color) return undefined;

  // Parse "#RRGGBB" → "R, G, B"
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return {
    '--subject-color': color,
    '--gradient-primary': color,
  } as React.CSSProperties;
}
