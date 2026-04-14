import type { ExamFormat } from './examConstants';
import { EXAM_FORMAT_OPTIONS } from './examConstants';

const formatPreviews: Record<ExamFormat, React.ReactNode> = {
  boxes: (
    <svg viewBox="0 0 48 36" fill="none" className="exam-format-preview">
      <rect x="2" y="2" width="44" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" opacity="0.4" />
      <rect x="2" y="14" width="44" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" opacity="0.4" />
      <rect x="2" y="26" width="44" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" opacity="0.4" />
    </svg>
  ),
  compact: (
    <svg viewBox="0 0 48 36" fill="none" className="exam-format-preview">
      <line x1="2" y1="6" x2="36" y2="6" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <line x1="2" y1="12" x2="28" y2="12" stroke="currentColor" strokeWidth="0.6" opacity="0.25" />
      <line x1="2" y1="18" x2="40" y2="18" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <line x1="2" y1="24" x2="32" y2="24" stroke="currentColor" strokeWidth="0.6" opacity="0.25" />
      <line x1="2" y1="30" x2="38" y2="30" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    </svg>
  ),
  test: (
    /* "A —— / B —— / C ——": letter + short answer line, stacked.
       Communicates "labelled options" much more clearly than filled bullets
       and scales down to a 48×36 chip without losing legibility. */
    <svg viewBox="0 0 48 36" fill="none" className="exam-format-preview">
      {[
        { letter: 'A', y: 9 },
        { letter: 'B', y: 19 },
        { letter: 'C', y: 29 },
      ].map((row, i) => (
        <g key={row.letter}>
          <text
            x="4"
            y={row.y + 2}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="6.5"
            fontWeight="700"
            fill="currentColor"
            opacity={i === 0 ? 1 : 0.45}
          >
            {row.letter}
          </text>
          <line
            x1="12"
            y1={row.y}
            x2="44"
            y2={row.y}
            stroke="currentColor"
            strokeWidth={i === 0 ? 1.3 : 0.9}
            strokeLinecap="round"
            opacity={i === 0 ? 0.95 : 0.35}
          />
        </g>
      ))}
    </svg>
  ),
};

interface FormatSelectorProps {
  value: ExamFormat;
  onChange: (format: ExamFormat) => void;
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ value, onChange }) => (
  <div className="form-item">
    <label className="block text-xs font-medium text-muted-foreground mb-1">Formato de examen</label>
    <div className="exam-format-cards">
      {EXAM_FORMAT_OPTIONS.map((f) => (
        <button
          key={f.value}
          type="button"
          className={`exam-format-card${value === f.value ? ' exam-format-card--active' : ''}`}
          onClick={() => onChange(f.value)}
        >
          {formatPreviews[f.value]}
          <span className="exam-format-card__label">{f.label}</span>
          <span className="exam-format-card__desc">{f.desc}</span>
        </button>
      ))}
    </div>
  </div>
);

export default FormatSelector;
