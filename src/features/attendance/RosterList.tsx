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

export function RosterList({ rows, label, tone, onTap, options, editor }: RosterListProps) {
  return (
    <div className="roster" role="list">
      {rows.map((row, i) => (
        <Fragment key={row.id}>
          <RosterLine n={i + 1} row={row} label={label[row.status]} tone={tone[row.status]} onTap={onTap}
            items={row.disabled ? undefined : options?.(row)} />
          {editor?.id === row.id && <div className="roster__edit">{editor.node}</div>}
        </Fragment>
      ))}
    </div>
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
    <button type="button" role="listitem" className="roster__row" disabled={row.disabled}
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

/** Debounced autosave: `schedule` the latest payload, `flush` before closing. Keeps taps even if a save fails. */
export function useAutosave<T>(save: (payload: T) => Promise<unknown>) {
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<T | null>(null);
  const dirty = useRef(false);
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** Saves now (the given payload, or the last scheduled one). Resolves to false if it failed. */
  const flush = useCallback(async (payload?: T): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (payload !== undefined) latest.current = payload;
    if (latest.current === null) return true;
    dirty.current = false;
    setState('saving');
    try {
      await saveRef.current(latest.current);
      setState('saved');
      return true;
    } catch {
      dirty.current = true;
      setState('error');
      return false;
    }
  }, []);

  const schedule = useCallback((payload: T, delay = 600) => {
    latest.current = payload;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, delay);
  }, [flush]);

  return { state, schedule, flush, isDirty: () => dirty.current };
}

export const SAVE_LABEL: Record<SaveState, string> = {
  idle: '', saving: 'Guardando…', saved: 'Guardado', error: 'No se ha podido guardar',
};
