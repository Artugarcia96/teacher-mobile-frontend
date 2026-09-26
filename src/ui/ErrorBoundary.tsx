import { WarningCircle } from '@phosphor-icons/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState } from './bits';
import { Page } from './Page';

interface Props { resetKey: string; children: ReactNode }

/** A screen that fails to render stays inside the frame (sidebar and tab capsule keep working) instead of leaving the
 *  whole app blank. Going to another screen (`resetKey`, the path) tries again. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Page title="Algo ha fallado">
        <EmptyState icon={<WarningCircle size={24} />} title="No se ha podido mostrar esta pantalla"
          text="Lo que ya estaba guardado no se ha perdido. Vuelve a cargarla para seguir."
          action={<Button variant="tinted" onClick={() => window.location.reload()}>Volver a cargar</Button>} />
      </Page>
    );
  }
}
