import {
  TrendingUp, TrendingDown, Minus,
  Info, Lightbulb, Sparkles, AlertTriangle, Target, StickyNote,
} from 'lucide-react';
import DiagramRenderer from '../diagrams/DiagramRenderer';
import type { Block, CalloutVariant } from '../../types/presentations';
import type { SlideThemeTokens } from './themes';
import { slideThemeToDiagramOverride } from './themes';
import { TypedText } from './typewriter';
import EquationBlock from './blocks/EquationBlock';
import CodeBlock from './blocks/CodeBlock';
import TableBlock from './blocks/TableBlock';
import MermaidBlock from './blocks/MermaidBlock';

const CALLOUT_VARIANTS: Record<CalloutVariant, {
  icon: typeof Info;
  accent: string;
  label: string;
}> = {
  info:    { icon: Info,          accent: '#0284c7', label: 'Info' },
  tip:     { icon: Lightbulb,     accent: '#d97706', label: 'Tip' },
  example: { icon: Sparkles,      accent: '#7c3aed', label: 'Ejemplo' },
  warning: { icon: AlertTriangle, accent: '#dc2626', label: 'Atención' },
  key:     { icon: Target,        accent: '#059669', label: 'Clave' },
  note:    { icon: StickyNote,    accent: '#475569', label: 'Nota' },
};

const CARD_ACCENT: Record<string, string> = {
  accent:  '#6366f1',
  primary: '#0ea5e9',
  success: '#10b981',
  warning: '#f59e0b',
  danger:  '#ef4444',
  muted:   '#64748b',
};

interface Props {
  block: Block;
  theme: SlideThemeTokens;
  revealDelayMs?: number;
  /** typewriter es controlado por el scope ancestor; aquí solo lo recibimos
   *  como flag para fragmentos editables. */
  typewriter?: boolean;
}

