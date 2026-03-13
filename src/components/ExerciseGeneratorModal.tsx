import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonModal, IonButton, IonSelect, IonSelectOption, IonItem, IonLabel,
  IonBadge, IonTextarea, IonSpinner, IonIcon, IonCheckbox, IonToggle,
  IonSegment, IonSegmentButton, IonInput, IonSearchbar, IonChip,
} from '@ionic/react';
import { sparkles, chevronDownOutline, chevronUpOutline, downloadOutline, documentTextOutline, globeOutline, schoolOutline, peopleOutline, timeOutline, flashOutline, layersOutline, checkmarkCircleOutline, closeCircleOutline, eyeOutline } from 'ionicons/icons';
import { useExamsStore } from '../store/examsStore';
import { useClassesStore } from '../store/classesStore';
import { useStudentsStore } from '../store/studentsStore';
import { useCorrectionStore } from '../store/correctionStore';
import { useExercisesStore } from '../store/exercisesStore';
import { exercises as exercisesApi, batch, GroupedExercisePreview, subjects as subjectsApi } from '../services/api';
import { SubjectWithTopics } from '../types';
import BatchProgressModal from './BatchProgressModal';
import './ExerciseGeneratorModal.css';

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  studentId?: string;
  studentName?: string;
  weakAreas?: { topic: string }[];
  classId?: string;
  preselectedExamId?: string;
  preselectedSubjectId?: string;
}

