import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useFeedback } from './feedback';

interface Option<T extends string | number> {
  value: T;
  label: ReactNode;
  count?: number;
  /** Not selectable now. `reason` says why: tooltip, screen readers and a toast when tapped. */
  disabled?: boolean;
  reason?: string;
}

interface Props<T extends string | number> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  full?: boolean;
  label?: string;
}

/** iOS-style segmented control with a glass thumb that slides. */
export function Segmented<T extends string | number>({ value, options, onChange, full, label }: Props<T>) {
  const { toast } = useFeedback();
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const btn = root.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (btn) setThumb({ x: btn.offsetLeft - 3, w: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div ref={ref} className={`seg${full ? ' seg--full' : ''}`} role="group" aria-label={label}>
      {thumb && <span className="seg__thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="seg__btn" aria-pressed={o.value === value}
          aria-disabled={o.disabled || undefined} title={o.disabled ? o.reason : undefined}
          onClick={() => { if (!o.disabled) onChange(o.value); else if (o.reason) toast(o.reason); }}>
          {o.label}
          {o.count !== undefined && <span className="count">{o.count}</span>}
          {o.disabled && o.reason && <span className="sr-only">: {o.reason}</span>}
        </button>
      ))}
    </div>
  );
}
