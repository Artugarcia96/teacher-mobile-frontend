import './WeakAreasRadar.css';

interface WeakArea {
  area: string;
  count: number;
}

interface Props {
  areas: WeakArea[];
  maxCount?: number;
  size?: number;
  showLabels?: boolean;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

const WeakAreasRadar: React.FC<Props> = ({ areas, maxCount, size = 180, showLabels = true }) => {
  // Need at least 3 areas for a radar; take top 8 by count
  const sorted = [...areas].sort((a, b) => b.count - a.count).slice(0, 8);

  if (sorted.length < 3) {
    // Fallback: render as tags
    return (
      <div className="war-fallback">
        {areas.map((a, i) => (
          <span key={i} className="war-fallback__tag">
            {a.area} <span className="war-fallback__count">{a.count}</span>
          </span>
        ))}
      </div>
    );
  }

  const n = sorted.length;
  const max = maxCount ?? Math.max(...sorted.map(a => a.count));
  const cx = size / 2;
  const cy = size / 2;
  const labelMargin = showLabels ? 40 : 8;
  const radius = (size / 2) - labelMargin;

  const getAngle = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2;
  const getPoint = (i: number, r: number) => ({
    x: cx + r * Math.cos(getAngle(i)),
    y: cy + r * Math.sin(getAngle(i)),
  });

  const guideRings = [0.25, 0.5, 0.75, 1];

  const makePolygon = (radiusFn: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => {
      const p = getPoint(i, radiusFn(i));
      return `${p.x},${p.y}`;
    }).join(' ');

  const dataPolygon = makePolygon((i) => (sorted[i].count / max) * radius);
  const guidePolygons = guideRings.map(pct => makePolygon(() => pct * radius));

  // Label positions pushed slightly outward
  const labelOffset = 14;

  return (
    <div className="war" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="war__svg">
        {/* Guide rings */}
        {guidePolygons.map((points, i) => (
          <polygon
            key={i}
            points={points}
            className="war__guide"
          />
        ))}

        {/* Axis lines */}
        {Array.from({ length: n }, (_, i) => {
          const p = getPoint(i, radius);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              className="war__axis"
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={dataPolygon}
          className="war__data"
        />

        {/* Data points */}
        {sorted.map((_, i) => {
          const r = (sorted[i].count / max) * radius;
          const p = getPoint(i, r);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              className="war__dot"
            />
          );
        })}

        {/* Labels */}
        {showLabels && sorted.map((item, i) => {
          const p = getPoint(i, radius + labelOffset);
          const angle = getAngle(i);
          const degrees = (angle * 180) / Math.PI;
          // Determine text-anchor based on position
          let anchor: string = 'middle';
          if (degrees > -80 && degrees < 80) anchor = 'start';
          else if (degrees > 100 || degrees < -100) anchor = 'end';

          return (
            <text
              key={i}
              x={p.x}
              y={p.y}
              textAnchor={anchor}
              dominantBaseline="central"
              className="war__label"
            >
              {truncate(item.area, 15)}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

export default WeakAreasRadar;
