import { X } from '@phosphor-icons/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { DESKTOP, useMediaQuery } from './useMediaQuery';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Sticky footer, usually the primary action. */
  footer?: ReactNode;
  size?: 'auto' | 'large';
  wide?: boolean;
  /** On desktop (≥1024) open as a right side panel next to the page, which stays visible, scrollable and clickable:
   *  the panel closes only with its ✕ or Esc, so a click on the page never discards what is being edited. */
  side?: boolean;
  children: ReactNode;
}

/** Bottom sheet on phones, centered glass panel on tablet/desktop (or a side panel). Esc and scrim close it. */
export function Sheet({ open, onClose, title, subtitle, footer, size = 'auto', wide, side, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const panel = useMediaQuery(DESKTOP) && !!side;
  // Latest onClose without re-running the open effect (it would steal focus from inputs on every render).
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, [data-autofocus]');
    first?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open || panel) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, panel]);

  if (!open) return null;
  return createPortal(
    <>
      {!panel && <div className="sheet-scrim" onClick={onClose} />}
      <div ref={ref} role="dialog" aria-modal={!panel} aria-label={typeof title === 'string' ? title : undefined}
        className={`sheet${size === 'large' ? ' sheet--large' : ''}${wide ? ' sheet--wide' : ''}${side ? ' sheet--side' : ''}`}>
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
