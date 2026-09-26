import { X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { useFeedback } from './feedback';
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
  /** Something typed would be lost: the scrim does nothing, and ✕, Esc or back ask «Descartar los cambios» first. */
  dirty?: boolean;
  children: ReactNode;
}

// ── Back closes the sheet ────────────────────────────────────────────────────
// Every open sheet owns a history entry (same URL, the router's state plus a `sheet` mark), so the phone's back
// gesture closes the top sheet instead of leaving the page. This listener is added at import time, before the
// router's, so pops between a page and its own sheet entries never reach the router.
type OpenSheet = { back: () => void };
const openSheets: OpenSheet[] = []; // bottom → top
let marks: string[] = []; // the history entries of openSheets that are in place, bottom → top
let pageKey: string | undefined; // router key of the page entry under the sheets
let lengthAtPush = 0;
let seq = 0;
let traversing: (() => void) | null = null; // our own history.go() in flight
let syncing = false;

const mark = (): string | undefined => (window.history.state as { sheet?: string } | null)?.sheet;

function go(delta: number, then: () => void = () => {}) {
  traversing = then;
  window.history.go(delta);
}

/** Make the history entries match the open sheets (batched: a confirm and its sheet close in the same tick). */
function scheduleSync() {
  if (syncing) return;
  syncing = true;
  setTimeout(() => { syncing = false; sync(); });
}

function sync() {
  if (traversing) return; // runs again when it lands
  if (marks.length && mark() !== marks[marks.length - 1]) {
    // The router navigated on top of the sheet entries (a link in the sheet, a URL parameter that closed it).
    const replaced = window.history.length === lengthAtPush;
    const n = marks.length;
    marks = [];
    if (replaced) {
      // Move the new location down onto the page entry, so back does not reopen what was just closed.
      const state = window.history.state, url = window.location.href;
      go(-n, () => window.history.replaceState(state, '', url));
      return;
    }
    // Pushed: the entries left behind are skipped when back lands on them (onPop).
  }
  if (openSheets.length > marks.length) {
    if (!marks.length) pageKey = (window.history.state as { key?: string } | null)?.key;
    while (marks.length < openSheets.length) {
      const m = `s${++seq}`;
      window.history.pushState({ ...(window.history.state ?? {}), sheet: m }, '');
      marks.push(m);
    }
    lengthAtPush = window.history.length;
  } else if (openSheets.length < marks.length) {
    const n = marks.length - openSheets.length;
    marks = marks.slice(0, openSheets.length);
    go(-n);
  }
}

function onPop(e: PopStateEvent) {
  if (traversing) {
    const then = traversing;
    traversing = null;
    e.stopImmediatePropagation();
    then();
    scheduleSync();
    return;
  }
  const m = mark();
  const at = m ? marks.indexOf(m) : -1;
  if (m && at < 0) {
    // An entry left by a sheet that closed by navigating: skip it.
    e.stopImmediatePropagation();
    window.history.back();
    return;
  }
  if (!marks.length) return;
  const keep = at + 1;
  if (m || (window.history.state as { key?: string } | null)?.key === pageKey) e.stopImmediatePropagation();
  const closing = openSheets.slice(keep).reverse();
  marks = marks.slice(0, keep);
  closing.forEach((s) => s.back());
  scheduleSync();
}

/** A reload keeps the history entries of the sheets that were open, but not the sheets: step back onto the page
 *  entry, so the first back leaves the page instead of dropping an invisible sheet. */
function dropStaleMarks() {
  if (mark()) go(-1, dropStaleMarks);
}

// The element focused before the current one: a control inside a sheet may take the focus as the sheet mounts
// (autoFocus), before the sheet can note what opened it.
let focused: Element | null = null;
let focusedBefore: Element | null = null;
const onFocusIn = (e: FocusEvent) => { focusedBefore = focused; focused = e.target as Element; };

/** What had the focus when the sheet `root` opened. */
function opener(root: HTMLElement | null): HTMLElement | null {
  const now = document.activeElement;
  const el = root && now && root.contains(now) ? focusedBefore : now;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}

