import './SubjectBars.css';

interface SubjectData {
  name: string;
  averageGrade: number | null;
  maxScore?: number;
  passRate: number | null;
}

interface Props {
  subjects: SubjectData[];
  maxScore?: number;
  onSubjectClick?: (index: number) => void;
}

const COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#3B82F6', '#EF4444', '#14B8A6',
  '#F97316', '#06B6D4',
];

const SubjectBars: React.FC<Props> = ({ subjects, maxScore = 10, onSubjectClick }) => {
  const filtered = subjects.filter(s => s.averageGrade !== null);
  if (filtered.length === 0) return null;

  return (
    <div className="sbars">
      {filtered.map((s, i) => {
        const pct = Math.min(((s.averageGrade ?? 0) / maxScore) * 100, 100);
        const passPct = maxScore > 0 ? (maxScore * 0.5 / maxScore) * 100 : 50;
        const isPassing = pct >= passPct;
        const color = COLORS[i % COLORS.length];

        return (
          <div
            key={i}
            className="sbars__row"
            onClick={() => onSubjectClick?.(i)}
            role={onSubjectClick ? 'button' : undefined}
          >
            <span className="sbars__label" title={s.name}>{s.name}</span>
            <div className="sbars__track">
              <div
                className="sbars__fill"
                style={{ width: `${pct}%`, background: color }}
              />
              <div className="sbars__pass-line" style={{ left: `${passPct}%` }} />
            </div>
            <span className={`sbars__value ${isPassing ? 'sbars__value--pass' : 'sbars__value--fail'}`}>
              {(s.averageGrade ?? 0).toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default SubjectBars;
