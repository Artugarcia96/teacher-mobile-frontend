import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonBadge, IonIcon, IonSpinner, IonTextarea,
  IonLabel, IonModal, IonInput, IonSelect, IonSelectOption,
} from '@ionic/react';
import {
  addOutline, sparklesOutline, chevronDownOutline, chevronUpOutline,
  chevronForwardOutline, trendingUpOutline, trendingDownOutline, removeOutline,
  calendarOutline, filterOutline,
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useStudentsStore } from '../../store/studentsStore';
import { useExamsStore } from '../../store/examsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useExercisesStore } from '../../store/exercisesStore';
import { useCalendarStore } from '../../store/calendarStore';
import { useClassesStore } from '../../store/classesStore';
import { CalendarEvent, ClassSubjectSummary } from '../../types';
import ExerciseCard from '../../components/ExerciseCard';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import GradeDonut from '../../components/charts/GradeDonut';
import WeakAreasRadar from '../../components/charts/WeakAreasRadar';
import GradeTrendLine from '../../components/charts/GradeTrendLine';
import './StudentFile.css';

const AVATAR_COLORS = [
  '#6C3AED', '#8B5CF6', '#059669', '#0891B2', '#D97706',
  '#DC2626', '#2563EB', '#7C3AED', '#DB2777', '#4F46E5',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatDate(d: string) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length < 3) return d;
  return `${parts[2]}/${parts[1]}`;
}

function formatTime(t?: string) {
  if (!t) return '';
  return t.slice(0, 5);
}