if (typeof window !== 'undefined') {
  document.addEventListener('focusin', onFocusIn);
  import.meta.hot?.dispose(() => document.removeEventListener('focusin', onFocusIn));
  window.addEventListener('popstate', onPop);
  import.meta.hot?.dispose(() => window.removeEventListener('popstate', onPop));
  dropStaleMarks();
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), '
  + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="file"]), textarea, select, [contenteditable="true"]';

const focusables = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);

/** Focus `[data-autofocus]` when the sheet opens; on touch screens only `[data-autofocus="always"]` (a note, a
 *  search), so the keyboard does not cover steppers and buttons. Without one, the first control that does not
 *  bring up a keyboard (✕ at worst), so the focus is always inside the sheet. */
function autofocus(root: HTMLElement | null) {
  if (!root) return;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const target = root.querySelector<HTMLElement>(touch ? '[data-autofocus="always"]' : '[data-autofocus]')
    ?? focusables(root).find((el) => !el.matches(TYPING) && !el.closest('.sheet__head'))
    ?? root.querySelector<HTMLElement>('.sheet__head button');
  target?.focus({ preventScroll: true });
}

/** Tab and Shift+Tab go round the controls of a modal sheet instead of walking out to the page behind. */
function trapTab(root: HTMLElement, e: KeyboardEvent) {
  const all = focusables(root);
  if (!all.length) return;
  const at = all.indexOf(document.activeElement as HTMLElement);
  const next = at < 0 ? (e.shiftKey ? all.length - 1 : 0) : at + (e.shiftKey ? -1 : 1);
  if (next >= 0 && next < all.length && at >= 0) return; // the browser moves within the sheet
  e.preventDefault();
  all[(next + all.length) % all.length].focus();
}

/** Bottom sheet on phones, centered glass panel on tablet/desktop (or a side panel). Esc, back and scrim close it. */
export function Sheet({ open, onClose, title, subtitle, footer, size = 'auto', wide, side, dirty, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const panel = useMediaQuery(DESKTOP) && !!side;
  const { confirm } = useFeedback();
  // Latest close without re-running the open effect (it would steal focus from inputs on every render).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = async () => {
      if (dirty && !(await confirm({ title: 'Descartar los cambios', text: 'Lo que has escrito se perderá.', confirm: 'Descartar', danger: true }))) return;
      onClose();
    };
  });
  const self = useRef<OpenSheet>({ back: () => closeRef.current() });

  useEffect(() => {
    if (!open) return;
    const me = self.current;
    openSheets.push(me);
    scheduleSync();
    const from = opener(ref.current);
    const onKey = (e: KeyboardEvent) => {
      if (openSheets[openSheets.length - 1] !== me) return;
      if (e.key === 'Escape') closeRef.current();
      else if (e.key === 'Tab' && ref.current?.getAttribute('aria-modal') === 'true') trapTab(ref.current, e);
    };
    document.addEventListener('keydown', onKey);
    autofocus(ref.current);
    return () => {
      document.removeEventListener('keydown', onKey);
      openSheets.splice(openSheets.indexOf(me), 1);
      scheduleSync();
      // Give the focus back to what opened the sheet, unless something else has taken it meanwhile.
      const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
      if (lost && from?.isConnected) from.focus({ preventScroll: true });
    };
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
      {!panel && <div className="sheet-scrim" onClick={dirty ? undefined : onClose} />}
      <div ref={ref} role="dialog" aria-modal={!panel} aria-labelledby={titleId}
        className={`sheet${size === 'large' ? ' sheet--large' : ''}${wide ? ' sheet--wide' : ''}${side ? ' sheet--side' : ''}`}>
        <div className="sheet__grab" />
        <div className="sheet__head">
          <div id={titleId} className="sheet__title">{title}</div>
          <IconButton label="Cerrar" size="sm" onClick={() => closeRef.current()}><X size={18} /></IconButton>
        </div>
        {subtitle && <div className="sheet__sub">{subtitle}</div>}
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
