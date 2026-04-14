import './GradeTrendLine.css';

interface DataPoint {
  label: string;
  value: number;
  maxValue: number;
}

interface Props {
  data: DataPoint[];
  height?: number;
  showLabels?: boolean;
}

const GradeTrendLine: React.FC<Props> = ({ data, height = 100, showLabels = true }) => {
  if (data.length < 2) return null;

  const width = 280;
  const padX = showLabels ? 30 : 12;
  const padTop = 8;
  const padBottom = showLabels ? 22 : 8;
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;

  // Normalize values to 0-10 scale
  const normalized = data.map((d) => (d.maxValue > 0 ? (d.value / d.maxValue) * 10 : 0));
  const max = 10;

  const getX = (i: number) => padX + (i / (data.length - 1)) * chartW;
  const getY = (val: number) => padTop + chartH - (val / max) * chartH;

  // Build path
  const pathPoints = normalized.map((v, i) => `${getX(i)},${getY(v)}`);
  const linePath = `M ${pathPoints.join(' L ')}`;

  // Gradient area path
  const areaPath = `${linePath} L ${getX(data.length - 1)},${getY(0)} L ${getX(0)},${getY(0)} Z`;

  // Pass line at 50%
  const passY = getY(5);

  // Color based on trend
  const lastVal = normalized[normalized.length - 1];
  const firstVal = normalized[0];
  const trendColor = lastVal > firstVal + 0.5
    ? 'var(--chart-correct, #10B981)'
    : lastVal < firstVal - 0.5
    ? 'var(--chart-incorrect, #EF4444)'
    : 'var(--ion-color-primary, #15665E)';

  return (
    <div className="gtl" style={{ maxWidth: width }} role="figure" aria-label={`Tendencia de calificaciones: ${data.map(d => `${d.label} ${d.value}`).join(', ')}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="gtl__svg" aria-hidden="true">
        <defs>
          <linearGradient id="gtl-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Pass line */}
        <line
          x1={padX}
          y1={passY}
          x2={width - padX}
          y2={passY}
          className="gtl__pass-line"
        />
        {showLabels && (
          <text x={padX - 4} y={passY + 3} className="gtl__axis-label" textAnchor="end">
            5
          </text>
        )}

        {/* Area fill */}
        <path d={areaPath} fill="url(#gtl-grad)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={trendColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="gtl__line"
        />

        {/* Dots */}
        {normalized.map((v, i) => (
          <circle
            key={i}
            cx={getX(i)}
            cy={getY(v)}
            r={data.length > 8 ? 2.5 : 3.5}
            fill={trendColor}
            stroke="var(--color-surface, #fff)"
            strokeWidth="1.5"
          />
        ))}

        {/* X labels (show first, last, and middle if many) */}
        {showLabels && data.length <= 6 && data.map((d, i) => (
          <text
            key={i}
            x={getX(i)}
            y={height - 2}
            className="gtl__x-label"
            textAnchor="middle"
          >
            {d.label.length > 6 ? d.label.slice(0, 5) + '…' : d.label}
          </text>
        ))}
        {showLabels && data.length > 6 && [0, Math.floor(data.length / 2), data.length - 1].map((i) => (
          <text
            key={i}
            x={getX(i)}
            y={height - 2}
            className="gtl__x-label"
            textAnchor="middle"
          >
            {data[i].label.length > 6 ? data[i].label.slice(0, 5) + '…' : data[i].label}
          </text>
        ))}
      </svg>
    </div>
  );
};

export default GradeTrendLine;
