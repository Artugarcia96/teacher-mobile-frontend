import { CaretRight } from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function List({ children, className, inset }: { children: ReactNode; className?: string; inset?: number }) {
  const style = inset !== undefined ? ({ '--row-inset': `${inset}px` } as CSSProperties) : undefined;
  return <div className={`list${className ? ` ${className}` : ''}`} style={style}>{children}</div>;
}

interface RowProps {
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  trail?: ReactNode;
  to?: string;
  /** History state of the `to` link (e.g. where the next screen goes back to). */
  state?: unknown;
  onClick?: () => void;
  chevron?: boolean;
  muted?: boolean;
  wrapSub?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Grouped-list row. Clickable when `to` or `onClick` is given (then shows a chevron unless chevron=false). */
export function Row({ lead, title, sub, trail, to, state, onClick, chevron, muted, wrapSub, className, ...aria }: RowProps) {
  const interactive = Boolean(to || onClick);
  const showChev = chevron ?? interactive;
  const cls = ['row', muted && 'row--muted', className].filter(Boolean).join(' ');
  const inner = (
    <>
      {lead && <div className="row__lead">{lead}</div>}
      <div className="row__main">
        <div className="row__title">{typeof title === 'string' ? <span>{title}</span> : title}</div>
        {sub && <div className={`row__sub${wrapSub ? ' row__sub--wrap' : ''}`}>{sub}</div>}
      </div>
      {(trail || showChev) && (
        <div className="row__trail">
          {trail}
          {showChev && <CaretRight size={16} className="row__chev" />}
        </div>
      )}
    </>
  );
  if (to) return <Link to={to} state={state} className={cls} {...aria}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls} {...aria}>{inner}</button>;
  return <div className={cls} {...aria}>{inner}</div>;
}

export function RowIcon({ children, tone }: { children: ReactNode; tone?: 'accent' | 'warn' }) {
  return <span className={`row-icon${tone ? ` row-icon--${tone}` : ''}`}>{children}</span>;
}
