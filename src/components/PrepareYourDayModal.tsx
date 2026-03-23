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

const PrepareYourDayModal: React.FC<PrepareYourDayModalProps> = ({ isOpen, onDismiss, date }) => {
  const [activeDate, setActiveDate] = useState(date);
  const [focusTopics, setFocusTopics] = useState('');
  const [showFocusInput, setShowFocusInput] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [eventsExpanded, setEventsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const goToToday = useCallback(() => setActiveDate(toDateStr(new Date())), []);

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

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setExpandedClasses(new Set());
      setEventsExpanded(false);
      setShowFocusInput(false);
      // Clear stale data before fetching for the new date
      clearPreparation();
      getPreparation(activeDate);
      fetchEvents(activeDate, activeDate);
    }
  }, [isOpen, activeDate]);

  const handleGenerate = async () => {
    setError(null);
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

  const toggleClassExpanded = (classId: string) => {
    const newSet = new Set(expandedClasses);
    if (newSet.has(classId)) {
      newSet.delete(classId);
    } else {
      newSet.add(classId);
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

  /** Merge grade_alerts into class_breakdowns for grouped display */
  const enrichedBreakdowns = useMemo(() => {
    if (!currentPreparation?.class_breakdowns) return [];
    // Guard: only use data if it matches the active date
    if (currentPreparation.prep_date !== activeDate) return [];
    const alertsByClass: Record<string, any[]> = {};
    if (currentPreparation.grade_alerts) {
      for (const alert of currentPreparation.grade_alerts) {
        const key = alert.class_name || '__unknown__';
        if (!alertsByClass[key]) alertsByClass[key] = [];
        alertsByClass[key].push(alert);
      }
    }
    return currentPreparation.class_breakdowns.map((cls: any) => ({
      ...cls,
      grade_alerts: alertsByClass[cls.class_name] || [],
    }));
  }, [currentPreparation, activeDate]);

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} className="prepare-modal">
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
        {/* Date navigator — arrows to shift day, calendar icon to pick date */}
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
          <button
            className="prepare-modal__date-calendar-btn"
            onClick={() => dateInputRef.current?.showPicker()}
            aria-label="Seleccionar fecha"
          >
            <IonIcon icon={calendarOutline} />
          </button>
          {!isToday && (
            <button className="prepare-modal__date-today-btn" onClick={goToToday}>
              Hoy
            </button>
          )}
          {/* Hidden native date picker */}
          <input
            ref={dateInputRef}
            type="date"
            className="prepare-modal__date-input-hidden"
            value={activeDate}
            onChange={(e) => {
              if (e.target.value) setActiveDate(e.target.value);
            }}
          />
        </div>
        <p className="prepare-modal__date-hint">Usa las flechas o el calendario para preparar otro día</p>

        {/* Loading State - Enhanced */}
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

        {/* No Preparation Yet */}
        {!currentPreparation && !preparationLoading && !error && (
          <div className="prepare-modal__empty">
            <div className="prepare-modal__empty-icon">
              <IonIcon icon={sparklesOutline} />
            </div>
            <h3>Obtén un resumen inteligente</h3>
            <p>
              La IA analizará tus clases de hoy, correcciones recientes, y comentarios
              para darte un resumen personalizado de tu jornada.
            </p>
            
            {showFocusInput && (
              <div className="prepare-modal__focus">
                <label>Temas a enfocar (opcional)</label>
                <IonTextarea
                  value={focusTopics}
                  onIonInput={(e) => setFocusTopics(e.detail.value || '')}
                  placeholder="Ej: Repasar fracciones, preparar examen de la semana que viene..."
                  rows={2}
                  className="prepare-modal__focus-input"
                />
              </div>
            )}

            <button className="prepare-modal__generate-btn" onClick={handleGenerate}>
              <IonIcon icon={sparklesOutline} />
              Generar preparación
            </button>

            {!showFocusInput && (
              <button className="prepare-modal__focus-toggle" onClick={() => setShowFocusInput(true)}>
                + Añadir temas de enfoque
              </button>
            )}
          </div>
        )}

        {/* Today's Events Overview - collapsible */}
        {!preparationLoading && (otherEvents.length > 0 || classSessions.length > 0) && (
          <div className="prepare-modal__events-overview">
            <button
              className="prepare-modal__events-toggle"
              onClick={() => setEventsExpanded(!eventsExpanded)}
            >
              <div className="prepare-modal__events-toggle-left">
                <IonIcon icon={calendarOutline} />
                <span>Eventos del día</span>
                <span className="prepare-modal__events-count-badge">
                  {dayEvents.length}
                </span>
              </div>
              <IonIcon icon={eventsExpanded ? chevronUpOutline : chevronDownOutline} className="prepare-modal__events-chevron" />
            </button>

            {!eventsExpanded && (
              <div className="prepare-modal__events-summary-row">
                {classSessions.length > 0 && (
                  <span className="prepare-modal__events-summary-chip">
                    <IonIcon icon={schoolOutline} />
                    {classSessions.length} {classSessions.length === 1 ? 'clase' : 'clases'}
                  </span>
                )}
                {otherEvents.length > 0 && (
                  <span className="prepare-modal__events-summary-chip">
                    <IonIcon icon={calendarOutline} />
                    {otherEvents.length} {otherEvents.length === 1 ? 'evento' : 'eventos'}
                  </span>
                )}
              </div>
            )}

            {eventsExpanded && (
              <div className="prepare-modal__events-list">
                {classSessions.map((ev) => (
                  <div key={ev.id} className="prepare-modal__event prepare-modal__event--class">
                    <div className="prepare-modal__event-header">
                      <IonIcon icon={schoolOutline} />
                      <span className="prepare-modal__event-title">{ev.title}</span>
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
                    {ev.location && (
                      <div className="prepare-modal__event-time">
                        <IonIcon icon={locationOutline} />
                        <span>{ev.location}</span>
                      </div>
                    )}
                  </div>
                ))}
                {otherEvents.map((ev) => (
                  <div key={ev.id} className={`prepare-modal__event prepare-modal__event--${ev.eventType}`}>
                    <div className="prepare-modal__event-header">
                      <IonIcon icon={ev.eventType === 'tutoring' ? peopleOutline : calendarOutline} />
                      <span className="prepare-modal__event-title">{ev.title}</span>
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
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preparation Content */}
        {currentPreparation && !preparationLoading && (
          <div className="prepare-modal__result">
            {/* Summary */}
            <div className="prepare-modal__summary">
              <p>{currentPreparation.summary}</p>
            </div>

            {/* Class Breakdowns - grouped with grade alerts */}
            {enrichedBreakdowns.length > 0 && (
              <div className="prepare-modal__section">
                <h3 className="prepare-modal__section-title">
                  <IonIcon icon={schoolOutline} />
                  Clases de hoy
                </h3>
                {enrichedBreakdowns.map((cls: any, idx: number) => {
                  const classKey = `${cls.class_id || cls.class_name}_${cls.subject_id || cls.subject || idx}`;
                  const isExpanded = expandedClasses.has(classKey);
                  const alertCount = (cls.student_alerts?.length || 0) + (cls.grade_alerts?.length || 0);
                  const topicCount = cls.topics_to_cover?.length || 0;

                  return (
                    <div key={classKey} className={`prepare-modal__class ${alertCount > 0 ? 'prepare-modal__class--has-alerts' : ''}`}>
                      <button
                        className="prepare-modal__class-header"
                        onClick={() => toggleClassExpanded(classKey)}
                      >
                        <div className="prepare-modal__class-info">
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
                          {/* Aggregated summary badges */}
                          <div className="prepare-modal__class-badges">
                            {cls.start_time && (
                              <span className="prepare-modal__badge prepare-modal__badge--time">
                                <IonIcon icon={timeOutline} />
                                {cls.start_time}
                              </span>
                            )}
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
                                {alertCount} {alertCount === 1 ? 'alerta' : 'alertas'}
                              </span>
                            )}
                            {topicCount > 0 && (
                              <span className="prepare-modal__badge prepare-modal__badge--info">
                                {topicCount} {topicCount === 1 ? 'tema' : 'temas'}
                              </span>
                            )}
                          </div>
                        </div>
                        <IonIcon
                          icon={isExpanded ? chevronUpOutline : chevronDownOutline}
                        />
                      </button>

                      {isExpanded && (
                        <div className="prepare-modal__class-details">
                          {cls.topics_to_cover && cls.topics_to_cover.length > 0 && (
                            <div className="prepare-modal__detail">
                              <strong>Temas a tratar:</strong>
                              <ul>
                                {cls.topics_to_cover.map((topic: string, i: number) => (
                                  <li key={i}>{topic}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {cls.student_alerts && cls.student_alerts.length > 0 && (
                            <div className="prepare-modal__detail prepare-modal__detail--alert">
                              <strong>Alumnos a atender:</strong>
                              <ul>
                                {cls.student_alerts.map((alert: any, i: number) => (
                                  <li key={i}>
                                    <span className="prepare-modal__student-name">{alert.name}</span>
                                    <span className="prepare-modal__student-reason">{alert.reason}</span>
                                    {alert.suggested_action && (
                                      <span className="prepare-modal__student-action">{alert.suggested_action}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Grade alerts merged into class card */}
                          {cls.grade_alerts && cls.grade_alerts.length > 0 && (
                            <div className="prepare-modal__detail prepare-modal__detail--grade-alert">
                              <strong>
                                <IonIcon icon={alertCircleOutline} />
                                Alertas de rendimiento
                              </strong>
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

                          {cls.class_weak_points && cls.class_weak_points.length > 0 && (
                            <div className="prepare-modal__detail">
                              <strong>Puntos débiles:</strong>
                              <div className="prepare-modal__tags">
                                {cls.class_weak_points.map((point: string, i: number) => (
                                  <span key={i} className="prepare-modal__tag">{point}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {cls.positive_highlights && cls.positive_highlights.length > 0 && (
                            <div className="prepare-modal__detail prepare-modal__detail--positive">
                              <strong>Destacados positivos:</strong>
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
                              <strong>Sugerencias:</strong>
                              <ul>
                                {cls.suggestions.map((sug: string, i: number) => (
                                  <li key={i}>{sug}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
    </IonModal>
  );
};

export default PrepareYourDayModal;
