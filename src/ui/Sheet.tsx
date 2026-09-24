import { X } from '@phosphor-icons/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Sticky footer, usually the primary action. */
  footer?: ReactNode;
  size?: 'auto' | 'large';
  wide?: boolean;
  children: ReactNode;
}

/** Bottom sheet on phones, centered glass panel on tablet/desktop. Esc and scrim close it. */
export function Sheet({ open, onClose, title, subtitle, footer, size = 'auto', wide, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, [data-autofocus]');
    first?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
        className={`sheet${size === 'large' ? ' sheet--large' : ''}${wide ? ' sheet--wide' : ''}`}>
        <div className="sheet__grab" />
        <div className="sheet__head">
          <div className="sheet__title">{title}</div>
          <IconButton label="Cerrar" size="sm" onClick={onClose}><X size={18} /></IconButton>
        </div>
        {subtitle && <div className="sheet__sub">{subtitle}</div>}
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
