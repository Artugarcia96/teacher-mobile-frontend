import { CaretLeft } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

/** In-app origin of each history entry (location.key → title of the page it was opened from). Memory only:
 *  after a reload the entry has no origin and the page falls back to its `back` path. */
const origins = new Map<string, string>();
let shown: { key: string; path: string; title: string } | null = null;

/** Remember which page opened the current one; returns the origin title for this history entry, if known. */
function useOrigin(title: string): string | undefined {
  const location = useLocation();
  const type = useNavigationType();
  const [origin, setOrigin] = useState(() => origins.get(location.key));
  useLayoutEffect(() => {
    const { key, pathname } = location;
    if (!origins.has(key) && shown && shown.key !== key) {
      // A new page names the one it came from; the same page with other params (tabs, ?nueva=1) keeps its origin.
      const inherited = origins.get(shown.key);
      if (type === 'PUSH' && shown.path !== pathname && shown.title) origins.set(key, shown.title);
      else if (type !== 'POP' && inherited) origins.set(key, inherited);
    }
    shown = { key, path: pathname, title };
    setOrigin(origins.get(key));
  }, [location, type, title]);
  return origin;
}

/** The display serif leaves a gap between "2." and "º": wrap ordinal indicators so CSS can pull them in. */
function displayText(text: string): ReactNode {
  const parts = text.split(/([ºª])/);
  return parts.length === 1 ? text : parts.map((p, i) => (p === 'º' || p === 'ª' ? <span key={i} className="ordinal">{p}</span> : p));
}

interface PageProps {
  title: string;
  /** Small line above the title (e.g. class dot + subject). */
  eyebrow?: ReactNode;
  /** Meta line under the large title. */
  subtitle?: ReactNode;
  /** Back target: a path, or true for history back. */
  back?: string | boolean;
  backLabel?: string;
  /** When the page was opened from another page of the app, the back button returns there and names it
   *  ("‹ 2.º ESO B", "‹ Hoy"); otherwise it uses `back` / `backLabel`. */
  backToOrigin?: boolean;
  actions?: ReactNode;
  /** Content right below the header (segmented control, chips…). */
  toolbar?: ReactNode;
  wide?: boolean;
  compactTitle?: boolean;
  children: ReactNode;
}

/** Standard page: glass top bar (appears on scroll) + large serif title + content column. */
export function Page({ title, eyebrow, subtitle, back, backLabel = 'Atrás', backToOrigin, actions, toolbar, wide, compactTitle, children }: PageProps) {
  const navigate = useNavigate();
  const origin = useOrigin(title);
  const fromOrigin = backToOrigin && origin !== undefined;
  const top = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  // Glass from the first scrolled pixel (the back button never draws over the large title); the small title once
  // the large one has gone under the bar.
  const [scrolled, setScrolled] = useState(false);
  const [titled, setTitled] = useState(false);

  useEffect(() => {
    if (!top.current || !sentinel.current) return;
    const bar = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting));
    const title = new IntersectionObserver(([e]) => setTitled(!e.isIntersecting), { rootMargin: '-54px 0px 0px 0px' });
    bar.observe(top.current);
    title.observe(sentinel.current);
    return () => { bar.disconnect(); title.disconnect(); };
  }, []);

  useEffect(() => {
    document.title = `${title} · Sepia`;
  }, [title]);

  return (
    <div className="page">
      <div ref={top} className="page__top" />
      <header className={`topbar${scrolled ? ' topbar--scrolled' : ''}${titled ? ' topbar--titled' : ''}`}>
        <div className="topbar__side">
          {(back || fromOrigin) && (
            <button className="back-btn" onClick={() => (fromOrigin || typeof back !== 'string' ? navigate(-1) : navigate(back))}>
              <CaretLeft size={20} weight="bold" />
              <span>{fromOrigin ? origin : backLabel}</span>
            </button>
          )}
        </div>
        <div className="topbar__title" aria-hidden={!titled}>{title}</div>
        <div className="topbar__side topbar__side--end">{actions}</div>
      </header>
      <div className="page-head">
        {eyebrow && <div className="page-head__eyebrow">{eyebrow}</div>}
        <h1 className={`page-head__title${compactTitle ? ' page-head__title--sm' : ''}`}>{displayText(title)}</h1>
        {subtitle && <div className="page-head__sub">{subtitle}</div>}
      </div>
      <div ref={sentinel} />
      <div className={`page-body${wide ? ' page-body--wide' : ''}`}>
        {toolbar}
        {children}
      </div>
    </div>
  );
}

interface SectionProps {
  title?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ title, action, footer, children, className }: SectionProps) {
  return (
    <section className={`section${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <div className="section__head">
          {title ? <h2 className="section__title">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
      {footer && <div className="section__foot">{footer}</div>}
    </section>
  );
}

/** Sticky bar at the end of a page for its pending action ("Guardar cambios"). On phones it floats above the tab capsule.
 *  `error` (a failed save) takes its own line above the buttons, in place of the note. */
export function ActionBar({ note, error, children }: { note?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="action-bar">
      {error ? <span className="action-bar__error field__error" role="alert">{error}</span>
        : note && <span className="action-bar__note">{note}</span>}
      <div className="action-bar__buttons">{children}</div>
    </div>
  );
}
