import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { IonModal, IonIcon, IonTextarea } from '@ionic/react';
import {
  closeOutline,
  sparklesOutline,
  sparkles,
  refreshOutline,
  schoolOutline,
  alertCircleOutline,
  calendarOutline,
  checkmarkCircleOutline,
  chevronDownOutline,
  chevronUpOutline,
  chevronBackOutline,
  chevronForwardOutline,
  peopleOutline,
  timeOutline,
  documentTextOutline,
  analyticsOutline,
  trendingDownOutline,
  trendingUpOutline,
  bookOutline,
  locationOutline,
  bulbOutline,
  trophyOutline,
  chatbubbleOutline,
} from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { useCalendarStore } from '../store/calendarStore';
import './PrepareYourDayModal.css';

const PREPARE_STEPS = [
  { icon: schoolOutline, label: 'Analizando clases del día' },
  { icon: documentTextOutline, label: 'Revisando correcciones' },
  { icon: analyticsOutline, label: 'Generando recomendaciones' },
];

const PrepareLoadingAnimation: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev < PREPARE_STEPS.length - 1 ? prev + 1 : prev));
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="prepare-modal__loading">
      <div className="prepare-modal__loading-visual">
        <div className="prepare-modal__loading-ripple" />
        <div className="prepare-modal__loading-ripple delay-1" />
        <div className="prepare-modal__loading-icon">
          <IonIcon icon={sparkles} />
        </div>
        <div className="prepare-modal__loading-particles">
          <span className="prepare-modal__loading-particle" />
          <span className="prepare-modal__loading-particle" />
          <span className="prepare-modal__loading-particle" />
          <span className="prepare-modal__loading-particle" />
        </div>
      </div>
      <p className="prepare-modal__loading-text">Preparando tu jornada</p>
      <p className="prepare-modal__loading-hint">La IA está analizando tus clases, correcciones recientes y comentarios</p>
      <div className="prepare-modal__loading-progress">
        <div className="prepare-modal__loading-progress-bar" />
      </div>
      <div className="prepare-modal__loading-steps">
        {PREPARE_STEPS.map((step, i) => (
          <div
            key={i}
            className={`prepare-modal__loading-step ${i < activeStep ? 'done' : ''} ${i === activeStep ? 'active' : ''}`}
          >
            <IonIcon icon={i < activeStep ? checkmarkCircleOutline : step.icon} />
            <span>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface PrepareYourDayModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  date: string;
}

/** Format a Date object to YYYY-MM-DD string */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Priority triage types ──
interface TriageBucket {
  urgent: { icon: string; text: string; detail?: string }[];
  pending: { icon: string; text: string; detail?: string }[];
  positive: { icon: string; text: string; detail?: string }[];
}

function buildTriage(prep: any): TriageBucket {
  const triage: TriageBucket = { urgent: [], pending: [], positive: [] };
  if (!prep) return triage;

  // Urgent: overdue/urgent deadlines, declining students, exams today
  const deadlines = prep.upcoming_deadlines || [];
  for (const dl of deadlines) {
    if (dl.days_until === 0) {
      triage.urgent.push({ icon: '🔴', text: `${dl.name} — ${dl.class_name}`, detail: 'Hoy' });
    } else if (dl.days_until === 1) {
      triage.urgent.push({ icon: '⚠️', text: `${dl.name} — ${dl.class_name}`, detail: 'Mañana' });
    }
  }

  const gradeAlerts = prep.grade_alerts || [];
  for (const alert of gradeAlerts) {
    if (alert.trend === 'declining') {
      triage.urgent.push({ icon: '📉', text: `${alert.student_name} bajando (${alert.avg_grade?.toFixed(1)})`, detail: alert.class_name });
    }
  }

  // Pending: corrections, exercises, upcoming deadlines
  const tasks = prep.pending_tasks || [];
  for (const task of tasks) {
    if (task.count > 0) {
      triage.pending.push({ icon: '📋', text: task.description });
    }
  }
  for (const dl of deadlines) {
    if (dl.days_until > 1 && dl.days_until <= 3) {
      triage.pending.push({ icon: '📅', text: `${dl.name} — ${dl.class_name}`, detail: `En ${dl.days_until} días` });
    }
  }

  // Positive: improving students, highlights
  const breakdowns = prep.class_breakdowns || [];
  for (const cls of breakdowns) {
    for (const h of (cls.positive_highlights || [])) {
      triage.positive.push({ icon: '⭐', text: `${h.name}: ${h.achievement}`, detail: cls.class_name });
    }
  }
  for (const alert of gradeAlerts) {
    if (alert.trend === 'improving') {
      triage.positive.push({ icon: '📈', text: `${alert.student_name} mejorando (${alert.avg_grade?.toFixed(1)})`, detail: alert.class_name });
    }
  }

  // Cap each bucket at 4
  triage.urgent = triage.urgent.slice(0, 4);
  triage.pending = triage.pending.slice(0, 4);
  triage.positive = triage.positive.slice(0, 4);

  return triage;
}

const PrepareYourDayModal: React.FC<PrepareYourDayModalProps> = ({ isOpen, onDismiss, date }) => {
  const [activeDate, setActiveDate] = useState(date);
  const [focusTopics, setFocusTopics] = useState('');
  const [showFocusInput, setShowFocusInput] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoGenerateTriggered, setAutoGenerateTriggered] = useState(false);
  const history = useHistory();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const currentPreparation = useCalendarStore((s) => s.currentPreparation);
  const preparationLoading = useCalendarStore((s) => s.preparationLoading);
  const generatePreparation = useCalendarStore((s) => s.generatePreparation);
  const getPreparation = useCalendarStore((s) => s.getPreparation);
  const clearPreparation = useCalendarStore((s) => s.clearPreparation);
  const events = useCalendarStore((s) => s.events);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);

  // Sync activeDate when the prop changes (e.g. modal re-opened)
  useEffect(() => { setActiveDate(date); }, [date]);

  const shiftDate = useCallback((days: number) => {
    const d = new Date(activeDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setActiveDate(toDateStr(d));
  }, [activeDate]);

  const goToToday = useCallback(() => {
    setActiveDate(toDateStr(new Date()));
  }, []);

  const isToday = activeDate === toDateStr(new Date());

  const dayEvents = useMemo(() => {
    return events.filter((e) => e.date === activeDate && !e.isCancelled);
  }, [events, activeDate]);

  const otherEvents = useMemo(() => {
    return dayEvents.filter((e) => e.eventType !== 'class_session');
  }, [dayEvents]);

  const classSessions = useMemo(() => {
    return dayEvents.filter((e) => e.eventType === 'class_session');
  }, [dayEvents]);

  // Load preparation and events when modal opens or date changes
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setExpandedClasses(new Set());
      setEventsExpanded(false);
      setShowFocusInput(false);
      clearPreparation();
      getPreparation(activeDate);
      fetchEvents(activeDate, activeDate);
    }
  }, [isOpen, activeDate]);

  // Auto-generate: only for today's date, only once per modal session
  useEffect(() => {
    if (
      isOpen &&
      !preparationLoading &&
      !currentPreparation &&
      !error &&
      !autoGenerateTriggered &&
      activeDate === toDateStr(new Date()) // only auto-generate for today
    ) {
      const timer = setTimeout(() => {
        const store = useCalendarStore.getState();
        if (!store.currentPreparation && !store.preparationLoading) {
          setAutoGenerateTriggered(true);
          handleGenerate();
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isOpen, preparationLoading, currentPreparation, error, autoGenerateTriggered]);

  const handleGenerate = async () => {
    setError(null);
    setAutoGenerateTriggered(true);
    try {
      await generatePreparation(activeDate, focusTopics || undefined);
      setShowFocusInput(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Error al generar la preparación');
    }
  };

  const regenerateFormRef = useRef<HTMLDivElement>(null);

  const handleRegenerate = () => {
    setShowFocusInput(true);
    setTimeout(() => {
      regenerateFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const toggleClassExpanded = (classKey: string) => {
    const newSet = new Set(expandedClasses);
    if (newSet.has(classKey)) {
      newSet.delete(classKey);
    } else {
      newSet.add(classKey);
    }
    setExpandedClasses(newSet);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const nowStr = toDateStr(new Date());
    if (dateStr === nowStr) return 'Hoy';
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateStr === toDateStr(tomorrow)) return 'Mañana';
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === toDateStr(yesterday)) return 'Ayer';
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const formatDateShort = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const navigateTo = useCallback((path: string) => {
    onDismiss();
    history.push(path);
  }, [onDismiss, history]);

  /** Merge grade_alerts into class_breakdowns, sort chronologically */
  const enrichedBreakdowns = useMemo(() => {
    if (!currentPreparation?.class_breakdowns) return [];
    if (currentPreparation.prep_date !== activeDate) return [];
    const alertsByClass: Record<string, any[]> = {};
    if (currentPreparation.grade_alerts) {
      for (const alert of currentPreparation.grade_alerts) {
        const key = alert.class_name || '__unknown__';
        if (!alertsByClass[key]) alertsByClass[key] = [];
        alertsByClass[key].push(alert);
      }
    }
    const breakdowns = currentPreparation.class_breakdowns.map((cls: any) => ({
      ...cls,
      _type: 'class' as const,
      grade_alerts: alertsByClass[cls.class_name] || [],
    }));

    // Sort by start_time (chronological timeline)
    breakdowns.sort((a: any, b: any) => {
      const ta = a.start_time || '99:99';
      const tb = b.start_time || '99:99';
      return ta.localeCompare(tb);
    });

    return breakdowns;
  }, [currentPreparation, activeDate]);

  /** Unified timeline: class breakdowns + other events (tutoring, custom) sorted by time */
  const timelineItems = useMemo(() => {
    const items: any[] = [...enrichedBreakdowns];

    // Add other events (tutoring, custom) as timeline items
    for (const ev of otherEvents) {
      items.push({
        _type: 'event' as const,
        _event: ev,
        start_time: ev.startTime || null,
      });
    }

    // Sort everything chronologically
    items.sort((a, b) => {
      const ta = a.start_time || '99:99';
      const tb = b.start_time || '99:99';
      return ta.localeCompare(tb);
    });

    return items;
  }, [enrichedBreakdowns, otherEvents]);

  // Build priority triage
  const triage = useMemo(() => buildTriage(currentPreparation), [currentPreparation]);
  const hasTriageContent = triage.urgent.length > 0 || triage.pending.length > 0 || triage.positive.length > 0;

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} className="prepare-modal">
      <div className="prepare-modal__inner">
      <div className="prepare-modal__header">
        <div className="prepare-modal__title-row">
          <IonIcon icon={sparklesOutline} className="prepare-modal__icon" />
          <h2 className="prepare-modal__title">Prepara tu día</h2>
        </div>
        <button className="prepare-modal__close" onClick={onDismiss}>
          <IonIcon icon={closeOutline} />
        </button>
      </div>

      <div className="prepare-modal__content">
        {/* Date navigator */}
        <div className="prepare-modal__date-nav">
          <button className="prepare-modal__date-nav-btn" onClick={() => shiftDate(-1)} aria-label="Día anterior">
            <IonIcon icon={chevronBackOutline} />
          </button>
          <div className="prepare-modal__date-center-group">
            <div className="prepare-modal__date-center-text">
              <span className="prepare-modal__date-label">{formatDate(activeDate)}</span>
              <span className="prepare-modal__date-full">{formatDateShort(activeDate)}</span>
            </div>
          </div>
          <button className="prepare-modal__date-nav-btn" onClick={() => shiftDate(1)} aria-label="Día siguiente">
            <IonIcon icon={chevronForwardOutline} />
          </button>
          <label className="prepare-modal__date-calendar-btn" aria-label="Seleccionar fecha">
            <IonIcon icon={calendarOutline} />
            <input
              ref={dateInputRef}
              type="date"
              className="prepare-modal__date-input-hidden"
              value={activeDate}
              onChange={(e) => {
                if (e.target.value) {
                  setActiveDate(e.target.value);
                }
              }}
            />
          </label>
          {!isToday && (
            <button className="prepare-modal__date-today-btn" onClick={goToToday}>
              Hoy
            </button>
          )}
        </div>

        {/* Loading State */}
        {preparationLoading && (
          <PrepareLoadingAnimation />
        )}

        {/* Error State */}
        {error && !preparationLoading && (
          <div className="prepare-modal__error">
            <IonIcon icon={alertCircleOutline} />
            <p>{error}</p>
            <button className="prepare-modal__btn" onClick={handleGenerate}>
              Reintentar
            </button>
          </div>
        )}

        {/* Empty state — no preparation exists, show generate button */}
        {!currentPreparation && !preparationLoading && !error && (
          <div className="prepare-modal__empty">
            <p className="prepare-modal__empty-text">
              {isToday
                ? 'Generando tu preparación...'
                : 'No hay preparación para este día'}
            </p>
            {!isToday && (
              <>
                {showFocusInput && (
                  <div className="prepare-modal__focus">
                    <IonTextarea
                      value={focusTopics}
                      onIonInput={(e) => setFocusTopics(e.detail.value || '')}
                      placeholder="Ej: Repasar fracciones, preparar examen..."
                      rows={2}
                      className="prepare-modal__focus-input"
                    />
                  </div>
                )}
                <button className="prepare-modal__generate-btn" onClick={handleGenerate}>
                  Generar preparación
                </button>
                {!showFocusInput && (
                  <button className="prepare-modal__focus-toggle" onClick={() => setShowFocusInput(true)}>
                    + Añadir temas de enfoque
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Timeline: always show if there are items (events appear even before AI generation) */}
        {!preparationLoading && timelineItems.length > 0 && !error && (
          <div className="prepare-modal__section">
            <h3 className="prepare-modal__section-title">
              <IonIcon icon={timeOutline} />
              Tu jornada
            </h3>
            <div className="prepare-modal__timeline">
              {timelineItems.map((item: any, idx: number) => {

                // ── Event item (tutoring, custom) ──
                if (item._type === 'event') {
                  const ev = item._event;
                  return (
                    <div key={`ev-${ev.id}`} className="prepare-modal__timeline-item">
                      <div className="prepare-modal__timeline-rail">
                        <div className={`prepare-modal__timeline-dot prepare-modal__timeline-dot--event${ev.eventType === 'tutoring' ? ' prepare-modal__timeline-dot--tutoring' : ''}`}>
                          {ev.startTime ? (
                            <span className="prepare-modal__timeline-time">{ev.startTime.slice(0, 5)}</span>
                          ) : (
                            <IonIcon icon={ev.eventType === 'tutoring' ? peopleOutline : calendarOutline} />
                          )}
                        </div>
                        {idx < timelineItems.length - 1 && <div className="prepare-modal__timeline-line" />}
                      </div>
                      <div className={`prepare-modal__timeline-card prepare-modal__timeline-card--event prepare-modal__timeline-card--${ev.eventType}`}>
                        <div className="prepare-modal__timeline-event-body">
                          <div className="prepare-modal__timeline-event-header">
                            <IonIcon icon={ev.eventType === 'tutoring' ? peopleOutline : calendarOutline} />
                            <span className="prepare-modal__class-name">{ev.title}</span>
                            {ev.eventType === 'tutoring' && (
                              <span className="prepare-modal__event-badge">Tutoría</span>
                            )}
                          </div>
                          {(ev.startTime || ev.endTime) && (
                            <div className="prepare-modal__event-time">
                              <IonIcon icon={timeOutline} />
                              <span>
                                {ev.startTime && ev.startTime}
                                {ev.startTime && ev.endTime && ' — '}
                                {ev.endTime && ev.endTime}
                              </span>
                            </div>
                          )}
                          {ev.studentName && (
                            <div className="prepare-modal__event-student">
                              Alumno:{' '}
                              {ev.studentId && ev.classId ? (
                                <span
                                  className="prepare-modal__link"
                                  onClick={() => navigateTo(`/tabs/classes/${ev.classId}/students/${ev.studentId}`)}
                                >
                                  {ev.studentName}
                                </span>
                              ) : (
                                ev.studentName
                              )}
                            </div>
                          )}
                          {ev.notes && (
                            <div className="prepare-modal__event-notes">{ev.notes}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                // ── Class breakdown item ──
                const cls = item;
                const classKey = `${cls.class_id || cls.class_name}_${cls.subject_id || cls.subject || idx}`;
                const isExpanded = expandedClasses.has(classKey);
                const alertCount = (cls.student_alerts?.length || 0) + (cls.grade_alerts?.length || 0);
                const hasExercises = cls.exercises_today && cls.exercises_today.length > 0;

                return (
                  <div key={classKey} className="prepare-modal__timeline-item">
                    <div className="prepare-modal__timeline-rail">
                      <div className={`prepare-modal__timeline-dot ${alertCount > 0 ? 'prepare-modal__timeline-dot--alert' : ''}`}>
                        {cls.start_time ? (
                          <span className="prepare-modal__timeline-time">{cls.start_time}</span>
                        ) : (
                          <IonIcon icon={schoolOutline} />
                        )}
                      </div>
                      {idx < timelineItems.length - 1 && <div className="prepare-modal__timeline-line" />}
                    </div>

                    <div className={`prepare-modal__timeline-card ${alertCount > 0 ? 'prepare-modal__timeline-card--has-alerts' : ''}`}>
                      <button
                        className="prepare-modal__timeline-card-header"
                        onClick={() => toggleClassExpanded(classKey)}
                      >
                        <div className="prepare-modal__timeline-card-info">
                          <div className="prepare-modal__class-title-row">
                            {cls.class_id ? (
                              <span
                                className="prepare-modal__class-name prepare-modal__link"
                                onClick={(e) => { e.stopPropagation(); navigateTo(`/tabs/classes/${cls.class_id}`); }}
                              >
                                {cls.class_name}
                              </span>
                            ) : (
                              <span className="prepare-modal__class-name">{cls.class_name}</span>
                            )}
                            {cls.subject && (
                              <span className="prepare-modal__class-subject">
                                <IonIcon icon={bookOutline} />
                                {cls.subject}
                              </span>
                            )}
                          </div>
                          <div className="prepare-modal__class-badges">
                            {cls.aula && (
                              <span className="prepare-modal__badge">
                                <IonIcon icon={locationOutline} />
                                {cls.aula}
                              </span>
                            )}
                            {cls.class_avg_grade != null && (
                              <span className={`prepare-modal__badge ${cls.class_avg_grade < 5 ? 'prepare-modal__badge--danger' : 'prepare-modal__badge--ok'}`}>
                                Media: {cls.class_avg_grade.toFixed(1)}
                              </span>
                            )}
                            {alertCount > 0 && (
                              <span className="prepare-modal__badge prepare-modal__badge--warning">
                                <IonIcon icon={alertCircleOutline} />
                                {alertCount}
                              </span>
                            )}
                            {hasExercises && (
                              <span className="prepare-modal__badge prepare-modal__badge--info">
                                <IonIcon icon={documentTextOutline} />
                                Ejercicios
                              </span>
                            )}
                          </div>
                          {!isExpanded && cls.student_alerts && cls.student_alerts.length > 0 && (
                            <div className="prepare-modal__timeline-peek">
                              {cls.student_alerts.slice(0, 2).map((a: any, i: number) => (
                                <span key={i} className="prepare-modal__timeline-peek-item">
                                  <strong>{a.name}</strong>: {a.issue?.slice(0, 50)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <IonIcon icon={isExpanded ? chevronUpOutline : chevronDownOutline} />
                      </button>

                      {isExpanded && (
                        <div className="prepare-modal__class-details">
                          {cls.topics_to_cover && cls.topics_to_cover.length > 0 && (
                            <div className="prepare-modal__detail">
                              <strong><IonIcon icon={bulbOutline} />Temas a reforzar</strong>
                              <ul>
                                {cls.topics_to_cover.map((topic: string, i: number) => (
                                  <li key={i}>{topic}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {cls.student_alerts && cls.student_alerts.length > 0 && (
                            <div className="prepare-modal__detail prepare-modal__detail--alert">
                              <strong><IonIcon icon={alertCircleOutline} />Alumnos a atender</strong>
                              <ul>
                                {cls.student_alerts.map((alert: any, i: number) => (
                                  <li key={i}>
                                    <span className="prepare-modal__student-name">{alert.name}</span>
                                    <span className="prepare-modal__student-reason">{alert.issue || alert.reason}</span>
                                    {alert.suggested_action && (
                                      <span className="prepare-modal__student-action">{alert.suggested_action}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {cls.grade_alerts && cls.grade_alerts.length > 0 && (
                            <div className="prepare-modal__detail prepare-modal__detail--grade-alert">
                              <strong><IonIcon icon={alertCircleOutline} />Alertas de rendimiento</strong>
                              <div className="prepare-modal__grade-alerts">
                                {cls.grade_alerts.map((alert: any, i: number) => (
                                  <div key={i} className="prepare-modal__grade-alert-item">
                                    <div className="prepare-modal__grade-alert-top">
                                      <span className="prepare-modal__student-name">{alert.student_name}</span>
                                      {alert.avg_grade != null && (
                                        <span className={`prepare-modal__badge ${alert.avg_grade < 5 ? 'prepare-modal__badge--danger' : 'prepare-modal__badge--ok'}`}>
                                          {alert.avg_grade.toFixed(1)}
                                        </span>
                                      )}
                                      {alert.trend && alert.trend !== 'stable' && (
                                        <IonIcon
                                          icon={alert.trend === 'improving' ? trendingUpOutline : trendingDownOutline}
                                          className={`prepare-modal__trend-icon prepare-modal__trend-icon--${alert.trend}`}
                                        />
                                      )}
                                    </div>
                                    <span className="prepare-modal__student-reason">{alert.issue}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {cls.exercises_today && cls.exercises_today.length > 0 && (
                            <div className="prepare-modal__detail">
                              <strong><IonIcon icon={documentTextOutline} />Ejercicios hoy</strong>
                              <ul>
                                {cls.exercises_today.map((ex: any, i: number) => (
                                  <li key={i}>
                                    {ex.type === 'deliver' ? '📤 Entregar' : '📥 Recoger'} — {ex.student}: {ex.exercise}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {cls.class_weak_points && cls.class_weak_points.length > 0 && (
                            <div className="prepare-modal__detail">
                              <strong>Puntos débiles</strong>
                              <div className="prepare-modal__tags">
                                {cls.class_weak_points.map((point: string, i: number) => (
                                  <span key={i} className="prepare-modal__tag">{point}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {cls.positive_highlights && cls.positive_highlights.length > 0 && (
                            <div className="prepare-modal__detail prepare-modal__detail--positive">
                              <strong><IonIcon icon={trophyOutline} />Destacados</strong>
                              <ul>
                                {cls.positive_highlights.map((h: any, i: number) => (
                                  <li key={i}>
                                    <span className="prepare-modal__student-name">{h.name}</span>
                                    <span className="prepare-modal__student-reason">{h.achievement}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {cls.suggestions && cls.suggestions.length > 0 && (
                            <div className="prepare-modal__detail">
                              <strong>Sugerencias</strong>
                              <ul>
                                {cls.suggestions.map((sug: string, i: number) => (
                                  <li key={i}>{sug}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {cls.recent_comments && cls.recent_comments.length > 0 && (
                            <div className="prepare-modal__detail">
                              <strong><IonIcon icon={chatbubbleOutline} />Comentarios recientes</strong>
                              <ul>
                                {cls.recent_comments.map((comment: string, i: number) => (
                                  <li key={i}>{comment}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Preparation Content */}
        {currentPreparation && !preparationLoading && (
          <div className="prepare-modal__result">
            {/* Summary — rendered as bullet list */}
            {currentPreparation.summary && (
              <ul className="prepare-modal__summary-bullets">
                {currentPreparation.summary.split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => (
                  <li key={i}>{line.replace(/^[•\-–]\s*/, '')}</li>
                ))}
              </ul>
            )}

            {/* Priority triage — lightweight, no icons */}
            {hasTriageContent && (
              <div className="prepare-modal__triage">
                {triage.urgent.length > 0 && (
                  <div className="prepare-modal__triage-row prepare-modal__triage-row--urgent">
                    <span className="prepare-modal__triage-label">Urgente</span>
                    <div className="prepare-modal__triage-items">
                      {triage.urgent.map((item, i) => (
                        <span key={i} className="prepare-modal__triage-item">
                          {item.text}
                          {item.detail && <span className="prepare-modal__triage-meta">{item.detail}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {triage.pending.length > 0 && (
                  <div className="prepare-modal__triage-row prepare-modal__triage-row--pending">
                    <span className="prepare-modal__triage-label">Pendiente</span>
                    <div className="prepare-modal__triage-items">
                      {triage.pending.map((item, i) => (
                        <span key={i} className="prepare-modal__triage-item">
                          {item.text}
                          {item.detail && <span className="prepare-modal__triage-meta">{item.detail}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {triage.positive.length > 0 && (
                  <div className="prepare-modal__triage-row prepare-modal__triage-row--positive">
                    <span className="prepare-modal__triage-label">Positivo</span>
                    <div className="prepare-modal__triage-items">
                      {triage.positive.map((item, i) => (
                        <span key={i} className="prepare-modal__triage-item">
                          {item.text}
                          {item.detail && <span className="prepare-modal__triage-meta">{item.detail}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Upcoming Deadlines */}
            {currentPreparation.upcoming_deadlines && currentPreparation.upcoming_deadlines.length > 0 && (
              <div className="prepare-modal__section">
                <h3 className="prepare-modal__section-title">
                  <IonIcon icon={calendarOutline} />
                  Próximos plazos
                </h3>
                <div className="prepare-modal__deadlines">
                  {currentPreparation.upcoming_deadlines.map((deadline: any, i: number) => (
                    <div key={i} className="prepare-modal__deadline">
                      <div className="prepare-modal__deadline-info">
                        <span className="prepare-modal__deadline-name">{deadline.name}</span>
                        <span className="prepare-modal__deadline-class">{deadline.class_name}</span>
                      </div>
                      <span className="prepare-modal__deadline-days">
                        {deadline.days_until === 0 ? 'Hoy' :
                         deadline.days_until === 1 ? 'Mañana' :
                         `En ${deadline.days_until} días`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Tasks */}
            {currentPreparation.pending_tasks && currentPreparation.pending_tasks.length > 0 && (
              <div className="prepare-modal__section">
                <h3 className="prepare-modal__section-title">
                  <IonIcon icon={checkmarkCircleOutline} />
                  Tareas pendientes
                </h3>
                <div className="prepare-modal__tasks">
                  {currentPreparation.pending_tasks.map((task: any, i: number) => (
                    <div key={i} className="prepare-modal__task">
                      <span className="prepare-modal__task-count">{task.count}</span>
                      <span className="prepare-modal__task-desc">{task.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regenerate Button */}
            <div className="prepare-modal__footer">
              <button className="prepare-modal__regenerate" onClick={handleRegenerate}>
                <IonIcon icon={refreshOutline} />
                Regenerar con otros temas
              </button>
            </div>

            {showFocusInput && (
              <div className="prepare-modal__regenerate-form" ref={regenerateFormRef}>
                <IonTextarea
                  value={focusTopics}
                  onIonInput={(e) => setFocusTopics(e.detail.value || '')}
                  placeholder="Ej: Quiero enfocarme en preparar el examen de la próxima semana..."
                  rows={2}
                  className="prepare-modal__focus-input"
                />
                <button className="prepare-modal__btn" onClick={handleGenerate}>
                  <IonIcon icon={sparklesOutline} />
                  Regenerar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </IonModal>
  );
};

export default PrepareYourDayModal;
