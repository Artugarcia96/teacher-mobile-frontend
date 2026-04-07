import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonModal, IonButton, IonSelect, IonSelectOption, IonItem, IonLabel,
  IonBadge, IonTextarea, IonSpinner, IonIcon, IonCheckbox, IonToggle,
  IonSegment, IonSegmentButton, IonInput, IonSearchbar, IonChip,
  IonHeader, IonToolbar, IonTitle, IonButtons, IonContent,
} from '@ionic/react';
import { sparkles, chevronDownOutline, chevronUpOutline, chevronForwardOutline, downloadOutline, documentTextOutline, globeOutline, schoolOutline, timeOutline, layersOutline, checkmarkCircleOutline, closeCircleOutline, closeOutline, eyeOutline, informationCircleOutline, medkitOutline, barbellOutline } from 'ionicons/icons';
import { useExamsStore } from '../store/examsStore';
import { useClassesStore } from '../store/classesStore';
import { useStudentsStore } from '../store/studentsStore';
import { useCorrectionStore } from '../store/correctionStore';
import { useExercisesStore } from '../store/exercisesStore';
import { exercises as exercisesApi, batch, GroupedExercisePreview, subjects as subjectsApi } from '../services/api';
import { SubjectWithTopics, WeakArea } from '../types';

import { useBackgroundTasksStore } from '../store/backgroundTasksStore';
import { useAcademicConfigStore } from '../store/academicConfigStore';
import { getPeriodNumbers, getPeriodLabel } from '../utils/periodConfig';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { subjectThemeStyle } from '../utils/subjectTheme';
import './ExerciseGeneratorModal.css';

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  studentId?: string;
  studentName?: string;
  weakAreas?: (WeakArea | { topic: string })[];
  classId?: string;
  preselectedExamId?: string;
  preselectedSubjectId?: string;
  preselectedTopicIds?: string[];
  preselectedName?: string;
  subjectColor?: string;
}

