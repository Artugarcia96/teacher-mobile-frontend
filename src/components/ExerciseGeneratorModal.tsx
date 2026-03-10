import { useState, useMemo, useEffect } from 'react';
import {
  IonModal, IonButton, IonSelect, IonSelectOption, IonItem, IonLabel,
  IonBadge, IonTextarea, IonSpinner, IonIcon, IonCheckbox, IonToggle,
  IonSegment, IonSegmentButton, IonInput,
} from '@ionic/react';
import { sparkles, chevronDownOutline, chevronUpOutline, downloadOutline, documentTextOutline } from 'ionicons/icons';
import { useExamsStore } from '../store/examsStore';
import { useClassesStore } from '../store/classesStore';
import { useStudentsStore } from '../store/studentsStore';
import { useCorrectionStore } from '../store/correctionStore';
import { useExercisesStore } from '../store/exercisesStore';
import { useTopicsStore } from '../store/topicsStore';
import { exercises as exercisesApi } from '../services/api';
import './ExerciseGeneratorModal.css';

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  // Single-student mode (from StudentFile)
  studentId?: string;
  studentName?: string;
  weakAreas?: { topic: string }[];
  // Multi-student mode (from GradeBook / ExamEditor)
  classId?: string;
  preselectedExamId?: string;
}

