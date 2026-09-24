import './StackedBar.css';

export type BarTone = 'fail' | 'pass' | 'pass-2' | 'good' | 'great' | 'neutral';

export interface BarSegment { key: string; label: string; value: number; tone: BarTone; title?: string }

/** Slim 100 % stacked bar with an inline legend (e.g. IN · SU · BI · NT · SB distribution). */
export function StackedBar({ segments, label }: { segments: BarSegment[]; label?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div className="sbar" role="img" aria-label={label ?? segments.map((s) => `${s.title ?? s.label}: ${s.value}`).join(', ')}>
      <div className="sbar__track">
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => (
          <i key={s.key} className={`sbar__seg sbar--${s.tone}`} style={{ flexGrow: s.value }} title={`${s.title ?? s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="sbar__legend">
        {segments.map((s) => (
          <span key={s.key} className={s.value ? undefined : 'sbar__zero'}>
            <i className={`sbar__dot sbar--${s.tone}`} />
            {s.label} <b className="num">{s.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
