import type { ExamFormat } from './examConstants';
import { EXAM_FORMAT_OPTIONS } from './examConstants';

/**
 * Three mini "preview" SVGs that hint at what the printed exam page will look
 * like. They draw with `currentColor` so the active state can recolour them
 * via the `.exam-format-card--active` rule.
 */
const formatPreviews: Record<ExamFormat, React.ReactNode> = {
  boxes: (
    <svg viewBox="0 0 56 42" fill="none" className="exam-format-preview" aria-hidden>
      {[4, 17, 30].map((y) => (
        <g key={y}>
          <line x1="3" y1={y} x2="22" y2={y} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="3" y={y + 3} width="50" height="9" rx="1.5"
                stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5" opacity="0.5" />
        </g>
      ))}
    </svg>
  ),
  compact: (
    <svg viewBox="0 0 56 42" fill="none" className="exam-format-preview" aria-hidden>
      {[7, 16, 25, 34].map((y, i) => (
        <g key={y}>
          <line x1="3" y1={y} x2={i % 2 ? 38 : 50} y2={y}
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity={i === 0 ? 0.95 : 0.7} />
          <line x1="3" y1={y + 4} x2={i % 2 ? 30 : 44} y2={y + 4}
                stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" opacity="0.4" />
        </g>
      ))}
    </svg>
  ),
  test: (
    <svg viewBox="0 0 56 42" fill="none" className="exam-format-preview" aria-hidden>
      {[
        { letter: 'A', y: 11 },
        { letter: 'B', y: 23 },
        { letter: 'C', y: 35 },
      ].map((row, i) => (
        <g key={row.letter}>
          <circle cx="6" cy={row.y - 2} r="3.5"
                  stroke="currentColor" strokeWidth="1.2"
                  fill={i === 0 ? 'currentColor' : 'none'}
                  opacity={i === 0 ? 1 : 0.55} />
          <text x="13" y={row.y + 1}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontSize="7" fontWeight="700"
                fill="currentColor"
                opacity={i === 0 ? 1 : 0.55}>
            {row.letter}
          </text>
          <line x1="22" y1={row.y - 2} x2="52" y2={row.y - 2}
                stroke="currentColor"
                strokeWidth={i === 0 ? 1.4 : 1}
                strokeLinecap="round"
                opacity={i === 0 ? 0.85 : 0.4} />
        </g>
      ))}
    </svg>
  ),
};

interface FormatSelectorProps {
  value: ExamFormat;
  onChange: (format: ExamFormat) => void;
  /** Singular noun used in the label. Defaults to "examen"; pass "ejercicio"
   *  for the Ejercicios flow so the label reads "Formato de ejercicio". */
  noun?: string;
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ value, onChange, noun = 'examen' }) => (
  <div className="form-item">
    <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
      Formato de {noun}
    </label>
    <div
      className="exam-format-selector"
      role="radiogroup"
      aria-label={`Formato de ${noun}`}
    >
      {EXAM_FORMAT_OPTIONS.map((f) => {
        const active = value === f.value;
        return (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`exam-format-card${active ? ' exam-format-card--active' : ''}`}
            onClick={() => onChange(f.value)}
          >
            {formatPreviews[f.value]}
            <span className="exam-format-card__label">{f.label}</span>
            <span className="exam-format-card__desc">{f.desc}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export default FormatSelector;
