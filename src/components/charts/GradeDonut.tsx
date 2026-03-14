import './GradeDonut.css';

interface Segment {
  label: string;
  count: number;
  color: string;
}

interface Props {
  distribution: Segment[];
  centerLabel?: string;
  centerSubLabel?: string;
  size?: number;
}

const GradeDonut: React.FC<Props> = ({ distribution, centerLabel, centerSubLabel, size = 140 }) => {
  const total = distribution.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gapAngle = 2; // degrees gap between segments
  const gapLength = (gapAngle / 360) * circumference;

  let accumulated = 0;

  const segments = distribution
    .filter(s => s.count > 0)
    .map((s) => {
      const pct = s.count / total;
      const segmentLength = pct * circumference - gapLength;
      const offset = circumference - accumulated * circumference + circumference * 0.25; // start from top
      accumulated += pct;

      return {
        ...s,
        segmentLength: Math.max(segmentLength, 0),
        dasharray: `${Math.max(segmentLength, 0)} ${circumference - Math.max(segmentLength, 0)}`,
        dashoffset: offset,
      };
    });

  return (
    <div className="gd" style={{ width: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="gd__svg">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border-strong, rgba(15, 23, 42, 0.06))"
          strokeWidth={strokeWidth}
          className="gd__bg"
        />

        {/* Data segments */}
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={strokeWidth}
            strokeDasharray={s.dasharray}
            strokeDashoffset={s.dashoffset}
            strokeLinecap="round"
            className="gd__segment"
          />
        ))}

        {/* Center text */}
        {centerLabel && (
          <>
            <text
              x={size / 2}
              y={centerSubLabel ? size / 2 - 6 : size / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="gd__center-value"
            >
              {centerLabel}
            </text>
            {centerSubLabel && (
              <text
                x={size / 2}
                y={size / 2 + 12}
                textAnchor="middle"
                dominantBaseline="central"
                className="gd__center-label"
              >
                {centerSubLabel}
              </text>
            )}
          </>
        )}
      </svg>

      {/* Legend */}
      <div className="gd__legend">
        {distribution.filter(s => s.count > 0).map((s, i) => (
          <div key={i} className="gd__legend-item">
            <span className="gd__legend-dot" style={{ background: s.color }} />
            <span className="gd__legend-label">{s.label}</span>
            <span className="gd__legend-count">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GradeDonut;
