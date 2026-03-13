import { useState, useEffect, useMemo } from 'react';
import { IonModal, IonContent, IonIcon, IonTextarea } from '@ionic/react';
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
  peopleOutline,
  timeOutline,
  documentTextOutline,
  analyticsOutline,
} from 'ionicons/icons';
import { useCalendarStore } from '../store/calendarStore';
import './PrepareYourDayModal.css';

interface PrepareYourDayModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  date: string;
}

const PrepareYourDayModal: React.FC<PrepareYourDayModalProps> = ({ isOpen, onDismiss, date }) => {
  const [focusTopics, setFocusTopics] = useState('');
  const [showFocusInput, setShowFocusInput] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const currentPreparation = useCalendarStore((s) => s.currentPreparation);
  const preparationLoading = useCalendarStore((s) => s.preparationLoading);
  const generatePreparation = useCalendarStore((s) => s.generatePreparation);
  const getPreparation = useCalendarStore((s) => s.getPreparation);
  const clearPreparation = useCalendarStore((s) => s.clearPreparation);
  const events = useCalendarStore((s) => s.events);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);

  const dayEvents = useMemo(() => {
    return events.filter((e) => e.date === date && !e.isCancelled);
  }, [events, date]);

  const otherEvents = useMemo(() => {
    return dayEvents.filter((e) => e.eventType !== 'class_session');
  }, [dayEvents]);

  const classSessions = useMemo(() => {
    return dayEvents.filter((e) => e.eventType === 'class_session');
  }, [dayEvents]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      getPreparation(date);
      fetchEvents(date, date);
    }
  }, [isOpen, date, getPreparation, fetchEvents]);

  const handleGenerate = async () => {
    setError(null);
    try {
      await generatePreparation(date, focusTopics || undefined);
      setShowFocusInput(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Error al generar la preparación');
    }
  };

  const handleRegenerate = () => {
    setShowFocusInput(true);
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
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (dateStr === todayStr) return 'Hoy';
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

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

      <IonContent className="prepare-modal__content">
        <p className="prepare-modal__date">{formatDate(date)}</p>

        {/* Loading State - Enhanced */}
        {preparationLoading && (
          <div className="prepare-modal__loading">
            <div className="prepare-modal__loading-visual">
              <div className="prepare-modal__loading-bg" />
              <div className="prepare-modal__loading-icon">
                <IonIcon icon={sparkles} />
              </div>
              <div className="prepare-modal__loading-particles">
                <span className="prepare-modal__loading-particle" />
                <span className="prepare-modal__loading-particle" />
                <span className="prepare-modal__loading-particle" />
                <span className="prepare-modal__loading-particle" />
                <span className="prepare-modal__loading-particle" />
              </div>
            </div>
            <p className="prepare-modal__loading-text">Preparando tu jornada</p>
            <p className="prepare-modal__loading-hint">La IA está analizando tus clases, correcciones recientes y notas</p>
            <div className="prepare-modal__loading-steps">
              <div className="prepare-modal__loading-step active">
                <IonIcon icon={schoolOutline} />
                <span>Analizando clases del día</span>
              </div>
              <div className="prepare-modal__loading-step">
                <IonIcon icon={documentTextOutline} />
                <span>Revisando correcciones</span>
              </div>
              <div className="prepare-modal__loading-step">
                <IonIcon icon={analyticsOutline} />
                <span>Generando recomendaciones</span>
              </div>
            </div>
          </div>
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
              La IA analizará tus clases de hoy, correcciones recientes, y notas 
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

        {/* Today's Events Overview - always show when open */}
        {!preparationLoading && (otherEvents.length > 0 || classSessions.length > 0) && (
          <div className="prepare-modal__events-overview">
            <h3 className="prepare-modal__section-title">
              <IonIcon icon={calendarOutline} />
              Eventos del día
            </h3>
            
            {classSessions.length > 0 && (
              <div className="prepare-modal__event-count">
                <IonIcon icon={schoolOutline} />
                <span>{classSessions.length} {classSessions.length === 1 ? 'clase programada' : 'clases programadas'}</span>
              </div>
            )}

            {otherEvents.length > 0 && (
              <div className="prepare-modal__other-events">
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
                        Alumno: {ev.studentName}
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

            {/* Class Breakdowns */}
            {currentPreparation.class_breakdowns && currentPreparation.class_breakdowns.length > 0 && (
              <div className="prepare-modal__section">
                <h3 className="prepare-modal__section-title">
                  <IonIcon icon={schoolOutline} />
                  Clases de hoy
                </h3>
                {currentPreparation.class_breakdowns.map((cls: any) => (
                  <div key={cls.class_id || cls.class_name} className="prepare-modal__class">
                    <button 
                      className="prepare-modal__class-header"
                      onClick={() => toggleClassExpanded(cls.class_id || cls.class_name)}
                    >
                      <div className="prepare-modal__class-info">
                        <span className="prepare-modal__class-name">{cls.class_name}</span>
                        {cls.start_time && (
                          <span className="prepare-modal__class-time">{cls.start_time}</span>
                        )}
                      </div>
                      <IonIcon 
                        icon={expandedClasses.has(cls.class_id || cls.class_name) ? chevronUpOutline : chevronDownOutline} 
                      />
                    </button>
                    
                    {expandedClasses.has(cls.class_id || cls.class_name) && (
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
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {cls.class_weak_points && cls.class_weak_points.length > 0 && (
                          <div className="prepare-modal__detail">
                            <strong>Puntos débiles de la clase:</strong>
                            <div className="prepare-modal__tags">
                              {cls.class_weak_points.map((point: string, i: number) => (
                                <span key={i} className="prepare-modal__tag">{point}</span>
                              ))}
                            </div>
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
                ))}
              </div>
            )}

            {/* Grade Alerts */}
            {currentPreparation.grade_alerts && currentPreparation.grade_alerts.length > 0 && (
              <div className="prepare-modal__section">
                <h3 className="prepare-modal__section-title prepare-modal__section-title--warning">
                  <IonIcon icon={alertCircleOutline} />
                  Alertas de rendimiento
                </h3>
                <div className="prepare-modal__alerts">
                  {currentPreparation.grade_alerts.map((alert: any, i: number) => (
                    <div key={i} className="prepare-modal__alert">
                      <span className="prepare-modal__alert-name">{alert.student_name}</span>
                      <span className="prepare-modal__alert-class">{alert.class_name}</span>
                      <span className="prepare-modal__alert-issue">{alert.issue}</span>
                    </div>
                  ))}
                </div>
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
              <div className="prepare-modal__regenerate-form">
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
      </IonContent>
    </IonModal>
  );
};

export default PrepareYourDayModal;
