/**
 * SessionCard — tarjeta compacta de una sesión.
 *
 * Pulsar en la tarjeta abre el SessionDetailDrawer (hub operativo). La
 * edición de tema, generación de material y asistencia ahora viven en el
 * drawer, no inline. Esto evita que una vista con 60+ sesiones se llene de
 * inputs y mantiene el listado escaneable.
 */

import { ChevronRight, FileText, Presentation as PresentationIcon } from 'lucide-react';
import type { CalendarEvent, Topic, TopicMaterial } from '../../types';

interface Props {
  session: CalendarEvent;
  topic?: Topic;
  isToday?: boolean;
  onOpen: (sessionId: string) => void;
}

const DAY_NAMES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const SessionCard: React.FC<Props> = ({ session, topic, isToday, onOpen }) => {
  const date = new Date(session.date + 'T00:00:00');
  const day = date.getDate();
  const month = MONTH_NAMES[date.getMonth()];
  const dayName = DAY_NAMES[date.getDay()];
  const timeRange = session.startTime
    ? `${session.startTime.slice(0, 5)}${session.endTime ? ` – ${session.endTime.slice(0, 5)}` : ''}`
    : null;

  const materials: TopicMaterial[] = topic?.materials || [];
  const presentationCount = materials.filter((m) => m.documentType === 'presentation').length;
  const attachmentCount = materials.length - presentationCount;

  return (
    <li
      className={`sc ${isToday ? 'sc--today' : ''} ${session.isCancelled ? 'sc--cancelled' : ''}`}
    >
      <button
        type="button"
        className="sc-button"
        onClick={() => onOpen(session.id)}
      >
        <div className="sc-date" aria-hidden>
          <span className="sc-date-day">{day}</span>
          <span className="sc-date-month">{month}</span>
          <span className="sc-date-weekday">{dayName}</span>
        </div>

        <div className="sc-body">
          <div className="sc-title-row">
            <h3 className="sc-title">
              {topic?.name || session.title || 'Sesión sin tema'}
              {!topic && !session.title && (
                <span className="sc-title-placeholder"> (sin tema)</span>
              )}
            </h3>
            {isToday && <span className="sc-today-chip">Hoy</span>}
          </div>
          <div className="sc-meta-row">
            {timeRange && <span className="sc-meta-item">{timeRange}</span>}
            {presentationCount > 0 && (
              <span className="sc-meta-item">
                <PresentationIcon size={11} /> {presentationCount}
              </span>
            )}
            {attachmentCount > 0 && (
              <span className="sc-meta-item">
                <FileText size={11} /> {attachmentCount}
              </span>
            )}
            {session.isCancelled && <span className="sc-meta-item sc-meta-warn">cancelada</span>}
            {!topic && !session.isCancelled && (
              <span className="sc-meta-item sc-meta-warn">sin tema</span>
            )}
          </div>
        </div>

        <ChevronRight size={16} className="sc-chevron" aria-hidden />
      </button>
    </li>
  );
};

export default SessionCard;
