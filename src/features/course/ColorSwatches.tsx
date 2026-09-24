import { Check } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import './course-forms.css';

export const COURSE_COLORS = ['teal', 'ochre', 'indigo', 'rose', 'olive', 'plum', 'slate', 'clay'] as const;
const NAMES: Record<string, string> = {
  teal: 'Verde azulado', ochre: 'Ocre', indigo: 'Índigo', rose: 'Rosa', olive: 'Oliva', plum: 'Ciruela', slate: 'Pizarra', clay: 'Arcilla',
};

/** The 8 class colors (palette keys, painted from --c-* tokens). */
export default function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Color">
      {COURSE_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={NAMES[c]} title={NAMES[c]}
          className="swatch" style={{ '--c': `var(--c-${c})` } as CSSProperties} onClick={() => onChange(c)}>
          {value === c && <Check size={16} weight="bold" />}
        </button>
      ))}
    </div>
  );
}