const ExerciseGeneratorModal: React.FC<Props> = ({
  isOpen, onDismiss, studentId, studentName, weakAreas,
  classId: preClassId, preselectedExamId,
}) => {
  const multiMode = !studentId;

  const allExams = useExamsStore((s) => s.exams);
  const allClasses = useClassesStore((s) => s.classes);
  const allStudents = useStudentsStore((s) => s.students);
  const fetchAllStudents = useStudentsStore((s) => s.fetchAllStudents);
  const corrections = useCorrectionStore((s) => s.corrections);
  const generateExercises = useExercisesStore((s) => s.generateExercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const topicsList = useTopicsStore((s) => s.topics);
  const fetchTopics = useTopicsStore((s) => s.fetchTopics);

  const [classId, setClassId] = useState('');
  const [sourceType, setSourceType] = useState<'exam' | 'topic'>('exam');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [difficulty, setDifficulty] = useState<'easier' | 'same' | 'harder'>('same');
  const [numQuestions, setNumQuestions] = useState(5);
  const [refinement, setRefinement] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [generatedIds, setGeneratedIds] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  const effectiveClassId = multiMode ? classId : (() => {
    if (!studentId) return '';
    const student = allStudents.find((s) => s.id === studentId);
    return student?.classId || '';
  })();

  const classStudents = useMemo(
    () => allStudents.filter((s) => s.classId === effectiveClassId),
    [allStudents, effectiveClassId]
  );

  const correctedExams = useMemo(() => {
    if (!effectiveClassId) return [];
    if (studentId) {
      const studentCorrections = corrections.filter((c) => c.studentId === studentId);
      const examIds = new Set(studentCorrections.map((c) => c.examId));
      return allExams.filter((e) => e.status === 'corrected' && examIds.has(e.id));
    }
    return allExams.filter((e) => e.status === 'corrected' && e.classId === effectiveClassId);
  }, [allExams, corrections, studentId, effectiveClassId]);

  const classTopics = useMemo(
    () => topicsList.filter((t) => t.classId === effectiveClassId),
    [topicsList, effectiveClassId]
  );

  const studentsWithIssues = useMemo(() => {
    if (!selectedExamId) return new Set<string>();
    const ids = new Set<string>();
    corrections
      .filter((c) => c.examId === selectedExamId && c.weakAreas && c.weakAreas.length > 0)
      .forEach((c) => { if (c.studentId) ids.add(c.studentId); });
    return ids;
  }, [selectedExamId, corrections]);

  // Init on open
  useEffect(() => {
    if (isOpen) {
      if (multiMode) {
        setClassId(preClassId || '');
        if (preselectedExamId) {
          setSelectedExamId(preselectedExamId);
          setSourceType('exam');
        }
        fetchAllStudents();
      } else {
        if (correctedExams.length > 0 && !selectedExamId) {
          setSelectedExamId(correctedExams[0].id);
        }
      }
    }
  }, [isOpen, multiMode, preClassId, preselectedExamId, correctedExams]);

  useEffect(() => {
    if (effectiveClassId) fetchTopics(effectiveClassId);
  }, [effectiveClassId, fetchTopics]);

  // Auto-select students with issues when exam changes
  useEffect(() => {
    if (multiMode && selectedExamId && studentsWithIssues.size > 0) {
      setSelectedStudentIds(Array.from(studentsWithIssues));
    } else if (multiMode && selectedExamId) {
      setSelectedStudentIds(classStudents.map((s) => s.id));
    }
  }, [selectedExamId, studentsWithIssues, classStudents, multiMode]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setSelectedExamId('');
      setSelectedTopicIds([]);
      setSelectedStudentIds([]);
      setShowOptions(false);
      setExerciseName('');
      setRefinement('');
      setError('');
      setSuccess(false);
      setGenerating(false);
      setGeneratedIds([]);
      setDownloading(false);
      setSourceType('exam');
    }
  }, [isOpen]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleTopic = (id: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    const studentIds = multiMode ? selectedStudentIds : [studentId!];
    if (studentIds.length === 0) return;
    if (sourceType === 'exam' && !selectedExamId) return;
    if (sourceType === 'topic' && selectedTopicIds.length === 0) return;

    setGenerating(true);
    setError('');
    try {
      const result = await generateExercises({
        studentIds,
        name: exerciseName,
        sourceExamIds: sourceType === 'exam' ? [selectedExamId] : undefined,
        sourceTopicIds: sourceType === 'topic' ? selectedTopicIds : undefined,
        refinementPrompt: refinement || undefined,
        difficulty,
        numQuestions,
      });
      setSuccess(true);
      if (result && Array.isArray(result)) {
        setGeneratedIds(result.map((e: any) => e.id));
      }
      if (studentId) await fetchExercises(studentId);
      if (!multiMode) setTimeout(() => onDismiss(), 1200);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al generar ejercicios');
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate = (() => {
    const hasStudents = multiMode ? selectedStudentIds.length > 0 : !!studentId;
    const hasSource = sourceType === 'exam' ? !!selectedExamId : selectedTopicIds.length > 0;
    const hasName = exerciseName.trim().length > 0;
    return hasStudents && hasSource && hasName && !generating;
  })();

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      initialBreakpoint={multiMode ? 0.85 : 0.65}
      breakpoints={[0, 0.65, 0.85, 0.95]}
      className="exercise-generator-modal"
    >
      <div className="exgen">
        <div className="exgen__header">
          <h2 className="exgen__title">Generar ejercicios</h2>
          <p className="exgen__subtitle">
            {multiMode
              ? (classId ? classes.find((c) => c.id === classId)?.name || '' : 'Selecciona una clase')
              : `Para ${studentName}`}
          </p>
        </div>

        {/* Class selector (multi-mode only, if not pre-selected) */}
        {multiMode && !preClassId && (
          <IonItem lines="none" className="exgen__select">
            <IonLabel>Clase</IonLabel>
            <IonSelect
              value={classId}
              onIonChange={(e) => { setClassId(e.detail.value); setSelectedStudentIds([]); setSelectedExamId(''); setSelectedTopicIds([]); }}
              interface="popover"
              placeholder="Seleccionar clase"
            >
              {classes.map((c) => (
                <IonSelectOption key={c.id} value={c.id}>{c.name} — {c.subject}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        )}

        {/* Exercise name */}
        <IonItem lines="none" className="exgen__select">
          <IonInput
            value={exerciseName}
            onIonInput={(e) => setExerciseName(e.detail.value ?? '')}
            placeholder="Nombre del ejercicio *"
            className="exgen__name-input"
            required
          />
        </IonItem>

        {/* Weak areas (single-student only) */}
        {!multiMode && weakAreas && weakAreas.length > 0 && (
          <div className="exgen__areas">
            <span className="exgen__areas-label">Areas a reforzar</span>
            <div className="exgen__areas-list">
              {weakAreas.map((a, i) => (
                <IonBadge key={i} color="warning" className="exgen__area-badge">{a.topic}</IonBadge>
              ))}
            </div>
          </div>
        )}

        {effectiveClassId && (
          <>
            {/* Source type toggle */}
            <div className="exgen__source-toggle">
              <IonSegment value={sourceType} onIonChange={(e) => setSourceType(e.detail.value as 'exam' | 'topic')}>
                <IonSegmentButton value="exam"><IonLabel>Examen corregido</IonLabel></IonSegmentButton>
                <IonSegmentButton value="topic"><IonLabel>Temario</IonLabel></IonSegmentButton>
              </IonSegment>
            </div>

            {/* Source: Exam */}
            {sourceType === 'exam' && (
              correctedExams.length === 0 ? (
                <div className="exgen__empty">
                  <p>No hay examenes corregidos{multiMode ? ' para esta clase' : ''}.</p>
                </div>
              ) : (
                <IonItem lines="none" className="exgen__select">
                  <IonLabel>Basado en</IonLabel>
                  <IonSelect
                    value={selectedExamId}
                    onIonChange={(e) => setSelectedExamId(e.detail.value)}
                    interface="popover"
                    placeholder="Seleccionar examen"
                  >
                    {correctedExams.map((exam) => {
                      const cls = classes.find((c) => c.id === exam.classId);
                      return (
                        <IonSelectOption key={exam.id} value={exam.id}>
                          {exam.name} ({cls?.name})
                        </IonSelectOption>
                      );
                    })}
                  </IonSelect>
                </IonItem>
              )
            )}

            {/* Source: Topics */}
            {sourceType === 'topic' && (
              classTopics.length === 0 ? (
                <div className="exgen__empty">
                  <p>No hay temas para esta clase.</p>
                </div>
              ) : (
                <div className="exgen__topics-list">
                  {classTopics.map((topic) => (
                    <div
                      key={topic.id}
                      className={`exgen__topic-chip ${selectedTopicIds.includes(topic.id) ? 'exgen__topic-chip--active' : ''}`}
                      onClick={() => toggleTopic(topic.id)}
                    >
                      <IonCheckbox checked={selectedTopicIds.includes(topic.id)} className="exgen__topic-check" />
                      <span className="exgen__topic-name">{topic.name}</span>
                      <IonBadge color="medium" className="exgen__topic-count">{topic.materialCount}</IonBadge>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Student selector (multi-mode only) */}
            {multiMode && (sourceType === 'topic' ? selectedTopicIds.length > 0 : !!selectedExamId) && (
              <div className="exgen__students">
                <div className="exgen__students-header">
                  <span className="exgen__students-label">
                    Alumnos
                    <IonBadge color="primary" className="exgen__students-count">{selectedStudentIds.length}</IonBadge>
                  </span>
                  <div className="exgen__students-actions">
                    <button
                      className={`exgen__filter-chip ${selectedStudentIds.length === classStudents.length ? 'exgen__filter-chip--active' : ''}`}
                      onClick={() => setSelectedStudentIds(classStudents.map((s) => s.id))}
                    >
                      Todos
                    </button>
                    {studentsWithIssues.size > 0 && (
                      <button
                        className={`exgen__filter-chip exgen__filter-chip--warn ${selectedStudentIds.length === studentsWithIssues.size ? 'exgen__filter-chip--active' : ''}`}
                        onClick={() => setSelectedStudentIds(Array.from(studentsWithIssues))}
                      >
                        Con dificultades ({studentsWithIssues.size})
                      </button>
                    )}
                  </div>
                </div>
                <div className="exgen__students-list">
                  {classStudents.map((student) => {
                    const hasIssues = studentsWithIssues.has(student.id);
                    return (
                      <div
                        key={student.id}
                        className={`exgen__student-row ${selectedStudentIds.includes(student.id) ? 'exgen__student-row--selected' : ''}`}
                        onClick={() => toggleStudent(student.id)}
                      >
                        <IonCheckbox checked={selectedStudentIds.includes(student.id)} className="exgen__student-check" />
                        <span className="exgen__student-name">{student.name}</span>
                        {student.studentId && <span className="exgen__student-code">{student.studentId}</span>}
                        {hasIssues && <IonBadge color="warning" className="exgen__student-warn">!</IonBadge>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Advanced options */}
            <button className="exgen__options-toggle" onClick={() => setShowOptions(!showOptions)}>
              <span>Opciones avanzadas</span>
              <IonIcon icon={showOptions ? chevronUpOutline : chevronDownOutline} />
            </button>

            {showOptions && (
              <div className="exgen__options">
                <IonItem lines="none" className="exgen__select">
                  <IonLabel>Dificultad</IonLabel>
                  <IonSelect value={difficulty} onIonChange={(e) => setDifficulty(e.detail.value)} interface="popover">
                    <IonSelectOption value="easier">Mas facil</IonSelectOption>
                    <IonSelectOption value="same">Mismo nivel</IonSelectOption>
                    <IonSelectOption value="harder">Mas dificil</IonSelectOption>
                  </IonSelect>
                </IonItem>
                <IonItem lines="none" className="exgen__select">
                  <IonLabel>Preguntas</IonLabel>
                  <IonSelect value={numQuestions} onIonChange={(e) => setNumQuestions(e.detail.value)} interface="popover">
                    {[3, 4, 5, 6, 7, 8, 10].map((n) => (
                      <IonSelectOption key={n} value={n}>{n}</IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>
                <IonItem lines="none" className="exgen__textarea-item">
                  <IonTextarea
                    value={refinement}
                    onIonInput={(e) => setRefinement(e.detail.value ?? '')}
                    placeholder="Instrucciones adicionales (opcional)"
                    rows={2}
                  />
                </IonItem>
              </div>
            )}

            {error && (
              <div className="exgen__error"><IonBadge color="danger">{error}</IonBadge></div>
            )}

            {success ? (
              <div className="exgen__success-section">
                <div className="exgen__success">
                  <span className="exgen__success-icon">&#10003;</span>
                  <span>Ejercicios generados</span>
                </div>
                {multiMode && generatedIds.length > 1 && (
                  <div className="exgen__batch-downloads">
                    <IonButton
                      size="small"
                      fill="outline"
                      disabled={downloading}
                      onClick={async () => {
                        setDownloading(true);
                        try {
                          const res = await exercisesApi.batchDownload(generatedIds, false);
                          const blob = new Blob([res.data], { type: 'application/pdf' });
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = 'todos_ejercicios.pdf';
                          a.click();
                          URL.revokeObjectURL(a.href);
                        } catch (err) {
                          console.error('Batch download error:', err);
                        } finally {
                          setDownloading(false);
                        }
                      }}
                    >
                      <IonIcon icon={downloadOutline} slot="start" />
                      {downloading ? 'Descargando...' : 'Todos los ejercicios'}
                    </IonButton>
                    <IonButton
                      size="small"
                      fill="outline"
                      color="success"
                      disabled={downloading}
                      onClick={async () => {
                        setDownloading(true);
                        try {
                          const res = await exercisesApi.batchDownload(generatedIds, true);
                          const blob = new Blob([res.data], { type: 'application/pdf' });
                          const a = document.createElement('a');
                          a.href = URL.createObjectURL(blob);
                          a.download = 'todos_con_soluciones.pdf';
                          a.click();
                          URL.revokeObjectURL(a.href);
                        } catch (err) {
                          console.error('Batch download error:', err);
                        } finally {
                          setDownloading(false);
                        }
                      }}
                    >
                      <IonIcon icon={documentTextOutline} slot="start" />
                      {downloading ? 'Descargando...' : 'Con soluciones'}
                    </IonButton>
                  </div>
                )}
                <IonButton fill="clear" size="small" onClick={onDismiss} className="exgen__done-btn">
                  Cerrar
                </IonButton>
              </div>
            ) : (
              <IonButton expand="block" className="exgen__button" onClick={handleGenerate} disabled={!canGenerate}>
                {generating ? (
                  <><IonSpinner name="crescent" /> Generando...</>
                ) : (
                  <><IonIcon icon={sparkles} slot="start" /> Generar ejercicios{multiMode && selectedStudentIds.length > 0 ? ` (${selectedStudentIds.length})` : ''}</>
                )}
              </IonButton>
            )}
          </>
        )}
      </div>
    </IonModal>
  );
};

export default ExerciseGeneratorModal;
