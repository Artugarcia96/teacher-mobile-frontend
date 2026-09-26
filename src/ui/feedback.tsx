import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton } from './Button';
import { Sheet } from './Sheet';

// ── Toasts ───────────────────────────────────────────────────────────────────
interface Toast { id: number; text: string; tone: 'ok' | 'error'; action?: { label: string; run: () => void } }
/** `other`: a third way out (the confirm resolves false and it runs): «Revisar» instead of printing anyway. */
interface ConfirmOpts { title: string; text?: ReactNode; confirm: string; danger?: boolean; other?: { label: string; run: () => void } }

interface Ctx {
  toast: (text: string, opts?: { tone?: 'ok' | 'error'; action?: Toast['action'] }) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
}

const FeedbackCtx = createContext<Ctx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback<Ctx['toast']>((text, opts) => {
    const id = ++seq.current;
    const tone = opts?.tone ?? 'ok';
    // The same words again (justifying several absences in a row) replace the visible toast and restart its time.
    setToasts((t) => [...t.filter((x) => x.text !== text).slice(-2), { id, text, tone, action: opts?.action }]);
    // Errors stay until dismissed: the teacher may be looking at the class when a save fails.
    if (tone !== 'error') setTimeout(() => dismiss(id), opts?.action ? 6000 : 3200);
  }, [dismiss]);

  const confirm = useCallback<Ctx['confirm']>((opts) => new Promise((resolve) => setPending({ ...opts, resolve })), []);

  const close = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  return (
    <FeedbackCtx.Provider value={{ toast, confirm }}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast glass${t.tone === 'error' ? ' toast--error' : ''}`}>
              {t.tone === 'error' ? <WarningCircle size={20} /> : <CheckCircle size={20} weight="fill" color="var(--ok)" />}
              <span>{t.text}</span>
              {t.action && (
                <Button className="toast__action" size="sm" variant="plain" onClick={() => { t.action!.run(); dismiss(t.id); }}>
                  {t.action.label}
                </Button>
              )}
              {t.tone === 'error' && (
                <IconButton className="toast__action" label="Cerrar el aviso" size="sm" onClick={() => dismiss(t.id)}><X size={16} /></IconButton>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
      <Sheet open={!!pending} onClose={() => close(false)} title={pending?.title ?? ''}
        footer={<>
          {pending?.other
            ? <Button variant="neutral" onClick={() => { const run = pending.other!.run; close(false); run(); }}>{pending.other.label}</Button>
            : <Button variant="neutral" onClick={() => close(false)}>Cancelar</Button>}
          <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>{pending?.confirm}</Button>
        </>}>
        {pending?.text && <p className="muted">{pending.text}</p>}
      </Sheet>
    </FeedbackCtx.Provider>
  );
}

export function useFeedback(): Ctx {
  const ctx = useContext(FeedbackCtx);
  if (!ctx) throw new Error('FeedbackProvider missing');
  return ctx;
}

// ── Menu (overflow actions) ──────────────────────────────────────────────────
/** `disabledReason`: the item cannot be used now; says why under its label. */
export interface MenuItem { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; separatorBefore?: boolean; disabledReason?: string }

export function Menu({ trigger, items }: { trigger: (open: () => void) => ReactNode; items: MenuItem[] }) {
  const [pos, setPos] = useState<{ top: number; right: number; above: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Keep the whole menu on screen: open upwards when there is no room below (rows near the bottom), and move it right
  // when it is wider than the room left of its trigger (a button at the left edge of a phone).
  useLayoutEffect(() => {
    const h = menu.current?.offsetHeight ?? 0;
    const w = menu.current?.offsetWidth ?? 0;
    if (!pos || !h) return;
    let { top, right } = pos;
    if (top + h > window.innerHeight - 8) {
      const up = pos.above - 6 - h;
      top = up >= 8 ? up : Math.max(8, window.innerHeight - 8 - h);
    }
    if (window.innerWidth - right - w < 8) right = Math.max(8, window.innerWidth - 8 - w);
    if (top !== pos.top || right !== pos.right) setPos({ ...pos, top, right });
  }, [pos]);

  const isOpen = !!pos;
  /** Close; the focus goes back to «···» (it was in the menu, which is about to disappear). */
  const close = () => {
    setPos(null);
    anchor.current?.querySelector<HTMLElement>('button, [tabindex]')?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!isOpen) return;
    // The menu takes the focus, so the arrows (or Tab) reach its options.
    menu.current?.focus({ preventScroll: true });
    const onResize = () => setPos(null);
    // Capture phase + stop: Escape closes only the menu, not the sheet it was opened from, and Tab stays in the menu.
    const onKey = (e: KeyboardEvent) => {
      const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const move = (i: number) => { e.preventDefault(); e.stopImmediatePropagation(); items[(i + items.length) % items.length]?.focus(); };
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
      else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) move(at + 1);
      else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) move(at < 0 ? -1 : at - 1);
      else if (e.key === 'Home') move(0);
      else if (e.key === 'End') move(-1);
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey, true); };
  }, [isOpen]);

  const open = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right), above: r.top });
  };

  return (
    <span ref={anchor} style={{ display: 'inline-flex' }}>
      {trigger(open)}
      {pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 109 }} onClick={close} />
          <div ref={menu} className="menu" role="menu" tabIndex={-1} style={{ top: pos.top, right: pos.right }}>
            {items.map((it) => (
              <div key={it.label}>
                {it.separatorBefore && <div className="menu__sep" />}
                <button role="menuitem" className={`menu__item${it.danger ? ' menu__item--danger' : ''}`} disabled={!!it.disabledReason}
                  onClick={() => { close(); it.onSelect(); }}>
                  {it.icon}
                  <span className="menu__label">{it.label}{it.disabledReason && <small className="menu__reason">{it.disabledReason}</small>}</span>
                </button>
              </div>
            ))}
          </div>
        </>,
        document.body,
      )}
    </span>
  );
}
