import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Upload, File as FileIconLucide, CheckCircle, Sparkles,
  Download, FileText, Trash2, RefreshCw, Clock,
  Pencil, AlertCircle,
} from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useExamsStore } from '../../store/examsStore';
import { useClassesStore } from '../../store/classesStore';
import { useTopicsStore } from '../../store/topicsStore';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import api, { exams as examsApi, classes as classesApi, subjects as subjectsApi } from '../../services/api';
import { Lecture, ExamIterationHistoryItem, SubjectWithTopics } from '../../types';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import ClassSubjectPicker from '../../components/ClassSubjectPicker';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import { useAcademicConfigStore } from '../../store/academicConfigStore';
import { EDUCATION_LEVELS, DIFFICULTY_OPTIONS, EXAM_DEADLINE_CONFIG } from './examConstants';
import type { ExamFormat } from './examConstants';
import FormatSelector from './FormatSelector';
import LogoUploader from './LogoUploader';
import TopicSelector from './TopicSelector';
import PageShell from '@/components/shared/PageShell';
import AlertConfirm from '@/components/shared/AlertConfirm';
import Spinner from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import './ExamEditor.css';

const ExamEditor: React.FC = () => {
  const { examId, classId: urlClassId, subjectId: urlSubjectId } = useParams() as { examId: string; classId?: string; subjectId?: string };
  const navigate = useNavigate();
  const location = useLocation();
  // isNew if examId is 'new' OR undefined (when coming from /tabs/classes/:classId/exams/new route)
  const isNew = examId === 'new' || examId === undefined;

  // Query params from calendar: ?topicIds=id1,id2&date=2026-04-05
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
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
  const [showExerciseModal, setShowExerciseModal] = useState(false);

  // Exam format: boxes (default), compact, test
  const [examFormat, setExamFormat] = useState<'boxes' | 'compact' | 'test'>('boxes');
  // MCQ-only config (only meaningful when examFormat === 'test')
  const [numOptions, setNumOptions] = useState<3 | 4 | 5>(4);
  const [numMultiAnswer, setNumMultiAnswer] = useState(0);

  // Logo
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Global context: free-text subject name when no urlClassId
  const [subjectNameText, setSubjectNameText] = useState('');

  // Reference materials (uploaded files for AI generation)
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [referencePaths, setReferencePaths] = useState<string[]>([]);
  const [uploadingRefs, setUploadingRefs] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);

  // Education level
  const [educationLevel, setEducationLevel] = useState('secundaria');

  // Blank answer pages per student
  const [blankPages, setBlankPages] = useState(1);

  // Phase 4: Deadline and iteration
  const [correctionDeadline, setCorrectionDeadline] = useState('');
  const [iterationInstruction, setIterationInstruction] = useState('');
  const [iterating, setIterating] = useState(false);
  const [iterationError, setIterationError] = useState('');
  const iterateExam = useExamsStore((s) => s.iterateExam);

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

  // Unsaved changes guard — warn on browser back/close when form has data
  const hasUnsavedChanges = isNew && (name.trim().length > 0 || files.length > 0 || selectedTopicIds.length > 0 || referenceFiles.length > 0);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId),
    [classes, classId]
  );

  // Pre-fill education level from class
  useEffect(() => {
    if (selectedClass?.educationLevel) {
      setEducationLevel(selectedClass.educationLevel);
    }
  }, [selectedClass?.educationLevel]);

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

  // Fetch teacher logo
  useEffect(() => {
    examsApi.getLogo().then(res => {
      if (res.data?.logo_url) setLogoUrl(res.data.logo_url);
    }).catch(() => {});
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const res = await examsApi.uploadLogo(file);
      setLogoUrl(res.data.logo_url);
    } catch (err) {
      console.error('Logo upload failed:', err);
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

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
      navigate('/tabs/exams/new', { replace: true });
    }
  }, [isNew, examId, examsLoading, allExams, exam, navigate]);

  useEffect(() => {
    if (exam) {
      setName(exam.name);
      setClassId(exam.classId || '');
      setLectureId(exam.lectureId || '');
      if (exam.subjectId) setSelectedSubjectId(exam.subjectId);
      setDate(exam.date);
      setMaxScore(exam.maxScore);
      setCorrectionDeadline(exam.correctionDeadline || '');
      if (exam.examFormat) setExamFormat(exam.examFormat as 'boxes' | 'compact' | 'test');
      if (exam.blankPagesCount !== undefined && exam.blankPagesCount !== null) setBlankPages(exam.blankPagesCount);
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
    if (!isNew && !exam) return;

    setSaving(true);
    try {
      if (isNew) {
        const taskName = name.trim();
        const examData = {
          name: taskName,
          classId: classId || undefined,
          lectureId: lectureId || undefined,
          subjectId: selectedSubjectId || undefined,
          // Exam date is left undefined; it will be set during the
          // Planificar step. Previously we passed today() here, which
          // surfaced the exam in the calendar prematurely.
          maxScore,
          examFormat: examFormat || undefined,
          // Persist the teacher's instructions so the digitiser can apply
          // them and the Validar card can surface them back.
          refinementPrompt: refinement || undefined,
        };
        const { id: newExamId, batchJobId: jobId } = await addExam(examData, files.length === 1 ? files[0] : files.length > 1 ? files : undefined);

        // Build destination URL using form-selected values (not URL params)
        const targetCId = classId || urlClassId;
        const targetSId = selectedSubjectId || urlSubjectId;
        const detailUrl = targetCId && targetSId
          ? `/tabs/classes/${targetCId}/subjects/${targetSId}/exams/${newExamId}`
          : targetCId
            ? `/tabs/classes/${targetCId}/exams/${newExamId}`
            : `/tabs/exams/${newExamId}`;

        // Register background task for upload processing (question extraction)
        if (jobId) {
          addBackgroundTask({
            type: 'exam',
            label: taskName,
            description: 'Extrayendo preguntas del documento y generando el examen digitalizado.',
            batchJobId: jobId,
            expectedResultUrl: detailUrl,
            execute: async () => detailUrl,
          });
        }

        // Navigate to exam detail so teacher can validate/assign
        navigate(detailUrl, { replace: true });
      } else if (exam) {
        await updateExam(exam.id, { name, classId: classId || undefined, lectureId: lectureId || undefined, subjectId: selectedSubjectId || undefined, maxScore, examFormat });
        navigate(-1);
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
      navigate(backHref, { replace: true });
    } catch (err) {
      console.error('Failed to delete exam:', err);
    }
  };

  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);

  const handleGenerate = async () => {
    if (!name.trim()) return;

    const taskName = name.trim();

    // Step 1: Upload reference files if any (before creating the exam)
    let uploadedPaths: string[] = [...referencePaths];
    if (referenceFiles.length > 0) {
      try {
        setUploadingRefs(true);
        const uploadRes = await examsApi.uploadReferenceMaterials(referenceFiles);
        uploadedPaths = [...uploadedPaths, ...(uploadRes.data.paths || [])];
        setReferencePaths(uploadedPaths);
      } catch (err) {
        console.error('[ExamEditor] Failed to upload reference materials:', err);
        return;
      } finally {
        setUploadingRefs(false);
      }
    }

    // Step 2: Generate exam
    const genData: Record<string, any> = {
      class_id: classId || undefined,
      lecture_id: lectureId || undefined,
      subject_id: selectedSubjectId || undefined,
      subject_name: !urlClassId ? subjectNameText || undefined : undefined,
      topic_ids: selectedTopicIds.length > 0 ? [...selectedTopicIds] : undefined,
      reference_material_paths: uploadedPaths.length > 0 ? uploadedPaths : undefined,
      name: taskName,
      num_questions: numQuestions,
      max_score: maxScore,
      difficulty,
      refinement_prompt: refinement || undefined,
      is_test_format: examFormat === 'test',
      exam_format: examFormat,
      education_level: educationLevel,
      // MCQ-only params, always sent — backend ignores them unless test
      num_options: numOptions,
      num_multi_answer: numMultiAnswer,
    };

    generateExam(genData as any).then(({ id: newExamId, batchJobId: jobId }) => {
      // Build destination URL using form-selected values (not URL params)
      const tCId = classId || urlClassId;
      const tSId = selectedSubjectId || urlSubjectId;
      const detailUrl = tCId && tSId
        ? `/tabs/classes/${tCId}/subjects/${tSId}/exams/${newExamId}`
        : tCId
          ? `/tabs/classes/${tCId}/exams/${newExamId}`
          : `/tabs/exams/${newExamId}`;
      addBackgroundTask({
        type: 'exam',
        label: taskName,
        description: 'La IA genera preguntas a partir del material proporcionado y compone el examen en PDF.',
        batchJobId: jobId,
        expectedResultUrl: detailUrl,
        execute: async () => detailUrl,
      });
      // Navigate to exam detail so teacher sees processing state
      navigate(detailUrl, { replace: true });
    }).catch((err) => {
      console.error('[ExamEditor] Failed to start exam generation:', err);
      toast.error('Error al iniciar la generacion');
    });
  };

  const handleStartCorrection = async () => {
    if (exam) {
      if (exam.status === 'pending_validation') await assignExam(exam.id);
      // Use exam's own classId/subjectId (may have been linked after creation)
      const cId = exam.classId || urlClassId;
      const sId = exam.subjectId || urlSubjectId;
      if (cId && sId) {
        navigate(`/tabs/classes/${cId}/subjects/${sId}/exams/${exam.id}`);
      } else if (cId) {
        navigate(`/tabs/classes/${cId}/exams/${exam.id}`);
      } else {
        navigate(`/tabs/exams/${exam.id}`);
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

  const getDeadlineStatusText = (status?: string) => {
    return status ? (EXAM_DEADLINE_CONFIG[status]?.label || '') : '';
  };

  const editorSubjectColor = urlSubjectId && urlClassId ? classSubjects[urlClassId]?.find(s => s.subjectId === urlSubjectId)?.subjectColor : undefined;

  const backHref = urlClassId && urlSubjectId
    ? `/tabs/classes/${urlClassId}/subjects/${urlSubjectId}/exams`
    : urlClassId
    ? `/tabs/classes/${urlClassId}/exams`
    : '/tabs/exams';

  // Whether we have a class context (urlClassId present)
  const hasClassContext = !!urlClassId;

  return (
    <PageShell
      title={isNew ? 'Nuevo examen' : name || 'Editar'}
      backHref={backHref}
      headerActions={
        !isNew ? (
          <Button variant="destructive" size="icon" onClick={() => setShowDeleteAlert(true)}>
            <Trash2 size={18} />
          </Button>
        ) : undefined
      }
      noPadding
      className={editorSubjectColor ? `[--color-primary:${editorSubjectColor}]` : undefined}
    >
      {/* Mode toggle (new exams only) */}
      {isNew && (
        <div className="exam-mode-toggle">
          <button
            type="button"
            className={`exam-mode-btn ${mode === 'upload' ? 'exam-mode-btn--active' : ''}`}
            onClick={() => setMode('upload')}
          >
            <Upload size={16} />
            <span>Digitalizar</span>
          </button>
          <button
            type="button"
            className={`exam-mode-btn ${mode === 'generate' ? 'exam-mode-btn--active' : ''}`}
            onClick={() => setMode('generate')}
          >
            <Sparkles size={16} />
            <span>Generar con IA</span>
          </button>
        </div>
      )}

      <div className="exam-editor-content">
        <input
          id="exam-file-input"
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="application/pdf,image/*"
          onChange={handleFileSelect}
        />

        <div className="exam-editor-form">
          {/* --- CLASS/SUBJECT PICKER (top of form, both modes) --- */}
          {isNew && hasClassContext && (
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
          )}

          {/* --- EXAM IDENTITY --- */}
          <div className="exam-name-field">
            <label className="exam-name-label">Nombre del examen</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Examen T2 Ecuaciones"
              className="text-lg font-semibold"
            />
            {duplicateName && (
              <p className="exam-name-warning">
                Ya existe un examen con este nombre en esta clase
              </p>
            )}
          </div>

          {/* Global context: subject name (shown for both modes when no class context) */}
          {isNew && !hasClassContext && (
            <div className="form-item" style={{ marginTop: '-8px', marginBottom: 'var(--space-lg)' }}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Asignatura o materia</label>
              <Input
                value={subjectNameText}
                onChange={(e) => setSubjectNameText(e.target.value)}
                placeholder="Ej: Matemáticas 2º ESO, Historia del Arte..."
              />
            </div>
          )}

          {/* --- UPLOAD MODE (existing + editing) --- */}
          {(mode === 'upload' || !isNew) && (
            <>
              <label htmlFor="exam-file-input" className="upload-item">
                {files.length > 0 || exam?.documentUrl ? (
                  <FileIconLucide size={24} className="upload-item-icon" />
                ) : (
                  <Upload size={24} className="upload-item-icon" />
                )}
                <div className="upload-item-text">
                  <h3>{files.length > 0
                    ? (files.length === 1 ? files[0].name : `${files.length} paginas anadidas`)
                    : (exam?.documentUrl ? 'Documento subido' : 'Sube tu examen')}</h3>
                  <p>{files.length > 0 ? 'Toca para anadir mas paginas' : (exam?.documentUrl ? 'Toca para cambiar' : 'Sube un PDF o fotos para digitalizarlo')}</p>
                </div>
                {(files.length > 0 || exam?.documentUrl) && (
                  <CheckCircle size={20} className="upload-success-icon" />
                )}
              </label>
              {files.length > 1 && (
                <div className="upload-file-list">
                  {files.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs">
                      <span>{f.name.length > 20 ? f.name.slice(0, 17) + '...' : f.name}</span>
                      <Trash2 size={12} className="cursor-pointer text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleRemoveFile(i); }} />
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {/* --- UPLOAD MODE: shared fields --- */}
          {mode === 'upload' && isNew && (
            <div className="form-grid">
              <div className="form-item">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Instrucciones adicionales</label>
                <Textarea
                  value={refinement}
                  onChange={(e) => setRefinement(e.target.value)}
                  placeholder="Ej: Anadir un ejercicio extra de fracciones, cambiar el ejercicio 3..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Format + Logo — visible in both new and edit for upload mode */}
          {mode === 'upload' && (
            <div className="gen-config" style={{ marginTop: 'var(--space-md)' }}>
              <span className="gen-config__label">Formato y personalización</span>
              <FormatSelector value={examFormat} onChange={setExamFormat} />
              {isNew && <LogoUploader logoUrl={logoUrl} uploading={uploadingLogo} onUpload={handleLogoUpload} />}
            </div>
          )}

          {/* --- MAX SCORE (new exams in upload mode only — generate mode has it in config section) --- */}
          {isNew && mode === 'upload' && (
            <div className="gen-config" style={{ marginTop: 'var(--space-md)' }}>
              <div className="gen-config-inline__row">
                <span className="gen-config-inline__label">Calificación máxima</span>
                <div className="gen-config-stepper">
                  <button type="button" className="gen-config-stepper__btn" onClick={() => setMaxScore(Math.max(1, maxScore - 1))} disabled={maxScore <= 1}>−</button>
                  <span className="gen-config-stepper__value">{maxScore}</span>
                  <button type="button" className="gen-config-stepper__btn" onClick={() => setMaxScore(maxScore + 1)}>+</button>
                </div>
              </div>
            </div>
          )}

          {/* --- EXISTING EXAM: editable fields --- */}
          {!isNew && (
            <div className="gen-config" style={{ marginTop: 'var(--space-md)' }}>
              <div className="gen-config-inline__row">
                <span className="gen-config-inline__label">Calificación máxima</span>
                <div className="gen-config-stepper">
                  <button type="button" className="gen-config-stepper__btn" onClick={() => setMaxScore(Math.max(1, maxScore - 1))} disabled={maxScore <= 1}>−</button>
                  <span className="gen-config-stepper__value">{maxScore}</span>
                  <button type="button" className="gen-config-stepper__btn" onClick={() => setMaxScore(maxScore + 1)}>+</button>
                </div>
              </div>
            </div>
          )}

          {/* --- GENERATE MODE --- */}
          {mode === 'generate' && isNew && (
            <div className="gen-section">
              {/* Topics selection */}
              {selectedSubjectId && (
                <TopicSelector
                  classId={classId}
                  topics={allSubjectTopics}
                  selectedTopicIds={selectedTopicIds}
                  onToggle={toggleTopic}
                  onBulkToggle={(ids, selected) => {
                    if (selected) {
                      setSelectedTopicIds(prev => [...new Set([...prev, ...ids])]);
                    } else {
                      setSelectedTopicIds(prev => prev.filter(id => !ids.includes(id)));
                    }
                  }}
                  trimesterFilter={topicTrimesterFilter}
                  onTrimesterFilterChange={setTopicTrimesterFilter}
                  periodMode={periodMode}
                />
              )}

              {/* ── MATERIAL DE REFERENCIA ── */}
              <div className="gen-config">
                <span className="gen-config__label">{selectedTopicIds.length > 0 ? 'Material adicional' : 'Material de referencia'}</span>
                <p className="text-xs text-muted-foreground" style={{ marginTop: '-4px', marginBottom: '8px' }}>
                  {selectedTopicIds.length > 0
                    ? 'La IA ya usará el material de los temas seleccionados. Añade documentos extra si quieres más detalle.'
                    : 'Sube documentos que la IA usará como base para generar las preguntas.'
                  }
                </p>
                <input
                  ref={refInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.txt,.md,.html"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files) {
                      setReferenceFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                    }
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="upload-item"
                  onClick={() => refInputRef.current?.click()}
                >
                  <Upload size={20} className="upload-item-icon" />
                  <div className="upload-item-text">
                    <h3>{referenceFiles.length > 0 ? `${referenceFiles.length} archivo${referenceFiles.length !== 1 ? 's' : ''}` : 'Subir documentos'}</h3>
                    <p>PDF, imágenes, Word, texto</p>
                  </div>
                  {referenceFiles.length > 0 && <CheckCircle size={18} className="upload-success-icon" />}
                </button>
                {referenceFiles.length > 0 && (
                  <div className="upload-file-list">
                    {referenceFiles.map((f, i) => (
                      <Badge key={i} variant="outline" className="gap-1">
                        <FileText size={12} />
                        {f.name.length > 25 ? f.name.slice(0, 22) + '...' : f.name}
                        <button onClick={() => setReferenceFiles(prev => prev.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive">
                          <Trash2 size={12} />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* ── CONFIGURACIÓN ── */}
              <div className="gen-config">
                <span className="gen-config__label">Configuración</span>

                {/* Inline stepper rows */}
                <div className="gen-config-inline">
                  <div className="gen-config-inline__row">
                    <span className="gen-config-inline__label">Nº preguntas</span>
                    <div className="gen-config-stepper">
                      <button type="button" className="gen-config-stepper__btn" onClick={() => setNumQuestions(Math.max(1, numQuestions - 1))} disabled={numQuestions <= 1}>−</button>
                      <span className="gen-config-stepper__value">{numQuestions}</span>
                      <button type="button" className="gen-config-stepper__btn" onClick={() => setNumQuestions(Math.min(50, numQuestions + 1))} disabled={numQuestions >= 50}>+</button>
                    </div>
                  </div>

                  <div className="gen-config-inline__row">
                    <span className="gen-config-inline__label">Nota máxima</span>
                    <div className="gen-config-stepper">
                      <button type="button" className="gen-config-stepper__btn" onClick={() => setMaxScore(Math.max(1, maxScore - 1))} disabled={maxScore <= 1}>−</button>
                      <span className="gen-config-stepper__value">{maxScore}</span>
                      <button type="button" className="gen-config-stepper__btn" onClick={() => setMaxScore(maxScore + 1)}>+</button>
                    </div>
                  </div>

                  <div className="gen-config-inline__row">
                    <span className="gen-config-inline__label">Dificultad</span>
                    <div className="gen-config-pills">
                      {DIFFICULTY_OPTIONS.map(({ value: v, label: l }) => (
                        <button key={v} type="button" className={`gen-config-pill${difficulty === v ? ' gen-config-pill--active' : ''}`} onClick={() => setDifficulty(v)}>{l}</button>
                      ))}
                    </div>
                  </div>

                  <div className="gen-config-inline__row">
                    <span className="gen-config-inline__label">Nivel</span>
                    <Select value={educationLevel} onValueChange={setEducationLevel}>
                      <SelectTrigger className="gen-config-inline__select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EDUCATION_LEVELS.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <FormatSelector value={examFormat} onChange={setExamFormat} />

                {/* MCQ-only: options-per-question + multi-answer count */}
                {examFormat === 'test' && (
                  <div className="gen-config-inline" style={{ marginTop: 'var(--space-sm)' }}>
                    <div className="gen-config-inline__row">
                      <span className="gen-config-inline__label">Opciones por pregunta</span>
                      <div className="gen-config-stepper">
                        {([3, 4, 5] as const).map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={`gen-config-stepper__btn${numOptions === n ? ' gen-config-stepper__btn--active' : ''}`}
                            onClick={() => setNumOptions(n)}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="gen-config-inline__row">
                      <span className="gen-config-inline__label">
                        Preguntas multirespuesta
                      </span>
                      <div className="gen-config-stepper">
                        <button
                          type="button"
                          className="gen-config-stepper__btn"
                          onClick={() => setNumMultiAnswer(Math.max(0, numMultiAnswer - 1))}
                          disabled={numMultiAnswer <= 0}
                        >−</button>
                        <span className="gen-config-stepper__value">{numMultiAnswer}</span>
                        <button
                          type="button"
                          className="gen-config-stepper__btn"
                          onClick={() => setNumMultiAnswer(Math.min(numQuestions, numMultiAnswer + 1))}
                          disabled={numMultiAnswer >= numQuestions}
                        >+</button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Las preguntas multirespuesta tendrán varias opciones correctas y se marcarán como tal en el enunciado.
                    </p>
                  </div>
                )}
              </div>

              {/* ── PERSONALIZACIÓN ── */}
              <div className="gen-config">
                <span className="gen-config__label">Personalización</span>
                <LogoUploader logoUrl={logoUrl} uploading={uploadingLogo} onUpload={handleLogoUpload} />

                {/* Instructions */}
                <div className="form-item">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Instrucciones adicionales</label>
                  <Textarea
                    value={refinement}
                    onChange={(e) => setRefinement(e.target.value)}
                    placeholder="Ej: Incluye 2 ejercicios de derivadas, evita integrales..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* --- DEADLINE STATUS (existing exams) --- */}
          {exam && !isNew && exam.correctionDeadline && (
            <div className="exam-deadline-section">
              <div className="exam-deadline-header">
                <Clock size={18} className="text-primary" />
                <span>Plazo de correccion: {new Date(exam.correctionDeadline).toLocaleDateString('es-ES')}</span>
                {exam.deadlineStatus && (
                  <Badge variant={exam.deadlineStatus === 'overdue' || exam.deadlineStatus === 'urgent' ? 'destructive' : exam.deadlineStatus === 'soon' ? 'outline' : 'default'} className="ml-auto">
                    {getDeadlineStatusText(exam.deadlineStatus)}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* --- DOWNLOAD SECTION (existing exams with documents) --- */}
          {exam && !isNew && (exam.documentUrl || exam.hasGeneratedQuestions) && (
            <div className="exam-downloads">
              <span className="exam-downloads__label">
                Descargas disponibles
                {exam.iterationHistory && exam.iterationHistory.length > 0 && (
                  <Badge className="ml-2 align-middle">
                    v{exam.iterationHistory.length + 1} -- ultima version
                  </Badge>
                )}
              </span>
              <div className="exam-downloads__buttons">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload('exam')}
                >
                  <Download size={16} />
                  {exam.isPersonalized
                    ? 'Todas las copias (QR)'
                    : 'Examen'}
                </Button>

                {exam.hasGeneratedQuestions && exam.documentUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('digitalized')}
                  >
                    <FileText size={16} />
                    Digitalizado
                  </Button>
                )}

                {exam.hasGeneratedQuestions && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('solutions')}
                  >
                    <FileText size={16} />
                    Solucionario
                  </Button>
                )}
              </div>
              {exam.isPersonalized && (
                <p className="exam-downloads__hint">
                  Este PDF incluye una copia del examen por cada alumno con su nombre y QR impresos. Imprimelo completo para repartir en clase.
                </p>
              )}
              {exam.hasGeneratedQuestions && exam.documentUrl && (
                <p className="exam-downloads__hint">
                  El examen digitalizado es la version escrita a ordenador generada a partir del documento original.
                </p>
              )}
            </div>
          )}

          {/* --- ITERATION SECTION (AI-generated exams) --- */}
          {exam && !isNew && exam.hasGeneratedQuestions && exam.status !== 'corrected' && (
            <div className="exam-iteration-section">
              <div className="exam-iteration-header">
                <Pencil size={20} />
                <span>Ajustar examen</span>
              </div>
              <p className="exam-iteration-description">
                Describe los cambios que quieres hacer y la IA ajustara el examen manteniendo la estructura.
              </p>

              <div className="exam-iteration-quick">
                <button className="inline-flex items-center px-3 py-1 rounded-full border text-xs cursor-pointer hover:bg-accent" onClick={() => applyQuickIteration('Simplifica las preguntas')}>
                  Simplificar
                </button>
                <button className="inline-flex items-center px-3 py-1 rounded-full border text-xs cursor-pointer hover:bg-accent" onClick={() => applyQuickIteration('Anade una pregunta mas del mismo estilo')}>
                  +1 pregunta
                </button>
                <button className="inline-flex items-center px-3 py-1 rounded-full border text-xs cursor-pointer hover:bg-accent" onClick={() => applyQuickIteration('Convierte algunas preguntas a tipo test')}>
                  Tipo test
                </button>
              </div>

              <div className="form-item">
                <Textarea
                  value={iterationInstruction}
                  onChange={(e) => setIterationInstruction(e.target.value)}
                  placeholder="Ej: Haz la pregunta 3 mas facil, anade mas problemas de geometria..."
                  rows={3}
                />
              </div>

              {iterationError && <p className="gen-error">{iterationError}</p>}

              <Button
                className="w-full"
                variant="outline"
                onClick={handleIterate}
                disabled={iterating || !iterationInstruction.trim()}
              >
                {iterating ? (
                  <><Spinner size={18} /> Aplicando cambios...</>
                ) : (
                  <><RefreshCw size={16} /> Aplicar cambios</>
                )}
              </Button>

              {/* Version history */}
              {exam.iterationHistory && exam.iterationHistory.length > 0 && (
                <Accordion type="single" collapsible className="exam-iteration-history">
                  <AccordionItem value="history">
                    <AccordionTrigger>
                      Historial de versiones ({exam.iterationHistory.length + 1} versiones)
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="iteration-history-content">
                        {/* Current version */}
                        <div className="iteration-history-item iteration-history-item--current">
                          <div className="iteration-history-version">
                            <Badge>v{exam.iterationHistory.length + 1}</Badge>
                            <span className="iteration-history-label">Version actual</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload('exam')}
                              title="Descargar esta version"
                            >
                              <Download size={16} />
                            </Button>
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
                              <Badge variant="secondary">v{item.version}</Badge>
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
                            <Badge variant="secondary">v1</Badge>
                            <span className="iteration-history-label">Version original</span>
                          </div>
                          <p className="iteration-history-instruction">Generacion inicial del examen</p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          )}
        </div>

        {/* --- BOTTOM ACTIONS --- */}
        <div className="exam-editor-actions">
          {/* Upload mode actions */}
          {mode === 'upload' && (
            <Button
              className="w-full save-btn"
              onClick={handleSave}
              disabled={!name.trim() || saving || duplicateName}
            >
              {saving ? <><Spinner size={18} /> Guardando...</> : isNew ? (files.length > 0 ? 'Digitalizar examen' : 'Crear examen') : 'Guardar cambios'}
            </Button>
          )}

          {/* Generate mode actions */}
          {mode === 'generate' && isNew && (
              <Button
                className="w-full save-btn gen-btn"
                onClick={handleGenerate}
                disabled={!name.trim() || uploadingRefs || duplicateName}
              >
                {uploadingRefs ? (
                  <><Spinner size={16} /> Subiendo documentos...</>
                ) : (
                  <><Sparkles size={16} /> Generar examen</>
                )}
              </Button>
          )}

          {/* Existing exam actions (both modes) */}
          {exam && exam.status === 'pending_validation' && (
            <Button className="w-full" variant="default" onClick={handleStartCorrection}>
              <CheckCircle size={16} />
              Asignar y corregir
            </Button>
          )}
          {exam && exam.status === 'pending_schedule' && (
            <Button className="w-full" variant="default" onClick={handleStartCorrection}>
              <CheckCircle size={16} />
              Continuar correccion
            </Button>
          )}
          {exam && exam.status === 'corrected' && (
            <>
              <Button className="w-full" onClick={handleStartCorrection}>
                <CheckCircle size={16} />
                Ver correcciones
              </Button>
              <Button className="w-full" variant="outline" onClick={() => setShowExerciseModal(true)}>
                <Sparkles size={16} />
                Generar ejercicios
              </Button>
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

        <AlertConfirm
          open={showDeleteAlert}
          onClose={() => setShowDeleteAlert(false)}
          header="Eliminar examen"
          message={`Eliminar "${name}"? Tambien se eliminaran las correcciones asociadas.`}
          confirmText="Eliminar"
          onConfirm={handleDelete}
          variant="destructive"
        />
      </div>
    </PageShell>
  );
};

export default ExamEditor;
