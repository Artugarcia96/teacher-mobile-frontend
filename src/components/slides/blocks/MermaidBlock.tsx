import { useEffect, useRef, useState } from 'react';
import type { SlideThemeTokens } from '../themes';

interface Props {
  code: string;
  caption?: string;
  theme: SlideThemeTokens;
  revealDelayMs?: number;
}

/* Mermaid se carga dinámicamente solo si una slide lo necesita. Esto evita
 * que el bundle inicial crezca por una capability que la mayoría de
 * presentaciones no usan. */
let mermaidPromise: Promise<any> | null = null;
const mermaidModule = () => {
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = import('mermaid').then((mod) => {
    const m: any = (mod as any).default || mod;
    if (m && typeof m.initialize === 'function') {
      m.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'Inter, sans-serif',
      });
    }
    return m;
  });
  return mermaidPromise;
};

let _mermaidId = 0;

const MermaidBlock: React.FC<Props> = ({ code, caption, theme, revealDelayMs = 0 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    mermaidModule()
      .then(async (m) => {
        if (cancelled || !ref.current) return;
        const id = `mermaid-${++_mermaidId}`;
        try {
          const { svg } = await m.render(id, code);
          if (!cancelled && ref.current) ref.current.innerHTML = svg;
        } catch (err: any) {
          if (!cancelled) setError(err?.message || 'Diagrama mermaid inválido');
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'No se pudo cargar mermaid');
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div
      className="diag-reveal slide-mermaid"
      style={{
        animationDelay: `${revealDelayMs}ms`,
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: 18,
        overflow: 'auto',
        maxHeight: '100%',
      }}
    >
      {error ? (
        <div style={{ color: '#dc2626', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
          <strong>Error mermaid:</strong> {error}
          <pre style={{ marginTop: 8, color: theme.textMuted, whiteSpace: 'pre-wrap' }}>{code}</pre>
        </div>
      ) : (
        <div ref={ref} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
      )}
      {caption && (
        <div style={{ marginTop: 10, fontSize: 12, color: theme.textMuted, fontStyle: 'italic', textAlign: 'center' }}>
          {caption}
        </div>
      )}
    </div>
  );
};

export default MermaidBlock;
