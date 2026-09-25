import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Sheet } from './Sheet';

// ── Toasts ───────────────────────────────────────────────────────────────────
interface Toast { id: number; text: string; tone: 'ok' | 'error'; action?: { label: string; run: () => void } }
interface ConfirmOpts { title: string; text?: ReactNode; confirm: string; danger?: boolean }

interface Ctx {
  toast: (text: string, opts?: { tone?: 'ok' | 'error'; action?: Toast['action'] }) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
}

const FeedbackCtx = createContext<Ctx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const seq = useRef(0);

  const toast = useCallback<Ctx['toast']>((text, opts) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone: opts?.tone ?? 'ok', action: opts?.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.action ? 6000 : 3200);
  }, []);

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
                <Button className="toast__action" size="sm" variant="plain" onClick={() => { t.action!.run(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>
                  {t.action.label}
                </Button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
      <Sheet open={!!pending} onClose={() => close(false)} title={pending?.title ?? ''}
        footer={<>
          <Button variant="neutral" onClick={() => close(false)}>Cancelar</Button>
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

  // Keep the whole menu on screen: open upwards when there is no room below (rows near the bottom).
  useLayoutEffect(() => {
    const h = menu.current?.offsetHeight ?? 0;
    if (!pos || !h || pos.top + h <= window.innerHeight - 8) return;
    const up = pos.above - 6 - h;
    const top = up >= 8 ? up : Math.max(8, window.innerHeight - 8 - h);
    if (top !== pos.top) setPos({ ...pos, top });
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    // Capture phase + stop: Escape closes only the menu, not the sheet it was opened from.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('resize', close); document.removeEventListener('keydown', onKey, true); };
  }, [pos]);

  const open = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right), above: r.top });
  };

  return (
    <span ref={anchor} style={{ display: 'inline-flex' }}>
      {trigger(open)}
      {pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 109 }} onClick={() => setPos(null)} />
          <div ref={menu} className="menu" role="menu" style={{ top: pos.top, right: pos.right }}>
            {items.map((it) => (
              <div key={it.label}>
                {it.separatorBefore && <div className="menu__sep" />}
                <button role="menuitem" className={`menu__item${it.danger ? ' menu__item--danger' : ''}`} disabled={!!it.disabledReason}
                  onClick={() => { setPos(null); it.onSelect(); }}>
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
