import { useState, useEffect, useMemo } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonSelect, IonSelectOption,
  IonItem, IonLabel, IonSegment, IonSegmentButton, IonList, IonCheckbox,
  IonBadge, IonTextarea, IonSpinner, IonIcon, IonChip, IonSearchbar,
} from '@ionic/react';
import {
  sparkles, alertCircleOutline, chevronDownOutline, chevronUpOutline,
  filterOutline, downloadOutline, documentTextOutline,
  checkboxOutline, closeOutline, chevronForwardOutline,
  checkmarkCircle, ellipseOutline,
} from 'ionicons/icons';
import { useLocation } from 'react-router-dom';
import { useStudentsStore } from '../../store/studentsStore';
import { useClassesStore } from '../../store/classesStore';
import { useExamsStore } from '../../store/examsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useExercisesStore } from '../../store/exercisesStore';
import { useTopicsStore } from '../../store/topicsStore';
import { exercises as exercisesApi } from '../../services/api';
import ExerciseCompactCard from '../../components/ExerciseCompactCard';
import EmptyState from '../../components/EmptyState';
import './Exercises.css';

const Exercises: React.FC = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const preselectedStudentId = queryParams.get('studentId');

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  
  const allStudents = useStudentsStore((s) => s.students);
  const fetchAllStudents = useStudentsStore((s) => s.fetchAllStudents);
  
  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  
  const corrections = useCorrectionStore((s) => s.corrections);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);
  
  const exercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const generateExercises = useExercisesStore((s) => s.generateExercises);
  const deleteExercise = useExercisesStore((s) => s.deleteExercise);
  const renameExercise = useExercisesStore((s) => s.renameExercise);
  const loading = useExercisesStore((s) => s.loading);

  const topicsList = useTopicsStore((s) => s.topics);
  const fetchTopics = useTopicsStore((s) => s.fetchTopics);

  const [tab, setTab] = useState<'generate' | 'assigned'>('assigned');
  const [preselectedHandled, setPreselectedHandled] = useState(false);
  
  // Generate tab state
  const [sourceType, setSourceType] = useState<'exam' | 'topic'>('exam');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [exerciseName, setExerciseName] = useState('');
  const [refinement, setRefinement] = useState('');
  const [difficulty, setDifficulty] = useState<'easier' | 'same' | 'harder'>('same');
  const [numQuestions, setNumQuestions] = useState(5);
  const [showOptions, setShowOptions] = useState(false);
  const [showStudentList, setShowStudentList] = useState(false);
  const [showTopicList, setShowTopicList] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  
  // Assigned tab state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'student' | 'questions'>('date');
  const [showFilters, setShowFilters] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);

  const correctedExams = useMemo(() => {
    return allExams.filter((e) => e.status === 'corrected');
  }, [allExams]);

  const examsWithIssues = useMemo(() => {
    const examIdsWithIssues = new Set<string>();
    corrections
      .filter((c) => c.weakAreas && c.weakAreas.length > 0)
      .forEach((c) => examIdsWithIssues.add(c.examId));
    return examIdsWithIssues;
  }, [corrections]);

  const effectiveClassId = useMemo(() => {
    if (sourceType === 'exam' && selectedExamId) {
      const exam = allExams.find((e) => e.id === selectedExamId);
      return exam?.classId || '';
    }
    return selectedClassId;
  }, [sourceType, selectedExamId, selectedClassId, allExams]);

  const studentsInClass = useMemo(() => {
    if (!effectiveClassId) return [];
    return allStudents.filter((s) => s.classId === effectiveClassId);
  }, [effectiveClassId, allStudents]);

  const filteredStudentsInClass = useMemo(() => {
    if (!studentSearch) return studentsInClass;
    const term = studentSearch.toLowerCase();
    return studentsInClass.filter((s) => s.name.toLowerCase().includes(term));
  }, [studentsInClass, studentSearch]);

  const classTopics = useMemo(
    () => topicsList.filter((t) => t.classId === effectiveClassId),
    [topicsList, effectiveClassId]
  );

  const studentIdsWithIssues = useMemo(() => {
    if (!selectedExamId) return new Set<string>();
    const ids = new Set<string>();
    corrections
      .filter((c) => c.examId === selectedExamId && c.weakAreas && c.weakAreas.length > 0)
      .forEach((c) => {
        if (c.studentId) ids.add(c.studentId);
      });
    return ids;
  }, [selectedExamId, corrections]);

  const examWeakAreas = useMemo(() => {
    if (!selectedExamId || selectedStudentIds.length === 0) return [];
    const areas = new Set<string>();
    corrections
      .filter((c) => 
        c.examId === selectedExamId && 
        selectedStudentIds.includes(c.studentId) &&
        c.weakAreas
      )
      .forEach((c) => {
        c.weakAreas?.forEach((area) => areas.add(area));
      });
    return Array.from(areas);
  }, [selectedExamId, selectedStudentIds, corrections]);

  useEffect(() => {
    fetchClasses();
    fetchAllStudents();
    fetchExercises();
    fetchExams();
    fetchAllCorrections();
  }, [fetchClasses, fetchAllStudents, fetchExercises, fetchExams, fetchAllCorrections]);

  useEffect(() => {
    if (effectiveClassId) fetchTopics(effectiveClassId);
  }, [effectiveClassId, fetchTopics]);

  useEffect(() => {
    if (preselectedStudentId && !preselectedHandled && allStudents.length > 0 && correctedExams.length > 0) {
      const student = allStudents.find(s => s.id === preselectedStudentId);
      if (student) {
        const studentExams = correctedExams.filter(e => e.classId === student.classId);
        if (studentExams.length > 0) {
          setSelectedExamId(studentExams[0].id);
          setSelectedStudentIds([preselectedStudentId]);
          setPreselectedHandled(true);
          setTab('generate');
        }
      }
    }
  }, [preselectedStudentId, preselectedHandled, allStudents, correctedExams]);

  useEffect(() => {
    if (preselectedStudentId && !preselectedHandled) return;
    
    if (sourceType === 'exam' && selectedExamId) {
      if (studentIdsWithIssues.size > 0) {
        setSelectedStudentIds(Array.from(studentIdsWithIssues));
      } else {
        setSelectedStudentIds(studentsInClass.map(s => s.id));
      }
    } else if (sourceType === 'topic' && selectedClassId && selectedTopicIds.length > 0) {
      setSelectedStudentIds(studentsInClass.map(s => s.id));
    } else if (sourceType === 'exam') {
      setSelectedStudentIds([]);
    }
  }, [sourceType, selectedExamId, selectedClassId, selectedTopicIds, studentIdsWithIssues, studentsInClass, preselectedStudentId, preselectedHandled]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const toggleTopicId = (id: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const canGenerate = useMemo(() => {
    if (!exerciseName.trim() || selectedStudentIds.length === 0 || generating) return false;
    if (sourceType === 'exam') return !!selectedExamId;
    return selectedTopicIds.length > 0;
  }, [exerciseName, selectedStudentIds, generating, sourceType, selectedExamId, selectedTopicIds]);

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setError('');
    try {
      await generateExercises({
        studentIds: selectedStudentIds,
        name: exerciseName,
        sourceExamIds: sourceType === 'exam' ? [selectedExamId] : undefined,
        sourceTopicIds: sourceType === 'topic' ? selectedTopicIds : undefined,
        focusTopics: selectedTopics.length > 0 ? selectedTopics : undefined,
        refinementPrompt: refinement || undefined,
        difficulty,
        numQuestions
      });
      setSelectedStudentIds([]);
      setSelectedExamId('');
      setSelectedClassId('');
      setSelectedTopicIds([]);
      setSelectedTopics([]);
      setExerciseName('');
      setRefinement('');
      setTab('assigned');
    } catch (err: any) {
      console.error('Failed to generate exercises:', err);
      setError(err.response?.data?.detail || 'Error al generar ejercicios');
    } finally {
      setGenerating(false);
    }
  };

  const selectedStudentNames = useMemo(() => {
    return selectedStudentIds
      .map((id) => allStudents.find((s) => s.id === id)?.name)
      .filter(Boolean);
  }, [selectedStudentIds, allStudents]);

  const filteredAndSortedExercises = useMemo(() => {
    let filtered = exercises;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((exercise) => {
        const student = allStudents.find((s) => s.id === exercise.studentId);
        const studentName = student?.name?.toLowerCase() || '';
        const weakAreas = exercise.weakAreas.join(' ').toLowerCase();
        const name = exercise.name?.toLowerCase() || '';
        return studentName.includes(term) || weakAreas.includes(term) || name.includes(term);
      });
    }

    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime();
        case 'student': {
          const studentA = allStudents.find((s) => s.id === a.studentId)?.name || '';
          const studentB = allStudents.find((s) => s.id === b.studentId)?.name || '';
          return studentA.localeCompare(studentB);
        }
        case 'questions':
          return b.questions.length - a.questions.length;
        default:
          return 0;
      }
    });

    return filtered;
  }, [exercises, searchTerm, sortBy, allStudents]);

  // Group exercises by name for the grouped view
  const groupedExercises = useMemo(() => {
    const groups = new Map<string, typeof exercises>();
    filteredAndSortedExercises.forEach((ex) => {
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
  }, [filteredAndSortedExercises]);

  const toggleGroupExpanded = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleDeleteExercise = async (id: string) => {
    try {
      await deleteExercise(id);
      setSelectedExerciseIds((prev) => prev.filter((eid) => eid !== id));
    } catch (error) {
      console.error('Failed to delete exercise:', error);
    }
  };

  const handleRenameExercise = async (id: string, name: string) => {
    try {
      await renameExercise(id, name);
    } catch (error) {
      console.error('Failed to rename exercise:', error);
    }
  };

  const toggleExerciseSelect = (id: string) => {
    setSelectedExerciseIds((prev) =>
      prev.includes(id) ? prev.filter((eid) => eid !== id) : [...prev, id]
    );
  };

  const toggleGroupSelect = (groupExerciseIds: string[]) => {
    setSelectedExerciseIds((prev) => {
      const allSelected = groupExerciseIds.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !groupExerciseIds.includes(id));
      }
      const merged = new Set([...prev, ...groupExerciseIds]);
      return Array.from(merged);
    });
  };

  const handleBatchDownload = async (includeSolutions: boolean) => {
    if (selectedExerciseIds.length === 0) return;
    setBatchDownloading(true);
    try {
      const res = await exercisesApi.batchDownload(selectedExerciseIds, includeSolutions);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = includeSolutions ? 'todos_con_soluciones.pdf' : 'todos_ejercicios.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Batch download error:', err);
    } finally {
      setBatchDownloading(false);
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedExerciseIds([]);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Ejercicios</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={tab} onIonChange={(e) => setTab(e.detail.value as typeof tab)}>
            <IonSegmentButton value="assigned"><IonLabel>Asignados</IonLabel></IonSegmentButton>
            <IonSegmentButton value="generate"><IonLabel>Generar</IonLabel></IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding exercises-content">
        {tab === 'generate' && (
          <div className="generate-stepper">
            {/* Progress indicator */}
            <div className="stepper-progress">
              <div className={`stepper-dot ${exerciseName.trim() ? 'stepper-dot--completed' : 'stepper-dot--active'}`} />
              <div className={`stepper-line ${exerciseName.trim() ? 'stepper-line--completed' : ''}`} />
              <div className={`stepper-dot ${(sourceType === 'exam' ? selectedExamId : selectedTopicIds.length > 0) ? 'stepper-dot--completed' : exerciseName.trim() ? 'stepper-dot--active' : ''}`} />
              <div className={`stepper-line ${(sourceType === 'exam' ? selectedExamId : selectedTopicIds.length > 0) ? 'stepper-line--completed' : ''}`} />
              <div className={`stepper-dot ${selectedStudentIds.length > 0 ? 'stepper-dot--completed' : (sourceType === 'exam' ? selectedExamId : selectedTopicIds.length > 0) ? 'stepper-dot--active' : ''}`} />
            </div>

            {/* Step 1: Name */}
            <div className="stepper-step">
              <div className="stepper-step__header">
                <div className={`stepper-step__number ${exerciseName.trim() ? 'stepper-step__number--completed' : ''}`}>
                  {exerciseName.trim() ? <IonIcon icon={checkmarkCircle} style={{ fontSize: 16 }} /> : '1'}
                </div>
                <span className="stepper-step__title">Nombre del ejercicio</span>
              </div>
              <div className="stepper-step__content">
                <input
                  type="text"
                  value={exerciseName}
                  onChange={(e) => setExerciseName(e.target.value)}
                  placeholder="Ej: Repaso fracciones, Práctica verbos..."
                  style={{
                    width: '100%',
                    border: '1px solid rgba(30, 41, 59, 0.1)',
                    borderRadius: 'var(--radius-sm)',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: '14px',
                    padding: '12px',
                  }}
                />
              </div>
            </div>

            {/* Step 2: Source */}
            <div className="stepper-step">
              <div className="stepper-step__header">
                <div className={`stepper-step__number ${(sourceType === 'exam' ? selectedExamId : selectedTopicIds.length > 0) ? 'stepper-step__number--completed' : ''}`}>
                  {(sourceType === 'exam' ? selectedExamId : selectedTopicIds.length > 0) ? <IonIcon icon={checkmarkCircle} style={{ fontSize: 16 }} /> : '2'}
                </div>
                <span className="stepper-step__title">Fuente de contenido</span>
              </div>
              <div className="stepper-step__content">
                <IonSegment
                  value={sourceType}
                  onIonChange={(e) => {
                    const val = e.detail.value as 'exam' | 'topic';
                    setSourceType(val);
                    setSelectedExamId('');
                    setSelectedClassId('');
                    setSelectedTopicIds([]);
                    setSelectedStudentIds([]);
                    setSelectedTopics([]);
                  }}
                  style={{ margin: 0, width: '100%', marginBottom: 'var(--space-md)' }}
                >
                  <IonSegmentButton value="exam"><IonLabel>Examen corregido</IonLabel></IonSegmentButton>
                  <IonSegmentButton value="topic"><IonLabel>Temario</IonLabel></IonSegmentButton>
                </IonSegment>

                {sourceType === 'exam' && (
                  correctedExams.length === 0 ? (
                    <div className="exercises-empty-state">
                      <IonIcon icon={alertCircleOutline} />
                      <p>No hay exámenes corregidos.<br/>Corrige algunos exámenes primero.</p>
                    </div>
                  ) : (
                    <IonItem lines="none" className="compact-select">
                      <IonLabel>Examen</IonLabel>
                      <IonSelect
                        value={selectedExamId}
                        onIonChange={(e) => setSelectedExamId(e.detail.value)}
                        interface="popover"
                        placeholder="Seleccionar examen"
                      >
                        {correctedExams.map((exam) => {
                          const cls = allClasses.find((c) => c.id === exam.classId);
                          const hasIssues = examsWithIssues.has(exam.id);
                          const issueCount = corrections.filter(
                            (c) => c.examId === exam.id && c.weakAreas && c.weakAreas.length > 0
                          ).length;
                          return (
                            <IonSelectOption key={exam.id} value={exam.id}>
                              {exam.name} ({cls?.name}){hasIssues ? ` — ${issueCount} con problemas` : ''}
                            </IonSelectOption>
                          );
                        })}
                      </IonSelect>
                    </IonItem>
                  )
                )}

                {sourceType === 'topic' && (
                  <>
                    <IonItem lines="none" className="compact-select">
                      <IonLabel>Clase</IonLabel>
                      <IonSelect
                        value={selectedClassId}
                        onIonChange={(e) => {
                          setSelectedClassId(e.detail.value);
                          setSelectedTopicIds([]);
                          setSelectedStudentIds([]);
                        }}
                        interface="popover"
                        placeholder="Seleccionar clase"
                      >
                        {classes.map((c) => (
                          <IonSelectOption key={c.id} value={c.id}>{c.name} — {c.subject}</IonSelectOption>
                        ))}
                      </IonSelect>
                    </IonItem>

                    {selectedClassId && (
                      classTopics.length === 0 ? (
                        <div className="exercises-empty-state">
                          <IonIcon icon={alertCircleOutline} />
                          <p>No hay temas para esta clase.<br/>Añade temas en la sección de temario.</p>
                        </div>
                      ) : (
                        <div className="exercises-topic-select" style={{ marginTop: 'var(--space-sm)' }}>
                          <span className="exercises-topic-label">Temas ({selectedTopicIds.length} seleccionados)</span>
                          <div className="exercises-topic-chips">
                            {classTopics.map((topic) => (
                              <IonChip
                                key={topic.id}
                                color={selectedTopicIds.includes(topic.id) ? 'primary' : 'medium'}
                                onClick={() => toggleTopicId(topic.id)}
                              >
                                <IonCheckbox checked={selectedTopicIds.includes(topic.id)} style={{ marginRight: 6, '--size': '16px' }} />
                                <IonLabel className="text-truncate">{topic.name}</IonLabel>
                                <IonBadge color="medium" style={{ marginLeft: 4, fontSize: '10px' }}>{topic.materialCount}</IonBadge>
                              </IonChip>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Step 3: Students (only shown when source is selected) */}
            {((sourceType === 'exam' && selectedExamId) || (sourceType === 'topic' && selectedTopicIds.length > 0)) && (
              <div className="stepper-step">
                <div className="stepper-step__header">
                  <div className={`stepper-step__number ${selectedStudentIds.length > 0 ? 'stepper-step__number--completed' : ''}`}>
                    {selectedStudentIds.length > 0 ? <IonIcon icon={checkmarkCircle} style={{ fontSize: 16 }} /> : '3'}
                  </div>
                  <span className="stepper-step__title">Alumnos</span>
                  <span className="stepper-step__subtitle">{selectedStudentIds.length} seleccionados</span>
                </div>
                <div className="stepper-step__content">
                  <div className="students-quick-actions" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                    <IonChip 
                      color={selectedStudentIds.length === studentsInClass.length ? 'primary' : 'medium'}
                      onClick={() => setSelectedStudentIds(studentsInClass.map((s) => s.id))}
                    >
                      Todos ({studentsInClass.length})
                    </IonChip>
                    {sourceType === 'exam' && studentIdsWithIssues.size > 0 && (
                      <IonChip 
                        color={selectedStudentIds.length === studentIdsWithIssues.size ? 'warning' : 'medium'}
                        onClick={() => setSelectedStudentIds(Array.from(studentIdsWithIssues))}
                      >
                        Con problemas ({studentIdsWithIssues.size})
                      </IonChip>
                    )}
                    <IonChip 
                      color="medium"
                      onClick={() => setShowStudentList(!showStudentList)}
                    >
                      {showStudentList ? 'Ocultar lista' : 'Ver lista'}
                      <IonIcon icon={showStudentList ? chevronUpOutline : chevronDownOutline} style={{ marginLeft: 4 }} />
                    </IonChip>
                  </div>

                  {showStudentList && (
                    <>
                      {studentsInClass.length > 5 && (
                        <IonSearchbar
                          value={studentSearch}
                          onIonInput={(e) => setStudentSearch(e.detail.value ?? '')}
                          placeholder="Buscar alumno..."
                          className="students-search"
                        />
                      )}
                      <IonList className="students-checklist">
                        {filteredStudentsInClass.map((student) => {
                          const hasIssues = sourceType === 'exam' && studentIdsWithIssues.has(student.id);
                          return (
                            <IonItem key={student.id} lines="none" className="student-check-item">
                              <IonCheckbox 
                                slot="start" 
                                checked={selectedStudentIds.includes(student.id)}
                                onIonChange={() => toggleStudent(student.id)}
                              />
                              <IonLabel className="text-truncate">{student.name}</IonLabel>
                              {hasIssues && <IonBadge color="warning" slot="end">!</IonBadge>}
                            </IonItem>
                          );
                        })}
                        {filteredStudentsInClass.length === 0 && studentSearch && (
                          <IonItem lines="none" className="student-check-item">
                            <IonLabel color="medium">Sin resultados</IonLabel>
                          </IonItem>
                        )}
                      </IonList>
                    </>
                  )}

                  {/* Weak areas focus (exam mode only) */}
                  {sourceType === 'exam' && examWeakAreas.length > 0 && (
                    <div style={{ marginTop: 'var(--space-md)' }}>
                      <div 
                        className="weak-areas-inline weak-areas-clickable"
                        onClick={() => setShowTopicList(!showTopicList)}
                      >
                        <span>Temas a reforzar:</span>
                        {selectedTopics.length > 0 ? (
                          <>
                            {selectedTopics.slice(0, 3).map((area) => (
                              <IonBadge key={area} color="primary">{area}</IonBadge>
                            ))}
                            {selectedTopics.length > 3 && (
                              <IonBadge color="medium">+{selectedTopics.length - 3}</IonBadge>
                            )}
                          </>
                        ) : (
                          <>
                            {examWeakAreas.slice(0, 3).map((area) => (
                              <IonBadge key={area} color="warning">{area}</IonBadge>
                            ))}
                            {examWeakAreas.length > 3 && (
                              <IonBadge color="medium">+{examWeakAreas.length - 3}</IonBadge>
                            )}
                            <span className="auto-label">Auto</span>
                          </>
                        )}
                        <IonIcon icon={showTopicList ? chevronUpOutline : chevronDownOutline} />
                      </div>

                      {showTopicList && (
                        <div className="topic-select-panel">
                          <div className="students-quick-actions">
                            <IonChip 
                              color={selectedTopics.length === 0 ? 'primary' : 'medium'}
                              onClick={() => setSelectedTopics([])}
                            >
                              Automático
                            </IonChip>
                            <IonChip 
                              color={selectedTopics.length === examWeakAreas.length ? 'warning' : 'medium'}
                              onClick={() => setSelectedTopics([...examWeakAreas])}
                            >
                              Todos ({examWeakAreas.length})
                            </IonChip>
                          </div>
                          <IonList className="students-checklist">
                            {examWeakAreas.map((area) => (
                              <IonItem key={area} lines="none" className="student-check-item">
                                <IonCheckbox 
                                  slot="start" 
                                  checked={selectedTopics.includes(area)}
                                  onIonChange={() => toggleTopic(area)}
                                />
                                <IonLabel className="text-truncate">{area}</IonLabel>
                              </IonItem>
                            ))}
                          </IonList>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Advanced options (collapsible, outside steps) */}
            {((sourceType === 'exam' && selectedExamId) || (sourceType === 'topic' && selectedTopicIds.length > 0)) && (
              <>
                <div 
                  className="options-toggle"
                  onClick={() => setShowOptions(!showOptions)}
                >
                  <span>Opciones avanzadas</span>
                  <IonIcon icon={showOptions ? chevronUpOutline : chevronDownOutline} />
                </div>

                {showOptions && (
                  <div className="options-panel">
                    <IonItem lines="none" className="compact-select">
                      <IonLabel>Dificultad</IonLabel>
                      <IonSelect value={difficulty} onIonChange={(e) => setDifficulty(e.detail.value)} interface="popover">
                        <IonSelectOption value="easier">Más fácil</IonSelectOption>
                        <IonSelectOption value="same">Mismo nivel</IonSelectOption>
                        <IonSelectOption value="harder">Más difícil</IonSelectOption>
                      </IonSelect>
                    </IonItem>
                    <IonItem lines="none" className="compact-select">
                      <IonLabel>Preguntas</IonLabel>
                      <IonSelect value={numQuestions} onIonChange={(e) => setNumQuestions(e.detail.value)} interface="popover">
                        {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <IonSelectOption key={n} value={n}>{n}</IonSelectOption>
                        ))}
                      </IonSelect>
                    </IonItem>
                    <IonItem lines="none" className="compact-textarea">
                      <IonTextarea
                        value={refinement}
                        onIonInput={(e) => setRefinement(e.detail.value ?? '')}
                        placeholder="Instrucciones adicionales (opcional)"
                        rows={2}
                      />
                    </IonItem>
                  </div>
                )}

                {/* Requirements checklist */}
                <div className="generate-requirements">
                  <div className={`generate-requirement ${exerciseName.trim() ? 'generate-requirement--met' : 'generate-requirement--missing'}`}>
                    <IonIcon icon={exerciseName.trim() ? checkmarkCircle : ellipseOutline} />
                    <span>Nombre del ejercicio</span>
                  </div>
                  <div className={`generate-requirement ${(sourceType === 'exam' ? selectedExamId : selectedTopicIds.length > 0) ? 'generate-requirement--met' : 'generate-requirement--missing'}`}>
                    <IonIcon icon={(sourceType === 'exam' ? selectedExamId : selectedTopicIds.length > 0) ? checkmarkCircle : ellipseOutline} />
                    <span>Fuente seleccionada</span>
                  </div>
                  <div className={`generate-requirement ${selectedStudentIds.length > 0 ? 'generate-requirement--met' : 'generate-requirement--missing'}`}>
                    <IonIcon icon={selectedStudentIds.length > 0 ? checkmarkCircle : ellipseOutline} />
                    <span>Al menos 1 alumno</span>
                  </div>
                </div>

                {error && (
                  <div className="exercises-error">
                    <IonBadge color="danger">{error}</IonBadge>
                  </div>
                )}

                <IonButton 
                  expand="block" 
                  className="generate-btn" 
                  onClick={handleGenerate} 
                  disabled={!canGenerate}
                >
                  {generating ? (
                    <><IonSpinner name="crescent" /> Generando...</>
                  ) : (
                    <><IonIcon icon={sparkles} slot="start" /> Generar ejercicios</>
                  )}
                </IonButton>
              </>
            )}
          </div>
        )}

        {tab === 'assigned' && (
          <div className="exercises-assigned">
            {loading && (
              <div className="exercises-skeleton">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton-group">
                    <div className="skeleton-group__header">
                      <div className="skeleton skeleton-group__chevron" />
                      <div className="skeleton skeleton-group__title" />
                      <div className="skeleton skeleton-group__badge" />
                      <div className="skeleton skeleton-group__date" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {!loading && exercises.length === 0 ? (
              <EmptyState icon="🏋️" title="Aún no hay ejercicios" actionLabel="Generar" onAction={() => setTab('generate')} />
            ) : (
              <>
                <div className="exercises-assigned-controls">
                  <IonSearchbar
                    value={searchTerm}
                    onIonInput={(e) => setSearchTerm(e.detail.value!)}
                    placeholder="Buscar por nombre, estudiante o área..."
                    className="exercises-search"
                  />

                  
                  <div className="exercises-controls-row">
                    <div className="exercises-right-controls">
                      {!selectMode ? (
                        <IonButton
                          fill="clear"
                          size="small"
                          onClick={() => setSelectMode(true)}
                        >
                          <IonIcon icon={checkboxOutline} slot="start" />
                          Seleccionar
                        </IonButton>
                      ) : (
                        <IonButton
                          fill="clear"
                          size="small"
                          color="medium"
                          onClick={exitSelectMode}
                        >
                          <IonIcon icon={closeOutline} slot="start" />
                          Cancelar
                        </IonButton>
                      )}
                      <IonButton
                        fill="clear"
                        size="small"
                        onClick={() => setShowFilters(!showFilters)}
                      >
                        <IonIcon icon={filterOutline} slot="start" />
                        Filtros
                      </IonButton>
                    </div>
                  </div>

                  {/* Batch download bar */}
                  {selectMode && (
                    <div className="exercises-batch-bar">
                      <div className="exercises-batch-info">
                        <span>{selectedExerciseIds.length} seleccionados</span>
                        <IonButton
                          fill="clear"
                          size="small"
                          onClick={() => setSelectedExerciseIds(filteredAndSortedExercises.map((e) => e.id))}
                        >
                          Seleccionar todos
                        </IonButton>
                      </div>
                      <div className="exercises-batch-actions">
                        <IonButton
                          size="small"
                          fill="outline"
                          disabled={selectedExerciseIds.length === 0 || batchDownloading}
                          onClick={() => handleBatchDownload(false)}
                        >
                          <IonIcon icon={documentTextOutline} slot="start" />
                          {batchDownloading ? 'Descargando...' : 'Ejercicios'}
                        </IonButton>
                        <IonButton
                          size="small"
                          fill="outline"
                          color="success"
                          disabled={selectedExerciseIds.length === 0 || batchDownloading}
                          onClick={() => handleBatchDownload(true)}
                        >
                          <IonIcon icon={downloadOutline} slot="start" />
                          {batchDownloading ? 'Descargando...' : 'Con soluciones'}
                        </IonButton>
                      </div>
                    </div>
                  )}

                  {showFilters && (
                    <div className="exercises-filters">
                      <IonItem lines="none" className="filter-item">
                        <IonLabel>Ordenar por</IonLabel>
                        <IonSelect
                          value={sortBy}
                          onIonChange={(e) => setSortBy(e.detail.value)}
                          interface="popover"
                        >
                          <IonSelectOption value="date">Fecha</IonSelectOption>
                          <IonSelectOption value="student">Estudiante</IonSelectOption>
                          <IonSelectOption value="questions">Nº preguntas</IonSelectOption>
                        </IonSelect>
                      </IonItem>
                    </div>
                  )}
                </div>

                {searchTerm && (
                  <div className="exercises-results-count">
                    {filteredAndSortedExercises.length} de {exercises.length} ejercicios
                  </div>
                )}

                {/* Grouped view */}
                <div className="exercises-grouped-view">
                  {groupedExercises.map((group) => {
                    const groupIds = group.exercises.map((ex) => ex.id);
                    const allGroupSelected = selectMode && groupIds.length > 0 && groupIds.every((id) => selectedExerciseIds.includes(id));
                    const someGroupSelected = selectMode && !allGroupSelected && groupIds.some((id) => selectedExerciseIds.includes(id));
                    return (
                    <div key={group.name} className="exercise-group">
                      <div
                        className="exercise-group__header"
                        onClick={() => toggleGroupExpanded(group.name)}
                      >
                        {selectMode && (
                          <IonCheckbox
                            checked={allGroupSelected}
                            indeterminate={someGroupSelected}
                            className="exercise-group__checkbox"
                            onClick={(e) => e.stopPropagation()}
                            onIonChange={() => toggleGroupSelect(groupIds)}
                          />
                        )}
                        <IonIcon
                          icon={expandedGroups.has(group.name) ? chevronDownOutline : chevronForwardOutline}
                          className="exercise-group__chevron"
                        />
                        <span className="exercise-group__name">{group.name}</span>
                        <IonBadge color="primary" className="exercise-group__count">
                          {group.count} {group.count === 1 ? 'alumno' : 'alumnos'}
                        </IonBadge>
                        <span className="exercise-group__date">
                          {new Date(group.latestDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      {expandedGroups.has(group.name) && (
                        <div className="exercise-group__content">
                          {group.exercises.map((ex) => {
                            const student = allStudents.find((s) => s.id === ex.studentId);
                            return (
                              <ExerciseCompactCard
                                key={ex.id}
                                exercise={ex}
                                studentName={student?.name}
                                onDelete={handleDeleteExercise}
                                onRename={handleRenameExercise}
                                selected={selectMode ? selectedExerciseIds.includes(ex.id) : undefined}
                                onToggleSelect={selectMode ? toggleExerciseSelect : undefined}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default Exercises;
