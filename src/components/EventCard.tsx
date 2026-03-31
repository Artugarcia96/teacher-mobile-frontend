import { IonIcon } from '@ionic/react';
import { chevronForwardOutline, checkboxOutline, squareOutline, readerOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { CalendarEvent, Exam } from '../types';
import { avatarColor as colorFromName } from '../utils/avatarColors';
import { getEventNoteSummary } from '../utils/parseEventNotes';
import './EventCard.css';

interface CalendarEventCardProps {
  event: CalendarEvent;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  compact?: boolean;
  onTakeAttendance?: (classId: string, date: string, eventId: string, subjectId?: string) => void;
  attendanceTaken?: boolean;
}

export const CalendarEventCard: React.FC<CalendarEventCardProps> = ({
  event, onClick, selectable, selected, onToggleSelect, compact, onTakeAttendance, attendanceTaken,
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
        {(event.startTime || event.notes) && (() => {
          const summary = getEventNoteSummary(event.notes);
          return (
            <div className="ev-card__bottom">
              {event.startTime && (
                <span className="ev-card__time">
                  {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
                </span>
              )}
              {summary && <span className="ev-card__notes">{summary}</span>}
            </div>
          );
        })()}
        {!selectable && event.eventType === 'class_session' && event.classId && onTakeAttendance && (
          <button
            className={`ev-card__attendance-btn ${attendanceTaken ? 'ev-card__attendance-btn--done' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onTakeAttendance(event.classId!, event.date, event.id, event.subjectId);
            }}
          >
            <IonIcon icon={attendanceTaken ? checkmarkCircleOutline : readerOutline} />
            <span>{attendanceTaken ? 'Lista revisada' : 'Pasar lista'}</span>
          </button>
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
