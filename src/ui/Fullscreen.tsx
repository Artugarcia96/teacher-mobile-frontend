import { X } from '@phosphor-icons/react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import './Fullscreen.css';

interface Props {
  onClose: () => void;
  label: string;
  children: ReactNode;
}

/** Full-screen paper stage to show something to the class on the projector (Esc or "Cerrar" to leave). */
export function Fullscreen({ onClose, label, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div className="fullscreen" role="dialog" aria-modal="true" aria-label={label}>
      <Button className="fullscreen__close" variant="glass" size="sm" icon={<X size={16} />} onClick={onClose}>Cerrar</Button>
      <div className="fullscreen__stage">{children}</div>
    </div>,
    document.body,
  );
}
