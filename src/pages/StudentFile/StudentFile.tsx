import { useState, useMemo, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonList, IonItem, IonBadge, IonLabel,
  IonTextarea, IonIcon, IonSpinner,
} from '@ionic/react';
import { addOutline, sparklesOutline, chevronDownOutline, chevronUpOutline, chevronForwardOutline, trendingUpOutline, trendingDownOutline, removeOutline } from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useStudentsStore } from '../../store/studentsStore';
import { useExamsStore } from '../../store/examsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useExercisesStore } from '../../store/exercisesStore';
import ExerciseCard from '../../components/ExerciseCard';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
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

  const student = useMemo(() => allStudents.find((st) => st.id === id), [allStudents, id]);
  const corrections = useMemo(() => allCorrections.filter((c) => c.studentId === id), [allCorrections, id]);
  const exercises = useMemo(() => allExercises.filter((e) => e.studentId === id), [allExercises, id]);
  const weakAreas = useMemo(() => getWeakAreasForStudent(id), [id, getWeakAreasForStudent]);

  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showAllGrades, setShowAllGrades] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [expandedExerciseGroups, setExpandedExerciseGroups] = useState<Set<string>>(new Set());

  // Group exercises by name for better organization
  const groupedExercises = useMemo(() => {
    const groups = new Map<string, typeof exercises>();
    exercises.forEach((ex) => {
      const key = ex.name || 'Sin nombre';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(ex);
    });
    return Array.from(groups.entries()).map(([name, exs]) => ({
      name,
      exercises: exs,
      count: exs.length,
      latestDate: exs[0]?.assignedAt || '',
    }));
  }, [exercises]);

  const toggleExerciseGroup = (name: string) => {
    setExpandedExerciseGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  useEffect(() => {
    fetchStudents(classId);
    fetchExams(classId);
    fetchExercises(id);
    fetchAllCorrections();
  }, [classId, id, fetchStudents, fetchExams, fetchExercises, fetchAllCorrections]);

  const handleSaveNote = async () => {
    if (!noteText.trim() || !student) return;
    setSaving(true);
    try {
      await addNote(student.id, noteText.trim());
      setNoteText('');
      setShowNoteInput(false);
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    try { await deleteExercise(exerciseId); } catch (err) { console.error(err); }
  };

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

  const avgGrade = corrections.length > 0
    ? corrections.reduce((sum, c) => sum + (c.grade || 0), 0) / corrections.length
    : null;

  // Calculate performance trend
  const performanceTrend = useMemo(() => {
    if (corrections.length < 2) return 'stable';
    const sorted = [...corrections].sort((a, b) => 
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
  }, [corrections]);

  const trendIcon = performanceTrend === 'improving' ? trendingUpOutline : 
                    performanceTrend === 'declining' ? trendingDownOutline : removeOutline;
  const trendColor = performanceTrend === 'improving' ? 'success' : 
                     performanceTrend === 'declining' ? 'danger' : 'medium';
  const trendLabel = performanceTrend === 'improving' ? 'Mejorando' :
                     performanceTrend === 'declining' ? 'En descenso' : 'Estable';

  // Aggregate weak areas with frequency counts
  const aggregatedWeakAreas = useMemo(() => {
    const counts = new Map<string, number>();
    corrections.forEach((c) => {
      (c.weakAreas || []).forEach((area) => {
        counts.set(area, (counts.get(area) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
  }, [corrections]);

  const displayedGrades = showAllGrades ? corrections : corrections.slice(0, 3);
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

        {/* Stats */}
        <div className="sf-stats">
          <div className="metric-card">
            <div className="metric-card__value">{corrections.length}</div>
            <div className="metric-card__label">Exámenes</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__value">{avgGrade !== null ? avgGrade.toFixed(1) : '—'}</div>
            <div className="metric-card__label">Promedio</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__value">{aggregatedWeakAreas.length}</div>
            <div className="metric-card__label">Áreas débiles</div>
          </div>
        </div>

        {/* Performance trend indicator */}
        {corrections.length >= 2 && (
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

        {/* Weak Areas + Generate CTA */}
        {aggregatedWeakAreas.length > 0 && (
          <div className="sf-section">
            <div className="sf-section__header">
              <span className="sf-section__title">Áreas a mejorar</span>
              <span className="sf-section__subtitle">
                Basado en {corrections.length} exámenes
              </span>
            </div>
            <div className="sf-weak-areas">
              {aggregatedWeakAreas.slice(0, 6).map((area, idx) => (
                <div key={idx} className="sf-weak-area-item">
                  <IonBadge color="warning" className="sf-weak-badge">{area.topic}</IonBadge>
                  {area.count > 1 && (
                    <span className="sf-weak-area-count">
                      {area.count}/{corrections.length}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {aggregatedWeakAreas.length > 6 && (
              <p className="sf-weak-areas-more">
                +{aggregatedWeakAreas.length - 6} áreas más
              </p>
            )}
          </div>
        )}

        {/* Generate exercises button */}
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

        {/* Grades Section */}
        <div className="sf-section">
          <div className="sf-section__header">
            <span className="sf-section__title">Calificaciones</span>
            {corrections.length > 3 && (
              <button className="sf-section__link" onClick={() => setShowAllGrades(!showAllGrades)}>
                {showAllGrades ? 'Ver menos' : `Ver todas (${corrections.length})`}
              </button>
            )}
          </div>
          {corrections.length === 0 ? (
            <p className="sf-empty">Sin calificaciones aún</p>
          ) : (
            <div className="sf-grades-list">
              {displayedGrades.map((c) => {
                const exam = exams.find((e) => e.id === c.examId);
                const passed = c.grade !== null && exam && c.grade / exam.maxScore >= 0.5;
                return (
                  <div
                    key={c.id}
                    className="sf-grade-item"
                    onClick={() => history.push(`/correction/${c.examId}?studentId=${id}`)}
                  >
                    <div className="sf-grade-item__info">
                      <span className="sf-grade-item__name">{exam?.name ?? 'Examen'}</span>
                      <span className="sf-grade-item__date">{c.savedAt?.slice(0, 10)}</span>
                    </div>
                    <span className={`sf-grade-pill ${passed ? 'grade-pass' : 'grade-fail'}`}>
                      {c.grade ?? '—'}/{exam?.maxScore ?? '?'}
                    </span>
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
        {exercises.length > 0 && (
          <div className="sf-section">
            <div className="sf-section__header">
              <span className="sf-section__title">Ejercicios asignados ({exercises.length})</span>
            </div>
            {groupedExercises.length > 3 || exercises.length !== groupedExercises.length ? (
              // Grouped view when there are many or duplicates
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
              // Simple list for few exercises
              <div className="sf-exercises-list">
                {exercises.map((ex) => (
                  <ExerciseCard key={ex.id} exercise={ex} onDelete={handleDeleteExercise} showIteration />
                ))}
              </div>
            )}
          </div>
        )}
      </IonContent>

      <ExerciseGeneratorModal
        isOpen={showExerciseModal}
        onDismiss={() => setShowExerciseModal(false)}
        studentId={id}
        studentName={student.name}
        weakAreas={weakAreas}
      />
    </IonPage>
  );
};

export default StudentFile;