const StudentFile: React.FC = () => {
  const { classId, id } = useParams<{ classId: string; id: string }>();
  const history = useHistory();

  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const addNote = useStudentsStore((s) => s.addNote);

  const exams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);

  const allCorrections = useCorrectionStore((s) => s.corrections);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);
  const getWeakAreasForStudent = useCorrectionStore((s) => s.getWeakAreasForStudent);

  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const deleteExercise = useExercisesStore((s) => s.deleteExercise);

  const calendarEvents = useCalendarStore((s) => s.events);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);
  const createEvent = useCalendarStore((s) => s.createEvent);

  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const student = useMemo(() => allStudents.find((st) => st.id === id), [allStudents, id]);
  const corrections = useMemo(() => allCorrections.filter((c) => c.studentId === id), [allCorrections, id]);
  const exercises = useMemo(() => allExercises.filter((e) => e.studentId === id), [allExercises, id]);
  const weakAreas = useMemo(() => getWeakAreasForStudent(id), [id, getWeakAreasForStudent]);

  // Subjects for this class
  const subjects: ClassSubjectSummary[] = classSubjects[classId] || [];

  // State
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [expandedExerciseGroups, setExpandedExerciseGroups] = useState<Set<string>>(new Set());
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', date: '', startTime: '', endTime: '', type: 'tutoring' as string });
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [showAllGrades, setShowAllGrades] = useState(false);

  // Student events (tutoring, custom events assigned to this student)
  const studentEvents = useMemo(() =>
    calendarEvents.filter((e) => e.studentId === id && !e.isCancelled)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [calendarEvents, id]
  );

  // Upcoming events (from today)
  const today = new Date().toISOString().slice(0, 10);
  const upcomingEvents = useMemo(() =>
    studentEvents.filter((e) => e.date >= today).slice(0, 5),
    [studentEvents, today]
  );

  // Filter data by subject
  const filteredCorrections = useMemo(() => {
    if (selectedSubject === 'all') return corrections;
    return corrections.filter((c) => {
      const exam = exams.find((e) => e.id === c.examId);
      return exam?.subjectId === selectedSubject;
    });
  }, [corrections, selectedSubject, exams]);

  const filteredExercises = useMemo(() => {
    if (selectedSubject === 'all') return exercises;
    return exercises.filter((e) => {
      // Match by sourceExamId -> exam.subjectId or exercise.subjectId
      if (e.subjectId === selectedSubject) return true;
      if (e.sourceExamId) {
        const exam = exams.find((ex) => ex.id === e.sourceExamId);
        if (exam?.subjectId === selectedSubject) return true;
      }
      if (e.sourceExamIds?.length) {
        return e.sourceExamIds.some((eid) => {
          const exam = exams.find((ex) => ex.id === eid);
          return exam?.subjectId === selectedSubject;
        });
      }
      return false;
    });
  }, [exercises, selectedSubject, exams]);

  // Grade stats
  const avgGrade = filteredCorrections.length > 0
    ? filteredCorrections.reduce((sum, c) => sum + (c.grade || 0), 0) / filteredCorrections.length
    : null;

  // Performance trend
  const performanceTrend = useMemo(() => {
    if (filteredCorrections.length < 2) return 'stable';
    const sorted = [...filteredCorrections].sort((a, b) =>
      new Date(a.savedAt || '').getTime() - new Date(b.savedAt || '').getTime()
    );
    const midpoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midpoint);
    const secondHalf = sorted.slice(midpoint);
    const firstAvg = firstHalf.reduce((sum, c) => sum + (c.grade || 0), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, c) => sum + (c.grade || 0), 0) / secondHalf.length;
    const diff = secondAvg - firstAvg;
    if (diff > 0.5) return 'improving';
    if (diff < -0.5) return 'declining';
    return 'stable';
  }, [filteredCorrections]);

  const trendIcon = performanceTrend === 'improving' ? trendingUpOutline :
    performanceTrend === 'declining' ? trendingDownOutline : removeOutline;
  const trendColor = performanceTrend === 'improving' ? 'success' :
    performanceTrend === 'declining' ? 'danger' : 'medium';
  const trendLabel = performanceTrend === 'improving' ? 'Mejorando' :
    performanceTrend === 'declining' ? 'En descenso' : 'Estable';

  // Aggregated weak areas for radar chart
  const aggregatedWeakAreas = useMemo(() => {
    const counts = new Map<string, number>();
    filteredCorrections.forEach((c) => {
      (c.weakAreas || []).forEach((area) => {
        counts.set(area, (counts.get(area) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCorrections]);

  // Grade distribution for donut
  const gradeDistribution = useMemo(() => {
    let excellent = 0, good = 0, borderline = 0, fail = 0;
    filteredCorrections.forEach((c) => {
      const exam = exams.find((e) => e.id === c.examId);
      if (!exam || c.grade === null) return;
      const pct = c.grade / exam.maxScore;
      if (pct >= 0.8) excellent++;
      else if (pct >= 0.6) good++;
      else if (pct >= 0.5) borderline++;
      else fail++;
    });
    return [
      { label: 'Excelente', count: excellent, color: 'var(--chart-excellent, #10B981)' },
      { label: 'Bien', count: good, color: 'var(--chart-good, #3B82F6)' },
      { label: 'Justo', count: borderline, color: 'var(--chart-borderline, #F59E0B)' },
      { label: 'Suspenso', count: fail, color: 'var(--chart-fail, #EF4444)' },
    ];
  }, [filteredCorrections, exams]);

  // Trend line data
  const trendData = useMemo(() => {
    const sorted = [...filteredCorrections]
      .filter((c) => c.grade !== null)
      .sort((a, b) => new Date(a.savedAt || '').getTime() - new Date(b.savedAt || '').getTime());
    return sorted.map((c) => {
      const exam = exams.find((e) => e.id === c.examId);
      return {
        label: exam?.name?.slice(0, 8) || formatDate(c.savedAt?.slice(0, 10) || ''),
        value: c.grade || 0,
        maxValue: exam?.maxScore || 10,
      };
    });
  }, [filteredCorrections, exams]);

  // Grouped exercises
  const groupedExercises = useMemo(() => {
    const groups = new Map<string, typeof filteredExercises>();
    filteredExercises.forEach((ex) => {
      const key = ex.name || 'Sin nombre';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ex);
    });
    return Array.from(groups.entries()).map(([name, exs]) => ({
      name,
      exercises: exs,
      count: exs.length,
    }));
  }, [filteredExercises]);

  const toggleExerciseGroup = (name: string) => {
    setExpandedExerciseGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  useEffect(() => {
    fetchStudents(classId);
    fetchExams(classId);
    fetchExercises(id);
    fetchAllCorrections();
    fetchClassSubjects(classId);
    // Fetch events for the next 90 days for this student
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    fetchEvents(start, end, undefined, id);
  }, [classId, id, fetchStudents, fetchExams, fetchExercises, fetchAllCorrections, fetchClassSubjects, fetchEvents]);

  const handleSaveNote = async () => {
    if (!noteText.trim() || !student) return;
    setSaving(true);
    try {
      await addNote(student.id, noteText.trim());
      setNoteText('');
      setShowNoteInput(false);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    try { await deleteExercise(exerciseId); } catch (err) { console.error(err); }
  };

  const handleCreateEvent = useCallback(async () => {
    if (!eventForm.title.trim() || !eventForm.date) return;
    setCreatingEvent(true);
    try {
      await createEvent({
        student_id: id,
        class_id: classId,
        title: eventForm.title.trim(),
        event_date: eventForm.date,
        start_time: eventForm.startTime || undefined,
        end_time: eventForm.endTime || undefined,
        event_type: eventForm.type,
      });
      setShowEventModal(false);
      setEventForm({ title: '', date: '', startTime: '', endTime: '', type: 'tutoring' });
      // Re-fetch events
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
      fetchEvents(start, end, undefined, id);
    } catch (err) { console.error(err); }
    finally { setCreatingEvent(false); }
  }, [eventForm, id, classId, createEvent, fetchEvents]);

  if (!student) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <IonSpinner color="primary" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const displayedGrades = showAllGrades ? filteredCorrections : filteredCorrections.slice(0, 5);
  const displayedNotes = showAllNotes ? student.notes : student.notes.slice(0, 2);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" />
          </IonButtons>
          <IonTitle>{student.name}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="sf-content" scrollY>
        {/* Profile header */}
        <div className="sf-profile">
          <div className="sf-profile__avatar" style={{ background: avatarColor(student.name) }}>
            {student.name.charAt(0)}
          </div>
          <h2 className="sf-profile__name">{student.name}</h2>
          {student.studentId && <p className="sf-profile__code">{student.studentId}</p>}
        </div>

        {/* Subject filter */}
        {subjects.length > 1 && (
          <div className="sf-subject-filter">
            <IonIcon icon={filterOutline} className="sf-subject-filter__icon" />
            <IonSelect
              value={selectedSubject}
              onIonChange={(e) => setSelectedSubject(e.detail.value as string)}
              interface="popover"
              className="sf-subject-filter__select"
              placeholder="Asignatura"
            >
              <IonSelectOption value="all">Todas las asignaturas</IonSelectOption>
              {subjects.map((s) => (
                <IonSelectOption key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </IonSelectOption>
              ))}
            </IonSelect>
          </div>
        )}

        {/* Stats row */}
        <div className="sf-stats">
          <div className="metric-card">
            <div className="metric-card__value">{filteredCorrections.length}</div>
            <div className="metric-card__label">Exámenes</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__value">{avgGrade !== null ? avgGrade.toFixed(1) : '—'}</div>
            <div className="metric-card__label">Promedio</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__value">{filteredExercises.length}</div>
            <div className="metric-card__label">Ejercicios</div>
          </div>
        </div>

        {/* Performance trend */}
        {filteredCorrections.length >= 2 && (
          <div className={`sf-trend sf-trend--${performanceTrend}`}>
            <IonIcon icon={trendIcon} />
            <span>{trendLabel}</span>
            <span className="sf-trend__detail">
              {performanceTrend === 'improving'
                ? 'Las últimas notas muestran mejora'
                : performanceTrend === 'declining'
                ? 'Las últimas notas han bajado'
                : 'Rendimiento constante'}
            </span>
          </div>
        )}

        {/* Charts section */}
        {filteredCorrections.length > 0 && (
          <div className="sf-section">
            <div className="sf-section__header">
              <span className="sf-section__title">Rendimiento</span>
              <span className="sf-section__subtitle">
                {filteredCorrections.length} exámenes
              </span>
            </div>

            <div className="sf-charts-row">
              {/* Grade donut */}
              <div className="sf-chart-card">
                <GradeDonut
                  distribution={gradeDistribution}
                  centerLabel={avgGrade !== null ? avgGrade.toFixed(1) : '—'}
                  centerSubLabel="promedio"
                  size={120}
                />
              </div>

              {/* Grade trend line */}
              {trendData.length >= 2 && (
                <div className="sf-chart-card sf-chart-card--wide">
                  <span className="sf-chart-card__title">Evolución</span>
                  <GradeTrendLine data={trendData} height={90} />
                </div>
              )}
            </div>

            {/* Weak areas radar */}
            {aggregatedWeakAreas.length > 0 && (
              <div className="sf-chart-card sf-chart-card--full">
                <span className="sf-chart-card__title">Áreas a mejorar</span>
                <WeakAreasRadar
                  areas={aggregatedWeakAreas.slice(0, 8).map((a) => ({ area: a.topic, count: a.count }))}
                  size={200}
                />
              </div>
            )}
          </div>
        )}

        {/* Upcoming events */}
        <div className="sf-section">
          <div className="sf-section__header">
            <span className="sf-section__title">Próximos eventos</span>
            <button className="sf-section__link" onClick={() => setShowEventModal(true)}>
              <IonIcon icon={addOutline} style={{ marginRight: 4, fontSize: 14 }} />
              Asignar
            </button>
          </div>
          {upcomingEvents.length === 0 ? (
            <div className="sf-empty-events" onClick={() => setShowEventModal(true)}>
              <IonIcon icon={calendarOutline} className="sf-empty-events__icon" />
              <span>Sin eventos programados</span>
              <span className="sf-empty-events__hint">Toca para asignar tutoría u otro evento</span>
            </div>
          ) : (
            <div className="sf-events-list">
              {upcomingEvents.map((ev) => (
                <div key={ev.id} className="sf-event-item">
                  <div className={`sf-event-item__dot sf-event-item__dot--${ev.eventType}`} />
                  <div className="sf-event-item__info">
                    <span className="sf-event-item__title">{ev.title}</span>
                    <span className="sf-event-item__meta">
                      {formatDate(ev.date)}
                      {ev.startTime && ` · ${formatTime(ev.startTime)}`}
                      {ev.endTime && `–${formatTime(ev.endTime)}`}
                    </span>
                  </div>
                  <IonBadge color={ev.eventType === 'tutoring' ? 'tertiary' : ev.eventType === 'exam' ? 'danger' : 'medium'} className="sf-event-item__badge">
                    {ev.eventType === 'tutoring' ? 'Tutoría' : ev.eventType === 'exam' ? 'Examen' : ev.eventType === 'class_session' ? 'Clase' : 'Evento'}
                  </IonBadge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generate exercises CTA */}
        <div className="sf-generate-cta" onClick={() => setShowExerciseModal(true)}>
          <IonIcon icon={sparklesOutline} className="sf-generate-cta__icon" />
          <div className="sf-generate-cta__text">
            <span className="sf-generate-cta__title">Generar ejercicios personalizados</span>
            <span className="sf-generate-cta__hint">
              {weakAreas.length > 0
                ? `Basado en ${weakAreas.length} áreas a mejorar`
                : 'IA genera ejercicios adaptados al alumno'}
            </span>
          </div>
        </div>

        {/* Grades Section - Compact */}
        <div className="sf-section">
          <div className="sf-section__header">
            <span className="sf-section__title">Calificaciones</span>
            {filteredCorrections.length > 5 && (
              <button className="sf-section__link" onClick={() => setShowAllGrades(!showAllGrades)}>
                {showAllGrades ? 'Ver menos' : `Ver todas (${filteredCorrections.length})`}
              </button>
            )}
          </div>
          {filteredCorrections.length === 0 ? (
            <p className="sf-empty">Sin calificaciones aún</p>
          ) : (
            <div className="sf-grades-compact">
              {displayedGrades.map((c) => {
                const exam = exams.find((e) => e.id === c.examId);
                const pct = c.grade !== null && exam ? c.grade / exam.maxScore : 0;
                const gradeClass = pct >= 0.8 ? 'grade-pass' : pct >= 0.5 ? 'grade-borderline' : 'grade-fail';
                return (
                  <div
                    key={c.id}
                    className="sf-grade-row"
                    onClick={() => history.push(`/correction/${c.examId}?studentId=${id}`)}
                  >
                    <div className="sf-grade-row__bar" style={{ width: `${Math.max(pct * 100, 4)}%`, background: pct >= 0.8 ? 'var(--chart-excellent)' : pct >= 0.6 ? 'var(--chart-good)' : pct >= 0.5 ? 'var(--chart-borderline)' : 'var(--chart-fail)' }} />
                    <div className="sf-grade-row__content">
                      <span className="sf-grade-row__name">{exam?.name ?? 'Examen'}</span>
                      <div className="sf-grade-row__right">
                        {exam?.subjectName && selectedSubject === 'all' && (
                          <span className="sf-grade-row__subject">{exam.subjectName}</span>
                        )}
                        <span className={`sf-grade-pill ${gradeClass}`}>
                          {c.grade ?? '—'}/{exam?.maxScore ?? '?'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Notes Section */}
        <div className="sf-section">
          <div className="sf-section__header">
            <span className="sf-section__title">Notas del profesor</span>
            <button className="sf-section__link" onClick={() => setShowNoteInput(!showNoteInput)}>
              <IonIcon icon={addOutline} style={{ marginRight: 4, fontSize: 14 }} />
              Añadir
            </button>
          </div>

          {showNoteInput && (
            <div className="sf-note-input">
              <IonTextarea
                value={noteText}
                onIonInput={(e) => setNoteText(e.detail.value ?? '')}
                placeholder="Escribe una nota..."
                rows={2}
                autoGrow
              />
              <div className="sf-note-input__actions">
                <IonButton size="small" fill="outline" onClick={() => { setShowNoteInput(false); setNoteText(''); }}>
                  Cancelar
                </IonButton>
                <IonButton size="small" onClick={handleSaveNote} disabled={saving || !noteText.trim()}>
                  {saving ? <IonSpinner name="crescent" /> : 'Guardar'}
                </IonButton>
              </div>
            </div>
          )}

          {student.notes.length === 0 && !showNoteInput ? (
            <p className="sf-empty">Sin notas</p>
          ) : (
            <>
              <div className="sf-notes-list">
                {displayedNotes.map((n) => (
                  <div key={n.id} className="sf-note-item">
                    <span className="sf-note-date">{n.createdAt?.slice(0, 10)}</span>
                    <p className="sf-note-text">{n.text}</p>
                  </div>
                ))}
              </div>
              {student.notes.length > 2 && (
                <button
                  className="sf-section__link sf-section__link--center"
                  onClick={() => setShowAllNotes(!showAllNotes)}
                >
                  {showAllNotes ? 'Ver menos' : `Ver todas (${student.notes.length})`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Exercises Section */}
        {filteredExercises.length > 0 && (
          <div className="sf-section">
            <div className="sf-section__header">
              <span className="sf-section__title">Ejercicios ({filteredExercises.length})</span>
            </div>
            {groupedExercises.length > 3 || filteredExercises.length !== groupedExercises.length ? (
              <div className="sf-exercises-grouped">
                {groupedExercises.map((group) => (
                  <div key={group.name} className="sf-exercise-group">
                    <div
                      className="sf-exercise-group__header"
                      onClick={() => toggleExerciseGroup(group.name)}
                    >
                      <IonIcon
                        icon={expandedExerciseGroups.has(group.name) ? chevronDownOutline : chevronForwardOutline}
                        className="sf-exercise-group__chevron"
                      />
                      <span className="sf-exercise-group__name">{group.name}</span>
                      {group.count > 1 && (
                        <IonBadge color="medium" className="sf-exercise-group__count">
                          {group.count}
                        </IonBadge>
                      )}
                    </div>
                    {expandedExerciseGroups.has(group.name) && (
                      <div className="sf-exercise-group__content">
                        {group.exercises.map((ex) => (
                          <ExerciseCard key={ex.id} exercise={ex} onDelete={handleDeleteExercise} showIteration />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="sf-exercises-list">
                {filteredExercises.map((ex) => (
                  <ExerciseCard key={ex.id} exercise={ex} onDelete={handleDeleteExercise} showIteration />
                ))}
              </div>
            )}
          </div>
        )}
      </IonContent>

      {/* Exercise generator modal */}
      <ExerciseGeneratorModal
        isOpen={showExerciseModal}
        onDismiss={() => setShowExerciseModal(false)}
        studentId={id}
        studentName={student.name}
        weakAreas={weakAreas}
      />

      {/* Calendar event assignment modal */}
      <IonModal
        isOpen={showEventModal}
        onDidDismiss={() => setShowEventModal(false)}
        initialBreakpoint={0.55}
        breakpoints={[0, 0.55, 0.85]}
        className="sf-event-modal"
      >
        <div className="modal-sheet">
          <h3 className="modal-sheet__title">Asignar evento</h3>
          <p className="modal-sheet__subtitle">Crear evento para {student.name}</p>

          <div className="sf-event-form">
            <div className="sf-event-form__field">
              <label className="sf-event-form__label">Tipo</label>
              <IonSelect
                value={eventForm.type}
                onIonChange={(e) => setEventForm((f) => ({ ...f, type: e.detail.value }))}
                interface="popover"
                className="sf-event-form__select"
              >
                <IonSelectOption value="tutoring">Tutoría</IonSelectOption>
                <IonSelectOption value="exam">Examen</IonSelectOption>
                <IonSelectOption value="custom">Otro</IonSelectOption>
              </IonSelect>
            </div>

            <div className="sf-event-form__field">
              <label className="sf-event-form__label">Título</label>
              <IonInput
                value={eventForm.title}
                onIonInput={(e) => setEventForm((f) => ({ ...f, title: e.detail.value ?? '' }))}
                placeholder={eventForm.type === 'tutoring' ? `Tutoría con ${student.name}` : 'Nombre del evento'}
                className="sf-event-form__input"
              />
            </div>

            <div className="sf-event-form__field">
              <label className="sf-event-form__label">Fecha</label>
              <IonInput
                type="date"
                value={eventForm.date}
                onIonInput={(e) => setEventForm((f) => ({ ...f, date: e.detail.value ?? '' }))}
                className="sf-event-form__input"
              />
            </div>

            <div className="sf-event-form__row">
              <div className="sf-event-form__field sf-event-form__field--half">
                <label className="sf-event-form__label">Hora inicio</label>
                <IonInput
                  type="time"
                  value={eventForm.startTime}
                  onIonInput={(e) => setEventForm((f) => ({ ...f, startTime: e.detail.value ?? '' }))}
                  className="sf-event-form__input"
                />
              </div>
              <div className="sf-event-form__field sf-event-form__field--half">
                <label className="sf-event-form__label">Hora fin</label>
                <IonInput
                  type="time"
                  value={eventForm.endTime}
                  onIonInput={(e) => setEventForm((f) => ({ ...f, endTime: e.detail.value ?? '' }))}
                  className="sf-event-form__input"
                />
              </div>
            </div>

            <IonButton
              expand="block"
              onClick={handleCreateEvent}
              disabled={creatingEvent || !eventForm.title.trim() || !eventForm.date}
              className="sf-event-form__submit"
            >
              {creatingEvent ? <IonSpinner name="crescent" /> : 'Crear evento'}
            </IonButton>
          </div>
        </div>
      </IonModal>
    </IonPage>
  );
};

export default StudentFile;