const BlockRenderer: React.FC<Props> = ({ block, theme, revealDelayMs = 0 }) => {
  const style: React.CSSProperties = { animationDelay: `${revealDelayMs}ms` };

  switch (block.kind) {
    case 'heading':
      return (
        <h3 className="slide-title-content diag-reveal" style={{ ...style, color: theme.primary, border: 'none', padding: 0 }}>
          <TypedText value={block.text} delay={revealDelayMs} />
        </h3>
      );

    case 'paragraph':
      return (
        <p className="slide-text-base diag-reveal" style={{ ...style, color: theme.text, margin: 0 }}>
          <TypedText value={block.text} delay={revealDelayMs} />
        </p>
      );

    case 'bullets':
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {block.items.map((item, i) => (
            <li
              key={i}
              className="slide-text-base diag-reveal"
              style={{ animationDelay: `${revealDelayMs + i * 90}ms`, color: theme.text, display: 'flex', gap: '16px', alignItems: 'baseline' }}
            >
              <span
                style={{
                  flex: '0 0 auto',
                  width: '14px', height: '2px',
                  background: theme.accent,
                  borderRadius: 1,
                  transform: 'translateY(-0.35em)',
                  opacity: 0.85,
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <TypedText value={item} delay={revealDelayMs + i * 90} />
              </span>
            </li>
          ))}
        </ul>
      );

    case 'quote':
      return (
        <blockquote
          className="slide-text-base diag-reveal"
          style={{
            ...style,
            borderLeft: `5px solid ${theme.accent}`,
            paddingLeft: '24px',
            paddingRight: 0,
            fontStyle: 'italic',
            margin: 0,
            color: theme.text,
          }}
        >
          "<TypedText value={block.text} delay={revealDelayMs} />"
          {block.author && (
            <footer className="slide-text-sm" style={{ marginTop: '6px', fontStyle: 'normal', color: theme.textMuted }}>
              — {block.author}
            </footer>
          )}
        </blockquote>
      );

    case 'stat': {
      const toneColor = (() => {
        switch (block.tone) {
          case 'success': return '#059669';
          case 'warning': return '#d97706';
          case 'danger':  return '#dc2626';
          case 'primary': return theme.primary;
          case 'accent':  return theme.accent;
          default:        return theme.primary;
        }
      })();
      return (
        <div
          className="diag-reveal"
          style={{
            ...style,
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '22px 28px',
            borderRadius: '16px',
            border: `1px solid ${theme.border}`,
            background: theme.bg,
          }}
        >
          <span className="slide-stat-value" style={{ color: toneColor }}>{block.value}</span>
          <span className="slide-stat-label" style={{ color: theme.textMuted }}>{block.label}</span>
        </div>
      );
    }

    case 'callout': {
      const v = CALLOUT_VARIANTS[block.variant] || CALLOUT_VARIANTS.info;
      const Icon = v.icon;
      const wash = `color-mix(in srgb, ${v.accent} 7%, ${theme.bg.startsWith('#') ? theme.bg : 'transparent'})`;
      return (
        <div
          className="diag-reveal"
          style={{
            ...style,
            display: 'flex',
            gap: '14px',
            padding: '18px 22px',
            background: wash,
            color: theme.text,
            borderLeft: `3px solid ${v.accent}`,
            borderRadius: '8px',
            alignItems: 'flex-start',
          }}
        >
          <Icon style={{ flex: '0 0 auto', width: '20px', height: '20px', color: v.accent, marginTop: '4px' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {block.title && (
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  marginBottom: '4px',
                  color: v.accent,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                <TypedText value={block.title} delay={revealDelayMs} />
              </div>
            )}
            <div style={{ fontSize: '17px', lineHeight: 1.5, color: theme.text }}>
              <TypedText value={block.text} delay={revealDelayMs + (block.title ? 150 : 0)} />
            </div>
          </div>
        </div>
      );
    }

    case 'cards': {
      const visible = block.items.slice(0, 3);
      const cols = Math.min(visible.length, 3);
      return (
        <div
          className="diag-reveal"
          style={{
            ...style,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: '18px',
          }}
        >
          {visible.map((card, i) => {
            const accent = card.tone ? (CARD_ACCENT[card.tone] || theme.accent) : theme.accent;
            return (
              <div
                key={i}
                className="diag-reveal"
                style={{
                  animationDelay: `${revealDelayMs + i * 110}ms`,
                  background: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderTop: `3px solid ${accent}`,
                  color: theme.text,
                  padding: '22px 24px 20px',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  minWidth: 0,
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 16px rgba(15, 23, 42, 0.04)',
                }}
              >
                <div
                  style={{
                    fontSize: '17px',
                    fontWeight: 700,
                    letterSpacing: '-0.005em',
                    lineHeight: 1.25,
                    color: theme.primary,
                  }}
                >
                  <TypedText value={card.title} delay={revealDelayMs + i * 110} />
                </div>
                <div style={{ fontSize: '14px', lineHeight: 1.55, color: theme.textMuted }}>
                  <TypedText value={card.text} delay={revealDelayMs + i * 110 + 100} />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    case 'diagram':
      return (
        <div className="diag-reveal" style={{ ...style, minHeight: 0, maxHeight: '100%', overflow: 'hidden' }}>
          <DiagramRenderer data={block.diagram} theme={slideThemeToDiagramOverride(theme)} />
        </div>
      );

    case 'equation':
      return (
        <EquationBlock
          latex={block.latex}
          display={block.display !== false}
          caption={block.caption}
          theme={theme}
          revealDelayMs={revealDelayMs}
        />
      );

    case 'codeBlock':
      return (
        <CodeBlock
          language={block.language}
          code={block.code}
          caption={block.caption}
          theme={theme}
          revealDelayMs={revealDelayMs}
        />
      );

    case 'table':
      return (
        <TableBlock
          columns={block.columns}
          rows={block.rows}
          highlightedRow={block.highlightedRow}
          caption={block.caption}
          theme={theme}
          revealDelayMs={revealDelayMs}
        />
      );

    case 'mermaid':
      return (
        <MermaidBlock
          code={block.code}
          caption={block.caption}
          theme={theme}
          revealDelayMs={revealDelayMs}
        />
      );

    default:
      return null;
  }
};

export default BlockRenderer;

export const TrendIcon: React.FC<{ trend?: 'up' | 'down' | 'flat' }> = ({ trend }) => {
  if (trend === 'up') return <TrendingUp size={14} className="text-emerald-600" />;
  if (trend === 'down') return <TrendingDown size={14} className="text-rose-600" />;
  return <Minus size={14} />;
};
