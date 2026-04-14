import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BarChart3, BookOpen, Calendar, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Dumbbell, FileText, Pencil, RefreshCw, School, Sparkles, TrendingDown, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import Modal from '@/components/shared/Modal';
import { useNavigate } from 'react-router-dom';
import { useCalendarStore } from '../store/calendarStore';
import './PrepareYourDayModal.css';

const PREPARE_STEPS = [
  { icon: School, label: 'Analizando clases del día' },
  { icon: FileText, label: 'Revisando correcciones' },
  { icon: BarChart3, label: 'Generando recomendaciones' },
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
          <Sparkles size={18} />
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
            {i < activeStep ? <CheckCircle size={14} /> : <step.icon size={14} />}
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
  urgent: { text: string; detail?: string }[];
  pending: { text: string; detail?: string }[];
  positive: { text: string; detail?: string }[];
}

function buildTriage(prep: any): TriageBucket {
  const triage: TriageBucket = { urgent: [], pending: [], positive: [] };
  if (!prep) return triage;

  const deadlines = prep.upcoming_deadlines || [];
  for (const dl of deadlines) {
    if (dl.days_until === 0) {
      triage.urgent.push({ text: `${dl.name} — ${dl.class_name}`, detail: 'Hoy' });
    } else if (dl.days_until === 1) {
      triage.urgent.push({ text: `${dl.name} — ${dl.class_name}`, detail: 'Mañana' });
    }
  }

  const gradeAlerts = prep.grade_alerts || [];
  for (const alert of gradeAlerts) {
    if (alert.trend === 'declining') {
      triage.urgent.push({ text: `${alert.student_name} bajando (${alert.avg_grade?.toFixed(1)})`, detail: alert.class_name });
    }
  }

  const tasks = prep.pending_tasks || [];
  for (const task of tasks) {
    if (task.count > 0) {
      triage.pending.push({ text: task.description });
    }
  }
  for (const dl of deadlines) {
    if (dl.days_until > 1 && dl.days_until <= 3) {
      triage.pending.push({ text: `${dl.name} — ${dl.class_name}`, detail: `En ${dl.days_until} días` });
    }
  }

  const breakdowns = prep.class_breakdowns || [];
  for (const cls of breakdowns) {
    for (const h of (cls.positive_highlights || [])) {
      triage.positive.push({ text: `${h.name}: ${h.achievement}`, detail: cls.class_name });
    }
  }
  for (const alert of gradeAlerts) {
    if (alert.trend === 'improving') {
      triage.positive.push({ text: `${alert.student_name} mejorando (${alert.avg_grade?.toFixed(1)})`, detail: alert.class_name });
    }
  }

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
  const [error, setError] = useState<string | null>(null);
  const [autoGenerateTriggered, setAutoGenerateTriggered] = useState(false);
  const navigate = useNavigate();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const currentPreparation = useCalendarStore((s) => s.currentPreparation);
  const preparationLoading = useCalendarStore((s) => s.preparationLoading);
  const generatePreparation = useCalendarStore((s) => s.generatePreparation);
  const getPreparation = useCalendarStore((s) => s.getPreparation);
  const clearPreparation = useCalendarStore((s) => s.clearPreparation);
  const events = useCalendarStore((s) => s.events);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);

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

  // Load preparation and events when modal opens or date changes
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setExpandedClasses(new Set());
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
      activeDate === toDateStr(new Date())
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
    navigate(path);
  }, [onDismiss, history]);

  /** Build the base path for routing */
  const classBasePath = useCallback((classId: string, subjectId?: string | null) => {
    if (subjectId) return `/tabs/classes/${classId}/subjects/${subjectId}`;
    return '/tabs/classes';
  }, []);

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

    breakdowns.sort((a: any, b: any) => {
      const ta = a.start_time || '99:99';
      const tb = b.start_time || '99:99';
      return ta.localeCompare(tb);
    });

    return breakdowns;
  }, [currentPreparation, activeDate]);

  /** Unified timeline: class breakdowns + other events sorted by time */
  const timelineItems = useMemo(() => {
    const items: any[] = [...enrichedBreakdowns];

    for (const ev of otherEvents) {
      items.push({
        _type: 'event' as const,
        _event: ev,
        start_time: ev.startTime || null,
      });
    }

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
    <Modal open={isOpen} onClose={onDismiss} sheetHeight="lg">
      <div className="prepare-modal__header">
        
          <h2 className="text-base font-semibold">Prepara tu día</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" className="prepare-modal__close" onClick={onDismiss} aria-label="Cerrar">
              <X size={18} />
            </Button>
          </div>
        
      </div>

      <div className="prepare-modal__content">
        {/* Date navigator */}
        <div className="prepare-modal__date-nav">
          <button className="prepare-modal__date-nav-btn" onClick={() => shiftDate(-1)} aria-label="Día anterior">
            <ChevronLeft size={18} />
          </button>
          <div className="prepare-modal__date-center-group">
            <div className="prepare-modal__date-center-text">
              <span className="prepare-modal__date-label">{formatDate(activeDate)}</span>
              <span className="prepare-modal__date-full">{formatDateShort(activeDate)}</span>
            </div>
          </div>
          <button className="prepare-modal__date-nav-btn" onClick={() => shiftDate(1)} aria-label="Día siguiente">
            <ChevronRight size={18} />
          </button>
          <label className="prepare-modal__date-calendar-btn" aria-label="Seleccionar fecha">
            <Calendar size={18} />
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

        {/* Loading State — only show AI animation for today */}
        {preparationLoading && isToday && (
          <PrepareLoadingAnimation />
        )}
        {preparationLoading && !isToday && (
          <div className="prepare-modal__loading-simple">
            <div className="prepare-modal__loading-simple-spinner" />
            <p>Cargando preparación...</p>
          </div>
        )}

        {/* Error State */}
        {error && !preparationLoading && (
          <div className="prepare-modal__error">
            <p>{error}</p>
            <button className="prepare-modal__btn" onClick={handleGenerate}>
              Reintentar
            </button>
          </div>
        )}

        {/* Empty state — no preparation exists */}
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
                    <Textarea value={focusTopics} onChange={(e) => setFocusTopics(e.target.value || '')} placeholder="Ej: Repasar fracciones, preparar examen..." rows={2} />
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

        {/* ═══ Main content when preparation is loaded ═══ */}
        {currentPreparation && !preparationLoading && (
          <div className="prepare-modal__result">

            {/* Summary bullets */}
            {currentPreparation.summary && (
              <div className="prepare-modal__summary-card">
                {currentPreparation.summary.split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => (
                  <p key={i} className="prepare-modal__summary-line">{line.replace(/^[•\-–]\s*/, '')}</p>
                ))}
              </div>
            )}

            {/* Priority triage */}
            {hasTriageContent && (
              <div className="prepare-modal__triage">
                {triage.urgent.length > 0 && (
                  <div className="prepare-modal__triage-row prepare-modal__triage-row--urgent">
                    <span className="prepare-modal__triage-label">URGENTE</span>
                    <div className="prepare-modal__triage-items">
                      {triage.urgent.map((item, i) => (
                        <div key={i} className="prepare-modal__triage-item">
                          <span>{item.text}</span>
                          {item.detail && <span className="prepare-modal__triage-meta">{item.detail}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {triage.positive.length > 0 && (
                  <div className="prepare-modal__triage-row prepare-modal__triage-row--positive">
                    <span className="prepare-modal__triage-label">POSITIVO</span>
                    <div className="prepare-modal__triage-items">
                      {triage.positive.map((item, i) => (
                        <div key={i} className="prepare-modal__triage-item">
                          <span>{item.text}</span>
                          {item.detail && <span className="prepare-modal__triage-meta">{item.detail}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Timeline: classes + events */}
        {!preparationLoading && timelineItems.length > 0 && !error && (
          <div className="prepare-modal__section">
            <h3 className="prepare-modal__section-title">TU JORNADA</h3>
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
                            null
                          )}
                        </div>
                        {idx < timelineItems.length - 1 && <div className="prepare-modal__timeline-line" />}
                      </div>
                      <div className={`prepare-modal__timeline-card prepare-modal__timeline-card--event prepare-modal__timeline-card--${ev.eventType}`}>
                        <div className="prepare-modal__timeline-event-body">
                          <div className="prepare-modal__timeline-event-header">
                            <span className="prepare-modal__class-name">{ev.title}</span>
                            {ev.eventType === 'tutoring' && (
                              <span className="prepare-modal__event-badge">Tutoría</span>
                            )}
                          </div>
                          {(ev.startTime || ev.endTime) && (
                            <div className="prepare-modal__event-time">
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

                return (
                  <div key={classKey} className="prepare-modal__timeline-item">
                    <div className="prepare-modal__timeline-rail">
                      <div className={`prepare-modal__timeline-dot ${alertCount > 0 ? 'prepare-modal__timeline-dot--alert' : ''}`}>
                        {cls.start_time ? (
                          <span className="prepare-modal__timeline-time">{cls.start_time}</span>
                        ) : (
                          <School size={18} />
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
                            <span
                              className="prepare-modal__class-name prepare-modal__link"
                              onClick={(e) => { e.stopPropagation(); navigateTo(classBasePath(cls.class_id, cls.subject_id)); }}
                            >
                              {cls.class_name}
                            </span>
                            {cls.subject && (
                              <span className="prepare-modal__class-subject">{cls.subject}</span>
                            )}
                          </div>
                          <div className="prepare-modal__class-badges">
                            {cls.aula && (
                              <span className="prepare-modal__badge">
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
                                {alertCount} {alertCount === 1 ? 'alerta' : 'alertas'}
                              </span>
                            )}
                          </div>
                          {/* Peek at student alerts when collapsed */}
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
                        {isExpanded ? <ChevronUp size={18} className="shrink-0 text-muted-foreground" /> : <ChevronDown size={18} className="shrink-0 text-muted-foreground" />}
                      </button>

                      {isExpanded && (
                        <div className="prepare-modal__class-details">
                          {/* Plan session */}
                          {cls.plan_session && (
                            <div className="prepare-modal__detail prepare-modal__detail--plan">
                              <strong>Sesión planificada</strong>
                              <div className="prepare-modal__plan-content">
                                <span className="prepare-modal__plan-topic">{cls.plan_session.topic_name}</span>
                                {cls.plan_session.session_title && <span className="prepare-modal__plan-subtitle">{cls.plan_session.session_title}</span>}
                                {cls.plan_session.focus && <span className="prepare-modal__plan-focus">{cls.plan_session.focus}</span>}
                                {cls.plan_session.key_points && cls.plan_session.key_points.length > 0 && (
                                  <div className="prepare-modal__tags">
                                    {cls.plan_session.key_points.map((kp: string, i: number) => (
                                      <span key={i} className="prepare-modal__tag">{kp}</span>
                                    ))}
                                  </div>
                                )}
                                {cls.plan_session.topic_pdf_url && (
                                  <button
                                    className="prepare-modal__action-btn"
                                    onClick={() => window.open(`${import.meta.env.VITE_API_URL || ''}/files${cls.plan_session.topic_pdf_url}`, '_blank')}
                                  >
                                    Ver material
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Upcoming plan exam */}
                          {cls.upcoming_plan_exam && (
                            <div className="prepare-modal__detail prepare-modal__detail--exam-alert">
                              <strong>Examen próximo</strong>
                              <div className="prepare-modal__exam-alert-content">
                                <div className="prepare-modal__exam-alert-header">
                                  <span>{cls.upcoming_plan_exam.name}</span>
                                  <span className="prepare-modal__exam-alert-days">
                                    en {cls.upcoming_plan_exam.days_until} {cls.upcoming_plan_exam.days_until === 1 ? 'día' : 'días'}
                                  </span>
                                </div>
                                <span className="prepare-modal__exam-alert-topics">{cls.upcoming_plan_exam.topic_names.join(', ')}</span>
                                {cls.class_id && (
                                  <button
                                    className="prepare-modal__action-btn prepare-modal__action-btn--primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const base = classBasePath(cls.class_id, cls.subject_id);
                                      navigateTo(`${base}/exams/new?name=${encodeURIComponent(cls.upcoming_plan_exam.name)}&date=${cls.upcoming_plan_exam.date}`);
                                    }}
                                  >
                                    <Pencil size={18} /> Crear examen con IA
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Topics to cover */}
                          {cls.topics_to_cover && cls.topics_to_cover.length > 0 && (
                            <div className="prepare-modal__detail">
                              <strong>Temas a reforzar</strong>
                              <ul>
                                {cls.topics_to_cover.map((topic: string, i: number) => (
                                  <li key={i}>{topic}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Student alerts */}
                          {cls.student_alerts && cls.student_alerts.length > 0 && (
                            <div className="prepare-modal__detail prepare-modal__detail--alert">
                              <strong>Alumnos a atender</strong>
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

                          {/* Grade alerts */}
                          {cls.grade_alerts && cls.grade_alerts.length > 0 && (
                            <div className="prepare-modal__detail prepare-modal__detail--grade-alert">
                              <strong>Alertas de rendimiento</strong>
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
                                      {alert.trend && alert.trend === 'improving' && (
                                        <TrendingUp size={14} className="text-success" />
                                      )}
                                      {alert.trend && alert.trend === 'declining' && (
                                        <TrendingDown size={14} className="text-danger" />
                                      )}
                                    </div>
                                    <span className="prepare-modal__student-reason">{alert.issue}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Exercises today */}
                          {cls.exercises_today && cls.exercises_today.length > 0 && (
                            <div className="prepare-modal__detail">
                              <strong>Ejercicios hoy</strong>
                              <ul>
                                {cls.exercises_today.map((ex: any, i: number) => (
                                  <li key={i}>
                                    {ex.type === 'deliver' ? 'Entregar' : 'Recoger'} — {ex.student}: {ex.exercise}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Weak points */}
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

                          {/* Positive highlights */}
                          {cls.positive_highlights && cls.positive_highlights.length > 0 && (
                            <div className="prepare-modal__detail prepare-modal__detail--positive">
                              <strong>Destacados</strong>
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

                          {/* Suggestions */}
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

                          {/* Recent comments */}
                          {cls.recent_comments && cls.recent_comments.length > 0 && (
                            <div className="prepare-modal__detail">
                              <strong>Comentarios recientes</strong>
                              <ul>
                                {cls.recent_comments.map((comment: string, i: number) => (
                                  <li key={i}>{comment}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* ═══ Quick action buttons ═══ */}
                          {cls.class_id && (
                            <div className="prepare-modal__class-actions">
                              <button
                                className="prepare-modal__action-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateTo(`${classBasePath(cls.class_id, cls.subject_id)}/topics`);
                                }}
                              >
                                <BookOpen size={18} /> Temario
                              </button>
                              <button
                                className="prepare-modal__action-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateTo(`${classBasePath(cls.class_id, cls.subject_id)}/exams/new`);
                                }}
                              >
                                <Pencil size={18} /> Crear examen
                              </button>
                              <button
                                className="prepare-modal__action-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateTo(`${classBasePath(cls.class_id, cls.subject_id)}/exercises`);
                                }}
                              >
                                <Dumbbell size={18} /> Ejercicios
                              </button>
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

        {/* Upcoming Deadlines */}
        {currentPreparation && !preparationLoading && currentPreparation.upcoming_deadlines && currentPreparation.upcoming_deadlines.length > 0 && (
          <div className="prepare-modal__section">
            <h3 className="prepare-modal__section-title">PRÓXIMOS PLAZOS</h3>
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
        {currentPreparation && !preparationLoading && currentPreparation.pending_tasks && currentPreparation.pending_tasks.length > 0 && (
          <div className="prepare-modal__section">
            <h3 className="prepare-modal__section-title">TAREAS PENDIENTES</h3>
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

        {/* Regenerate */}
        {currentPreparation && !preparationLoading && (
          <div className="prepare-modal__footer">
            <button className="prepare-modal__regenerate" onClick={handleRegenerate}>
              <RefreshCw size={18} />
              Regenerar con otros temas
            </button>

            {showFocusInput && (
              <div className="prepare-modal__regenerate-form" ref={regenerateFormRef}>
                <Textarea value={focusTopics} onChange={(e) => setFocusTopics(e.target.value || '')} placeholder="Ej: Quiero enfocarme en preparar el examen de la próxima semana..." rows={2} />
                <button className="prepare-modal__btn" onClick={handleGenerate}>
                  Regenerar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PrepareYourDayModal;
