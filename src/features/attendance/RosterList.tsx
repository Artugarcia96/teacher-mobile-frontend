/** Roster «a toques», shared by Pasar lista and Revisar deberes: list number, «Apellidos, Nombre» and a status chip.
 *  Tap cycles the status; long-press (touch) or right-click opens per-student options. Plus the autosave hook both use. */
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Chip, Menu, type MenuItem } from '../../ui';
import './attendance.css';

type Tone = 'ok' | 'warn' | 'danger' | 'accent' | 'info' | 'outline' | 'muted';

export interface RosterRow { id: string; name: string; status: string; note?: string | null; disabled?: boolean }

interface RosterListProps {
  rows: RosterRow[];
  label: Record<string, string>;
  tone: Record<string, Tone>;
  onTap: (id: string) => void;
  /** Per-student options (long-press / right-click). */
  options?: (row: RosterRow) => MenuItem[];
  /** Inline editor shown under one row (e.g. the note of an absence). */
  editor?: { id: string; node: ReactNode } | null;
}

/** How to reach the per-student options, for the list's accessible name and the line under it. */
export const OPTIONS_HINT = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
  ? 'Clic derecho en un nombre: justificar o anotar.' : 'Mantén pulsado un nombre: justificar o anotar.';

export function RosterList({ rows, label, tone, onTap, options, editor }: RosterListProps) {
  return (
    <>
      <div className="roster" role="list" aria-label={options ? `Lista de la clase. ${OPTIONS_HINT}` : 'Lista de la clase'}>
        {rows.map((row, i) => (
          <Fragment key={row.id}>
            <div role="listitem" className="roster__item">
              <RosterLine n={i + 1} row={row} label={label[row.status]} tone={tone[row.status]} onTap={onTap}
                items={row.disabled ? undefined : options?.(row)} />
            </div>
            {editor?.id === row.id && <div className="roster__edit">{editor.node}</div>}
          </Fragment>
        ))}
      </div>
      {options && <p className="roster-hint">{OPTIONS_HINT}</p>}
    </>
  );
}

const LONG_PRESS_MS = 480;

function RosterLine({ n, row, label, tone, onTap, items }: {
  n: number; row: RosterRow; label: string; tone: Tone; onTap: (id: string) => void; items?: MenuItem[];
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(() => cancel, []);

  const line = (open?: () => void) => (
    <button type="button" className="roster__row" disabled={row.disabled}
      aria-label={`${n}. ${row.name}: ${label}${row.disabled ? '' : '. Toca para cambiar'}`}
      onClick={() => {
        if (longPressed.current) { longPressed.current = false; return; }
        onTap(row.id);
      }}
      onPointerDown={(e) => {
        longPressed.current = false;
        if (!open || e.pointerType === 'mouse') return;
        origin.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => { longPressed.current = true; navigator.vibrate?.(8); open(); }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        if (origin.current && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 8) cancel();
      }}
      onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
      // After a long-press the menu is open: the click the browser synthesises on release would land on its backdrop.
      onTouchEnd={(e) => { if (longPressed.current) e.preventDefault(); }}
      onContextMenu={(e) => {
        if (!open) return;
        e.preventDefault();
        if (!longPressed.current) open();
      }}>
      <span className="roster__n num">{n}</span>
      <span className="roster__main">
        <span className="roster__name">{row.name}</span>
        {row.note && <span className="roster__note">{row.note}</span>}
      </span>
      {tone === 'muted' ? <span className="chip roster__muted">{label}</span> : <Chip tone={tone}>{label}</Chip>}
    </button>
  );

  if (!items?.length) return line();
  return <Menu trigger={(open) => line(open)} items={items} />;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Debounced autosave of the latest state. One save at a time: when it resolves, the state scheduled meanwhile goes
 *  next, so an older save never lands after a newer one. `flush` resolves once the server has everything (false if a
 *  save failed; the taps are kept for the next try). Leaving mid-save (unmount, closing the tab) sends what is left
 *  with `keepalive` instead of dropping it. */
export function useAutosave<T>(save: (payload: T) => Promise<unknown>, keepalive: (payload: T) => void) {
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const saveRef = useRef(save);
  const keepaliveRef = useRef(keepalive);
  useEffect(() => { saveRef.current = save; keepaliveRef.current = keepalive; }, [save, keepalive]);

  const drain = useCallback((): Promise<boolean> => {
    if (inflight.current) return inflight.current;
    if (pending.current === null) return Promise.resolve(true);
    const run = (async () => {
      setState('saving');
      while (pending.current !== null) {
        const payload = pending.current;
        pending.current = null;
        try {
          await saveRef.current(payload);
        } catch {
          pending.current ??= payload;
          setState('error');
          return false;
        }
      }
      setState('saved');
      return true;
    })().finally(() => { inflight.current = null; });
    inflight.current = run;
    return run;
  }, []);

  /** Saves now (the given payload, or what is left) and resolves when the server has confirmed it all. */
  const flush = useCallback(async (payload?: T): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (payload !== undefined) pending.current = payload;
    return drain();
  }, [drain]);

  const schedule = useCallback((payload: T, delay = 600) => {
    pending.current = payload;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void drain(); }, delay);
  }, [drain]);

  useEffect(() => {
    const leave = (now: boolean) => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      const payload = pending.current;
      if (payload === null) return;
      pending.current = null;
      // After the save in flight (unless the page is going away): it may carry older values of the same students.
      if (inflight.current && !now) void inflight.current.then(() => keepaliveRef.current(payload));
      else keepaliveRef.current(payload);
    };
    const onPageHide = () => leave(true);
    window.addEventListener('pagehide', onPageHide);
    return () => { window.removeEventListener('pagehide', onPageHide); leave(false); };
  }, []);

  return { state, schedule, flush, isDirty: () => timer.current !== null || pending.current !== null || inflight.current !== null };
}

export const SAVE_LABEL: Record<SaveState, string> = {
  idle: '', saving: 'Guardando…', saved: 'Guardado', error: 'No se ha podido guardar',
};
