import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { SlideThemeTokens } from '../themes';

interface Props {
  latex: string;
  display?: boolean;
  caption?: string;
  theme: SlideThemeTokens;
  revealDelayMs?: number;
}

/* Renderiza una ecuación LaTeX en el canvas de la slide. La caption es
 * texto plano (descripción de variables) — si necesitase fórmulas inline,
 * usar paragraph con $...$ y MathText. */
const EquationBlock: React.FC<Props> = ({ latex, display = true, caption, theme, revealDelayMs = 0 }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
      });
    } catch {
      return null;
    }
  }, [latex, display]);

  return (
    <div
      className="diag-reveal slide-equation"
      style={{
        animationDelay: `${revealDelayMs}ms`,
        textAlign: display ? 'center' : 'left',
        padding: display ? '20px 24px' : '8px 12px',
        background: display ? `color-mix(in srgb, ${theme.primary} 4%, ${theme.bg.startsWith('#') ? theme.bg : 'transparent'})` : 'transparent',
        borderRadius: 12,
        border: display ? `1px solid ${theme.border}` : 'none',
        color: theme.text,
      }}
    >
      {html ? (
        <div
          style={{ fontSize: display ? '28px' : '18px', color: theme.primary }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <code style={{ color: '#dc2626', fontFamily: 'ui-monospace, monospace' }}>{latex}</code>
      )}
      {caption && (
        <p style={{ marginTop: 10, fontSize: 14, color: theme.textMuted, lineHeight: 1.45 }}>
          {caption}
        </p>
      )}
    </div>
  );
};

export default EquationBlock;
