import { X } from '@phosphor-icons/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import './Fullscreen.css';

interface Props {
  onClose: () => void;
  label: string;
  children: ReactNode;
}

/** Full-screen paper stage to show something to the class on the projector (Esc or "Cerrar" to leave). Uses the
 *  browser's fullscreen where available, so the toolbar does not show on the projector; leaving it closes too. */
export function Fullscreen({ onClose, label, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement === ref.current) entered = true;
      else if (entered) close.current(); // the browser's own Esc / gesture left fullscreen
    };
    document.addEventListener('fullscreenchange', onChange);
    ref.current?.requestFullscreen?.().catch(() => undefined); // not on iPhone, or refused: the overlay still works
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onChange);
      document.body.style.overflow = prev;
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  return createPortal(
    <div ref={ref} className="fullscreen" role="dialog" aria-modal="true" aria-label={label}>
      <Button className="fullscreen__close" variant="glass" size="sm" icon={<X size={16} />} onClick={onClose}>Cerrar</Button>
      <div className="fullscreen__stage">{children}</div>
    </div>,
    document.body,
  );
}
