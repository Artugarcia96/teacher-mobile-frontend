import { IonIcon, IonBadge } from '@ionic/react';
import {
  chevronForwardOutline, createOutline,
  locationOutline, timeOutline, pencilOutline,
} from 'ionicons/icons';
import { ClassSubjectSummary, ScheduleSlot } from '../types';
import './SubjectCard.css';

const FALLBACK_COLORS = [
  '#15665E', '#6C3AED', '#0891B2', '#D97706', '#059669',
  '#DC2626', '#2563EB', '#DB2777', '#4F46E5', '#8B5CF6',
];

function fallbackColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

const DAY_ABBR: Record<string, string> = {
  lunes: 'L', martes: 'M', miércoles: 'X', miercoles: 'X',
  jueves: 'J', viernes: 'V', sábado: 'S', sabado: 'S', domingo: 'D',
  monday: 'L', tuesday: 'M', wednesday: 'X', thursday: 'J',
  friday: 'V', saturday: 'S', sunday: 'D',
};

const DAY_ORDER: Record<string, number> = {
  lunes: 0, martes: 1, miércoles: 2, miercoles: 2,
  jueves: 3, viernes: 4, sábado: 5, sabado: 5, domingo: 6,
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};

function formatScheduleCompact(slots: ScheduleSlot[]): string {
  if (!slots || slots.length === 0) return '';
  const sorted = [...slots].sort((a, b) => (DAY_ORDER[a.day.toLowerCase()] ?? 7) - (DAY_ORDER[b.day.toLowerCase()] ?? 7));
  const groups: Record<string, string[]> = {};
  const order: string[] = [];
  for (const s of sorted) {
    const day = DAY_ABBR[s.day.toLowerCase()] || s.day.slice(0, 2);
    const start = s.start_time?.slice(0, 5) || '';
    const key = start || '';
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(day);
  }
  return order.map(key => {
    const days = groups[key].join(', ');
    return key ? `${days} ${key}` : days;
  }).join(' · ');
}

interface SubjectCardProps {
  subject: ClassSubjectSummary;
  classId: string;
  onNavigate: (subjectId: string) => void;
  onCorrect?: (examId: string) => void;
  firstPendingExamId?: string;
}

const SubjectCard: React.FC<SubjectCardProps> = ({
  subject, classId, onNavigate, onCorrect, firstPendingExamId
}) => {
  const color = subject.subjectColor || fallbackColor(subject.subjectName);

  const scheduleStr = subject.schedule && subject.schedule.length > 0
    ? formatScheduleCompact(subject.schedule)
    : '';
  const hasAula = !!subject.aula;
  const hasExams = subject.examCount > 0;

  return (
    <div className="sc pressable" onClick={() => onNavigate(subject.subjectId)}>
      <div className="sc__accent" style={{ background: color }} />
      <div className="sc__body">
        <div className="sc__dot" style={{ background: color }} />
        <div className="sc__info">
          <span className="sc__name">{subject.subjectName}</span>
          <div className="sc__chips">
            {hasAula && (
              <span className="sc__chip">
                <IonIcon icon={locationOutline} />
                {subject.aula}
              </span>
            )}
            {hasAula && scheduleStr && <span className="sc__chip-dot" />}
            {scheduleStr && (
              <span className="sc__chip">
                <IonIcon icon={timeOutline} />
                {scheduleStr}
              </span>
            )}
            {(hasAula || scheduleStr) && hasExams && <span className="sc__chip-dot" />}
            {hasExams && (
              <span className="sc__chip">
                {subject.examCount} {subject.examCount === 1 ? 'examen' : 'exam.'}
                {subject.passRate !== null && ` · ${Math.round(subject.passRate)}% aprob.`}
              </span>
            )}
          </div>
          {subject.pendingExerciseCount > 0 && (
            <div className="sc__pending">
              <IonIcon icon={pencilOutline} />
              <span>{subject.pendingExerciseCount} {subject.pendingExerciseCount === 1 ? 'ejercicio pendiente' : 'ejercicios pendientes'}</span>
            </div>
          )}
        </div>
        <div className="sc__right">
          {subject.pendingCorrections > 0 && firstPendingExamId ? (
            <button
              className="sc__correct-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCorrect?.(firstPendingExamId);
              }}
            >
              <IonIcon icon={createOutline} />
              <span>Corregir</span>
              <IonBadge color="danger">{subject.pendingCorrections}</IonBadge>
            </button>
          ) : (
            <IonIcon icon={chevronForwardOutline} className="sc__arrow" />
          )}
        </div>
      </div>
    </div>
  );
};

export default SubjectCard;
