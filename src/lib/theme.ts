/** Appearance preference: 'system' follows the OS; 'light'/'dark' force it via <html data-theme>. */
export type Theme = 'system' | 'light' | 'dark';
const KEY = 'sepia.theme';

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme = getTheme()) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch { /* private mode: applies for this visit only */ }
  applyTheme(theme);
}
