import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonIcon,
  IonSpinner, IonCheckbox, IonTextarea, IonBadge, IonSegment, IonSegmentButton,
  IonAlert, IonChip, IonList, IonAccordion, IonAccordionGroup,
} from '@ionic/react';
import {
  cloudUploadOutline, documentOutline, checkmarkCircleOutline, sparklesOutline,
  downloadOutline, documentTextOutline, trashOutline, refreshOutline, timeOutline,
  createOutline, chevronForwardOutline, informationCircleOutline,
  barbellOutline, medkitOutline, alertCircleOutline,
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useClassesStore } from '../../store/classesStore';
import { useTopicsStore } from '../../store/topicsStore';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import api, { exams as examsApi, classes as classesApi, subjects as subjectsApi, corrections as correctionsApi, batch } from '../../services/api';
import { Lecture, ExamIterationHistoryItem, SubjectWithTopics, Exam } from '../../types';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import ClassSubjectPicker from '../../components/ClassSubjectPicker';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import { useAcademicConfigStore } from '../../store/academicConfigStore';
import { getPeriodNumbers, getPeriodLabel } from '../../utils/periodConfig';
import './ExamEditor.css';

const ExamEditor: React.FC = () => {
  const { examId, classId: urlClassId, subjectId: urlSubjectId } = useParams<{ examId: string; classId?: string; subjectId?: string }>();
  const history = useHistory();
  // isNew if examId is 'new' OR undefined (when coming from /tabs/classes/:classId/exams/new route)
  const isNew = examId === 'new' || examId === undefined;

  // Query params from calendar: ?topicIds=id1,id2&date=2026-04-05
  const queryParams = useMemo(() => new URLSearchParams(history.location.search), [history.location.search]);
  const qTopicIds = useMemo(() => queryParams.get('topicIds')?.split(',').filter(Boolean) || [], [queryParams]);
  const qDate = queryParams.get('date');
  const qName = queryParams.get('name');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);

  const allExams = useExamsStore((s) => s.exams);
  const examsLoading = useExamsStore((s) => s.loading);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const exam = useMemo(() => (isNew ? null : allExams.find((e) => e.id === examId)), [allExams, examId, isNew]);
  const addExam = useExamsStore((s) => s.addExam);
  const generateExam = useExamsStore((s) => s.generateExam);
  const updateExam = useExamsStore((s) => s.updateExam);
  const assignExam = useExamsStore((s) => s.assignExam);
  const deleteExam = useExamsStore((s) => s.deleteExam);

  const topicsLoading = useTopicsStore((s) => s.loading);
  const [topicsBySubject, setTopicsBySubject] = useState<SubjectWithTopics[]>([]);

  // Class-subject pairs for combined dropdown
  interface ClassSubjectPair { classId: string; className: string; subjectId: string; subjectName: string; }
  const [classPairs, setClassPairs] = useState<ClassSubjectPair[]>([]);
  const [pairsLoading, setPairsLoading] = useState(false);

  // Shared fields
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('');
  const [lectureId, setLectureId] = useState('');
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [lecturesLoading, setLecturesLoading] = useState(false);
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [maxScore, setMaxScore] = useState(10);
  const [saving, setSaving] = useState(false);

  // Mode toggle (new exams only)
  const [mode, setMode] = useState<'upload' | 'generate'>('upload');

  // Upload mode (supports multiple files for multi-page handwritten exams)
  const [files, setFiles] = useState<File[]>([]);

  // Personalization is always on
  const isPersonalized = true;

  // Delete confirmation
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  // Generate mode
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [topicTrimesterFilter, setTopicTrimesterFilter] = useState<string>('all');
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [refinement, setRefinement] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);

  // Phase 4: Deadline and iteration
  const [correctionDeadline, setCorrectionDeadline] = useState('');
  const [blankPagesCount, setBlankPagesCount] = useState(1);
  const [iterationInstruction, setIterationInstruction] = useState('');
  const [iterating, setIterating] = useState(false);
  const [iterationError, setIterationError] = useState('');
  const iterateExam = useExamsStore((s) => s.iterateExam);

  // Recovery exam mode
  const [examType, setExamType] = useState<'practice' | 'recovery'>('practice');
  const [sourceExamId, setSourceExamId] = useState('');
  const [failingStudents, setFailingStudents] = useState<{ id: string; name: string; grade: number }[]>([]);
  const [loadingFailingStudents, setLoadingFailingStudents] = useState(false);

  // Corrected exams for recovery source selection
  const correctedExams = useMemo(
    () => allExams.filter((e) => e.status === 'corrected' && e.classId === classId),
    [allExams, classId]
  );

  // Fetch lectures when class changes
  const fetchLectures = useCallback(async (cId: string) => {
    if (!cId) {
      setLectures([]);
      return;
    }
    setLecturesLoading(true);
    try {
      const res = await classesApi.get(cId);
      setLectures(res.data.lectures || []);
    } catch (err) {
      console.error('Failed to fetch lectures:', err);
      setLectures([]);
    } finally {
      setLecturesLoading(false);
    }
  }, []);

  const [topicsFetching, setTopicsFetching] = useState(false);

  const allSubjectTopics = useMemo(() => {
    if (!selectedSubjectId) return [];
    const subj = topicsBySubject.find((s) => s.subjectId === selectedSubjectId);
    return subj?.topics || [];
  }, [topicsBySubject, selectedSubjectId]);

  const periodMode = useAcademicConfigStore((s) => s.configs[classId])?.periodMode;
  const fetchAcademicConfig = useAcademicConfigStore((s) => s.fetchConfig);
  useEffect(() => { if (classId) fetchAcademicConfig(classId); }, [classId, fetchAcademicConfig]);

  const topicTrimesters = useMemo(() => {
    const trims = new Set(allSubjectTopics.map((t) => (t as any).trimester || 0));
    return trims;
  }, [allSubjectTopics]);

  const filteredTopics = useMemo(() => {
    if (topicTrimesterFilter === 'all') return allSubjectTopics;
    const tri = parseInt(topicTrimesterFilter);
    return allSubjectTopics.filter((t) => ((t as any).trimester || 0) === tri);
  }, [allSubjectTopics, topicTrimesterFilter]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId),
    [classes, classId]
  );

  const duplicateName = useMemo(() => {
    if (!name.trim() || !isNew) return false;
    return allExams.some(e =>
      e.name.toLowerCase() === name.trim().toLowerCase() &&
      e.classId === classId &&
      e.id !== exam?.id
    );
  }, [name, classId, allExams, isNew, exam?.id]);

  // Combined class|subject value for the single dropdown
  const comboValue = classId && selectedSubjectId ? `${classId}|${selectedSubjectId}` : '';

  const handleComboChange = (value: string) => {
    if (!value) {
      setClassId('');
      setSelectedSubjectId('');
      setLectureId('');
      return;
    }
    const [cId, sId] = value.split('|');
    if (cId !== classId) {
      setLectureId('');
    }
    setClassId(cId);
    setSelectedSubjectId(sId);
  };

  useEffect(() => { fetchClasses(); if (urlClassId) fetchClassSubjects(urlClassId); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch class-subject pairs for combined dropdown
  useEffect(() => {
    setPairsLoading(true);
    subjectsApi.classPairs()
      .then((res) => {
        setClassPairs(res.data.map((p: any) => ({
          classId: p.class_id,
          className: p.class_name,
          subjectId: p.subject_id,
          subjectName: p.subject_name,
        })));
      })
      .catch(() => setClassPairs([]))
      .finally(() => setPairsLoading(false));
  }, []);
  
  useEffect(() => {
    if (!isNew && examId) {
      fetchExams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, examId]);

  // Redirect if exam not found after loading (only for edit mode with specific examId)
  useEffect(() => {
    if (!isNew && examId && examId !== 'new' && !examsLoading && allExams.length > 0 && !exam) {
      console.error('Exam not found, redirecting to create new exam');
      history.replace('/tabs/exams/new');
    }
  }, [isNew, examId, examsLoading, allExams, exam, history]);

  useEffect(() => {
    if (exam) {
      setName(exam.name);
      setClassId(exam.classId || '');
      setLectureId(exam.lectureId || '');
      setDate(exam.date);
      setMaxScore(exam.maxScore);
      setCorrectionDeadline(exam.correctionDeadline || '');
      setBlankPagesCount(exam.blankPagesCount || 1);
    } else if (isNew) {
      if (urlClassId) setClassId(urlClassId);
      if (urlSubjectId) setSelectedSubjectId(urlSubjectId);
      // From calendar: auto-set generate mode, date, name, and pre-select topics
      if (qTopicIds.length > 0) {
        setMode('generate');
        setSelectedTopicIds(qTopicIds);
      }
      if (qDate) setDate(qDate);
      if (qName) setName(qName);
    }
  }, [exam, isNew, urlClassId, urlSubjectId, qTopicIds, qDate, qName]);

  // Auto-set correction deadline to 7 days after exam date if not set,
  // and reset it if the exam date moves past the current deadline
  useEffect(() => {
    if (date) {
      if (correctionDeadline && correctionDeadline < date) {
        const examDate = new Date(date);
        examDate.setDate(examDate.getDate() + 7);
        const deadlineStr = `${examDate.getFullYear()}-${String(examDate.getMonth() + 1).padStart(2, '0')}-${String(examDate.getDate()).padStart(2, '0')}`;
        setCorrectionDeadline(deadlineStr);
      } else if (isNew && !correctionDeadline) {
        const examDate = new Date(date);
        examDate.setDate(examDate.getDate() + 7);
        const deadlineStr = `${examDate.getFullYear()}-${String(examDate.getMonth() + 1).padStart(2, '0')}-${String(examDate.getDate()).padStart(2, '0')}`;
        setCorrectionDeadline(deadlineStr);
      }
    }
  }, [date, isNew, correctionDeadline]);

  // Fetch failing students when source exam changes (recovery mode)
  useEffect(() => {
    if (!sourceExamId || examType !== 'recovery') {
      setFailingStudents([]);
      return;
    }
    setLoadingFailingStudents(true);
    correctionsApi.list(sourceExamId)
      .then((res) => {
        const sourceExam = allExams.find((e) => e.id === sourceExamId);
        const passThreshold = (sourceExam?.maxScore ?? 10) * 0.5;
        const failing = (res.data as any[])
          .filter((c: any) => c.grade !== null && c.grade !== undefined && c.grade < passThreshold)
          .map((c: any) => ({ id: c.student_id, name: c.student_name || 'Alumno', grade: c.grade }));
        setFailingStudents(failing);
      })
      .catch(() => setFailingStudents([]))
      .finally(() => setLoadingFailingStudents(false));
  }, [sourceExamId, examType, allExams]);

  // Auto-set name and topics when source exam changes in recovery mode
  useEffect(() => {
    if (examType === 'recovery' && sourceExamId) {
      const sourceExam = allExams.find((e) => e.id === sourceExamId);
      if (sourceExam) {
        if (!name.trim()) setName(`Recuperación - ${sourceExam.name}`);
        if (sourceExam.subjectId) setSelectedSubjectId(sourceExam.subjectId);
      }
    }
  }, [sourceExamId, examType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset recovery state when switching exam type
  useEffect(() => {
    if (examType === 'practice') {
      setSourceExamId('');
      setFailingStudents([]);
    }
  }, [examType]);

  useEffect(() => {
    if (classId) {
      setTopicsFetching(true);
      subjectsApi.topicsForClass(classId)
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
          // Pre-select subject if coming from a subject-scoped route
          if (urlSubjectId && grouped.some(s => s.subjectId === urlSubjectId)) {
            setSelectedSubjectId(urlSubjectId);
          }
        })
        .catch(() => setTopicsBySubject([]))
        .finally(() => setTopicsFetching(false));
      fetchLectures(classId);
    } else {
      setLectures([]);
      setTopicsBySubject([]);
    }
    if (!urlSubjectId) {
      setSelectedSubjectId('');
    }
    // Preserve pre-selected topics from calendar query params
    if (qTopicIds.length === 0) {
      setSelectedTopicIds([]);
    }
    setTopicTrimesterFilter('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      // Copy files immediately — resetting value below clears the live FileList
      const newFiles = Array.from(selected);
      setFiles((prev) => [...prev, ...newFiles]);
    }
    // Reset so the same file can be picked again and onChange fires
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (!isNew && !exam) return; // Should not happen due to redirect effect

    // New exam with file(s): run creation + AI correction in background
    if (isNew && files.length > 0) {
      const taskName = name.trim();
      const taskFiles = [...files];
      const examData = {
        name: taskName,
        classId: classId || undefined,
        lectureId: lectureId || undefined,
        subjectId: selectedSubjectId || undefined,
        date,
        maxScore,
        isPersonalized,
        blankPagesCount: blankPagesCount,
      };

      addBackgroundTask({
        type: 'exam',
        label: taskName,
        description: 'La IA recorta cada examen por alumno y analiza las respuestas para preparar la corrección.',
        execute: async () => {
          // 1. Create exam with file upload (returns immediately, AI analysis runs in background)
          const { id: examId, batchJobId: analysisJobId } = await addExam(examData, taskFiles.length === 1 ? taskFiles[0] : taskFiles);

          // 2. Wait for upload analysis (extract questions, solve, generate PDFs, personalize)
          if (analysisJobId) {
            let done = false;
            while (!done) {
              await new Promise((r) => setTimeout(r, 3000));
              const progressRes = await batch.getJobProgress(analysisJobId);
              const status = progressRes.data.status;
              if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                done = true;
                if (status === 'failed') throw new Error('El análisis del examen falló');
              }
            }
          }

          // 3. Assign exam (creates corrections for each student)
          await assignExam(examId);

          // 4. Fetch corrections and start batch AI correction
          const corrRes = await correctionsApi.list(examId);
          const correctionIds = (corrRes.data as any[])
            .filter((c: any) => c.paper_url && !c.ai_processed)
            .map((c: any) => c.id);

          if (correctionIds.length > 0) {
            const batchRes = await batch.startBatchCorrection(examId, correctionIds);
            const jobId = batchRes.data.id;

            // 5. Poll until batch correction completes
            let done = false;
            while (!done) {
              await new Promise((r) => setTimeout(r, 3000));
              const progressRes = await batch.getJobProgress(jobId);
              const status = progressRes.data.status;
              if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                done = true;
                if (status === 'failed') throw new Error('La corrección por IA falló');
              }
            }
          }

          return `/tabs/exams/${examId}`;
        },
      });

      // Navigate away immediately
      if (urlClassId && urlSubjectId) {
        history.replace(`/tabs/classes/${urlClassId}/subjects/${urlSubjectId}/exams`);
      } else if (urlClassId) {
        history.replace(`/tabs/classes/${urlClassId}/exams`);
      } else {
        history.replace('/tabs/classes');
      }
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const { id } = await addExam({
          name: name.trim(),
          classId: classId || undefined,
          lectureId: lectureId || undefined,
          subjectId: selectedSubjectId || undefined,
          date,
          maxScore,
          isPersonalized,
          blankPagesCount: blankPagesCount,
        });
        history.replace(`/tabs/exams/${id}`);
      } else if (exam) {
        await updateExam(exam.id, { name, classId: classId || undefined, lectureId: lectureId || undefined, date, maxScore });
        history.goBack();
      }
    } catch (err) {
      console.error('Failed to save exam:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = (type: 'exam' | 'solutions' | 'digitalized') => {
    if (!exam) return;
    const pathMap = {
      exam: `/exams/${exam.id}/download`,
      solutions: `/exams/${exam.id}/solutions`,
      digitalized: `/exams/${exam.id}/digitalized`,
    };
    const suffixMap = { exam: '', solutions: '_soluciones', digitalized: '_digitalizado' };
    api.get(pathMap[type], { responseType: 'blob' })
      .then((res) => {
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = exam.name + suffixMap[type] + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Download error:', err));
  };

  const handleDelete = async () => {
    if (!exam) return;
    try {
      await deleteExam(exam.id);
      if (urlClassId) {
        history.replace(`/tabs/classes/${urlClassId}`);
      } else {
        history.replace('/tabs/classes');
      }
    } catch (err) {
      console.error('Failed to delete exam:', err);
    }
  };

  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);

  const handleGenerate = () => {
    const isRecovery = examType === 'recovery';
    // For recovery: source exam is required, topics are optional
    if (!name.trim()) return;
    if (!isRecovery && selectedTopicIds.length === 0) return;
    if (isRecovery && !sourceExamId) return;

    const taskName = name.trim();
    const genData: Record<string, any> = {
      class_id: classId || undefined,
      lecture_id: lectureId || undefined,
      subject_id: selectedSubjectId || undefined,
      topic_ids: selectedTopicIds.length > 0 ? [...selectedTopicIds] : undefined,
      name: taskName,
      exam_date: date,
      num_questions: numQuestions,
      max_score: maxScore,
      difficulty,
      refinement_prompt: refinement || undefined,
      is_personalized: isPersonalized,
      correction_deadline: correctionDeadline || undefined,
      blank_pages_count: blankPagesCount,
      ...(isRecovery ? {
        exam_type: 'recovery',
        source_exam_id: sourceExamId,
      } : {}),
    };

    // Call generate synchronously (fast — just creates DB records + batch job)
    generateExam(genData as any).then(({ id: examId, batchJobId: jobId }) => {
      addBackgroundTask({
        type: 'exam',
        label: taskName,
        description: isRecovery
          ? 'La IA genera un examen de recuperación reformulando las preguntas del examen original.'
          : 'La IA genera preguntas a partir de los temas seleccionados y compone el examen en PDF.',
        batchJobId: jobId,
        expectedResultUrl: `/tabs/exams/${examId}`,
        execute: async () => {
          // Polling is handled by batchJobId; this is a no-op
          return `/tabs/exams/${examId}`;
        },
      });
    }).catch((err) => {
      console.error('[ExamEditor] Failed to start exam generation:', err);
    });

    // Navigate back immediately — generation runs in background
    if (urlClassId && urlSubjectId) {
      history.replace(`/tabs/classes/${urlClassId}/subjects/${urlSubjectId}/exams`);
    } else if (urlClassId) {
      history.replace(`/tabs/classes/${urlClassId}/exams`);
    } else {
      history.replace('/tabs/classes');
    }
  };

  const handleStartCorrection = async () => {
    if (exam) {
      if (exam.status === 'uploaded') await assignExam(exam.id);
      // Navigate to ExamDetail (which includes corrections section)
      if (urlClassId && urlSubjectId) {
        history.push(`/tabs/classes/${urlClassId}/subjects/${urlSubjectId}/exams/${exam.id}`);
      } else if (urlClassId) {
        history.push(`/tabs/classes/${urlClassId}/exams/${exam.id}`);
      } else {
        history.push(`/correction/${exam.id}`);
      }
    }
  };

  const handleIterate = async () => {
    if (!exam || !iterationInstruction.trim()) return;
    setIterating(true);
    setIterationError('');
    try {
      await iterateExam(exam.id, { instruction: iterationInstruction.trim() });
      setIterationInstruction('');
    } catch (err: any) {
      setIterationError(err.response?.data?.detail || 'Error al ajustar el examen');
    } finally {
      setIterating(false);
    }
  };

  const applyQuickIteration = (instruction: string) => {
    setIterationInstruction(instruction);
  };

  const getDeadlineStatusColor = (status?: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'ok': return 'success';
      case 'soon': return 'warning';
      case 'urgent': return 'danger';
      case 'overdue': return 'danger';
      default: return 'medium';
    }
  };

  const getDeadlineStatusText = (status?: string) => {
    switch (status) {
      case 'completed': return 'Corregido';
      case 'ok': return 'A tiempo';
      case 'soon': return 'Próximo';
      case 'urgent': return 'Urgente';
      case 'overdue': return 'Atrasado';
      default: return '';
    }
  };

  const editorSubjectColor = urlSubjectId && urlClassId ? classSubjects[urlClassId]?.find(s => s.subjectId === urlSubjectId)?.subjectColor : undefined;

  return (
    <IonPage style={subjectThemeStyle(editorSubjectColor)}>
      <IonHeader>
        <IonToolbar style={editorSubjectColor ? { '--background': editorSubjectColor, '--color': 'white' } as React.CSSProperties : undefined}>
          <IonButtons slot="start">
            <IonBackButton defaultHref={urlClassId ? `/tabs/classes/${urlClassId}` : '/tabs/classes'} text="" color={editorSubjectColor ? 'light' : undefined} />
          </IonButtons>
          <IonTitle>{isNew ? 'Nuevo examen' : name || 'Editar'}</IonTitle>
          {!isNew && (
            <IonButtons slot="end">
              <IonButton color="danger" onClick={() => setShowDeleteAlert(true)}>
                <IonIcon icon={trashOutline} />
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
        {isNew && (
          <IonToolbar>
            <IonSegment value={mode} onIonChange={(e) => setMode(e.detail.value as 'upload' | 'generate')}>
              <IonSegmentButton value="upload"><IonLabel>Digitalizar examen</IonLabel></IonSegmentButton>
              <IonSegmentButton value="generate"><IonLabel>Generar con IA</IonLabel></IonSegmentButton>
            </IonSegment>
          </IonToolbar>
        )}
      </IonHeader>

      <IonContent className="exam-editor-content">
        <input
          id="exam-file-input"
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="application/pdf,image/*"
          onChange={handleFileSelect}
        />

        <div className="exam-editor-form">
          {/* ─── EXAM NAME (always first, both modes) ─── */}
          <div className="exam-name-field">
            <label className="exam-name-label">Nombre del examen</label>
            <IonInput
              value={name}
              onIonInput={(e) => setName(e.detail.value ?? '')}
              placeholder="Ej: Examen T2 Ecuaciones"
              className="exam-name-input"
            />
            {duplicateName && (
              <p className="exam-name-warning">
                Ya existe un examen con este nombre en esta clase
              </p>
            )}
          </div>

          {/* ─── EXAM TYPE TOGGLE (both modes, new exams only) ─── */}
          {isNew && (
            <div className="exgen__type-toggle">
              <button
                className={`exgen__type-btn ${examType === 'practice' ? 'exgen__type-btn--active' : ''}`}
                onClick={() => setExamType('practice')}
              >
                <IonIcon icon={barbellOutline} />
                <span>Evaluación</span>
              </button>
              <button
                className={`exgen__type-btn exgen__type-btn--recovery ${examType === 'recovery' ? 'exgen__type-btn--active' : ''}`}
                onClick={() => setExamType('recovery')}
              >
                <IonIcon icon={medkitOutline} />
                <span>Recuperación</span>
              </button>
            </div>
          )}

          {/* ─── UPLOAD MODE (existing + editing) ─── */}
          {(mode === 'upload' || !isNew) && (
            <>
              <label htmlFor="exam-file-input" className="upload-item">
                <IonIcon
                  icon={files.length > 0 || exam?.documentUrl ? documentOutline : cloudUploadOutline}
                  className="upload-item-icon"
                />
                <div className="upload-item-text">
                  <h3>{files.length > 0
                    ? (files.length === 1 ? files[0].name : `${files.length} páginas añadidas`)
                    : (exam?.documentUrl ? 'Documento subido' : 'Sube tu examen')}</h3>
                  <p>{files.length > 0 ? 'Toca para añadir más páginas' : (exam?.documentUrl ? 'Toca para cambiar' : 'Sube un PDF o fotos para digitalizarlo')}</p>
                </div>
                {(files.length > 0 || exam?.documentUrl) && (
                  <IonIcon icon={checkmarkCircleOutline} className="upload-success-icon" />
                )}
              </label>
              {files.length > 1 && (
                <div className="upload-file-list">
                  {files.map((f, i) => (
                    <IonChip key={i} outline>
                      <IonLabel>{f.name.length > 20 ? f.name.slice(0, 17) + '...' : f.name}</IonLabel>
                      <IonIcon icon={trashOutline} onClick={(e) => { e.stopPropagation(); handleRemoveFile(i); }} />
                    </IonChip>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── GENERATE MODE ─── */}
          {mode === 'generate' && isNew && (
            <div className="gen-section">
              {/* Combined class + subject selector */}
              <div className="form-item-standalone">
                <label className="form-item-label">Clase y asignatura</label>
                <ClassSubjectPicker
                  pairs={urlClassId ? classPairs.filter(p => p.classId === urlClassId) : classPairs}
                  loading={pairsLoading}
                  value={classId && selectedSubjectId ? { classId, subjectId: selectedSubjectId } : null}
                  onChange={(cId, sId) => {
                    if (cId !== classId) setLectureId('');
                    setClassId(cId);
                    setSelectedSubjectId(sId);
                    setSelectedTopicIds([]);
                  }}
                />
              </div>

              {/* Recovery: Source exam selector */}
              {examType === 'recovery' && classId && (
                <div className="gen-recovery-source">
                  <span className="gen-config__label">Examen de origen</span>
                  <p className="gen-recovery-source__hint">
                    Selecciona el examen corregido del que quieres generar la recuperación. Se generará un examen similar con preguntas reformuladas.
                  </p>
                  {correctedExams.length === 0 ? (
                    <div className="gen-topics__empty">
                      <p>No hay exámenes corregidos con IA en esta clase.</p>
                    </div>
                  ) : (
                    <div className="gen-topics__list">
                      {correctedExams.map((e) => (
                        <div
                          key={e.id}
                          className={`gen-topic-chip ${sourceExamId === e.id ? 'gen-topic-chip--active' : ''}`}
                          onClick={() => setSourceExamId(sourceExamId === e.id ? '' : e.id)}
                        >
                          <IonCheckbox checked={sourceExamId === e.id} className="gen-topic-chip__check" />
                          <span className="gen-topic-chip__name">{e.name}</span>
                          <IonBadge color="medium">{new Date(e.date).toLocaleDateString('es-ES')}</IonBadge>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Failing students list */}
                  {sourceExamId && (
                    <div className="gen-recovery-students">
                      {loadingFailingStudents ? (
                        <div className="gen-topics__loading"><IonSpinner name="crescent" /></div>
                      ) : failingStudents.length === 0 ? (
                        <div className="gen-recovery-students__empty">
                          <IonIcon icon={checkmarkCircleOutline} />
                          <span>Todos los alumnos han aprobado este examen.</span>
                        </div>
                      ) : (
                        <>
                          <span className="gen-recovery-students__label">
                            <IonIcon icon={alertCircleOutline} />
                            {failingStudents.length} alumno{failingStudents.length !== 1 ? 's' : ''} no ha{failingStudents.length !== 1 ? 'n' : ''} aprobado
                          </span>
                          <div className="gen-recovery-students__list">
                            {failingStudents.map((s) => (
                              <div key={s.id} className="gen-recovery-student">
                                <span className="gen-recovery-student__name">{s.name}</span>
                                <IonBadge color="danger">{s.grade} / {allExams.find((e) => e.id === sourceExamId)?.maxScore ?? 10}</IonBadge>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Topics selection - only for practice exams */}
              {selectedSubjectId && examType !== 'recovery' && (
                <div className="gen-topics">
                  <span className="gen-topics__label">
                    Temas del examen
                    {selectedTopicIds.length > 0 && (
                      <IonBadge color="primary" className="gen-topics__count">{selectedTopicIds.length}</IonBadge>
                    )}
                  </span>
                  {/* Trimester filter for topics */}
                  {allSubjectTopics.length > 0 && topicTrimesters.size > 1 && (
                    <div className="trimester-pills">
                      <button
                        className={`trimester-pill ${topicTrimesterFilter === 'all' ? 'trimester-pill--active' : ''}`}
                        onClick={() => setTopicTrimesterFilter('all')}
                      >Todos</button>
                      {getPeriodNumbers(periodMode).filter((t) => topicTrimesters.has(t)).map((t) => (
                        <button
                          key={t}
                          className={`trimester-pill ${topicTrimesterFilter === String(t) ? 'trimester-pill--active' : ''}`}
                          onClick={() => setTopicTrimesterFilter(String(t))}
                        >{getPeriodLabel(periodMode, t)}</button>
                      ))}
                    </div>
                  )}
                  {filteredTopics.length === 0 ? (
                    <div className="gen-topics__empty">
                      <p>{topicTrimesterFilter !== 'all' ? 'No hay temas en este trimestre.' : 'No hay temas en esta asignatura.'}</p>
                      {topicTrimesterFilter === 'all' && (
                        <IonButton
                          size="small"
                          fill="outline"
                          onClick={() => history.push(`/tabs/classes/${classId}/topics`)}
                        >
                          Añadir temas
                        </IonButton>
                      )}
                    </div>
                  ) : (
                    <div className="gen-topics__list">
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
                              className={`gen-topic-chip ${isActive ? 'gen-topic-chip--active' : someChildrenSelected ? 'gen-topic-chip--partial' : ''}`}
                              onClick={() => {
                                if (children.length === 0) {
                                  toggleTopic(topic.id);
                                } else {
                                  // Toggle parent + all children together
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
                                className="gen-topic-chip__check"
                              />
                              <span className="gen-topic-chip__name">{topic.name}</span>
                              {children.length > 0 && (
                                <IonBadge color="light" style={{ fontSize: 10, fontWeight: 600 }}>{children.length} sub</IonBadge>
                              )}
                              <IonBadge color="medium" className="gen-topic-chip__materials">
                                {topic.materialCount + children.reduce((s, c) => s + (c.materialCount || 0), 0)}
                              </IonBadge>
                            </div>
                            {/* Subtopics — shown indented when parent has children */}
                            {children.length > 0 && (parentSelected || someChildrenSelected) && (
                              <div style={{ paddingLeft: 20, borderLeft: '2px solid var(--ion-color-primary-tint, #4d9a93)', marginLeft: 14, marginBottom: 4 }}>
                                {children.map(child => (
                                  <div
                                    key={child.id}
                                    className={`gen-topic-chip gen-topic-chip--sub ${selectedTopicIds.includes(child.id) ? 'gen-topic-chip--active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); toggleTopic(child.id); }}
                                    style={{ marginTop: 2, marginBottom: 2 }}
                                  >
                                    <IonCheckbox checked={selectedTopicIds.includes(child.id)} className="gen-topic-chip__check" />
                                    <span className="gen-topic-chip__name" style={{ fontSize: 12 }}>{child.name}</span>
                                    {child.materialCount > 0 && (
                                      <IonBadge color="medium" className="gen-topic-chip__materials">{child.materialCount}</IonBadge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* NOTE: material text budget is shared (30K chars total across all documents) */}
                      <p className="gen-materials-note">
                        <IonIcon icon={informationCircleOutline} />
                        Se usarán hasta ~30.000 caracteres del material adjunto (repartidos entre todos los documentos).
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Configuration */}
              {selectedTopicIds.length > 0 && (
                <div className="gen-config">
                  <span className="gen-config__label">Configuración</span>
                  <div className="gen-config__row">
                    <IonItem lines="none" className="form-item form-item-half">
                      <IonLabel position="stacked">Preguntas</IonLabel>
                      <IonSelect value={numQuestions} onIonChange={(e) => setNumQuestions(e.detail.value)} interface="popover">
                        {[5, 8, 10, 12, 15, 20].map((n) => (
                          <IonSelectOption key={n} value={n}>{n}</IonSelectOption>
                        ))}
                      </IonSelect>
                    </IonItem>
                    <IonItem lines="none" className="form-item form-item-half">
                      <IonLabel position="stacked">Dificultad</IonLabel>
                      <IonSelect value={difficulty} onIonChange={(e) => setDifficulty(e.detail.value)} interface="popover">
                        <IonSelectOption value="easy">Fácil</IonSelectOption>
                        <IonSelectOption value="medium">Media</IonSelectOption>
                        <IonSelectOption value="hard">Difícil</IonSelectOption>
                      </IonSelect>
                    </IonItem>
                  </div>

                  {/* Date + max score above correction deadline */}
                  <div className="gen-config__row">
                    <IonItem lines="none" className="form-item form-item-half">
                      <IonInput
                        type="date"
                        value={date}
                        onIonInput={(e) => setDate(e.detail.value ?? '')}
                        label="Fecha del examen"
                        labelPlacement="stacked"
                      />
                    </IonItem>
                    <IonItem lines="none" className="form-item form-item-half">
                      <IonInput
                        type="number"
                        value={maxScore}
                        min={1}
                        onIonInput={(e) => {
                          const v = parseFloat(e.detail.value ?? '');
                          if (!isNaN(v) && v > 0) setMaxScore(v);
                        }}
                        label="Calificación máx."
                        labelPlacement="stacked"
                      />
                    </IonItem>
                  </div>

                  {/* Correction deadline */}
                  <IonItem lines="none" className="form-item">
                    <IonInput
                      type="date"
                      value={correctionDeadline}
                      min={date}
                      onIonInput={(e) => setCorrectionDeadline(e.detail.value ?? '')}
                      label="Fecha límite de corrección"
                      labelPlacement="stacked"
                    />
                  </IonItem>

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
                    <IonItem lines="none" className="form-item">
                      <IonTextarea
                        value={refinement}
                        onIonInput={(e) => setRefinement(e.detail.value ?? '')}
                        placeholder="Describe lo que quieres que incluya o evite el examen..."
                        rows={3}
                        autoGrow
                      />
                    </IonItem>
                  )}

                </div>
              )}
            </div>
          )}

          {/* ─── SHARED FIELDS (upload mode) ─── */}
          {mode === 'upload' && (
            <div className="form-grid">
              {isNew && (
                <div className="form-item-standalone">
                  <label className="form-item-label">Clase y asignatura</label>
                  <ClassSubjectPicker
                    pairs={urlClassId ? classPairs.filter(p => p.classId === urlClassId) : classPairs}
                    loading={pairsLoading}
                    value={classId && selectedSubjectId ? { classId, subjectId: selectedSubjectId } : null}
                    onChange={(cId, sId) => {
                      if (cId !== classId) setLectureId('');
                      setClassId(cId);
                      setSelectedSubjectId(sId);
                    }}
                  />
                </div>
              )}

              {/* Recovery: Source exam selector (upload mode) */}
              {examType === 'recovery' && classId && (
                <div className="gen-recovery-source" style={{ marginTop: 'var(--space-md)' }}>
                  <span className="gen-config__label">Examen de origen</span>
                  <p className="gen-recovery-source__hint">
                    Selecciona el examen corregido para el que subes la recuperación.
                  </p>
                  {correctedExams.length === 0 ? (
                    <div className="gen-topics__empty">
                      <p>No hay exámenes corregidos en esta clase.</p>
                    </div>
                  ) : (
                    <div className="gen-topics__list">
                      {correctedExams.map((e) => (
                        <div
                          key={e.id}
                          className={`gen-topic-chip ${sourceExamId === e.id ? 'gen-topic-chip--active' : ''}`}
                          onClick={() => setSourceExamId(sourceExamId === e.id ? '' : e.id)}
                        >
                          <IonCheckbox checked={sourceExamId === e.id} className="gen-topic-chip__check" />
                          <span className="gen-topic-chip__name">{e.name}</span>
                          <IonBadge color="medium">{new Date(e.date).toLocaleDateString('es-ES')}</IonBadge>
                        </div>
                      ))}
                    </div>
                  )}

                  {sourceExamId && (
                    <div className="gen-recovery-students">
                      {loadingFailingStudents ? (
                        <div className="gen-topics__loading"><IonSpinner name="crescent" /></div>
                      ) : failingStudents.length === 0 ? (
                        <div className="gen-recovery-students__empty">
                          <IonIcon icon={checkmarkCircleOutline} />
                          <span>Todos los alumnos han aprobado este examen.</span>
                        </div>
                      ) : (
                        <>
                          <span className="gen-recovery-students__label">
                            <IonIcon icon={alertCircleOutline} />
                            {failingStudents.length} alumno{failingStudents.length !== 1 ? 's' : ''} no ha{failingStudents.length !== 1 ? 'n' : ''} aprobado
                          </span>
                          <div className="gen-recovery-students__list">
                            {failingStudents.map((s) => (
                              <div key={s.id} className="gen-recovery-student">
                                <span className="gen-recovery-student__name">{s.name}</span>
                                <IonBadge color="danger">{s.grade} / {allExams.find((ex) => ex.id === sourceExamId)?.maxScore ?? 10}</IonBadge>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="form-row">
                <IonItem lines="none" className="form-item form-item-half">
                  <IonInput
                    type="date"
                    value={date}
                    onIonInput={(e) => setDate(e.detail.value ?? '')}
                    label="Fecha del examen"
                    labelPlacement="stacked"
                  />
                </IonItem>
                <IonItem lines="none" className="form-item form-item-half">
                  <IonInput
                    type="number"
                    value={maxScore}
                    min={1}
                    onIonInput={(e) => {
                      const v = parseFloat(e.detail.value ?? '');
                      if (!isNaN(v) && v > 0) setMaxScore(v);
                    }}
                    label="Calificación máx."
                    labelPlacement="stacked"
                  />
                </IonItem>
              </div>

              {/* Correction deadline */}
              <IonItem lines="none" className="form-item">
                <IonInput
                  type="date"
                  value={correctionDeadline}
                  min={date}
                  onIonInput={(e) => setCorrectionDeadline(e.detail.value ?? '')}
                  label="Fecha límite de corrección"
                  labelPlacement="stacked"
                />
              </IonItem>

              {/* Instructions */}
              <button
                type="button"
                className="exgen__instructions-toggle"
                onClick={() => setShowInstructions(v => !v)}
              >
                <IonIcon icon={chevronForwardOutline} className={`exgen__instructions-chevron ${showInstructions ? 'exgen__instructions-chevron--open' : ''}`} />
                <span>Comentarios para la digitalización</span>
                {!showInstructions && refinement && <IonBadge color="primary" className="exgen__instructions-dot">1</IonBadge>}
              </button>
              {showInstructions && (
                <IonItem lines="none" className="form-item">
                  <IonTextarea
                    value={refinement}
                    onIonInput={(e) => setRefinement(e.detail.value ?? '')}
                    placeholder="Ej: Añadir un ejercicio extra de fracciones, cambiar el ejercicio 3..."
                    rows={3}
                    autoGrow
                  />
                </IonItem>
              )}
            </div>
          )}


          {/* ─── BLANK PAGES (both modes, new exams only) ─── */}
          {isNew && classId && (
            <div className="gen-personalize">
              {selectedClass && (
                <div className="gen-personalize__info">
                  <IonIcon icon={sparklesOutline} />
                  <span>
                    Se generará 1 copia por alumno ({selectedClass.studentCount} alumnos) con su código impreso.
                    Al corregir con subida masiva, la IA detectará los códigos automáticamente.
                  </span>
                </div>
              )}
              <div className="blank-pages-stepper">
                <span className="blank-pages-stepper__label">Hojas en blanco por alumno</span>
                <div className="blank-pages-stepper__controls">
                  <button
                    className="blank-pages-stepper__btn"
                    onClick={() => setBlankPagesCount(Math.max(1, blankPagesCount - 1))}
                    disabled={blankPagesCount <= 1}
                  >
                    &minus;
                  </button>
                  <span className="blank-pages-stepper__value">{blankPagesCount}</span>
                  <button
                    className="blank-pages-stepper__btn"
                    onClick={() => setBlankPagesCount(Math.min(10, blankPagesCount + 1))}
                    disabled={blankPagesCount >= 10}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── DEADLINE STATUS (existing exams) ─── */}
          {exam && !isNew && exam.correctionDeadline && (
            <div className="exam-deadline-section">
              <div className="exam-deadline-header">
                <IonIcon icon={timeOutline} />
                <span>Plazo de corrección: {new Date(exam.correctionDeadline).toLocaleDateString('es-ES')}</span>
                {exam.deadlineStatus && (
                  <IonBadge color={getDeadlineStatusColor(exam.deadlineStatus)}>
                    {getDeadlineStatusText(exam.deadlineStatus)}
                  </IonBadge>
                )}
              </div>
            </div>
          )}

          {/* ─── DOWNLOAD SECTION (existing exams with documents) ─── */}
          {exam && !isNew && (exam.documentUrl || exam.hasGeneratedQuestions) && (
            <div className="exam-downloads">
              <span className="exam-downloads__label">
                Descargas disponibles
                {exam.iterationHistory && exam.iterationHistory.length > 0 && (
                  <IonBadge color="primary" style={{ marginLeft: '8px', verticalAlign: 'middle' }}>
                    v{exam.iterationHistory.length + 1} — última versión
                  </IonBadge>
                )}
              </span>
              <div className="exam-downloads__buttons">
                <IonButton
                  fill="outline"
                  size="small"
                  onClick={() => handleDownload('exam')}
                >
                  <IonIcon icon={downloadOutline} slot="start" />
                  {exam.isPersonalized
                    ? 'Todas las copias (QR)'
                    : 'Examen'}
                </IonButton>

                {exam.hasGeneratedQuestions && exam.documentUrl && (
                  <IonButton
                    fill="outline"
                    size="small"
                    onClick={() => handleDownload('digitalized')}
                  >
                    <IonIcon icon={documentTextOutline} slot="start" />
                    Digitalizado
                  </IonButton>
                )}

                {exam.hasGeneratedQuestions && (
                  <IonButton
                    fill="outline"
                    size="small"
                    onClick={() => handleDownload('solutions')}
                  >
                    <IonIcon icon={documentTextOutline} slot="start" />
                    Solucionario
                  </IonButton>
                )}
              </div>
              {exam.isPersonalized && (
                <p className="exam-downloads__hint">
                  Este PDF incluye una copia del examen por cada alumno con su nombre y QR impresos. Imprímelo completo para repartir en clase.
                </p>
              )}
              {exam.hasGeneratedQuestions && exam.documentUrl && (
                <p className="exam-downloads__hint">
                  El examen digitalizado es la versión escrita a ordenador generada a partir del documento original.
                </p>
              )}
            </div>
          )}

          {/* ─── ITERATION SECTION (AI-generated exams) ─── */}
          {exam && !isNew && exam.hasGeneratedQuestions && exam.status !== 'corrected' && (
            <div className="exam-iteration-section">
              <div className="exam-iteration-header">
                <IonIcon icon={createOutline} />
                <span>Ajustar examen</span>
              </div>
              <p className="exam-iteration-description">
                Describe los cambios que quieres hacer y la IA ajustará el examen manteniendo la estructura.
              </p>
              
              <div className="exam-iteration-quick">
                <IonChip outline onClick={() => applyQuickIteration('Simplifica las preguntas')}>
                  Simplificar
                </IonChip>
                <IonChip outline onClick={() => applyQuickIteration('Añade una pregunta más del mismo estilo')}>
                  +1 pregunta
                </IonChip>
                <IonChip outline onClick={() => applyQuickIteration('Convierte algunas preguntas a tipo test')}>
                  Tipo test
                </IonChip>
              </div>

              <IonItem lines="none" className="form-item">
                <IonTextarea
                  value={iterationInstruction}
                  onIonInput={(e) => setIterationInstruction(e.detail.value ?? '')}
                  placeholder="Ej: Haz la pregunta 3 más fácil, añade más problemas de geometría..."
                  rows={3}
                />
              </IonItem>

              {iterationError && <p className="gen-error">{iterationError}</p>}

              <IonButton
                expand="block"
                fill="outline"
                onClick={handleIterate}
                disabled={iterating || !iterationInstruction.trim()}
              >
                {iterating ? (
                  <><IonSpinner name="crescent" /> Aplicando cambios...</>
                ) : (
                  <><IonIcon icon={refreshOutline} slot="start" /> Aplicar cambios</>
                )}
              </IonButton>

              {/* Version history */}
              {exam.iterationHistory && exam.iterationHistory.length > 0 && (
                <IonAccordionGroup className="exam-iteration-history">
                  <IonAccordion value="history">
                    <IonItem slot="header" lines="none">
                      <IonLabel>
                        Historial de versiones ({exam.iterationHistory.length + 1} versiones)
                      </IonLabel>
                    </IonItem>
                    <div slot="content" className="iteration-history-content">
                      {/* Current version */}
                      <div className="iteration-history-item iteration-history-item--current">
                        <div className="iteration-history-version">
                          <IonBadge color="primary">v{exam.iterationHistory.length + 1}</IonBadge>
                          <span className="iteration-history-label">Versión actual</span>
                          <IonButton
                            fill="clear"
                            size="small"
                            onClick={() => handleDownload('exam')}
                            title="Descargar esta versión"
                          >
                            <IonIcon icon={downloadOutline} slot="icon-only" />
                          </IonButton>
                        </div>
                        <p className="iteration-history-instruction">
                          {exam.iterationHistory[exam.iterationHistory.length - 1].instruction}
                        </p>
                        {exam.iterationHistory[exam.iterationHistory.length - 1].changes_made &&
                          exam.iterationHistory[exam.iterationHistory.length - 1].changes_made!.length > 0 && (
                          <ul className="iteration-history-changes">
                            {exam.iterationHistory[exam.iterationHistory.length - 1].changes_made!.map((change: string, cidx: number) => (
                              <li key={cidx}>{change}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {/* Previous versions */}
                      {[...exam.iterationHistory].slice(0, -1).reverse().map((item: ExamIterationHistoryItem, idx: number) => (
                        <div key={idx} className="iteration-history-item">
                          <div className="iteration-history-version">
                            <IonBadge color="medium">v{item.version}</IonBadge>
                            <span className="iteration-history-time">
                              {new Date(item.timestamp).toLocaleString('es-ES')}
                            </span>
                          </div>
                          <p className="iteration-history-instruction">{item.instruction}</p>
                          {item.changes_made && item.changes_made.length > 0 && (
                            <ul className="iteration-history-changes">
                              {item.changes_made.map((change: string, cidx: number) => (
                                <li key={cidx}>{change}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                      {/* Original version */}
                      <div className="iteration-history-item">
                        <div className="iteration-history-version">
                          <IonBadge color="medium">v1</IonBadge>
                          <span className="iteration-history-label">Versión original</span>
                        </div>
                        <p className="iteration-history-instruction">Generación inicial del examen</p>
                      </div>
                    </div>
                  </IonAccordion>
                </IonAccordionGroup>
              )}
            </div>
          )}
        </div>

        {/* ─── BOTTOM ACTIONS ─── */}
        <div className="exam-editor-actions">
          {/* Upload mode actions */}
          {mode === 'upload' && (
            <IonButton
              expand="block"
              onClick={handleSave}
              disabled={!name.trim() || !selectedSubjectId || saving}
              className="save-btn"
            >
              {saving ? <><IonSpinner name="crescent" /> Guardando...</> : isNew ? (files.length > 0 ? 'Crear y preparar examen' : 'Crear examen') : 'Guardar cambios'}
            </IonButton>
          )}

          {/* Generate mode actions */}
          {mode === 'generate' && isNew && (
              <IonButton
                expand="block"
                onClick={handleGenerate}
                disabled={
                  !name.trim() ||
                  (examType === 'recovery' ? !sourceExamId : selectedTopicIds.length === 0)
                }
                className="save-btn gen-btn"
              >
                <IonIcon icon={sparklesOutline} slot="start" />
                {examType === 'recovery' ? 'Generar recuperación' : 'Generar examen'}
              </IonButton>
          )}

          {/* Existing exam actions (both modes) */}
          {exam && exam.status === 'uploaded' && (
            <IonButton expand="block" color="success" onClick={handleStartCorrection}>
              <IonIcon icon={checkmarkCircleOutline} slot="start" />
              Asignar y corregir
            </IonButton>
          )}
          {exam && exam.status === 'assigned' && (
            <IonButton expand="block" color="success" onClick={handleStartCorrection}>
              <IonIcon icon={checkmarkCircleOutline} slot="start" />
              Continuar corrección
            </IonButton>
          )}
          {exam && exam.status === 'corrected' && (
            <>
              <IonButton expand="block" color="primary" onClick={() => history.push(`/correction/${exam.id}`)}>
                <IonIcon icon={checkmarkCircleOutline} slot="start" />
                Ver correcciones
              </IonButton>
              <IonButton expand="block" fill="outline" onClick={() => setShowExerciseModal(true)}>
                <IonIcon icon={sparklesOutline} slot="start" />
                Generar ejercicios
              </IonButton>
            </>
          )}
        </div>

        {exam && exam.status === 'corrected' && (
          <ExerciseGeneratorModal
            isOpen={showExerciseModal}
            onDismiss={() => setShowExerciseModal(false)}
            classId={exam.classId}
            preselectedExamId={exam.id}
          />
        )}

        <IonAlert
          isOpen={showDeleteAlert}
          onDidDismiss={() => setShowDeleteAlert(false)}
          header="Eliminar examen"
          message={`¿Eliminar "${name}"? También se eliminarán las correcciones asociadas.`}
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Eliminar', role: 'destructive', handler: handleDelete }
          ]}
        />
      </IonContent>
    </IonPage>
  );
};

export default ExamEditor;
