import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonModal, IonButton, IonSelect, IonSelectOption, IonItem, IonLabel,
  IonBadge, IonTextarea, IonSpinner, IonIcon, IonCheckbox, IonToggle,
  IonSegment, IonSegmentButton, IonInput, IonSearchbar,
} from '@ionic/react';
import { sparkles, chevronDownOutline, chevronUpOutline, downloadOutline, documentTextOutline, globeOutline, schoolOutline } from 'ionicons/icons';
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
  studentId?: string;
  studentName?: string;
  weakAreas?: { topic: string }[];
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

  const [isTransversal, setIsTransversal] = useState(false);
  const [classId, setClassId] = useState('');
  const [sourceType, setSourceType] = useState<'exam' | 'topic'>('exam');
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
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
  const [examSearch, setExamSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [showExamPicker, setShowExamPicker] = useState(false);
  const [showStudentPicker, setShowStudentPicker] = useState(false);

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  
  const effectiveClassId = useMemo(() => {
    if (isTransversal) return '';
    if (multiMode) return classId;
    if (!studentId) return '';
    const student = allStudents.find((s) => s.id === studentId);
    return student?.classId || '';
  }, [isTransversal, multiMode, classId, studentId, allStudents]);

  const classStudents = useMemo(() => {
    if (isTransversal) {
      return allStudents;
    }
    return allStudents.filter((s) => s.classId === effectiveClassId);
  }, [allStudents, effectiveClassId, isTransversal]);

  const correctedExams = useMemo(() => {
    if (isTransversal) {
      return allExams.filter((e) => e.status === 'corrected');
    }
    if (!effectiveClassId) return [];
    if (studentId) {
      const studentCorrections = corrections.filter((c) => c.studentId === studentId);
      const examIds = new Set(studentCorrections.map((c) => c.examId));
      return allExams.filter((e) => e.status === 'corrected' && examIds.has(e.id));
    }
    return allExams.filter((e) => e.status === 'corrected' && e.classId === effectiveClassId);
  }, [allExams, corrections, studentId, effectiveClassId, isTransversal]);

  const allTopics = useMemo(() => {
    if (isTransversal) {
      return topicsList;
    }
    return topicsList.filter((t) => t.classId === effectiveClassId);
  }, [topicsList, effectiveClassId, isTransversal]);

  const studentsWithIssues = useMemo(() => {
    if (selectedExamIds.length === 0) return new Set<string>();
    const ids = new Set<string>();
    corrections
      .filter((c) => selectedExamIds.includes(c.examId) && c.weakAreas && c.weakAreas.length > 0)
      .forEach((c) => { if (c.studentId) ids.add(c.studentId); });
    return ids;
  }, [selectedExamIds, corrections]);

  // Group exams by class for transversal mode
  const examsByClass = useMemo(() => {
    const grouped = new Map<string, typeof correctedExams>();
    correctedExams.forEach((exam) => {
      const key = exam.classId || '__global__';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(exam);
    });
    return grouped;
  }, [correctedExams]);

  // Filter exams by search
  const filteredExams = useMemo(() => {
    if (!examSearch) return correctedExams;
    const term = examSearch.toLowerCase();
    return correctedExams.filter((e) => {
      const cls = classes.find((c) => c.id === e.classId);
      return e.name.toLowerCase().includes(term) || 
             cls?.name.toLowerCase().includes(term) ||
             cls?.subject?.toLowerCase().includes(term);
    });
  }, [correctedExams, examSearch, classes]);

  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!studentSearch) return classStudents;
    const term = studentSearch.toLowerCase();
    return classStudents.filter((s) => 
      s.name.toLowerCase().includes(term) ||
      s.studentId?.toLowerCase().includes(term)
    );
  }, [classStudents, studentSearch]);

  // Group students by class for transversal mode
  const studentsByClass = useMemo(() => {
    const grouped = new Map<string, typeof filteredStudents>();
    filteredStudents.forEach((student) => {
      const key = student.classId || '__global__';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(student);
    });
    return grouped;
  }, [filteredStudents]);

  useEffect(() => {
    if (isOpen) {
      if (multiMode) {
        setClassId(preClassId || '');
        if (preselectedExamId) {
          setSelectedExamIds([preselectedExamId]);
          setSourceType('exam');
        }
        fetchAllStudents();
      }
      classes.forEach((c) => fetchTopics(c.id));
    }
  }, [isOpen, multiMode, preClassId, preselectedExamId]);

  useEffect(() => {
    if (isOpen && !multiMode && correctedExams.length > 0 && selectedExamIds.length === 0) {
      setSelectedExamIds([correctedExams[0].id]);
    }
  }, [isOpen, multiMode, correctedExams, selectedExamIds.length]);

  useEffect(() => {
    if (effectiveClassId) fetchTopics(effectiveClassId);
  }, [effectiveClassId, fetchTopics]);

  useEffect(() => {
    if (multiMode && selectedExamIds.length > 0 && studentsWithIssues.size > 0) {
      setSelectedStudentIds(Array.from(studentsWithIssues));
    } else if (multiMode && selectedExamIds.length > 0) {
      setSelectedStudentIds(classStudents.map((s) => s.id));
    }
  }, [selectedExamIds, studentsWithIssues, classStudents, multiMode]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedExamIds([]);
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
      setIsTransversal(false);
      setExamSearch('');
      setStudentSearch('');
      setShowExamPicker(false);
      setShowStudentPicker(false);
    }
  }, [isOpen]);

  const toggleExam = (id: string) => {
    setSelectedExamIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

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
    if (sourceType === 'exam' && selectedExamIds.length === 0) return;
    if (sourceType === 'topic' && selectedTopicIds.length === 0) return;

    setGenerating(true);
    setError('');
    try {
      const result = await generateExercises({
        studentIds,
        name: exerciseName,
        sourceExamIds: sourceType === 'exam' ? selectedExamIds : undefined,
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
    const hasSource = sourceType === 'exam' ? selectedExamIds.length > 0 : selectedTopicIds.length > 0;
    const hasName = exerciseName.trim().length > 0;
    return hasStudents && hasSource && hasName && !generating;
  })();

  const getClassName = (classId: string) => {
    if (classId === '__global__') return 'Global';
    const cls = classes.find((c) => c.id === classId);
    return cls?.name || 'Sin clase';
  };

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
              ? (isTransversal 
                  ? 'Ejercicios transversales' 
                  : (classId ? classes.find((c) => c.id === classId)?.name || '' : 'Selecciona una clase'))
              : `Para ${studentName}`}
          </p>
        </div>

        {/* Transversal toggle (multi-mode only, when not pre-selected class) */}
        {multiMode && !preClassId && (
          <div className="exgen__mode-toggle">
            <button 
              className={`exgen__mode-btn ${!isTransversal ? 'exgen__mode-btn--active' : ''}`}
              onClick={() => { setIsTransversal(false); setSelectedExamIds([]); setSelectedStudentIds([]); }}
            >
              <IonIcon icon={schoolOutline} />
              <span>Por clase</span>
            </button>
            <button 
              className={`exgen__mode-btn ${isTransversal ? 'exgen__mode-btn--active' : ''}`}
              onClick={() => { setIsTransversal(true); setClassId(''); setSelectedExamIds([]); setSelectedStudentIds([]); }}
            >
              <IonIcon icon={globeOutline} />
              <span>Transversal</span>
            </button>
          </div>
        )}

        {/* Class selector (multi-mode only, when not transversal and not pre-selected) */}
        {multiMode && !preClassId && !isTransversal && (
          <IonItem lines="none" className="exgen__select">
            <IonLabel>Clase</IonLabel>
            <IonSelect
              value={classId}
              onIonChange={(e) => { setClassId(e.detail.value); setSelectedStudentIds([]); setSelectedExamIds([]); setSelectedTopicIds([]); }}
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

        {(effectiveClassId || isTransversal) && (
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
                  <p>No hay examenes corregidos{!isTransversal && multiMode ? ' para esta clase' : ''}.</p>
                </div>
              ) : (
                <div className="exgen__exam-picker">
                  <div 
                    className="exgen__picker-header"
                    onClick={() => setShowExamPicker(!showExamPicker)}
                  >
                    <span className="exgen__picker-label">
                      {selectedExamIds.length === 0 
                        ? 'Seleccionar exámenes' 
                        : `${selectedExamIds.length} examen${selectedExamIds.length !== 1 ? 'es' : ''} seleccionado${selectedExamIds.length !== 1 ? 's' : ''}`}
                    </span>
                    <IonIcon icon={showExamPicker ? chevronUpOutline : chevronDownOutline} />
                  </div>
                  
                  {showExamPicker && (
                    <div className="exgen__picker-dropdown">
                      {correctedExams.length > 5 && (
                        <IonSearchbar
                          value={examSearch}
                          onIonInput={(e) => setExamSearch(e.detail.value ?? '')}
                          placeholder="Buscar examen..."
                          className="exgen__picker-search"
                        />
                      )}
                      <div className="exgen__picker-list">
                        {isTransversal ? (
                          Array.from(examsByClass.entries()).map(([clsId, exams]) => {
                            const clsExams = exams.filter((e) => 
                              !examSearch || 
                              e.name.toLowerCase().includes(examSearch.toLowerCase())
                            );
                            if (clsExams.length === 0) return null;
                            return (
                              <div key={clsId} className="exgen__picker-group">
                                <div className="exgen__picker-group-header">
                                  <IonIcon icon={schoolOutline} />
                                  <span>{getClassName(clsId)}</span>
                                </div>
                                {clsExams.map((exam) => (
                                  <div
                                    key={exam.id}
                                    className={`exgen__picker-item ${selectedExamIds.includes(exam.id) ? 'exgen__picker-item--selected' : ''}`}
                                    onClick={() => toggleExam(exam.id)}
                                  >
                                    <IonCheckbox checked={selectedExamIds.includes(exam.id)} />
                                    <span className="exgen__picker-item-name">{exam.name}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })
                        ) : (
                          filteredExams.map((exam) => (
                            <div
                              key={exam.id}
                              className={`exgen__picker-item ${selectedExamIds.includes(exam.id) ? 'exgen__picker-item--selected' : ''}`}
                              onClick={() => toggleExam(exam.id)}
                            >
                              <IonCheckbox checked={selectedExamIds.includes(exam.id)} />
                              <span className="exgen__picker-item-name">{exam.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {/* Source: Topics */}
            {sourceType === 'topic' && (
              allTopics.length === 0 ? (
                <div className="exgen__empty">
                  <p>No hay temas{!isTransversal ? ' para esta clase' : ''}.</p>
                </div>
              ) : (
                <div className="exgen__topics-list">
                  {allTopics.map((topic) => (
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
            {multiMode && (sourceType === 'topic' ? selectedTopicIds.length > 0 : selectedExamIds.length > 0) && (
              <div className="exgen__students">
                <div 
                  className="exgen__picker-header"
                  onClick={() => setShowStudentPicker(!showStudentPicker)}
                >
                  <span className="exgen__picker-label">
                    Alumnos
                    <IonBadge color="primary" className="exgen__students-count">{selectedStudentIds.length}</IonBadge>
                  </span>
                  <IonIcon icon={showStudentPicker ? chevronUpOutline : chevronDownOutline} />
                </div>
                
                {showStudentPicker && (
                  <div className="exgen__picker-dropdown">
                    <div className="exgen__students-actions">
                      <button
                        className={`exgen__filter-chip ${selectedStudentIds.length === classStudents.length ? 'exgen__filter-chip--active' : ''}`}
                        onClick={() => setSelectedStudentIds(classStudents.map((s) => s.id))}
                      >
                        Todos ({classStudents.length})
                      </button>
                      {studentsWithIssues.size > 0 && (
                        <button
                          className={`exgen__filter-chip exgen__filter-chip--warn ${selectedStudentIds.length === studentsWithIssues.size ? 'exgen__filter-chip--active' : ''}`}
                          onClick={() => setSelectedStudentIds(Array.from(studentsWithIssues))}
                        >
                          Con dificultades ({studentsWithIssues.size})
                        </button>
                      )}
                      <button
                        className="exgen__filter-chip"
                        onClick={() => setSelectedStudentIds([])}
                      >
                        Ninguno
                      </button>
                    </div>
                    
                    {classStudents.length > 10 && (
                      <IonSearchbar
                        value={studentSearch}
                        onIonInput={(e) => setStudentSearch(e.detail.value ?? '')}
                        placeholder="Buscar alumno..."
                        className="exgen__picker-search"
                      />
                    )}
                    
                    <div className="exgen__picker-list exgen__picker-list--students">
                      {isTransversal ? (
                        Array.from(studentsByClass.entries()).map(([clsId, students]) => {
                          if (students.length === 0) return null;
                          return (
                            <div key={clsId} className="exgen__picker-group">
                              <div className="exgen__picker-group-header">
                                <IonIcon icon={schoolOutline} />
                                <span>{getClassName(clsId)}</span>
                                <button 
                                  className="exgen__picker-group-toggle"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const ids = students.map((s) => s.id);
                                    const allSelected = ids.every((id) => selectedStudentIds.includes(id));
                                    if (allSelected) {
                                      setSelectedStudentIds((prev) => prev.filter((id) => !ids.includes(id)));
                                    } else {
                                      setSelectedStudentIds((prev) => [...new Set([...prev, ...ids])]);
                                    }
                                  }}
                                >
                                  {students.every((s) => selectedStudentIds.includes(s.id)) ? 'Quitar' : 'Añadir'} todos
                                </button>
                              </div>
                              {students.map((student) => {
                                const hasIssues = studentsWithIssues.has(student.id);
                                return (
                                  <div
                                    key={student.id}
                                    className={`exgen__picker-item ${selectedStudentIds.includes(student.id) ? 'exgen__picker-item--selected' : ''}`}
                                    onClick={() => toggleStudent(student.id)}
                                  >
                                    <IonCheckbox checked={selectedStudentIds.includes(student.id)} />
                                    <span className="exgen__picker-item-name">{student.name}</span>
                                    {student.studentId && <span className="exgen__picker-item-code">{student.studentId}</span>}
                                    {hasIssues && <IonBadge color="warning" className="exgen__picker-item-warn">!</IonBadge>}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })
                      ) : (
                        filteredStudents.map((student) => {
                          const hasIssues = studentsWithIssues.has(student.id);
                          return (
                            <div
                              key={student.id}
                              className={`exgen__picker-item ${selectedStudentIds.includes(student.id) ? 'exgen__picker-item--selected' : ''}`}
                              onClick={() => toggleStudent(student.id)}
                            >
                              <IonCheckbox checked={selectedStudentIds.includes(student.id)} />
                              <span className="exgen__picker-item-name">{student.name}</span>
                              {student.studentId && <span className="exgen__picker-item-code">{student.studentId}</span>}
                              {hasIssues && <IonBadge color="warning" className="exgen__picker-item-warn">!</IonBadge>}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
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
