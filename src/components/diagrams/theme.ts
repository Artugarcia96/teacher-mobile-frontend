import { createContext, useContext } from 'react';
import type { DiagramItem } from './types';

export interface DiagramTheme {
  /** Paleta de acentos por tono. Cada tono define fill, text, border. */
  tones: Record<NonNullable<DiagramItem['tone']>, ToneSwatch>;
  /** Colores base neutros. */
  neutral: {
    surface: string;
    surfaceAlt: string;
    border: string;
    text: string;
    textMuted: string;
  };
  /** Familia tipográfica (deja undefined para heredar de la app). */
  fontFamily?: string;
  /** Radio base para cajas. */
  radius: number;
  /** Delay base (ms) entre items al animar la entrada. */
  stepDelayMs: number;
}

export interface ToneSwatch {
  fill: string;
  fillSoft: string;
  stroke: string;
  text: string;
  onFill: string;
}

const swatch = (fill: string, fillSoft: string, stroke: string, text: string, onFill = '#fff'): ToneSwatch => ({
  fill, fillSoft, stroke, text, onFill,
});

export const DEFAULT_THEME: DiagramTheme = {
  tones: {
    accent: swatch('#6366f1', '#eef2ff', '#4f46e5', '#4338ca'),
    primary: swatch('#0ea5e9', '#e0f2fe', '#0284c7', '#075985'),
    muted: swatch('#94a3b8', '#f1f5f9', '#64748b', '#334155', '#fff'),
    success: swatch('#10b981', '#d1fae5', '#059669', '#065f46'),
    warning: swatch('#f59e0b', '#fef3c7', '#d97706', '#92400e'),
    danger: swatch('#ef4444', '#fee2e2', '#dc2626', '#991b1b'),
  },
  neutral: {
    surface: 'var(--background, #fff)',
    surfaceAlt: 'var(--muted, #f8fafc)',
    border: 'var(--border, #e2e8f0)',
    text: 'var(--foreground, #0f172a)',
    textMuted: 'var(--muted-foreground, #64748b)',
  },
  radius: 10,
  stepDelayMs: 110,
};

/** Ciclo determinista de tonos para iterar cuando el LLM no asigna colores. */
export const TONE_CYCLE: Array<NonNullable<DiagramItem['tone']>> = [
  'accent', 'primary', 'success', 'warning', 'danger', 'muted',
];

export function resolveTone(theme: DiagramTheme, tone?: DiagramItem['tone'], index = 0): ToneSwatch {
  if (tone && theme.tones[tone]) return theme.tones[tone];
  return theme.tones[TONE_CYCLE[index % TONE_CYCLE.length]];
}

export const DiagramThemeContext = createContext<DiagramTheme>(DEFAULT_THEME);
export const useDiagramTheme = () => useContext(DiagramThemeContext);

/** Delay inline para animaciones stagger; se combina con la clase .diag-reveal. */
export const revealStyle = (index: number, theme = DEFAULT_THEME): React.CSSProperties => ({
  animationDelay: `${index * theme.stepDelayMs}ms`,
});
