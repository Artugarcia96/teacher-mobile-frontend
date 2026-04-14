import { useState, useEffect, useMemo } from 'react';
import { ArrowRight, Plus, BookOpen, Pencil, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import Spinner from '@/components/shared/Spinner';
import Modal from '@/components/shared/Modal';
import { parseEventNotes } from '../utils/parseEventNotes';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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
      navigate(`/tabs/classes/${existingEvent.classId}/subjects/${subjectId}`);
    } else {
      navigate('/tabs/classes');
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
    <Modal
      open={isOpen}
      onClose={onDismiss}
      sheetHeight="lg"
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
                <ArrowRight size={18} />
                Ir a la asignatura
              </button>
            )}
            {existingEvent.topicPdfUrl && (
              <button className="ev-editor__quick-btn ev-editor__quick-btn--accent" onClick={() => {
                window.open(`${import.meta.env.VITE_API_URL || ''}/files${existingEvent.topicPdfUrl}`, '_blank');
              }}>
                <BookOpen size={18} />
                Ver material
              </button>
            )}
            {isClassSession && existingEvent.subjectId && (() => {
              const parsed = parseEventNotes(existingEvent.notes);
              if (!parsed.isPlanEvent) return null;
              return (
                <button className="ev-editor__quick-btn ev-editor__quick-btn--accent" onClick={() => {
                  onDismiss();
                  navigate(`/tabs/classes/${existingEvent.classId}/subjects/${existingEvent.subjectId}/exercises?generate=1`);
                }}>
                  <Sparkles size={18} />
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
                  navigate(`/tabs/classes/${existingEvent.classId}/subjects/${existingEvent.subjectId}/exams/new?${params}`);
                }}>
                  <Pencil size={18} />
                  Crear examen con IA
                </button>
              );
            })()}
          </div>
        )}

        <div className="ev-editor__field">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Título</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título del evento"
          />
        </div>

        {!existingEvent && (
          <>
            <div className="ev-editor__field">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de evento</label>
              <Select value={eventType} onValueChange={(v) => handleEventTypeChange(v as 'class_session' | 'custom' | 'tutoring')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Evento personalizado</SelectItem>
                  <SelectItem value="class_session">Sesión de clase</SelectItem>
                  <SelectItem value="tutoring">Tutoría</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {eventType === 'class_session' && (
              <div className="ev-editor__field">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Clase</label>
                <Select value={classId} onValueChange={(v) => handleClassChange(v)}>
                  <SelectTrigger><SelectValue placeholder="Selecciona una clase" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} — {c.subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        <div className="ev-editor__field">
          <label className="block text-xs font-medium text-muted-foreground mb-1">Fecha</label>
          <Input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </div>

        <div className="ev-editor__row">
          <div className="ev-editor__field ev-editor__field--half">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Inicio</label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="ev-editor__field ev-editor__field--half">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Fin</label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
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
                {savingObservation ? <Spinner size={16} /> : <Plus size={22} />}
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

        <Button
          className="w-full ev-editor__save"
          onClick={handleSave}
          disabled={saving || !title.trim() || !eventDate}
        >
          {saving ? <Spinner size={18} /> : 'Guardar'}
        </Button>

        {existingEvent && (
          <div className="ev-editor__actions">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
            >
              {existingEvent.isCancelled ? 'Reactivar' : 'Cancelar sesión'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
            >
              Eliminar
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default EventEditorSheet;
