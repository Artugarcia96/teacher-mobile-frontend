import type { PeriodMode } from '../../utils/periodConfig';
import { PERIOD_COLORS, getPeriodLabel, getPeriodNoun } from '../../utils/periodConfig';
import './PlanProgressChart.css';

interface Props {
  trimesterProgress: { trimester: number; planned: number; completed: number; pct: number }[];
  periodMode?: PeriodMode | null;
}

const PlanProgressChart: React.FC<Props> = ({ trimesterProgress, periodMode }) => {
  if (!trimesterProgress.length) return null;

  const maxPlanned = Math.max(...trimesterProgress.map((t) => t.planned), 1);

  return (
    <div className="ppc" role="figure" aria-label={`Progreso por período: ${trimesterProgress.map(t => `${getPeriodLabel(periodMode, t.trimester)} ${t.pct}%`).join(', ')}`}>
      <span className="ppc__title">Progreso por {getPeriodNoun(periodMode)}</span>
      <div className="ppc__bars">
        {trimesterProgress.map((tri, idx) => {
          const barHeight = (tri.planned / maxPlanned) * 100;
          const fillHeight = tri.planned > 0 ? (tri.completed / tri.planned) * barHeight : 0;
          const color = PERIOD_COLORS[tri.trimester] || '#6366F1';
          const label = getPeriodLabel(periodMode, tri.trimester);

          return (
            <div key={tri.trimester} className="ppc__bar-group">
              <div className="ppc__bar-container" style={{ height: `${barHeight}%` }}>
                <div className="ppc__bar-bg" style={{ background: `${color}15` }} />
                <div className="ppc__bar-fill"
                  style={{
                    height: `${fillHeight}%`,
                    background: color,
                  }}
                />
              </div>
              <span className="ppc__bar-label" style={{ color }}>
                {label}
              </span>
              <span className="ppc__bar-pct">{tri.pct}%</span>
              <span className="ppc__bar-count">
                {tri.completed}/{tri.planned}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlanProgressChart;
