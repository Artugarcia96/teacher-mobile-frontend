import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'tinted' | 'plain' | 'neutral' | 'danger' | 'glass';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: ReactNode;
  loading?: boolean;
  full?: boolean;
  to?: string;
}

export function Button({ variant = 'primary', size = 'md', icon, loading, full, to, className, children, disabled, ...rest }: Props) {
  const cls = [
    'btn', `btn--${variant}`, size === 'sm' && 'btn--sm', full && 'btn--full', loading && 'btn--loading',
    variant === 'glass' && 'glass', className,
  ].filter(Boolean).join(' ');
  const content = (
    <>
      {loading && <span className="spinner" aria-hidden />}
      {icon}
      {children && <span>{children}</span>}
    </>
  );
  if (to) return <Link to={to} className={cls}>{content}</Link>;
  return (
    <button className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  glass?: boolean;
  size?: 'md' | 'sm';
}

export function IconButton({ label, glass, size = 'md', className, children, ...rest }: IconButtonProps) {
  const cls = ['icon-btn', glass && 'glass icon-btn--glass', size === 'sm' && 'icon-btn--sm', className].filter(Boolean).join(' ');
  return (
    <button className={cls} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Cargando" />;
}
