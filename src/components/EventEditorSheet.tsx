import { useState, useEffect, useMemo } from 'react';
import {
  IonModal, IonButton, IonSelect, IonSelectOption, IonItem, IonLabel,
  IonInput, IonTextarea, IonSpinner, IonIcon, IonSearchbar, IonList, IonRadioGroup, IonRadio,
} from '@ionic/react';
import { arrowForwardOutline, chatbubbleOutline, checkmarkOutline, personOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { CalendarEvent } from '../types';
import { useClassesStore } from '../store/classesStore';
import { useStudentsStore } from '../store/studentsStore';
import { useCalendarStore } from '../store/calendarStore';
import { useNotesStore } from '../store/notesStore';
import './EventEditorSheet.css';

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  existingEvent?: CalendarEvent | null;
  defaultDate?: string;
}

const EventEditorSheet: React.FC<Props> = ({ isOpen, onDismiss, existingEvent, defaultDate }) => {
  const history = useHistory();
  const allClasses = useClassesStore((s) => s.classes);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  const allStudents = useStudentsStore((s) => s.students);
  const createEvent = useCalendarStore((s) => s.createEvent);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const createClassNote = useNotesStore((s) => s.createClassNote);

  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [eventType, setEventType] = useState<'class_session' | 'custom' | 'tutoring'>('custom');
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Session note state
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [sessionNote, setSessionNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  
  // Student filter state for tutoring
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('');

  const filteredStudents = useMemo(() => {
    let students = allStudents;
    
    if (studentClassFilter) {
      students = students.filter((s) => 
        s.classes?.some((c: any) => c.class_id === studentClassFilter) || 
        s.class_id === studentClassFilter
      );
    }
    
    if (studentSearch.trim()) {
      const searchLower = studentSearch.toLowerCase();
      students = students.filter((s) => 
        s.name.toLowerCase().includes(searchLower)
      );
    }
    
    return students;
  }, [allStudents, studentClassFilter, studentSearch]);

  const selectedStudent = useMemo(() => {
    return allStudents.find((s) => s.id === studentId);
  }, [allStudents, studentId]);

  useEffect(() => {
    if (isOpen) {
      setShowNoteInput(false);
      setSessionNote('');
      setNoteSaved(false);
      setStudentSearch('');
      setStudentClassFilter('');
      
      if (existingEvent) {
        setTitle(existingEvent.title);
        setEventDate(existingEvent.date);
        setStartTime(existingEvent.startTime || '');
        setEndTime(existingEvent.endTime || '');
        setEventType(existingEvent.eventType as 'class_session' | 'custom' | 'tutoring');
        setClassId(existingEvent.classId || '');
        setStudentId(existingEvent.studentId || '');
        setNotes(existingEvent.notes || '');
      } else {
        setTitle('');
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        setEventDate(defaultDate || todayStr);
        setStartTime('');
        setEndTime('');
        setEventType('custom');
        setClassId('');
        setStudentId('');
        setNotes('');
      }
    }
  }, [isOpen, existingEvent, defaultDate]);

  const handleGoToClass = () => {
    if (existingEvent?.classId) {
      onDismiss();
      history.push(`/tabs/classes/${existingEvent.classId}`);
    }
  };

  const handleSaveSessionNote = async () => {
    if (!existingEvent?.classId || !sessionNote.trim()) return;
    setSaving(true);
    try {
      await createClassNote({
        class_id: existingEvent.classId,
        event_id: existingEvent.id,
        event_date: existingEvent.date,
        text: sessionNote.trim(),
      });
      setNoteSaved(true);
      setShowNoteInput(false);
    } catch (err) {
      console.error('Failed to save session note:', err);
    } finally {
      setSaving(false);
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

  const handleStudentChange = (id: string) => {
    setStudentId(id);
    if (id) {
      const student = allStudents.find((s) => s.id === id);
      if (student && !title) {
        setTitle(`Tutoría con ${student.name}`);
      }
      setEventType('tutoring');
    }
  };

  const handleEventTypeChange = (type: 'class_session' | 'custom' | 'tutoring') => {
    setEventType(type);
    if (type !== 'tutoring') {
      setStudentId('');
    }
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
          notes: notes || undefined,
        });
      } else {
        await createEvent({
          class_id: classId || undefined,
          student_id: studentId || undefined,
          title: title.trim(),
          event_date: eventDate,
          start_time: startTime || undefined,
          end_time: endTime || undefined,
          event_type: eventType,
          notes: notes || undefined,
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
  const isTutoring = existingEvent?.eventType === 'tutoring' && existingEvent?.studentId;

  const handleGoToStudent = () => {
    if (existingEvent?.studentId && existingEvent?.classId) {
      onDismiss();
      history.push(`/tabs/classes/${existingEvent.classId}/students/${existingEvent.studentId}`);
    }
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      initialBreakpoint={0.75}
      breakpoints={[0, 0.75, 0.95]}
    >
      <div className="ev-editor">
        <h2 className="ev-editor__title">
          {existingEvent ? 'Editar evento' : 'Nuevo evento'}
        </h2>

        {/* Quick actions for class sessions */}
        {isClassSession && (
          <div className="ev-editor__quick-actions">
            <button className="ev-editor__quick-btn" onClick={handleGoToClass}>
              <IonIcon icon={arrowForwardOutline} />
              Ir a la clase
            </button>
            {!noteSaved ? (
              <button 
                className="ev-editor__quick-btn ev-editor__quick-btn--note" 
                onClick={() => setShowNoteInput(!showNoteInput)}
              >
                <IonIcon icon={chatbubbleOutline} />
                Añadir nota
              </button>
            ) : (
              <span className="ev-editor__note-saved">
                <IonIcon icon={checkmarkOutline} />
                Nota guardada
              </span>
            )}
          </div>
        )}

        {/* Quick actions for tutoring sessions */}
        {isTutoring && (
          <div className="ev-editor__quick-actions">
            <button className="ev-editor__quick-btn" onClick={handleGoToStudent}>
              <IonIcon icon={personOutline} />
              Ver ficha del alumno
            </button>
          </div>
        )}

        {/* Session note input */}
        {showNoteInput && isClassSession && (
          <div className="ev-editor__session-note">
            <IonTextarea
              value={sessionNote}
              onIonInput={(e) => setSessionNote(e.detail.value ?? '')}
              placeholder="¿Cómo ha ido la clase? Escribe una nota rápida..."
              rows={2}
              className="ev-editor__session-note-input"
            />
            <IonButton
              size="small"
              onClick={handleSaveSessionNote}
              disabled={saving || !sessionNote.trim()}
            >
              {saving ? <IonSpinner name="dots" /> : 'Guardar nota'}
            </IonButton>
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

            {eventType === 'tutoring' && (
              <div className="ev-editor__student-picker">
                <IonLabel className="ev-editor__label">Alumno</IonLabel>
                
                {selectedStudent ? (
                  <div className="ev-editor__selected-student">
                    <div className="ev-editor__selected-student-info">
                      <IonIcon icon={checkmarkCircleOutline} color="success" />
                      <span className="ev-editor__selected-student-name">{selectedStudent.name}</span>
                    </div>
                    <button 
                      className="ev-editor__change-student-btn"
                      onClick={() => setStudentId('')}
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="ev-editor__student-filters">
                      <IonSearchbar
                        value={studentSearch}
                        onIonInput={(e) => setStudentSearch(e.detail.value ?? '')}
                        placeholder="Buscar alumno..."
                        className="ev-editor__student-search"
                      />
                      {classes.length > 0 && (
                        <IonSelect
                          value={studentClassFilter}
                          onIonChange={(e) => setStudentClassFilter(e.detail.value)}
                          interface="popover"
                          placeholder="Todas las clases"
                          className="ev-editor__class-filter"
                        >
                          <IonSelectOption value="">Todas las clases</IonSelectOption>
                          {classes.map((c) => (
                            <IonSelectOption key={c.id} value={c.id}>
                              {c.name}
                            </IonSelectOption>
                          ))}
                        </IonSelect>
                      )}
                    </div>
                    
                    <div className="ev-editor__student-list">
                      {filteredStudents.length === 0 ? (
                        <div className="ev-editor__no-students">
                          No se encontraron alumnos
                        </div>
                      ) : (
                        <IonList className="ev-editor__student-list-inner">
                          <IonRadioGroup value={studentId} onIonChange={(e) => handleStudentChange(e.detail.value)}>
                            {filteredStudents.map((s) => (
                              <IonItem key={s.id} lines="none" className="ev-editor__student-item">
                                <IonRadio value={s.id} labelPlacement="end">
                                  <div className="ev-editor__student-row">
                                    <span className="ev-editor__student-name">{s.name}</span>
                                    {s.class_name && (
                                      <span className="ev-editor__student-class">{s.class_name}</span>
                                    )}
                                  </div>
                                </IonRadio>
                              </IonItem>
                            ))}
                          </IonRadioGroup>
                        </IonList>
                      )}
                    </div>
                  </>
                )}
              </div>
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

        <IonItem lines="none" className="ev-editor__field">
          <IonTextarea
            value={notes}
            onIonInput={(e) => setNotes(e.detail.value ?? '')}
            placeholder="Notas (opcional)"
            rows={2}
          />
        </IonItem>

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
