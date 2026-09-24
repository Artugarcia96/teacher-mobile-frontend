import { CaretLeft } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface PageProps {
  title: string;
  /** Small line above the title (e.g. class dot + subject). */
  eyebrow?: ReactNode;
  /** Meta line under the large title. */
  subtitle?: ReactNode;
  /** Back target: a path, or true for history back. */
  back?: string | boolean;
  backLabel?: string;
  actions?: ReactNode;
  /** Content right below the header (segmented control, chips…). */
  toolbar?: ReactNode;
  wide?: boolean;
  compactTitle?: boolean;
  children: ReactNode;
}

/** Standard page: glass top bar (appears on scroll) + large serif title + content column. */
export function Page({ title, eyebrow, subtitle, back, backLabel = 'Atrás', actions, toolbar, wide, compactTitle, children }: PageProps) {
  const navigate = useNavigate();
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { rootMargin: '-54px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    document.title = `${title} · Sepia`;
  }, [title]);

  return (
    <div className="page">
      <header className={`topbar${scrolled ? ' topbar--scrolled' : ''}`}>
        <div className="topbar__side">
          {back && (
            <button className="back-btn" onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}>
              <CaretLeft size={20} weight="bold" />
              <span>{backLabel}</span>
            </button>
          )}
        </div>
        <div className="topbar__title" aria-hidden={!scrolled}>{title}</div>
        <div className="topbar__side topbar__side--end">{actions}</div>
      </header>
      <div className="page-head">
        {eyebrow && <div className="page-head__eyebrow">{eyebrow}</div>}
        <h1 className={`page-head__title${compactTitle ? ' page-head__title--sm' : ''}`}>{title}</h1>
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
