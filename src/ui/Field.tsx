import { CaretDown, Minus, Plus } from '@phosphor-icons/react';
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

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

export function TextArea({ label, hint, error, className, ...rest }: Wrap & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldWrap id={id} label={label} hint={hint} error={error}>
      <textarea id={id} className={`textarea${className ? ` ${className}` : ''}`} {...rest} />
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

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

interface StepperProps {
  value: number;
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
      <button type="button" aria-label="Menos" disabled={value <= min} onClick={() => onChange(clamp(value - step))}><Minus size={16} weight="bold" /></button>
      <output>{format ? format(value) : value}</output>
      <button type="button" aria-label="Más" disabled={value >= max} onClick={() => onChange(clamp(value + step))}><Plus size={16} weight="bold" /></button>
    </div>
  );
}
