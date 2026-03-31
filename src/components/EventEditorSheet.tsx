import { useState, useEffect, useMemo } from 'react';
import {
  IonModal, IonButton, IonSelect, IonSelectOption, IonItem, IonLabel,
  IonInput, IonSpinner, IonIcon,
} from '@ionic/react';
import { arrowForwardOutline, personOutline, addOutline, bookOutline, createOutline, sparkles } from 'ionicons/icons';
import { parseEventNotes } from '../utils/parseEventNotes';
import { useHistory } from 'react-router-dom';
import { CalendarEvent, MentionedStudent } from '../types';
import { useClassesStore } from '../store/classesStore';
import { useCalendarStore } from '../store/calendarStore';
import { useCommentsStore } from '../store/commentsStore';
import { useIsDesktop } from '../hooks/useIsDesktop';
import MentionTextarea from './MentionTextarea';
import './EventEditorSheet.css';

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  existingEvent?: CalendarEvent | null;
  defaultDate?: string;
}

const EventEditorSheet: React.FC<Props> = ({ isOpen, onDismiss, existingEvent, defaultDate }) => {
  const isDesktop = useIsDesktop();
  const history = useHistory();
  const allClasses = useClassesStore((s) => s.classes);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  const createEvent = useCalendarStore((s) => s.createEvent);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const eventObservations = useCommentsStore((s) => s.eventObservations);
  const fetchEventObservations = useCommentsStore((s) => s.fetchEventObservations);
  const createEventObservation = useCommentsStore((s) => s.createEventObservation);

  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [eventType, setEventType] = useState<'class_session' | 'custom' | 'tutoring'>('custom');
  const [classId, setClassId] = useState('');
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);
  const [newObservation, setNewObservation] = useState('');
  const [savingObservation, setSavingObservation] = useState(false);

  // Mention state for new event observations
  const [obsMentions, setObsMentions] = useState<MentionedStudent[]>([]);
  // Mention state for add-observation on existing event
  const [newObsMentions, setNewObsMentions] = useState<MentionedStudent[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (existingEvent) {
        setTitle(existingEvent.title);
        setEventDate(existingEvent.date);
        setStartTime(existingEvent.startTime || '');
        setEndTime(existingEvent.endTime || '');
        setEventType(existingEvent.eventType as 'class_session' | 'custom' | 'tutoring');
        setClassId(existingEvent.classId || '');
        setObservations(existingEvent.notes || '');
        setNewObservation('');
        setNewObsMentions([]);
        setObsMentions(existingEvent.mentionedStudents || []);
        fetchEventObservations(existingEvent.id);
      } else {
        setTitle('');
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        setEventDate(defaultDate || todayStr);
        setStartTime('');
        setEndTime('');
        setEventType('custom');
        setClassId('');
        setObservations('');
        setObsMentions([]);
        setNewObsMentions([]);
      }
    }
  }, [isOpen, existingEvent, defaultDate]);

  const handleGoToSubject = async () => {
    if (!existingEvent?.classId) return;
    onDismiss();
    let subjectId = existingEvent.subjectId;
    if (!subjectId && existingEvent.classSubject) {
      let subjects = classSubjects[existingEvent.classId];
      if (!subjects) {
        subjects = await fetchClassSubjects(existingEvent.classId);
      }
      const match = subjects?.find((s) => s.subjectName === existingEvent.classSubject);
      if (match) subjectId = match.subjectId;
    }
    if (subjectId) {
      history.push(`/tabs/classes/${existingEvent.classId}/subjects/${subjectId}`);
    } else {
      history.push(`/tabs/classes/${existingEvent.classId}`);
    }
  };

  const handleAddObservation = async () => {
    if (!existingEvent || !newObservation.trim()) return;
    setSavingObservation(true);
    try {
      await createEventObservation({
        event_id: existingEvent.id,
        text: newObservation.trim(),
        mentioned_student_ids: newObsMentions.map((s) => s.id),
      });
      setNewObservation('');
      setNewObsMentions([]);
    } catch (err) {
      console.error('Failed to save observation:', err);
    } finally {
      setSavingObservation(false);
    }
  };

  const handleClassChange = (id: string) => {
    setClassId(id);
    if (id) {
      const cls = classes.find((c) => c.id === id);
      if (cls && !title) {
        setTitle(`${cls.name} — ${cls.subject}`);
      }
      if (eventType === 'custom') {
        setEventType('class_session');
      }
    }
  };

  const handleEventTypeChange = (type: 'class_session' | 'custom' | 'tutoring') => {
    setEventType(type);
    if (type !== 'class_session') {
      setClassId('');
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !eventDate) return;
    setSaving(true);
    try {
      if (existingEvent) {
        await updateEvent(existingEvent.id, {
          title: title.trim(),
          event_date: eventDate,
          start_time: startTime || undefined,
          end_time: endTime || undefined,
          mentioned_student_ids: obsMentions.map((s) => s.id),
        });
      } else {
        await createEvent({
          class_id: classId || undefined,
          title: title.trim(),
          event_date: eventDate,
          start_time: startTime || undefined,
          end_time: endTime || undefined,
          event_type: eventType,
          notes: observations || undefined,
          mentioned_student_ids: obsMentions.map((s) => s.id),
        });
      }
      onDismiss();
    } catch (err) {
      console.error('Failed to save event:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingEvent) return;
    setSaving(true);
    try {
      await deleteEvent(existingEvent.id);
      onDismiss();
    } catch (err) {
      console.error('Failed to delete event:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!existingEvent) return;
    setSaving(true);
    try {
      await updateEvent(existingEvent.id, { is_cancelled: !existingEvent.isCancelled });
      onDismiss();
    } catch (err) {
      console.error('Failed to toggle cancel:', err);
    } finally {
      setSaving(false);
    }
  };

  const isClassSession = existingEvent?.eventType === 'class_session' && existingEvent?.classId;

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      initialBreakpoint={isDesktop ? 1 : 0.65}
      breakpoints={isDesktop ? [0, 1] : [0, 0.65, 0.85]}
    >
      <div className="ev-editor">
        <h2 className="ev-editor__title">
          {existingEvent ? 'Editar evento' : 'Nuevo evento'}
        </h2>

        {/* Quick actions for existing events */}
        {existingEvent && (isClassSession || existingEvent.eventType === 'exam') && (
          <div className="ev-editor__quick-actions">
            {isClassSession && (
              <button className="ev-editor__quick-btn" onClick={handleGoToSubject}>
                <IonIcon icon={arrowForwardOutline} />
                Ir a la asignatura
              </button>
            )}
            {existingEvent.topicPdfUrl && (
              <button className="ev-editor__quick-btn ev-editor__quick-btn--accent" onClick={() => {
                window.open(`${import.meta.env.VITE_API_URL || ''}/files${existingEvent.topicPdfUrl}`, '_blank');
              }}>
                <IonIcon icon={bookOutline} />
                Ver material
              </button>
            )}
            {isClassSession && existingEvent.subjectId && (() => {
              const parsed = parseEventNotes(existingEvent.notes);
              if (!parsed.isPlanEvent) return null;
              return (
                <button className="ev-editor__quick-btn ev-editor__quick-btn--accent" onClick={() => {
                  onDismiss();
                  history.push(`/tabs/classes/${existingEvent.classId}/subjects/${existingEvent.subjectId}/exercises?generate=1`);
                }}>
                  <IonIcon icon={sparkles} />
                  Ejercicios
                </button>
              );
            })()}
            {existingEvent.eventType === 'exam' && !existingEvent.examId && (() => {
              const parsed = parseEventNotes(existingEvent.notes);
              if (!parsed.isPlanEvent) return null;
              return (
                <button className="ev-editor__quick-btn ev-editor__quick-btn--accent" onClick={() => {
                  onDismiss();
                  const params = new URLSearchParams();
                  if (parsed.topicIds.length) params.set('topicIds', parsed.topicIds.join(','));
                  params.set('date', existingEvent.date);
                  params.set('name', existingEvent.title);
                  history.push(`/tabs/classes/${existingEvent.classId}/subjects/${existingEvent.subjectId}/exams/new?${params}`);
                }}>
                  <IonIcon icon={createOutline} />
                  Crear examen con IA
                </button>
              );
            })()}
          </div>
        )}

        <IonItem lines="none" className="ev-editor__field">
          <IonInput
            value={title}
            onIonInput={(e) => setTitle(e.detail.value ?? '')}
            placeholder="Título del evento"
            label="Título"
            labelPlacement="stacked"
          />
        </IonItem>

        {!existingEvent && (
          <>
            <IonItem lines="none" className="ev-editor__field">
              <IonLabel position="stacked">Tipo de evento</IonLabel>
              <IonSelect
                value={eventType}
                onIonChange={(e) => handleEventTypeChange(e.detail.value)}
                interface="popover"
              >
                <IonSelectOption value="custom">Evento personalizado</IonSelectOption>
                <IonSelectOption value="class_session">Sesión de clase</IonSelectOption>
                <IonSelectOption value="tutoring">Tutoría</IonSelectOption>
              </IonSelect>
            </IonItem>

            {eventType === 'class_session' && (
              <IonItem lines="none" className="ev-editor__field">
                <IonLabel position="stacked">Clase</IonLabel>
                <IonSelect
                  value={classId}
                  onIonChange={(e) => handleClassChange(e.detail.value)}
                  interface="popover"
                  placeholder="Selecciona una clase"
                >
                  {classes.map((c) => (
                    <IonSelectOption key={c.id} value={c.id}>
                      {c.name} — {c.subject}
                    </IonSelectOption>
                  ))}
                </IonSelect>
              </IonItem>
            )}
          </>
        )}

        <IonItem lines="none" className="ev-editor__field">
          <IonInput
            type="date"
            value={eventDate}
            onIonInput={(e) => setEventDate(e.detail.value ?? '')}
            label="Fecha"
            labelPlacement="stacked"
          />
        </IonItem>

        <div className="ev-editor__row">
          <IonItem lines="none" className="ev-editor__field ev-editor__field--half">
            <IonInput
              type="time"
              value={startTime}
              onIonInput={(e) => setStartTime(e.detail.value ?? '')}
              label="Inicio"
              labelPlacement="stacked"
            />
          </IonItem>
          <IonItem lines="none" className="ev-editor__field ev-editor__field--half">
            <IonInput
              type="time"
              value={endTime}
              onIonInput={(e) => setEndTime(e.detail.value ?? '')}
              label="Fin"
              labelPlacement="stacked"
            />
          </IonItem>
        </div>

        {existingEvent ? (
          <div className="ev-editor__observations">
            <div className="ev-editor__obs-header">
              <span className="ev-editor__obs-label">Observaciones</span>
              {(eventObservations.length > 0 || existingEvent.notes) && (
                <span className="ev-editor__obs-count">
                  {eventObservations.length + (existingEvent.notes ? 1 : 0)}
                </span>
              )}
            </div>

            {(eventObservations.length > 0 || existingEvent.notes) && (
              <div className="ev-editor__obs-list">
                {existingEvent.notes && (() => {
                  const parsed = parseEventNotes(existingEvent.notes);
                  return parsed.isPlanEvent ? (
                    <div className="ev-editor__plan-info">
                      {parsed.focus && <p className="ev-editor__plan-focus">{parsed.focus}</p>}
                      {parsed.keyPoints.length > 0 && (
                        <div className="ev-editor__plan-kp">
                          <span className="ev-editor__plan-kp-label">Puntos clave</span>
                          {parsed.keyPoints.map((kp, i) => (
                            <span key={i} className="ev-editor__plan-kp-tag">{kp}</span>
                          ))}
                        </div>
                      )}
                      {parsed.contents.length > 0 && (
                        <div className="ev-editor__plan-contents">
                          <span className="ev-editor__plan-kp-label">Contenidos</span>
                          <span className="ev-editor__plan-contents-text">{parsed.contents.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="ev-editor__obs-item">
                      <span className="ev-editor__obs-text">{existingEvent.notes}</span>
                    </div>
                  );
                })()}
                {eventObservations.map((obs) => (
                  <div key={obs.id} className="ev-editor__obs-item">
                    <span className="ev-editor__obs-text">{obs.text}</span>
                    <span className="ev-editor__obs-date">
                      {new Date(obs.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      {' '}
                      {new Date(obs.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="ev-editor__obs-add ev-editor__obs-mention">
              <MentionTextarea
                value={newObservation}
                onChange={setNewObservation}
                mentionedStudents={newObsMentions}
                onMentionsChange={setNewObsMentions}
                placeholder="Añadir observación... Usa @ para mencionar alumnos"
                rows={2}
                helperText="Usa @ para referenciar alumnos"
                classId={classId || undefined}
              />
              <button
                className="ev-editor__obs-add-btn"
                onClick={handleAddObservation}
                disabled={savingObservation || !newObservation.trim()}
              >
                {savingObservation ? <IonSpinner name="dots" /> : <IonIcon icon={addOutline} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="ev-editor__field ev-editor__field--mention">
            <label className="ev-editor__mention-label">Observaciones (opcional)</label>
            <MentionTextarea
              value={observations}
              onChange={setObservations}
              mentionedStudents={obsMentions}
              onMentionsChange={setObsMentions}
              placeholder="Escribe observaciones... Usa @ para mencionar alumnos"
              rows={2}
              helperText="Usa @ para referenciar alumnos — aparecerá en su ficha"
              classId={classId || undefined}
            />
          </div>
        )}

        <IonButton
          expand="block"
          className="ev-editor__save"
          onClick={handleSave}
          disabled={saving || !title.trim() || !eventDate}
        >
          {saving ? <IonSpinner name="crescent" /> : 'Guardar'}
        </IonButton>

        {existingEvent && (
          <div className="ev-editor__actions">
            <IonButton
              fill="outline"
              color="medium"
              size="small"
              onClick={handleCancel}
              disabled={saving}
            >
              {existingEvent.isCancelled ? 'Reactivar' : 'Cancelar sesión'}
            </IonButton>
            <IonButton
              fill="outline"
              color="danger"
              size="small"
              onClick={handleDelete}
              disabled={saving}
            >
              Eliminar
            </IonButton>
          </div>
        )}
      </div>
    </IonModal>
  );
};

export default EventEditorSheet;
