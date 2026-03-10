import { IonIcon } from '@ionic/react';
import { chevronForwardOutline, checkboxOutline, squareOutline } from 'ionicons/icons';
import { CalendarEvent, Exam } from '../types';
import './EventCard.css';

const AVATAR_COLORS = [
  '#6C3AED', '#8B5CF6', '#059669', '#0891B2', '#D97706',
  '#DC2626', '#2563EB', '#7C3AED', '#DB2777', '#4F46E5',
];

function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface CalendarEventCardProps {
  event: CalendarEvent;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  compact?: boolean;
}

export const CalendarEventCard: React.FC<CalendarEventCardProps> = ({
  event, onClick, selectable, selected, onToggleSelect, compact,
}) => {
  const color = event.className ? colorFromName(event.className) : '#64748B';

  const handleClick = () => {
    if (selectable && onToggleSelect) {
      onToggleSelect();
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <div
      className={`ev-card ${event.isCancelled ? 'ev-card--cancelled' : ''} ${selected ? 'ev-card--selected' : ''} ${compact ? 'ev-card--compact' : ''}`}
      onClick={handleClick}
      onContextMenu={(e) => {
        if (onToggleSelect) {
          e.preventDefault();
          onToggleSelect();
        }
      }}
    >
      {selectable && (
        <IonIcon
          icon={selected ? checkboxOutline : squareOutline}
          className="ev-card__checkbox"
          color={selected ? 'primary' : 'medium'}
        />
      )}
      <div className="ev-card__color" style={{ background: color }} />
      <div className="ev-card__body">
        <div className="ev-card__top">
          <span className="ev-card__title">{event.title}</span>
          {!selectable && <IonIcon icon={chevronForwardOutline} className="ev-card__arrow" />}
        </div>
        {(event.startTime || event.notes) && (
          <div className="ev-card__bottom">
            {event.startTime && (
              <span className="ev-card__time">
                {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
              </span>
            )}
            {event.notes && <span className="ev-card__notes">{event.notes}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

interface ExamEventCardProps {
  exam: Exam;
  className?: string;
  onClick?: () => void;
  compact?: boolean;
}

const statusLabels: Record<string, string> = {
  uploaded: 'Subido',
  assigned: 'Por corregir',
  corrected: 'Corregido',
};

const statusColors: Record<string, string> = {
  uploaded: 'medium',
  assigned: 'warning',
  corrected: 'success',
};

export const ExamEventCard: React.FC<ExamEventCardProps> = ({ exam, className, onClick, compact }) => (
  <div className={`ev-card ev-card--exam ${compact ? 'ev-card--compact' : ''}`} onClick={onClick}>
    <div className="ev-card__color" style={{ background: '#EF4444' }} />
    <div className="ev-card__body">
      <div className="ev-card__top">
        <span className="ev-card__title">{exam.name}</span>
        <span className={`ev-card__status ev-card__status--${exam.status}`}>
          {statusLabels[exam.status]}
        </span>
      </div>
      <div className="ev-card__bottom">
        {className && <span className="ev-card__time">{className}</span>}
      </div>
    </div>
  </div>
);

interface GroupedExamCardProps {
  name: string;
  className?: string;
  status: string;
  count: number;
  onClick?: () => void;
  compact?: boolean;
}

export const GroupedExamCard: React.FC<GroupedExamCardProps> = ({ 
  name, className, status, count, onClick, compact 
}) => (
  <div className={`ev-card ev-card--exam ${compact ? 'ev-card--compact' : ''}`} onClick={onClick}>
    <div className="ev-card__color" style={{ background: '#EF4444' }} />
    <div className="ev-card__body">
      <div className="ev-card__top">
        <span className="ev-card__title">{name}</span>
        <div className="ev-card__right">
          {count > 1 && (
            <span className="ev-card__count">{count} alumnos</span>
          )}
          <span className={`ev-card__status ev-card__status--${status}`}>
            {statusLabels[status]}
          </span>
        </div>
      </div>
      <div className="ev-card__bottom">
        {className && <span className="ev-card__time">{className}</span>}
      </div>
    </div>
  </div>
);