const ExerciseGeneratorModal: React.FC<Props> = ({
  isOpen, onDismiss, studentId, studentName, weakAreas,
  classId: preClassId, preselectedExamId, preselectedSubjectId,
  preselectedTopicIds, preselectedName, subjectColor,
}) => {
  const multiMode = !studentId;
  const isDesktop = useIsDesktop();

  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const allClasses = useClassesStore((s) => s.classes);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const allStudents = useStudentsStore((s) => s.students);
  const fetchAllStudents = useStudentsStore((s) => s.fetchAllStudents);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const corrections = useCorrectionStore((s) => s.corrections);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);
  const allExercises = useExercisesStore((s) => s.exercises);
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
  const [maxScore, setMaxScore] = useState(10);
  const [numBlankPages, setNumBlankPages] = useState(1);
  const [refinement, setRefinement] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
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
  const [exerciseType, setExerciseType] = useState<'practice' | 'recovery'>('practice');
  const [groupByWeakness, setGroupByWeakness] = useState(true);
  const uniquePerStudent = exerciseType === 'recovery';
  const [groupPreview, setGroupPreview] = useState<GroupedExercisePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  
  const effectiveClassId = useMemo(() => {
    if (isTransversal) return '';
    if (multiMode) return classId;
    if (!studentId) return '';
    const student = allStudents.find((s) => s.id === studentId);
    return student?.classId || '';
  }, [isTransversal, multiMode, classId, studentId, allStudents]);

  // Resolve subject color: use dynamically selected subject color, fall back to prop
  const activeSubjectColor = useMemo(() => {
    if (selectedSubjectId && effectiveClassId) {
      const found = classSubjects[effectiveClassId]?.find(s => s.subjectId === selectedSubjectId);
      if (found?.subjectColor) return found.subjectColor;
    }
    return subjectColor;
  }, [selectedSubjectId, effectiveClassId, classSubjects, subjectColor]);

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

  const [exerciseTrimesterFilter, setExerciseTrimesterFilter] = useState<string>('all');

  const allSubjectTopicsForExercise = useMemo(() => {
    if (!selectedSubjectId) return [];
    const subj = topicsBySubject.find((s) => s.subjectId === selectedSubjectId);
    return subj?.topics || [];
  }, [topicsBySubject, selectedSubjectId]);

  const periodMode = useAcademicConfigStore((s) => s.configs[effectiveClassId])?.periodMode;
  const fetchAcademicConfig = useAcademicConfigStore((s) => s.fetchConfig);
  useEffect(() => { if (effectiveClassId) fetchAcademicConfig(effectiveClassId); }, [effectiveClassId, fetchAcademicConfig]);

  const exerciseTopicTrimesters = useMemo(() => {
    const trims = new Set(allSubjectTopicsForExercise.map((t) => (t as any).trimester || 0));
    return trims;
  }, [allSubjectTopicsForExercise]);

  const filteredTopics = useMemo(() => {
    if (exerciseTrimesterFilter === 'all') return allSubjectTopicsForExercise;
    const tri = parseInt(exerciseTrimesterFilter);
    return allSubjectTopicsForExercise.filter((t) => ((t as any).trimester || 0) === tri);
  }, [allSubjectTopicsForExercise, exerciseTrimesterFilter]);

  const allTopics = useMemo(
    () => topicsBySubject.flatMap((s) => s.topics),
    [topicsBySubject]
  );

  const studentsWithIssues = useMemo(() => {
    if (selectedExamIds.length === 0) return new Set<string>();
    const ids = new Set<string>();
    corrections
      .filter((c) => selectedExamIds.includes(c.examId))
      .forEach((c) => {
        if (!c.studentId) return;
        const hasWeakAreas = (c.weakAreas && c.weakAreas.length > 0) ||
          (c.aiAnalysis?.weakAreas && c.aiAnalysis.weakAreas.length > 0);
        const hasLowGrade = c.grade !== null && c.grade !== undefined && c.grade < 5;
        if (hasWeakAreas || hasLowGrade) ids.add(c.studentId);
      });
    return ids;
  }, [selectedExamIds, corrections]);

  // Per-student weak areas from corrections (for recovery preview)
  // Uses: teacher-set weakAreas > AI-suggested weakAreas
  const studentWeakAreas = useMemo(() => {
    const map = new Map<string, string[]>();
    if (exerciseType !== 'recovery') return map;
    if (selectedExamIds.length === 0) return map;
    const relevantCorrections = corrections.filter((c) => selectedExamIds.includes(c.examId));
    relevantCorrections.forEach((c) => {
      if (!c.studentId) return;
      const areas = (c.weakAreas && c.weakAreas.length > 0)
        ? c.weakAreas
        : (c.aiAnalysis?.weakAreas || []);
      if (areas.length === 0) return;
      const existing = map.get(c.studentId) || [];
      areas.forEach((area) => {
        if (!existing.includes(area)) existing.push(area);
      });
      map.set(c.studentId, existing);
    });
    return map;
  }, [corrections, exerciseType, selectedExamIds]);

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
          const mapTopic = (t: any, subj: any): any => ({
            id: t.id,
            subjectId: subj.subject_id,
            subjectName: subj.subject_name,
            name: t.name,
            trimester: t.trimester ?? null,
            order: t.order,
            materialCount: t.material_count || 0,
            children: (t.children || []).map((c: any) => mapTopic(c, subj)),
          });
          const grouped: SubjectWithTopics[] = res.data.map((s: any) => ({
            subjectId: s.subject_id,
            subjectName: s.subject_name,
            topics: (s.topics || []).map((t: any) => mapTopic(t, s)),
          }));
          setTopicsBySubject(grouped);
          // Pre-select subject if provided
          if (preselectedSubjectId && grouped.some(s => s.subjectId === preselectedSubjectId)) {
            setSelectedSubjectId(preselectedSubjectId);
            // Only switch to topic source if no exam is pre-selected
            if (!preselectedExamId) {
              setSourceType('topic');
            }
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
      if (exerciseType === 'recovery' && studentsWithIssues.size > 0) {
        setSelectedStudentIds(Array.from(studentsWithIssues));
      } else {
        setSelectedStudentIds(classStudents.map((s) => s.id));
      }
    }
  }, [selectedExamIds, studentsWithIssues, classStudents, multiMode, exerciseType]);

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
      setExerciseType('practice');
    }
  }, [isOpen]);

  // Pre-fill name and topics from calendar navigation
  useEffect(() => {
    if (isOpen && preselectedTopicIds && preselectedTopicIds.length > 0) {
      setSelectedTopicIds(preselectedTopicIds);
      setSourceType('topic');
    }
    if (isOpen && preselectedName) {
      setExerciseName(preselectedName);
    }
  }, [isOpen, preselectedTopicIds, preselectedName]);

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

  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);

  const handleGenerate = async () => {
    const sIds = multiMode ? [...selectedStudentIds] : [studentId!];
    if (sIds.length === 0) return;
    if (sourceType === 'exam' && selectedExamIds.length === 0) return;
    if (sourceType === 'topic' && selectedTopicIds.length === 0) return;

    setError('');

    // Use batch processing for multiple students
    if (multiMode && sIds.length > 1 && effectiveClassId) {
      setGenerating(true);
      try {
        const response = await batch.startBatchExerciseGeneration({
          class_id: effectiveClassId,
          student_ids: sIds,
          name: exerciseName,
          source_exam_ids: sourceType === 'exam' ? selectedExamIds : undefined,
          source_topic_ids: sourceType === 'topic' ? selectedTopicIds : undefined,
          subject_id: selectedSubjectId || undefined,
          num_questions: numQuestions,
          max_score: maxScore,
          num_blank_pages: numBlankPages,
          difficulty,
          delivery_date: deliveryDate || undefined,
          correction_date: correctionDate || undefined,
          group_by_weakness: groupByWeakness,
          unique_per_student: uniquePerStudent,
          exercise_type: exerciseType,
        });
        const jobId = response.data.id;
        setGenerating(false);
        const taskLabel = exerciseName || 'Ejercicios';
        const capturedClassId = preClassId || effectiveClassId;
        addBackgroundTask({
          type: 'exercises',
          label: taskLabel,
          description: exerciseType === 'recovery'
            ? 'La IA crea ejercicios de repaso personalizados según las áreas débiles y genera el PDF.'
            : 'La IA crea ejercicios adaptados al nivel de los alumnos y genera el PDF con soluciones.',
          batchJobId: jobId,
          expectedResultUrl: capturedClassId ? `/tabs/classes/${capturedClassId}/exercises` : '/tabs/classes',
          execute: async () => {
            // Polling is handled by the store's batchJobId mechanism.
            // This execute just refreshes exercises when the store signals completion.
            const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
            let attempts = 0;
            while (attempts < 600) {
              await sleep(5000);
              attempts++;
              const task = useBackgroundTasksStore.getState().tasks.find(t => t.batchJobId === jobId);
              if (!task || task.status !== 'running') break;
            }
            await fetchExercises();
            return capturedClassId ? `/tabs/classes/${capturedClassId}/exercises` : '/tabs/classes';
          },
        });
        onDismiss();
      } catch (err: any) {
        console.error('Batch generation failed, falling back to background:', err);
        setGenerating(false);
        handleDirectGenerateBackground(sIds);
      }
    } else {
      handleDirectGenerateBackground(sIds);
    }
  };

  const handleDirectGenerateBackground = (sIds: string[]) => {
    const taskLabel = exerciseName || 'Ejercicios';
    const genParams = {
      studentIds: sIds,
      name: exerciseName,
      sourceExamIds: sourceType === 'exam' ? [...selectedExamIds] : undefined,
      sourceTopicIds: sourceType === 'topic' ? [...selectedTopicIds] : undefined,
      subjectId: selectedSubjectId || undefined,
      refinementPrompt: refinement || undefined,
      difficulty: difficulty as 'easier' | 'same' | 'harder',
      numQuestions,
      maxScore,
      numBlankPages,
      deliveryDate: deliveryDate || undefined,
      correctionDate: correctionDate || undefined,
      exerciseType,
    };
    const capturedStudentId = studentId;
    const capturedClassId = preClassId || effectiveClassId;

    addBackgroundTask({
      type: 'exercises',
      label: taskLabel,
      description: exerciseType === 'recovery'
            ? 'La IA crea ejercicios de repaso personalizados según las áreas débiles y genera el PDF.'
            : 'La IA crea ejercicios adaptados al nivel de los alumnos y genera el PDF con soluciones.',
      execute: async () => {
        const result = await generateExercises(genParams);
        if (capturedStudentId) await fetchExercises(capturedStudentId);
        else await fetchExercises();
        if (result && Array.isArray(result) && result.length > 0) {
          const firstEx = result[0] as any;
          const cId = firstEx.class_id || capturedClassId || '';
          return cId ? `/tabs/classes/${cId}/exercises/${firstEx.id}` : '/tabs/classes';
        }
        return '/tabs/classes';
      },
    });

    // Close modal immediately — generation continues in background
    onDismiss();
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

  const toolbarStyle = activeSubjectColor ? { '--background': activeSubjectColor, '--color': 'white' } as React.CSSProperties : undefined;

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      className="exercise-generator-modal modal-fullscreen"
      style={subjectThemeStyle(activeSubjectColor)}
    >
      <IonHeader>
        <IonToolbar style={toolbarStyle}>
          <IonTitle>{exerciseType === 'recovery' ? 'Ejercicios de repaso' : 'Generar ejercicios'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onDismiss} color={activeSubjectColor ? 'light' : undefined}>
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent style={subjectThemeStyle(activeSubjectColor)}>
      <div className="exgen" style={subjectThemeStyle(activeSubjectColor)}>

        <div className="exgen__body">
        {/* Exercise name — always first */}
        <div className="exgen__name-field">
          <label className="exgen__name-label">Nombre del ejercicio</label>
          <IonInput
            value={exerciseName}
            onIonInput={(e) => setExerciseName(e.detail.value ?? '')}
            placeholder="Ej: Práctica ecuaciones T2"
            className="exgen__name-input"
            required
          />
          {exerciseName.trim() && allExercises.some(e => e.name?.toLowerCase() === exerciseName.trim().toLowerCase()) && (
            <p className="exgen__name-warning">
              Ya existe un ejercicio con este nombre
            </p>
          )}
        </div>

        {/* Exercise type toggle */}
        <div className="exgen__type-toggle">
          <button
            className={`exgen__type-btn ${exerciseType === 'practice' ? 'exgen__type-btn--active' : ''}`}
            onClick={() => setExerciseType('practice')}
          >
            <IonIcon icon={barbellOutline} />
            <span>Práctica</span>
          </button>
          <button
            className={`exgen__type-btn exgen__type-btn--recovery ${exerciseType === 'recovery' ? 'exgen__type-btn--active' : ''}`}
            onClick={() => setExerciseType('recovery')}
          >
            <IonIcon icon={medkitOutline} />
            <span>Repaso</span>
          </button>
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

        {/* Weak areas (single-student only) */}
        {!multiMode && weakAreas && weakAreas.length > 0 && exerciseType === 'recovery' ? (() => {
          const filtered = selectedSubjectId
            ? weakAreas.filter((a) => {
                const examId = 'examId' in a ? a.examId : undefined;
                if (!examId) return true; // no exam info — include by default
                const exam = allExams.find((e) => e.id === examId);
                return exam?.subjectId === selectedSubjectId;
              })
            : weakAreas;
          const uniqueTopics = [...new Set(filtered.map((a) => a.topic))];
          return (
            <div className="exgen__recovery-summary">
              <span className="exgen__recovery-summary-title">
                <IonIcon icon={medkitOutline} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Áreas débiles de {studentName || 'alumno'}
              </span>
              <div className="exgen__recovery-student-areas" style={{ marginTop: 6 }}>
                {uniqueTopics.length > 0 ? (
                  uniqueTopics.map((topic, i) => (
                    <span key={i} className="exgen__picker-area-tag">{topic}</span>
                  ))
                ) : (
                  <p className="exgen__recovery-no-areas">
                    Sin áreas débiles registradas{selectedSubjectId ? ' en esta asignatura' : ''} — se generará repaso general.
                  </p>
                )}
              </div>
            </div>
          );
        })() : !multiMode && weakAreas && weakAreas.length > 0 && (
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
              <IonSegment value={sourceType} onIonChange={(e) => { const v = e.detail.value as 'exam' | 'topic'; setSourceType(v); if (v === 'topic') { setSelectedExamIds([]); } else { setSelectedTopicIds([]); } }}>
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
                      onIonChange={(e) => { setSelectedSubjectId(e.detail.value || ''); setSelectedTopicIds([]); setExerciseTrimesterFilter('all'); }}
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

                  {/* Trimester filter for topics */}
                  {selectedSubjectId && allSubjectTopicsForExercise.length > 0 && exerciseTopicTrimesters.size > 1 && (
                    <div className="trimester-pills">
                      <button
                        className={`trimester-pill ${exerciseTrimesterFilter === 'all' ? 'trimester-pill--active' : ''}`}
                        onClick={() => setExerciseTrimesterFilter('all')}
                      >Todos</button>
                      {getPeriodNumbers(periodMode).filter((t) => exerciseTopicTrimesters.has(t)).map((t) => (
                        <button
                          key={t}
                          className={`trimester-pill ${exerciseTrimesterFilter === String(t) ? 'trimester-pill--active' : ''}`}
                          onClick={() => setExerciseTrimesterFilter(String(t))}
                        >{getPeriodLabel(periodMode, t)}</button>
                      ))}
                    </div>
                  )}

                  {/* Topic list for selected subject */}
                  {selectedSubjectId && (
                    filteredTopics.length === 0 ? (
                      <div className="exgen__empty">
                        <p>No hay temas{exerciseTrimesterFilter !== 'all' ? ' en este trimestre' : ' en esta asignatura'}.</p>
                      </div>
                    ) : (
                      <div className="exgen__topics-list">
                        {filteredTopics.map((topic) => {
                          const children = topic.children || [];
                          const childIds = children.map(c => c.id);
                          const allChildrenSelected = children.length > 0 && childIds.every(id => selectedTopicIds.includes(id));
                          const someChildrenSelected = children.length > 0 && childIds.some(id => selectedTopicIds.includes(id));
                          const parentSelected = selectedTopicIds.includes(topic.id);
                          const isActive = parentSelected || allChildrenSelected;

                          return (
                            <div key={topic.id}>
                              <div
                                className={`exgen__topic-chip ${isActive ? 'exgen__topic-chip--active' : someChildrenSelected ? 'exgen__topic-chip--partial' : ''}`}
                                onClick={() => {
                                  if (children.length === 0) {
                                    toggleTopic(topic.id);
                                  } else {
                                    const allIds = [topic.id, ...childIds];
                                    if (isActive) {
                                      setSelectedTopicIds(prev => prev.filter(id => !allIds.includes(id)));
                                    } else {
                                      setSelectedTopicIds(prev => [...new Set([...prev, ...allIds])]);
                                    }
                                  }
                                }}
                              >
                                <IonCheckbox
                                  checked={isActive}
                                  indeterminate={!isActive && someChildrenSelected}
                                  className="exgen__topic-check"
                                />
                                <span className="exgen__topic-name">{topic.name}</span>
                                {children.length > 0 && (
                                  <IonBadge color="light" style={{ fontSize: 10, fontWeight: 600 }}>{children.length} sub</IonBadge>
                                )}
                                <IonBadge color="medium" className="exgen__topic-count">
                                  {topic.materialCount + children.reduce((s, c) => s + (c.materialCount || 0), 0)}
                                </IonBadge>
                              </div>
                              {children.length > 0 && (parentSelected || someChildrenSelected) && (
                                <div style={{ paddingLeft: 20, borderLeft: '2px solid var(--ion-color-primary-tint, #4d9a93)', marginLeft: 14, marginBottom: 4 }}>
                                  {children.map(child => (
                                    <div
                                      key={child.id}
                                      className={`exgen__topic-chip exgen__topic-chip--sub ${selectedTopicIds.includes(child.id) ? 'exgen__topic-chip--active' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); toggleTopic(child.id); }}
                                      style={{ marginTop: 2, marginBottom: 2 }}
                                    >
                                      <IonCheckbox checked={selectedTopicIds.includes(child.id)} className="exgen__topic-check" />
                                      <span className="exgen__topic-name" style={{ fontSize: 12 }}>{child.name}</span>
                                      {child.materialCount > 0 && (
                                        <IonBadge color="medium" className="exgen__topic-count">{child.materialCount}</IonBadge>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {/* NOTE: material text budget is shared (30K chars total across all documents) */}
                        <p className="exgen__materials-note">
                          <IonIcon icon={informationCircleOutline} />
                          Se usarán hasta ~30.000 caracteres del material adjunto (repartidos entre todos los documentos).
                        </p>
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

            {/* Recovery: per-student weak areas summary */}
            {exerciseType === 'recovery' && sourceType === 'exam' && selectedExamIds.length > 0 && selectedStudentIds.length > 0 && studentWeakAreas.size > 0 && (
              <div className="exgen__recovery-summary">
                <span className="exgen__recovery-summary-title">Áreas débiles detectadas</span>
                <div className="exgen__recovery-students">
                  {selectedStudentIds.map((sid) => {
                    const student = classStudents.find((s) => s.id === sid);
                    const areas = studentWeakAreas.get(sid);
                    if (!student || !areas || areas.length === 0) return null;
                    return (
                      <div key={sid} className="exgen__recovery-student">
                        <span className="exgen__recovery-student-name">{student.name}</span>
                        <div className="exgen__recovery-student-areas">
                          {areas.slice(0, 4).map((a, i) => (
                            <span key={i} className="exgen__picker-area-tag">{a}</span>
                          ))}
                          {areas.length > 4 && <span className="exgen__picker-area-more">+{areas.length - 4}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {selectedStudentIds.filter((sid) => !studentWeakAreas.has(sid) || studentWeakAreas.get(sid)!.length === 0).length > 0 && (
                    <p className="exgen__recovery-no-areas">
                      {selectedStudentIds.filter((sid) => !studentWeakAreas.has(sid) || studentWeakAreas.get(sid)!.length === 0).length} alumno(s) sin áreas débiles registradas — se generará repaso general.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Generation config (multi-student only) */}
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
                
                {uniquePerStudent ? (
                  <div className="exgen__gen-recovery-info">
                    <IonIcon icon={medkitOutline} />
                    <span>Cada alumno recibirá ejercicios únicos basados en sus áreas débiles individuales.</span>
                  </div>
                ) : loadingPreview ? (
                  <div className="exgen__gen-preview-loading">
                    <IonSpinner name="dots" />
                    <span>Calculando grupos...</span>
                  </div>
                ) : groupPreview ? (
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
                ) : null}
              </div>
            )}

            {/* Options — 2×2 grid */}
              <div className="exgen__options">
                <span className="exgen__section-label">Configuración</span>
                <div className="exgen__options-grid">
                  <IonItem lines="none" className="exgen__select exgen__select-half">
                    <IonLabel>Preguntas</IonLabel>
                    <IonSelect value={numQuestions} onIonChange={(e) => setNumQuestions(e.detail.value)} interface="popover">
                      {[3, 4, 5, 6, 7, 8, 10].map((n) => (
                        <IonSelectOption key={n} value={n}>{n}</IonSelectOption>
                      ))}
                    </IonSelect>
                  </IonItem>
                  <IonItem lines="none" className="exgen__select exgen__select-half">
                    <IonLabel>Dificultad</IonLabel>
                    <IonSelect value={difficulty} onIonChange={(e) => setDifficulty(e.detail.value)} interface="popover">
                      <IonSelectOption value="easier">Más fácil</IonSelectOption>
                      <IonSelectOption value="same">Mismo nivel</IonSelectOption>
                      <IonSelectOption value="harder">Más difícil</IonSelectOption>
                    </IonSelect>
                  </IonItem>
                  <IonItem lines="none" className="exgen__select exgen__select-half">
                    <IonLabel>Nota máx.</IonLabel>
                    <IonSelect value={maxScore} onIonChange={(e) => setMaxScore(e.detail.value)} interface="popover">
                      {[5, 10, 15, 20].map((n) => (
                        <IonSelectOption key={n} value={n}>{n}</IonSelectOption>
                      ))}
                    </IonSelect>
                  </IonItem>
                  <IonItem lines="none" className="exgen__select exgen__select-half">
                    <IonLabel>Hojas resp.</IonLabel>
                    <IonSelect value={numBlankPages} onIonChange={(e) => setNumBlankPages(e.detail.value)} interface="popover">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <IonSelectOption key={n} value={n}>{n}</IonSelectOption>
                      ))}
                    </IonSelect>
                  </IonItem>
                </div>
                <div className="exgen__dates-row">
                  <IonItem lines="none" className="exgen__select exgen__select-half">
                    <IonInput
                      type="date"
                      value={deliveryDate}
                      onIonInput={(e) => setDeliveryDate(e.detail.value ?? '')}
                      label="Fecha de entrega"
                      labelPlacement="stacked"
                    />
                  </IonItem>
                  <IonItem lines="none" className="exgen__select exgen__select-half">
                    <IonInput
                      type="date"
                      value={correctionDate}
                      onIonInput={(e) => setCorrectionDate(e.detail.value ?? '')}
                      label="Fecha de recogida"
                      labelPlacement="stacked"
                    />
                  </IonItem>
                </div>
                <button
                  type="button"
                  className="exgen__instructions-toggle"
                  onClick={() => setShowInstructions(v => !v)}
                >
                  <IonIcon icon={chevronForwardOutline} className={`exgen__instructions-chevron ${showInstructions ? 'exgen__instructions-chevron--open' : ''}`} />
                  <span>Instrucciones adicionales</span>
                  {!showInstructions && refinement && <IonBadge color="primary" className="exgen__instructions-dot">1</IonBadge>}
                </button>
                {showInstructions && (
                  <IonItem lines="none" className="exgen__textarea-item">
                    <IonTextarea
                      value={refinement}
                      onIonInput={(e) => setRefinement(e.detail.value ?? '')}
                      placeholder="Describe lo que quieres que incluya o evite el ejercicio..."
                      rows={3}
                      autoGrow
                    />
                  </IonItem>
                )}
              </div>

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
      </div>
      </IonContent>

    </IonModal>
  );
};

export default ExerciseGeneratorModal;