const ExerciseGeneratorModal: React.FC<Props> = ({
  isOpen, onDismiss, studentId, studentName, weakAreas,
  classId: preClassId, preselectedExamId, preselectedSubjectId,
}) => {
  const multiMode = !studentId;

  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const allClasses = useClassesStore((s) => s.classes);
  const allStudents = useStudentsStore((s) => s.students);
  const fetchAllStudents = useStudentsStore((s) => s.fetchAllStudents);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const corrections = useCorrectionStore((s) => s.corrections);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);
  const generateExercises = useExercisesStore((s) => s.generateExercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const [topicsBySubject, setTopicsBySubject] = useState<SubjectWithTopics[]>([]);

  const [isTransversal, setIsTransversal] = useState(false);
  const [classId, setClassId] = useState('');
  const [sourceType, setSourceType] = useState<'exam' | 'topic'>('exam');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showOptions, setShowOptions] = useState(false);
  const [difficulty, setDifficulty] = useState<'easier' | 'same' | 'harder'>('same');
  const [numQuestions, setNumQuestions] = useState(5);
  const [numBlankPages, setNumBlankPages] = useState(1);
  const [refinement, setRefinement] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [generatedIds, setGeneratedIds] = useState<string[]>([]);
  const [generatedExercises, setGeneratedExercises] = useState<any[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [examSearch, setExamSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [showExamPicker, setShowExamPicker] = useState(false);
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [correctionDate, setCorrectionDate] = useState('');
  
  // Batch processing state
  const [groupByWeakness, setGroupByWeakness] = useState(true);
  const [uniquePerStudent, setUniquePerStudent] = useState(false);
  const [groupPreview, setGroupPreview] = useState<GroupedExercisePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  const [showBatchProgress, setShowBatchProgress] = useState(false);

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
      // For single student, show exams where the student has corrections with grades
      // This includes exams even if not fully "corrected" status
      const studentCorrections = corrections.filter((c) => c.studentId === studentId && c.grade !== null && c.grade !== undefined);
      const examIds = new Set(studentCorrections.map((c) => c.examId));
      // Include exams with corrections OR exams marked as corrected for this class
      return allExams.filter((e) => 
        (examIds.has(e.id)) || 
        (e.status === 'corrected' && e.classId === effectiveClassId)
      );
    }
    return allExams.filter((e) => e.status === 'corrected' && e.classId === effectiveClassId);
  }, [allExams, corrections, studentId, effectiveClassId, isTransversal]);

  const filteredTopics = useMemo(() => {
    if (!selectedSubjectId) return [];
    const subj = topicsBySubject.find((s) => s.subjectId === selectedSubjectId);
    return subj?.topics || [];
  }, [topicsBySubject, selectedSubjectId]);

  const allTopics = useMemo(
    () => topicsBySubject.flatMap((s) => s.topics),
    [topicsBySubject]
  );

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
      // Always fetch corrections to ensure we have the latest data
      fetchAllCorrections();
      
      if (multiMode) {
        setClassId(preClassId || '');
        if (preselectedExamId) {
          setSelectedExamIds([preselectedExamId]);
          setSourceType('exam');
        }
        // Fetch students for the specific class if provided, otherwise fetch all
        if (preClassId) {
          fetchStudents(preClassId);
          fetchExams(preClassId);
        } else {
          fetchAllStudents();
        }
      } else if (studentId) {
        // In single-student mode, fetch exams for the student's class
        const student = allStudents.find((s) => s.id === studentId);
        if (student?.classId) {
          fetchExams(student.classId);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, multiMode, preClassId, preselectedExamId, studentId]);

  useEffect(() => {
    if (isOpen && !multiMode && correctedExams.length > 0 && selectedExamIds.length === 0) {
      setSelectedExamIds([correctedExams[0].id]);
    }
  }, [isOpen, multiMode, correctedExams.length, selectedExamIds.length]);

  useEffect(() => {
    if (effectiveClassId) {
      subjectsApi.topicsForClass(effectiveClassId)
        .then((res) => {
          const grouped: SubjectWithTopics[] = res.data.map((s: any) => ({
            subjectId: s.subject_id,
            subjectName: s.subject_name,
            topics: (s.topics || []).map((t: any) => ({
              id: t.id,
              subjectId: s.subject_id,
              subjectName: s.subject_name,
              name: t.name,
              order: t.order,
              materialCount: t.material_count || 0,
            })),
          }));
          setTopicsBySubject(grouped);
          // Pre-select subject if provided
          if (preselectedSubjectId && grouped.some(s => s.subjectId === preselectedSubjectId)) {
            setSelectedSubjectId(preselectedSubjectId);
            setSourceType('topic');
          }
        })
        .catch(() => setTopicsBySubject([]));
    } else {
      setTopicsBySubject([]);
    }
  }, [effectiveClassId, preselectedSubjectId]);

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
      setGeneratingStep(0);
      setGeneratedIds([]);
      setGeneratedExercises([]);
      setDownloading(null);
      setSourceType('exam');
      setSelectedSubjectId('');
      setTopicsBySubject([]);
      setIsTransversal(false);
      setExamSearch('');
      setStudentSearch('');
      setShowExamPicker(false);
      setShowStudentPicker(false);
      setDeliveryDate('');
      setCorrectionDate('');
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

  // Fetch group preview when students and exams change (multi-mode only)
  useEffect(() => {
    const fetchPreview = async () => {
      if (!multiMode || selectedStudentIds.length <= 1 || !effectiveClassId) {
        setGroupPreview(null);
        return;
      }
      
      setLoadingPreview(true);
      try {
        const res = await batch.previewExerciseGroups({
          class_id: effectiveClassId,
          student_ids: selectedStudentIds,
          source_exam_ids: sourceType === 'exam' ? selectedExamIds : undefined,
          group_by_weakness: groupByWeakness,
        });
        setGroupPreview(res.data);
      } catch (err) {
        console.error('Failed to fetch group preview:', err);
        setGroupPreview(null);
      } finally {
        setLoadingPreview(false);
      }
    };
    
    const debounce = setTimeout(fetchPreview, 500);
    return () => clearTimeout(debounce);
  }, [multiMode, selectedStudentIds, selectedExamIds, effectiveClassId, groupByWeakness, sourceType]);

  const handleGenerate = async () => {
    const studentIds = multiMode ? selectedStudentIds : [studentId!];
    if (studentIds.length === 0) return;
    if (sourceType === 'exam' && selectedExamIds.length === 0) return;
    if (sourceType === 'topic' && selectedTopicIds.length === 0) return;

    setGenerating(true);
    setError('');
    
    // Use batch processing for multiple students
    if (multiMode && studentIds.length > 1 && effectiveClassId) {
      try {
        const response = await batch.startBatchExerciseGeneration({
          class_id: effectiveClassId,
          student_ids: studentIds,
          name: exerciseName,
          source_exam_ids: sourceType === 'exam' ? selectedExamIds : undefined,
          source_topic_ids: sourceType === 'topic' ? selectedTopicIds : undefined,
          num_questions: numQuestions,
          num_blank_pages: numBlankPages,
          difficulty,
          delivery_date: deliveryDate || undefined,
          correction_date: correctionDate || undefined,
          group_by_weakness: groupByWeakness,
          unique_per_student: uniquePerStudent,
        });
        setBatchJobId(response.data.id);
        setShowBatchProgress(true);
        setGenerating(false);
      } catch (err: any) {
        console.error('Batch generation failed, falling back to direct:', err);
        // Fallback to direct generation
        await handleDirectGenerate(studentIds);
      }
    } else {
      await handleDirectGenerate(studentIds);
    }
  };
  
  const handleDirectGenerate = async (studentIds: string[]) => {
    try {
      // Simulate generation steps for better UX
      setGeneratingStep(1);
      await new Promise(r => setTimeout(r, 800));
      setGeneratingStep(2);
      
      const result = await generateExercises({
        studentIds,
        name: exerciseName,
        sourceExamIds: sourceType === 'exam' ? selectedExamIds : undefined,
        sourceTopicIds: sourceType === 'topic' ? selectedTopicIds : undefined,
        refinementPrompt: refinement || undefined,
        difficulty,
        numQuestions,
        numBlankPages,
        deliveryDate: deliveryDate || undefined,
        correctionDate: correctionDate || undefined,
      });
      
      setGeneratingStep(3);
      await new Promise(r => setTimeout(r, 500));
      
      setSuccess(true);
      if (result && Array.isArray(result)) {
        setGeneratedIds(result.map((e: any) => e.id));
        setGeneratedExercises(result);
      }
      if (studentId) await fetchExercises(studentId);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al generar ejercicios');
    } finally {
      setGenerating(false);
      setGeneratingStep(0);
    }
  };
  
  const handleBatchComplete = async (job: { id: string; status: string }) => {
    // Fetch full job details to get the exercise IDs from results
    try {
      const jobRes = await batch.getJob(job.id);
      const results = jobRes.data.results as { items?: Array<{ result?: { exercise_ids?: string[] } }> } | undefined;
      
      if (results?.items) {
        // Extract all exercise IDs from the batch results
        const allExerciseIds: string[] = [];
        for (const item of results.items) {
          if (item.result?.exercise_ids) {
            allExerciseIds.push(...item.result.exercise_ids);
          }
        }
        
        if (allExerciseIds.length > 0) {
          setGeneratedIds(allExerciseIds);
          // Fetch exercise details for the generated exercises
          const exerciseDetails = await Promise.all(
            allExerciseIds.slice(0, 10).map(id => exercisesApi.get(id).then(r => r.data).catch(() => null))
          );
          setGeneratedExercises(exerciseDetails.filter(Boolean));
        }
      }
    } catch (err) {
      console.error('Error fetching batch job results:', err);
    }
    
    setShowBatchProgress(false);
    setBatchJobId(null);
    setSuccess(true);
    await fetchExercises();
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
              onClick={() => { setIsTransversal(true); setClassId(''); setSelectedExamIds([]); setSelectedStudentIds([]); fetchAllStudents(); }}
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
              onIonChange={(e) => { 
                const newClassId = e.detail.value;
                setClassId(newClassId); 
                setSelectedStudentIds([]); 
                setSelectedExamIds([]); 
                setSelectedTopicIds([]); 
                if (newClassId) {
                  fetchStudents(newClassId);
                }
              }}
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

            {/* Source: Topics - subject selector then topic list */}
            {sourceType === 'topic' && (
              topicsBySubject.length === 0 ? (
                <div className="exgen__empty">
                  <p>No hay asignaturas{!isTransversal ? ' para esta clase' : ''}.</p>
                </div>
              ) : (
                <>
                  {/* Subject selector */}
                  <IonItem lines="none" className="exgen__select">
                    <IonLabel>Asignatura</IonLabel>
                    <IonSelect
                      value={selectedSubjectId}
                      onIonChange={(e) => { setSelectedSubjectId(e.detail.value || ''); setSelectedTopicIds([]); }}
                      interface="popover"
                      placeholder="Seleccionar asignatura"
                    >
                      {topicsBySubject.map((s) => (
                        <IonSelectOption key={s.subjectId} value={s.subjectId}>
                          {s.subjectName} ({s.topics.length})
                        </IonSelectOption>
                      ))}
                    </IonSelect>
                  </IonItem>

                  {/* Topic list for selected subject */}
                  {selectedSubjectId && (
                    filteredTopics.length === 0 ? (
                      <div className="exgen__empty">
                        <p>No hay temas en esta asignatura.</p>
                      </div>
                    ) : (
                      <div className="exgen__topics-list">
                        {filteredTopics.map((topic) => (
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
                </>
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

            {/* Generation Mode (multi-student only) */}
            {multiMode && selectedStudentIds.length > 1 && (
              <div className="exgen__gen-section">
                <div className="exgen__gen-section-header">
                  <div className="exgen__gen-section-icon">
                    <IonIcon icon={sparkles} />
                  </div>
                  <div className="exgen__gen-section-title">
                    <h4>Configuración de generación</h4>
                    <p>{selectedStudentIds.length} estudiantes seleccionados</p>
                  </div>
                </div>
                
                <div className="exgen__gen-cards">
                  <button
                    className={`exgen__gen-card ${!uniquePerStudent ? 'exgen__gen-card--active' : ''}`}
                    onClick={() => setUniquePerStudent(false)}
                  >
                    <div className="exgen__gen-card-icon">
                      <IonIcon icon={peopleOutline} />
                    </div>
                    <div className="exgen__gen-card-content">
                      <span className="exgen__gen-card-title">Ejercicios por grupos</span>
                      <span className="exgen__gen-card-desc">Mismo contenido por área débil</span>
                    </div>
                    <div className="exgen__gen-card-badge exgen__gen-card-badge--fast">
                      <IonIcon icon={flashOutline} />
                      <span>Rápido</span>
                    </div>
                  </button>
                  
                  <button
                    className={`exgen__gen-card ${uniquePerStudent ? 'exgen__gen-card--active' : ''}`}
                    onClick={() => setUniquePerStudent(true)}
                  >
                    <div className="exgen__gen-card-icon">
                      <IonIcon icon={sparkles} />
                    </div>
                    <div className="exgen__gen-card-content">
                      <span className="exgen__gen-card-title">Único por alumno</span>
                      <span className="exgen__gen-card-desc">Ejercicios personalizados</span>
                    </div>
                    <div className="exgen__gen-card-badge exgen__gen-card-badge--premium">
                      <IonIcon icon={timeOutline} />
                      <span>+Tiempo</span>
                    </div>
                  </button>
                </div>
                
                {loadingPreview ? (
                  <div className="exgen__gen-preview-loading">
                    <IonSpinner name="dots" />
                    <span>Calculando grupos...</span>
                  </div>
                ) : groupPreview && !uniquePerStudent ? (
                  <div className="exgen__gen-preview">
                    <div className="exgen__gen-preview-stats">
                      <div className="exgen__gen-stat">
                        <span className="exgen__gen-stat-value">{groupPreview.total_groups}</span>
                        <span className="exgen__gen-stat-label">grupo{groupPreview.total_groups !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="exgen__gen-stat-divider"></div>
                      <div className="exgen__gen-stat">
                        <span className="exgen__gen-stat-value">{groupPreview.total_students}</span>
                        <span className="exgen__gen-stat-label">alumnos</span>
                      </div>
                      <div className="exgen__gen-stat-divider"></div>
                      <div className="exgen__gen-stat">
                        <span className="exgen__gen-stat-value">~{Math.ceil(groupPreview.estimated_generation_time_seconds / 60)}</span>
                        <span className="exgen__gen-stat-label">min</span>
                      </div>
                    </div>
                    <div className="exgen__gen-groups">
                      {groupPreview.groups.map((group, idx) => (
                        <div key={idx} className="exgen__gen-group-chip">
                          <span>{group.weakness}</span>
                          <span className="exgen__gen-group-count">{group.student_names.length}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : uniquePerStudent ? (
                  <div className="exgen__gen-preview exgen__gen-preview--unique">
                    <div className="exgen__gen-preview-stats">
                      <div className="exgen__gen-stat">
                        <span className="exgen__gen-stat-value">{selectedStudentIds.length}</span>
                        <span className="exgen__gen-stat-label">ejercicios únicos</span>
                      </div>
                      <div className="exgen__gen-stat-divider"></div>
                      <div className="exgen__gen-stat">
                        <span className="exgen__gen-stat-value">~{Math.ceil((selectedStudentIds.length * 15) / 60)}</span>
                        <span className="exgen__gen-stat-label">minutos</span>
                      </div>
                    </div>
                  </div>
                ) : null}
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
                <IonItem lines="none" className="exgen__select">
                  <IonLabel>Hojas de respuesta (QR)</IonLabel>
                  <IonSelect value={numBlankPages} onIonChange={(e) => setNumBlankPages(e.detail.value)} interface="popover">
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <IonSelectOption key={n} value={n}>{n === 0 ? 'Ninguna' : n}</IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>
                <div className="exgen__dates-row">
                  <IonItem lines="none" className="exgen__select exgen__select-half">
                    <IonInput
                      type="date"
                      value={deliveryDate}
                      onIonInput={(e) => setDeliveryDate(e.detail.value ?? '')}
                      label="Fecha entrega"
                      labelPlacement="stacked"
                    />
                  </IonItem>
                  <IonItem lines="none" className="exgen__select exgen__select-half">
                    <IonInput
                      type="date"
                      value={correctionDate}
                      onIonInput={(e) => setCorrectionDate(e.detail.value ?? '')}
                      label="Fecha recogida"
                      labelPlacement="stacked"
                    />
                  </IonItem>
                </div>
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

            {/* Generation Loading State */}
            {generating && (
              <div className="exgen__generating">
                <div className="exgen__generating-animation">
                  <div className="exgen__generating-brain">
                    <div className="exgen__generating-pulse"></div>
                    <div className="exgen__generating-pulse delay-1"></div>
                    <div className="exgen__generating-pulse delay-2"></div>
                    <IonIcon icon={sparkles} className="exgen__generating-icon" />
                  </div>
                </div>
                <div className="exgen__generating-text">
                  <h3>
                    {generatingStep === 0 && 'Preparando...'}
                    {generatingStep === 1 && 'Analizando contenido...'}
                    {generatingStep === 2 && 'Generando ejercicios con IA...'}
                    {generatingStep === 3 && 'Creando PDFs...'}
                  </h3>
                  <p>
                    {generatingStep <= 1 && 'Esto puede tardar unos segundos'}
                    {generatingStep === 2 && `Creando ${numQuestions} preguntas personalizadas`}
                    {generatingStep === 3 && 'Ya casi está listo'}
                  </p>
                </div>
                <div className="exgen__generating-steps">
                  <div className={`exgen__step ${generatingStep >= 1 ? 'exgen__step--active' : ''} ${generatingStep > 1 ? 'exgen__step--done' : ''}`}>
                    <span className="exgen__step-dot"></span>
                    <span className="exgen__step-label">Análisis</span>
                  </div>
                  <div className={`exgen__step ${generatingStep >= 2 ? 'exgen__step--active' : ''} ${generatingStep > 2 ? 'exgen__step--done' : ''}`}>
                    <span className="exgen__step-dot"></span>
                    <span className="exgen__step-label">IA</span>
                  </div>
                  <div className={`exgen__step ${generatingStep >= 3 ? 'exgen__step--active' : ''}`}>
                    <span className="exgen__step-dot"></span>
                    <span className="exgen__step-label">PDFs</span>
                  </div>
                </div>
              </div>
            )}

            {/* Success State */}
            {success && (
              <div className="exgen__success-container">
                <div className="exgen__success-header">
                  <div className="exgen__success-icon-wrapper">
                    <IonIcon icon={checkmarkCircleOutline} className="exgen__success-check" />
                  </div>
                  <h3 className="exgen__success-title">
                    {generatedIds.length === 1 ? '¡Ejercicio creado!' : `¡${generatedIds.length} ejercicios creados!`}
                  </h3>
                  <p className="exgen__success-subtitle">
                    {exerciseName || 'Ejercicios de refuerzo'} • {numQuestions} preguntas
                  </p>
                </div>

                <div className="exgen__success-downloads">
                  <p className="exgen__downloads-label">Descargar PDFs</p>
                  
                  {generatedIds.length === 1 ? (
                    <div className="exgen__download-cards">
                      <button
                        className={`exgen__download-card ${downloading === 'ex' ? 'exgen__download-card--loading' : ''}`}
                        onClick={() => {
                          const url = exercisesApi.downloadExercisesPdf(generatedIds[0]);
                          window.open(url, '_blank');
                        }}
                        disabled={!!downloading}
                      >
                        <div className="exgen__download-icon">
                          <IonIcon icon={downloadOutline} />
                        </div>
                        <span className="exgen__download-title">Ejercicios</span>
                        <span className="exgen__download-desc">PDF para el alumno</span>
                      </button>
                      
                      <button
                        className={`exgen__download-card exgen__download-card--solutions ${downloading === 'sol' ? 'exgen__download-card--loading' : ''}`}
                        onClick={() => {
                          const url = exercisesApi.downloadSolutionsPdf(generatedIds[0]);
                          window.open(url, '_blank');
                        }}
                        disabled={!!downloading}
                      >
                        <div className="exgen__download-icon">
                          <IonIcon icon={documentTextOutline} />
                        </div>
                        <span className="exgen__download-title">Soluciones</span>
                        <span className="exgen__download-desc">PDF con respuestas</span>
                      </button>
                    </div>
                  ) : (
                    <div className="exgen__download-cards">
                      <button
                        className={`exgen__download-card ${downloading === 'all-ex' ? 'exgen__download-card--loading' : ''}`}
                        onClick={async () => {
                          setDownloading('all-ex');
                          try {
                            const res = await exercisesApi.batchDownload(generatedIds, false);
                            const blob = new Blob([res.data], { type: 'application/pdf' });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = `${exerciseName || 'ejercicios'}_todos.pdf`;
                            a.click();
                            URL.revokeObjectURL(a.href);
                          } catch (err) {
                            console.error('Batch download error:', err);
                          } finally {
                            setDownloading(null);
                          }
                        }}
                        disabled={!!downloading}
                      >
                        <div className="exgen__download-icon">
                          {downloading === 'all-ex' ? <IonSpinner name="crescent" /> : <IonIcon icon={downloadOutline} />}
                        </div>
                        <span className="exgen__download-title">Todos los ejercicios</span>
                        <span className="exgen__download-desc">{generatedIds.length} PDFs en uno</span>
                      </button>
                      
                      <button
                        className={`exgen__download-card exgen__download-card--solutions ${downloading === 'all-sol' ? 'exgen__download-card--loading' : ''}`}
                        onClick={async () => {
                          setDownloading('all-sol');
                          try {
                            const res = await exercisesApi.batchDownload(generatedIds, true);
                            const blob = new Blob([res.data], { type: 'application/pdf' });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = `${exerciseName || 'ejercicios'}_con_soluciones.pdf`;
                            a.click();
                            URL.revokeObjectURL(a.href);
                          } catch (err) {
                            console.error('Batch download error:', err);
                          } finally {
                            setDownloading(null);
                          }
                        }}
                        disabled={!!downloading}
                      >
                        <div className="exgen__download-icon">
                          {downloading === 'all-sol' ? <IonSpinner name="crescent" /> : <IonIcon icon={documentTextOutline} />}
                        </div>
                        <span className="exgen__download-title">Con soluciones</span>
                        <span className="exgen__download-desc">Incluye respuestas</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="exgen__success-actions">
                  {generatedIds.length === 1 && (
                    <IonButton 
                      expand="block" 
                      fill="outline"
                      onClick={() => {
                        onDismiss();
                        // Navigate to the exercise detail if we have the info
                        if (generatedExercises.length > 0 && generatedExercises[0].classId) {
                          window.location.href = `/tabs/classes/${generatedExercises[0].classId}/exercises/${generatedIds[0]}`;
                        }
                      }}
                      className="exgen__success-btn"
                    >
                      <IonIcon icon={eyeOutline} slot="start" />
                      Ver ejercicio
                    </IonButton>
                  )}
                  <IonButton 
                    expand="block" 
                    onClick={onDismiss}
                    className="exgen__success-btn exgen__success-btn--primary"
                  >
                    Listo
                  </IonButton>
                </div>
              </div>
            )}

            {/* Generate Button */}
            {!generating && !success && (
              <IonButton expand="block" className="exgen__button" onClick={handleGenerate} disabled={!canGenerate}>
                <IonIcon icon={sparkles} slot="start" /> 
                Generar ejercicios{multiMode && selectedStudentIds.length > 0 ? ` (${selectedStudentIds.length})` : ''}
              </IonButton>
            )}
          </>
        )}
      </div>
      
      {/* Batch Progress Modal */}
      <BatchProgressModal
        isOpen={showBatchProgress}
        jobId={batchJobId}
        title="Generando ejercicios"
        onClose={() => {
          setShowBatchProgress(false);
          setBatchJobId(null);
        }}
        onComplete={handleBatchComplete}
      />
    </IonModal>
  );
};

export default ExerciseGeneratorModal;
