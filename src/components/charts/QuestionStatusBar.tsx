import { Badge } from '@/components/ui/badge';
import { AIQuestionFeedback } from '../../types';
import { chartColors } from '../../utils/statusConfig';
import './QuestionStatusBar.css';

interface Props {
  questions: AIQuestionFeedback[];
  compact?: boolean;
  showLegend?: boolean;
  onQuestionTap?: (question: AIQuestionFeedback) => void;
}

const statusColorMap: Record<string, string> = {
  correct: chartColors.correct,
  partial: chartColors.partial,
  incorrect: chartColors.incorrect,
  blank: chartColors.blank,
};

const QuestionStatusBar: React.FC<Props> = ({ questions, compact, showLegend = true, onQuestionTap }) => {
  if (!questions || questions.length === 0) return null;

  const n = questions.length;
  const gap = 1.5;
  const totalGaps = (n - 1) * gap;
  const barWidth = 200;
  const segmentWidth = (barWidth - totalGaps) / n;
  const h = compact ? 10 : 16;
  const r = compact ? 1.5 : 2.5;

  const stats = questions.reduce(
    (acc, q) => { acc[q.status] = (acc[q.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className={`qsb ${compact ? 'qsb--compact' : ''}`}>
      <svg
        className="qsb__svg"
        viewBox={`0 0 ${barWidth} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${stats.correct || 0} correctas, ${stats.partial || 0} parciales, ${stats.incorrect || 0} incorrectas, ${stats.blank || 0} sin respuesta`}
      >
        {questions.map((q, i) => {
          const x = i * (segmentWidth + gap);
          const color = statusColorMap[q.status] || statusColorMap.blank;
          return (
            <rect
              key={q.id}
              x={x}
              y={0}
              width={segmentWidth}
              height={h}
              rx={r}
              ry={r}
              fill={color}
              className="qsb__segment"
              onClick={onQuestionTap ? () => onQuestionTap(q) : undefined}
              style={onQuestionTap ? { cursor: 'pointer' } : undefined}
            />
          );
        })}
      </svg>

      {showLegend && !compact && (
        <div className="qsb__legend">
          {stats.correct > 0 && <Badge className="bg-success text-white">{stats.correct} ✓</Badge>}
          {stats.partial > 0 && <Badge className="bg-warning text-white">{stats.partial} ~</Badge>}
          {stats.incorrect > 0 && <Badge className="bg-danger text-white">{stats.incorrect} ✗</Badge>}
          {stats.blank > 0 && <Badge variant="secondary">{stats.blank} —</Badge>}
        </div>
      )}
    </div>
  );
};

export default QuestionStatusBar;
