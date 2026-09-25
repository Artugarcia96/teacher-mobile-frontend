import { CaretRight } from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';
import { formatAverage, formatProposal, formatScore, gradeTone } from '../lib/format';

export function Chip({ children, tone, onClick, selected, icon, disabled, title }: {
  children: ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'accent' | 'info' | 'outline'; onClick?: () => void; selected?: boolean; icon?: ReactNode;
  /** Tappable chips only; `title` says why it is disabled. */
  disabled?: boolean; title?: string;
}) {
  const cls = ['chip', tone && `chip--${tone}`, selected && 'chip--selected'].filter(Boolean).join(' ');
  if (onClick) {
    return <button type="button" className={cls} onClick={onClick} aria-pressed={selected} disabled={disabled} title={title}>{icon}{children}</button>;
  }
  return <span className={cls}>{icon}{children}</span>;
}

export function AIBadge({ label = 'Borrador IA' }: { label?: string }) {
  return <span className="ai-badge">{label}</span>;
}

/** Class color dot. `color` is a palette key (teal, ochre, indigo…). */
export function Dot({ color, large }: { color?: string; large?: boolean }) {
  return <span className={`dot${large ? ' dot--lg' : ''}`} style={{ '--c': `var(--c-${color || 'teal'})` } as CSSProperties} aria-hidden />;
}

export function Avatar({ initials, size }: { initials: string; size?: 'sm' | 'lg' }) {
  return <span className={`avatar${size ? ` avatar--${size}` : ''}`} aria-hidden>{initials}</span>;
}

/** A grade colored by the Spanish scale (three tones). Without `max` it is an average on 0-10 (one decimal);
 *  with `max` it is an activity score as entered (up to two decimals), toned on its normalized value, unless
 *  `average` says it is an average on that scale (class average of an activity: one decimal). */
export function Grade({ value, max, average, className }: {
  value: number | null | undefined; max?: number; average?: boolean; className?: string;
}) {
  const norm = value == null ? null : max ? (value / max) * 10 : value;
  const text = max && !average ? formatScore(value) : formatAverage(value);
  return <span className={`grade grade--${gradeTone(norm)}${className ? ` ${className}` : ''}`}>{text}</span>;
}

/** A tinted pill: an average (one decimal), with `proposal` a proposed / final grade (integer), or with `max` an
 *  activity score as entered (up to two decimals, toned on its normalized value); `label` = qualitative (SU, NT…). */
export function GradePill({ value, label, proposal, max }: {
  value: number | null | undefined; label?: string | null; proposal?: boolean; max?: number;
}) {
  const norm = value == null ? null : max ? (value / max) * 10 : value;
  const text = max ? formatScore(value) : proposal ? formatProposal(value) : formatAverage(value);
  return (
    <span className={`grade-pill grade--${gradeTone(norm)}`}>
      <span>{text}</span>
      {label && <small>{label}</small>}
    </span>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <div className="empty__title">{title}</div>
      {text && <div className="empty__text">{text}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;
}

/** Placeholder list while loading. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="list" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row">
          <Skeleton h={36} w={36} r={18} />
          <div className="row__main" style={{ display: 'grid', gap: 6 }}>
            <Skeleton h={14} w="55%" />
            <Skeleton h={12} w="35%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** `indeterminate`: work under way whose share is not known yet (a bar that moves instead of one stuck at 0). */
export function Progress({ value, total, indeterminate }: { value: number; total: number; indeterminate?: boolean }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  if (indeterminate) return <div className="progress progress--indeterminate" role="progressbar" aria-valuemin={0} aria-valuemax={100}><i /></div>;
  return <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>;
}

/** A note above the content. With `onClick` the whole callout is a button (with a chevron) that opens its detail. */
export function Callout({ children, tone, icon, onClick, label }: {
  children: ReactNode; tone?: 'warn' | 'accent'; icon?: ReactNode; onClick?: () => void; label?: string;
}) {
  const cls = `callout${tone ? ` callout--${tone}` : ''}`;
  if (onClick) {
    return (
      <button type="button" className={`${cls} callout--button`} onClick={onClick} aria-label={label}>
        {icon}<div className="callout__body">{children}</div><CaretRight size={16} className="callout__chev" />
      </button>
    );
  }
  return <div className={cls}>{icon}<div>{children}</div></div>;
}

export function Stats({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="stats">
      {items.map((s) => (
        <div key={s.label} className="stat">
          <div className="stat__value">{s.value}</div>
          <div className="stat__label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
