import { CalendarBlank, CaretDown, Clock, MagnifyingGlass, Minus, Plus, X } from '@phosphor-icons/react';
import {
  forwardRef, useId, useLayoutEffect, useRef, type InputHTMLAttributes, type KeyboardEvent, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { dateWithYear, shortDate } from '../lib/format';

interface Wrap {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

function FieldWrap({ id, label, hint, error, children }: Wrap & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      {label && <label className="field__label" htmlFor={id}>{label}</label>}
      {children}
      {error ? <div className="field__error">{error}</div> : hint ? <div className="field__hint">{hint}</div> : null}
    </div>
  );
}

export function TextField({ label, hint, error, className, ...rest }: Wrap & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error}>
      <input id={id} className={`input${className ? ` ${className}` : ''}`} {...rest} />
    </FieldWrap>
  );
}

/** `grow`: the box follows its text (never an inner scroll), from `rows` lines up: a report comment reads whole. */
export function TextArea({ label, hint, error, className, grow, ...rest }: Wrap & TextareaHTMLAttributes<HTMLTextAreaElement> & { grow?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!grow || !el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [grow, rest.value]);
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error}>
      <textarea ref={ref} id={id} className={['textarea', grow && 'textarea--grow', className].filter(Boolean).join(' ')} {...rest} />
    </FieldWrap>
  );
}

export function Select({ label, hint, error, children, ...rest }: Wrap & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error}>
      <div className="select-wrap">
        <select id={id} className="select" {...rest}>{children}</select>
        <CaretDown size={16} />
      </div>
    </FieldWrap>
  );
}

interface DateFieldProps extends Wrap {
  /** ISO date 'YYYY-MM-DD', or '' when empty. */
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  /** "8 sept 2026" instead of "martes, 8 sept 2026" (date ranges side by side). */
  short?: boolean;
  /** Optional dates: shows a button to empty the field. */
  clearable?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Date input that always reads in Spanish ("martes, 8 sept 2026") whatever the browser locale.
 *  The native picker (calendar / iOS wheel) sits invisible on top, so tapping anywhere opens it. */
export function DateField({ label, hint, error, value, onChange, min, max, placeholder = 'Elegir fecha', short, clearable, disabled, ...aria }: DateFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    try { input.current?.showPicker(); } catch { /* not supported or already open: the native input handles the tap */ }
  };
  const cls = ['datefield', clearable && value && 'datefield--clearable', disabled && 'datefield--disabled'].filter(Boolean).join(' ');
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error}>
      <div className={cls}>
        <input ref={input} id={id} type="date" className="datefield__native" value={value} min={min} max={max} disabled={disabled}
          aria-label={aria['aria-label']} onClick={openPicker} onChange={(e) => onChange(e.target.value)} />
        <span className={`input datefield__text${value ? '' : ' datefield__text--empty'}`} aria-hidden>
          {value ? (short ? `${shortDate(value)} ${value.slice(0, 4)}` : dateWithYear(value)) : placeholder}
        </span>
        <CalendarBlank size={18} className="datefield__icon" aria-hidden />
        {clearable && value && !disabled && (
          <button type="button" className="datefield__clear" aria-label="Quitar la fecha" onClick={() => onChange('')}><X size={14} weight="bold" /></button>
        )}
      </div>
    </FieldWrap>
  );
}

interface TimeFieldProps extends Wrap {
  /** 'HH:MM' (24 h), or '' when empty. */
  value: string;
  onChange: (hhmm: string) => void;
  placeholder?: string;
  /** Optional times: shows a button to empty the field. */
  clearable?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Time input that always reads 24 h ("16:00") whatever the browser locale; same pattern as DateField. */
export function TimeField({ label, hint, error, value, onChange, placeholder = 'Sin hora', clearable, disabled, ...aria }: TimeFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    try { input.current?.showPicker(); } catch { /* not supported or already open: the native input handles the tap */ }
  };
  const cls = ['datefield', clearable && value && 'datefield--clearable', disabled && 'datefield--disabled'].filter(Boolean).join(' ');
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error}>
      <div className={cls}>
        <input ref={input} id={id} type="time" className="datefield__native" value={value} disabled={disabled}
          aria-label={aria['aria-label']} onClick={openPicker} onChange={(e) => onChange(e.target.value)} />
        <span className={`input datefield__text num${value ? '' : ' datefield__text--empty'}`} aria-hidden>{value || placeholder}</span>
        <Clock size={18} className="datefield__icon" aria-hidden />
        {clearable && value && !disabled && (
          <button type="button" className="datefield__clear" aria-label="Quitar la hora" onClick={() => onChange('')}><X size={14} weight="bold" /></button>
        )}
      </div>
    </FieldWrap>
  );
}

interface SearchFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  /** Focus it when its sheet opens, on phones too (typing is the task). */
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/** Search box: magnifier, clear button, Esc clears. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, placeholder = 'Buscar', label = 'Buscar', autoFocus, onKeyDown }, ref,
) {
  return (
    <div className="search-field" role="search">
      <MagnifyingGlass size={18} aria-hidden />
      <input ref={ref} type="search" className="input" value={value} placeholder={placeholder} aria-label={label} data-autofocus={autoFocus ? 'always' : undefined}
        autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search" onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange(''); } onKeyDown?.(e); }} />
      {value && (
        <button type="button" className="icon-btn icon-btn--sm search-field__clear" aria-label="Borrar la búsqueda" onClick={() => onChange('')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
});

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

interface StepperProps {
  /** null: nothing set yet ("—"): «Menos» sets the minimum and «Más» the maximum, to fine-tune from there. */
  value: number | null;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  label?: string;
}

export function Stepper({ value, onChange, min = 0, max = 100, step = 1, format, label }: StepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Menos" disabled={value !== null && value <= min}
        onClick={() => onChange(value === null ? min : clamp(value - step))}><Minus size={16} weight="bold" /></button>
      <output className={value === null ? 'stepper__unset' : undefined}>{value === null ? '—' : format ? format(value) : value}</output>
      <button type="button" aria-label="Más" disabled={value !== null && value >= max}
        onClick={() => onChange(value === null ? max : clamp(value + step))}><Plus size={16} weight="bold" /></button>
    </div>
  );
}
