import { useState, useEffect, useMemo, useRef } from 'react';
import {
  IonModal, IonButton, IonSelect, IonSelectOption, IonItem, IonLabel,
  IonInput, IonTextarea, IonSpinner, IonIcon,
} from '@ionic/react';
import { arrowForwardOutline, chatbubbleOutline, personOutline, checkmarkCircleOutline, closeCircleOutline, searchOutline, addOutline } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { CalendarEvent } from '../types';
import { useClassesStore } from '../store/classesStore';
import { useStudentsStore, StudentPoolEntry } from '../store/studentsStore';
import { useCalendarStore } from '../store/calendarStore';
import { useCommentsStore } from '../store/commentsStore';
import { useIsDesktop } from '../hooks/useIsDesktop';
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
  const allStudents = useStudentsStore((s) => s.students);
  const pool = useStudentsStore((s) => s.pool);
  const fetchPool = useStudentsStore((s) => s.fetchPool);
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
  const [studentId, setStudentId] = useState('');
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);
  const [newObservation, setNewObservation] = useState('');
  const [savingObservation, setSavingObservation] = useState(false);
  const obsInputRef = useRef<HTMLIonTextareaElement>(null);

  // Student filter state for tutoring
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('');

  // Fetch pool when opening with tutoring type
  useEffect(() => {
    if (isOpen && pool.length === 0) {
      fetchPool();
    }
  }, [isOpen]);

  const filteredStudents = useMemo(() => {
    let students = pool;

    if (studentClassFilter) {
      students = students.filter((s) =>
        s.classes?.some((c) => c.class_id === studentClassFilter)
      );
    }

    if (studentSearch.trim()) {
      const searchLower = studentSearch.toLowerCase();
      students = students.filter((s) =>
        s.name.toLowerCase().includes(searchLower)
      );
    }

    return students;
  }, [pool, studentClassFilter, studentSearch]);

  // Group filtered students by class for display
  const groupedStudents = useMemo(() => {
    if (studentClassFilter) {
      // When filtering by class, show flat list
      return null;
    }
    const groups: Record<string, { className: string; students: StudentPoolEntry[] }> = {};
    const noClass: StudentPoolEntry[] = [];

    filteredStudents.forEach((s) => {
      if (s.classes.length === 0) {
        noClass.push(s);
      } else {
        // Add student under their first class for grouping
        const firstClass = s.classes[0];
        if (!groups[firstClass.class_id]) {
          groups[firstClass.class_id] = { className: firstClass.class_name, students: [] };
        }
        groups[firstClass.class_id].students.push(s);
      }
    });

    const result = Object.values(groups).sort((a, b) => a.className.localeCompare(b.className));
    if (noClass.length > 0) {
      result.push({ className: 'Sin clase', students: noClass });
    }
    return result;
  }, [filteredStudents, studentClassFilter]);

  const selectedStudent = useMemo(() => {
    return pool.find((s) => s.id === studentId) || allStudents.find((s) => s.id === studentId);
  }, [pool, allStudents, studentId]);

  useEffect(() => {
    if (isOpen) {
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
        setObservations(existingEvent.notes || '');
        setNewObservation('');
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
        setStudentId('');
        setObservations('');
      }
    }
  }, [isOpen, existingEvent, defaultDate]);

  const handleGoToSubject = async () => {
    if (!existingEvent?.classId) return;
    onDismiss();
    // Use subjectId from the event (via lecture), or resolve from class subjects
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
      });
      setNewObservation('');
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

  const handleStudentChange = (id: string) => {
    setStudentId(id);
    if (id) {
      const student = pool.find((s) => s.id === id) || allStudents.find((s) => s.id === id);
      if (student) {
        setTitle(`Tutoría con ${student.name}`);
        // Set classId from the student's first class for navigation
        if ('classes' in student && (student as StudentPoolEntry).classes?.length > 0) {
          setClassId((student as StudentPoolEntry).classes[0].class_id);
        }
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
          notes: observations || undefined,
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
      initialBreakpoint={isDesktop ? 1 : 0.65}
      breakpoints={isDesktop ? [0, 1] : [0, 0.65, 0.85]}
    >
      <div className="ev-editor">
        <h2 className="ev-editor__title">
          {existingEvent ? 'Editar evento' : 'Nuevo evento'}
        </h2>

        {/* Quick actions for existing events */}
        {existingEvent && (isClassSession || isTutoring) && (
          <div className="ev-editor__quick-actions">
            {isClassSession && (
              <button className="ev-editor__quick-btn" onClick={handleGoToSubject}>
                <IonIcon icon={arrowForwardOutline} />
                Ir a la asignatura
              </button>
            )}
            {isTutoring && (
              <button className="ev-editor__quick-btn" onClick={handleGoToStudent}>
                <IonIcon icon={personOutline} />
                Ver ficha del alumno
              </button>
            )}
            <button
              className="ev-editor__quick-btn ev-editor__quick-btn--note"
              onClick={() => obsInputRef.current?.setFocus()}
            >
              <IonIcon icon={chatbubbleOutline} />
              Añadir nota
            </button>
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
                      <div>
                        <span className="ev-editor__selected-student-name">{selectedStudent.name}</span>
                        {'classes' in selectedStudent && (selectedStudent as StudentPoolEntry).classes?.length > 0 && (
                          <span className="ev-editor__selected-student-class">
                            {(selectedStudent as StudentPoolEntry).classes.map((c) => c.class_name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="ev-editor__change-student-btn"
                      onClick={() => { setStudentId(''); setTitle(''); }}
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Search bar */}
                    <div className="ev-editor__student-search-wrap">
                      <IonIcon icon={searchOutline} className="ev-editor__student-search-icon" />
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Buscar alumno..."
                        className="ev-editor__student-search-input"
                      />
                      {studentSearch && (
                        <button
                          className="ev-editor__student-search-clear"
                          onClick={() => setStudentSearch('')}
                        >
                          <IonIcon icon={closeCircleOutline} />
                        </button>
                      )}
                    </div>

                    {/* Class filter chips */}
                    {classes.length > 0 && (
                      <div className="ev-editor__class-chips">
                        <button
                          className={`ev-editor__class-chip ${!studentClassFilter ? 'ev-editor__class-chip--active' : ''}`}
                          onClick={() => setStudentClassFilter('')}
                        >
                          Todos
                        </button>
                        {classes.map((c) => (
                          <button
                            key={c.id}
                            className={`ev-editor__class-chip ${studentClassFilter === c.id ? 'ev-editor__class-chip--active' : ''}`}
                            onClick={() => setStudentClassFilter(studentClassFilter === c.id ? '' : c.id)}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Student list */}
                    <div className="ev-editor__student-list">
                      {filteredStudents.length === 0 ? (
                        <div className="ev-editor__no-students">
                          No se encontraron alumnos
                        </div>
                      ) : studentClassFilter || !groupedStudents ? (
                        // Flat list when filtering by class
                        <div className="ev-editor__student-list-inner">
                          {filteredStudents.map((s) => (
                            <button
                              key={s.id}
                              className="ev-editor__student-option"
                              onClick={() => handleStudentChange(s.id)}
                            >
                              <span className="ev-editor__student-name">{s.name}</span>
                              {s.classes.length > 0 && !studentClassFilter && (
                                <span className="ev-editor__student-class-badge">
                                  {s.classes.map((c) => c.class_name).join(', ')}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        // Grouped list
                        <div className="ev-editor__student-list-inner">
                          {groupedStudents.map((group) => (
                            <div key={group.className} className="ev-editor__student-group">
                              <div className="ev-editor__student-group-header">{group.className}</div>
                              {group.students.map((s) => (
                                <button
                                  key={s.id}
                                  className="ev-editor__student-option"
                                  onClick={() => handleStudentChange(s.id)}
                                >
                                  <span className="ev-editor__student-name">{s.name}</span>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
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
                {existingEvent.notes && (
                  <div className="ev-editor__obs-item">
                    <span className="ev-editor__obs-text">{existingEvent.notes}</span>
                  </div>
                )}
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

            <div className="ev-editor__obs-add">
              <IonTextarea
                ref={obsInputRef}
                value={newObservation}
                onIonInput={(e) => setNewObservation(e.detail.value ?? '')}
                placeholder="Añadir observación..."
                rows={2}
                className="ev-editor__obs-input"
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
          <IonItem lines="none" className="ev-editor__field">
            <IonTextarea
              value={observations}
              onIonInput={(e) => setObservations(e.detail.value ?? '')}
              placeholder="Observaciones (opcional)"
              rows={2}
            />
          </IonItem>
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
