import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * ErrorBoundary genérico. Envuélvelo alrededor de cualquier subárbol que pueda
 * renderizar datos de IA o de red: si dentro de ese subárbol algo peta (acceso
 * a undefined, schema inesperado, etc.), en lugar de tumbar toda la app
 * mostramos un fallback localizado — un slide con "no se pudo mostrar este
 * elemento" y el resto de la UI sigue viva.
 *
 * React class component porque los hooks no pueden capturar errores de
 * render — `componentDidCatch`/`getDerivedStateFromError` son class-only.
 */

type FallbackRender = (opts: {
  error: Error | null;
  reset: () => void;
}) => ReactNode;

interface Props {
  children: ReactNode;
  /** Render custom para el fallback. Si no se pasa, se muestra el default. */
  fallback?: FallbackRender;
  /** Tag opcional — ayuda a leer los logs cuando hay varios boundaries. */
  label?: string;
  /** Callback side-effect (telemetría, etc.). */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Por defecto logueamos a consola — nunca queremos silenciar en prod un
    // error que tumbaba la app entera, eso dificulta diagnóstico.
    // Evitamos console.error para no ensuciar de rojo — warn es suficiente.
    // eslint-disable-next-line no-console
    console.warn(
      `[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}] captured:`,
      error,
      info.componentStack,
    );
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset });
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

const DefaultFallback: React.FC<{ error: Error; reset: () => void }> = ({
  error,
  reset,
}) => (
  <div
    role="alert"
    style={{
      padding: '1.5rem',
      borderRadius: 12,
      border: '1px solid color-mix(in srgb, #dc2626 30%, transparent)',
      background: 'color-mix(in srgb, #dc2626 5%, transparent)',
      color: 'var(--color-foreground, #0f172a)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      alignItems: 'flex-start',
      maxWidth: 640,
      margin: '1rem auto',
    }}
  >
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 600 }}>
      <AlertTriangle size={18} />
      No se ha podido mostrar este elemento
    </div>
    <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>
      Algo ha fallado al preparar esta parte de la página. El resto de la app
      sigue funcionando. Puedes reintentar:
    </p>
    <button
      type="button"
      onClick={reset}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        border: 'none',
        background: 'var(--color-primary, #15665e)',
        color: 'var(--color-primary-foreground, #fff)',
        fontWeight: 600,
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      Reintentar
    </button>
    {import.meta.env.DEV && (
      <pre
        style={{
          margin: 0,
          padding: '8px 10px',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.04)',
          fontSize: 11,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxWidth: '100%',
        }}
      >
        {error.message}
      </pre>
    )}
  </div>
);

export default ErrorBoundary;
