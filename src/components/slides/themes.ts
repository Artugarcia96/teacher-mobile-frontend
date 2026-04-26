import type { ThemeId } from '../../types/presentations';

/**
 * Temas visuales de presentación. Son sólo tokens CSS — SlideRenderer y
 * EditableSlide los aplican como custom properties al contenedor.
 *
 * Diseño editorial inspirado en Gamma: cada tema es una COMBINACIÓN
 * cuidada de paleta + par tipográfico + textura de fondo. La idea es que
 * una presentación en cualquier tema se sienta "hecha por un profesional",
 * no un template plano.
 */
export interface SlideThemeTokens {
  id: ThemeId;
  label: string;
  description: string;

  /* Paleta base ── */
  /** Color de fondo del slide. Puede ser sólido o una imagen/gradient CSS. */
  bg: string;
  /** Color principal (acento fuerte — títulos, enlaces, acentos). */
  primary: string;
  /** Color secundario (acento suave, para highlights y decoración). */
  accent: string;
  /** Color de texto principal. */
  text: string;
  /** Color de texto suavizado (subtítulos, etiquetas). */
  textMuted: string;
  /** Color de bordes y separadores. */
  border: string;

  /* Tipografía ── */
  /** Familia tipográfica principal (body). Inter/sans por defecto. */
  fontFamily?: string;
  /** Familia tipográfica para títulos (display). Si no se da, usa fontFamily. */
  fontFamilyDisplay?: string;
  /** Peso del título — algunos displays quedan mejor en 600 que 700. */
  titleWeight?: number;

  /* Variantes por layout ── */
  coverBg?: string;
  coverText?: string;
  sectionBg?: string;
  sectionText?: string;

  /* Decoración (opcional) — renderizada por .slide-decoration ── */
  /** Patrón de fondo sutil en content slides. CSS background completo. */
  pattern?: string;
  /** Acento decorativo en covers: 'orb' | 'grid' | 'stripe' | 'none'. */
  coverDecoration?: 'orb' | 'grid' | 'stripe' | 'none';
}

/* ──────────────────────────────────────────────────────────────────
 * EDITORIAL — minimalismo refinado estilo magazine (The Economist × Gamma)
 * Blanco cremoso, navy profundo, coral como acento. Inter body + serif display.
 * ───────────────────────────────────────────────────────────────── */
const editorial: SlideThemeTokens = {
  id: 'minimal',
  label: 'Editorial',
  description: 'Minimalismo refinado, serif para títulos, coral como acento',
  bg: '#FBF9F4',
  primary: '#0B1D3A',
  accent: '#E5553B',
  text: '#111827',
  textMuted: '#6B6760',
  border: 'rgba(11, 29, 58, 0.12)',
  fontFamily: "'Inter', system-ui, sans-serif",
  fontFamilyDisplay: "'Fraunces', 'Playfair Display', Georgia, serif",
  titleWeight: 600,
  coverBg:
    'radial-gradient(ellipse at top right, rgba(229, 85, 59, 0.22), transparent 55%), ' +
    'radial-gradient(ellipse at bottom left, rgba(11, 29, 58, 0.08), transparent 55%), ' +
    '#0B1D3A',
  coverText: '#FBF9F4',
  sectionBg: '#F1EEE6',
  sectionText: '#0B1D3A',
  pattern:
    'radial-gradient(circle at 1px 1px, rgba(11, 29, 58, 0.05) 1px, transparent 0)',
  coverDecoration: 'orb',
};

/* ──────────────────────────────────────────────────────────────────
 * ACADEMIC — botánico clásico, serif en todo, tonos tierra
 * ───────────────────────────────────────────────────────────────── */
const academic: SlideThemeTokens = {
  id: 'academic',
  label: 'Académico',
  description: 'Serif clásico, tierra cálida y verde botánico',
  bg: '#FDFAF4',
  primary: '#6B2D0C',
  accent: '#0F6E5F',
  text: '#2B1E14',
  textMuted: '#8A7862',
  border: 'rgba(107, 45, 12, 0.15)',
  fontFamily: "'Lora', 'Crimson Pro', Georgia, serif",
  fontFamilyDisplay: "'Playfair Display', 'Lora', Georgia, serif",
  titleWeight: 700,
  coverBg:
    'linear-gradient(140deg, #6B2D0C 0%, #A34B1D 60%, #D17C4A 100%)',
  coverText: '#FEF7E8',
  sectionBg: '#F5E9D4',
  sectionText: '#6B2D0C',
  pattern:
    'radial-gradient(circle at 2px 2px, rgba(107, 45, 12, 0.06) 1px, transparent 0)',
  coverDecoration: 'stripe',
};

/* ──────────────────────────────────────────────────────────────────
 * VIVID — vibrante moderno, morado real + amarillo mostaza, para ESO/primaria
 * Sin "colorido infantil": paleta saturada pero culta.
 * ───────────────────────────────────────────────────────────────── */
const vivid: SlideThemeTokens = {
  id: 'playful',
  label: 'Didáctico',
  description: 'Vibrante, moderno — morado + mostaza, para ESO y Primaria',
  bg: '#FFFBEA',
  primary: '#5B21B6',
  accent: '#F59E0B',
  text: '#1F1B3A',
  textMuted: '#6B6189',
  border: 'rgba(91, 33, 182, 0.14)',
  fontFamily: "'Inter', system-ui, sans-serif",
  fontFamilyDisplay: "'Poppins', 'Inter', system-ui, sans-serif",
  titleWeight: 700,
  coverBg:
    'linear-gradient(135deg, #5B21B6 0%, #7C3AED 50%, #F59E0B 100%)',
  coverText: '#FFFFFF',
  sectionBg: '#F3E8FF',
  sectionText: '#5B21B6',
  pattern:
    'radial-gradient(circle at 1px 1px, rgba(91, 33, 182, 0.08) 1px, transparent 0)',
  coverDecoration: 'grid',
};

export const THEMES: Record<ThemeId, SlideThemeTokens> = {
  minimal: editorial,
  academic,
  playful: vivid,
};

export const THEME_LIST = Object.values(THEMES);

export function getTheme(id?: string): SlideThemeTokens {
  if (id && (id as ThemeId) in THEMES) return THEMES[id as ThemeId];
  return THEMES.minimal;
}

/** Traduce el tema de slide a un override parcial del DiagramTheme para que
 *  los diagramas dentro de un slide hereden el color del tema. */
export function slideThemeToDiagramOverride(theme: SlideThemeTokens) {
  return {
    tones: {
      accent: {
        fill: theme.primary,
        fillSoft: theme.bg.startsWith('#') ? theme.bg : '#ffffff',
        stroke: theme.primary,
        text: theme.primary,
        onFill: '#ffffff',
      },
    } as any,
  };
}
