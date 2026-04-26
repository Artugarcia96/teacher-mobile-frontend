import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Upload, File as FileIconLucide, CheckCircle, Sparkles,
  Download, FileText, Trash2, RefreshCw, Clock,
  Pencil, ScanLine, BookOpen, Settings2, Layers,
  Users, User, GraduationCap, ListChecks, Wand2,
} from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useExamsStore } from '../../store/examsStore';
import { useClassesStore } from '../../store/classesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useTopicsStore } from '../../store/topicsStore';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import api, { exams as examsApi, classes as classesApi, subjects as subjectsApi } from '../../services/api';
import { Lecture, ExamIterationHistoryItem, SubjectWithTopics } from '../../types';
import ClassSubjectPicker from '../../components/ClassSubjectPicker';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import { useAcademicConfigStore } from '../../store/academicConfigStore';
import { EDUCATION_LEVELS, DIFFICULTY_OPTIONS, EXAM_DEADLINE_CONFIG } from './examConstants';
import type { ExamFormat } from './examConstants';
import FormatSelector from './FormatSelector';
import LogoUploader from './LogoUploader';
import TopicSelector from './TopicSelector';
import PageShell from '@/components/shared/PageShell';
import { useExamDeleteFlow } from '../../hooks/useExamDeleteFlow';
import Spinner from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import './ExamEditor.css';

interface ExamEditorProps {
  /** Default purpose for newly created exams. "evaluation" by default
   *  (the classic /tabs/exams/new flow); "practice" or "recovery" when
   *  entering from the Ejercicios tab. Can be overridden via ?purpose= URL param. */
  defaultPurpose?: 'evaluation' | 'practice' | 'recovery';
}

const ExamEditor: React.FC<ExamEditorProps> = ({ defaultPurpose = 'evaluation' }) => {
  const { examId, classId: urlClassId, subjectId: urlSubjectId } = useParams() as { examId: string; classId?: string; subjectId?: string };
  const navigate = useNavigate();
  const location = useLocation();
  // isNew if examId is 'new' OR undefined (when coming from /tabs/classes/:classId/exams/new route)
  const isNew = examId === 'new' || examId === undefined;

  // Query params from calendar: ?topicIds=id1,id2&date=2026-04-05
  // Also accepts: ?purpose=practice|recovery&sourceExamId=...&studentIds=...,...
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qTopicIds = useMemo(() => queryParams.get('topicIds')?.split(',').filter(Boolean) || [], [queryParams]);
  const qDate = queryParams.get('date');
  const qName = queryParams.get('name');
  const qPurpose = (queryParams.get('purpose') as 'evaluation' | 'practice' | 'recovery' | null);
  const qSourceExamId = queryParams.get('sourceExamId');
  const qStudentIds = useMemo(() => queryParams.get('studentIds')?.split(',').filter(Boolean) || [], [queryParams]);
  const [purpose, setPurpose] = useState<'evaluation' | 'practice' | 'recovery'>(qPurpose || defaultPurpose);
  // Derive noun/label variants from purpose so a single component renders
  // both "Nuevo examen" and "Nuevo ejercicio" flows naturally. Recovery still
  // uses "ejercicio" copy — the word "recuperación" only appears in CTAs.
  const isExerciseFlow = purpose !== 'evaluation';
  const nounUpper = isExerciseFlow ? 'Ejercicio' : 'Examen';
  const nounLower = isExerciseFlow ? 'ejercicio' : 'examen';

  // Target-student state (only meaningful when isExerciseFlow). When the
  // teacher chooses "a la clase entera" we submit no targets and the backend
  // creates a single class-level ExamAssignment. When "a alumnos concretos"
  // we submit targets[] with student_id set per entry.
  type TargetMode = 'class' | 'selected';
  const [targetMode, setTargetMode] = useState<TargetMode>(
    // Preselect "selected" when arriving with a source exam (recovery flow)
    // because the whole point there is cherry-picking struggling students.
    qPurpose === 'recovery' || qStudentIds.length > 0 ? 'selected' : 'class'
  );
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>(qStudentIds);
  // True once we've applied the auto-preselection based on source-exam grades
  // — prevents overwriting the teacher's manual toggles.
  const [autoSelectApplied, setAutoSelectApplied] = useState(false);

  // Sources of the generation prompt (combinable). Only meaningful when
  // isExerciseFlow. The teacher can pick any combination of:
  //   - corrected exams → drive weak_areas aggregation + auto-target failing students
  //   - selectedTopicIds → topic material fed to the AI
  //   - referenceFiles  → extra documents uploaded
  // All three coexist freely. ?sourceExamId= preselects an exam from the
  // "Generar repaso" entry point on a corrected exam page.
  const [pickedSourceExamIds, setPickedSourceExamIds] = useState<string[]>(
    qSourceExamId ? [qSourceExamId] : []
  );
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
  const { requestDelete: requestDeleteExam, DeleteDialogs: ExamDeleteDialogs } = useExamDeleteFlow();

  // Student list + correction data — only loaded on demand for the exercise
  // flow (target picker + recovery grade/weak_areas overlay). For regular
  // evaluation exams these stay empty and cost nothing.
  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const allCorrections = useCorrectionStore((s) => s.corrections);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);

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
  // Si el editor se abre desde el Taller (con prompt en location.state)
  // arranca directamente en modo "generate" — el profesor ya quiere generar.
  const _initialMode: 'upload' | 'generate' =
    (location.state as { prompt?: string } | null)?.prompt ? 'generate' : 'upload';
  const [mode, setMode] = useState<'upload' | 'generate'>(_initialMode);

  // Upload mode (supports multiple files for multi-page handwritten exams)
  const [files, setFiles] = useState<File[]>([]);

  // Personalization is always on
  const isPersonalized = true;

  // Delete confirmation

  // Generate mode
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [topicTrimesterFilter, setTopicTrimesterFilter] = useState<string>('all');
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  // Pre-rellena el prompt + el modo "generate" cuando el editor se abre desde
  // el Taller (Programación / Sesión / Tema). El state.location.prompt llega
  // como sugerencia y el profesor puede ajustarla antes de generar.
  const initialPrompt = (location.state as { prompt?: string } | null)?.prompt || '';
  const [refinement, setRefinement] = useState(initialPrompt);

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

  // Personalisation card is collapsed by default — most teachers don't tweak
  // logo or extra instructions, so we keep them out of the main flow.
  const [personalizationOpen, setPersonalizationOpen] = useState(false);
  // Each sub-source in the "¿Sobre qué contenido?" card is collapsed by
  // default. Auto-opens if there's preselected data so the teacher sees what
  // came in without having to expand manually.
  const [examsSectionOpen, setExamsSectionOpen] = useState<boolean>(!!qSourceExamId);
  const [topicsSectionOpen, setTopicsSectionOpen] = useState<boolean>(qTopicIds.length > 0);
  const [materialsSectionOpen, setMaterialsSectionOpen] = useState<boolean>(false);

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

  // Exercise flow needs the class roster to render the target picker.
  // Evaluation flow skips this call (no picker rendered).
  useEffect(() => {
    if (isExerciseFlow && classId) fetchStudents(classId);
  }, [isExerciseFlow, classId, fetchStudents]);

  // Load all corrections once so we can overlay source-exam grades/weak_areas
  // onto the student rows. Cached by the store so re-opens are free.
  useEffect(() => {
    if (isExerciseFlow && pickedSourceExamIds.length > 0) fetchAllCorrections();
  }, [isExerciseFlow, pickedSourceExamIds.length, fetchAllCorrections]);
  // Fetch the teacher's exams up-front in the exercise flow so the
  // exam multi-select has data ready as soon as the section opens.
  useEffect(() => {
    if (isExerciseFlow) fetchExams();
  }, [isExerciseFlow, fetchExams]);

  // Students of the currently-selected class, used by the picker.
  const classStudents = useMemo(
    () => (classId ? allStudents.filter((s) => s.classId === classId) : []),
    [allStudents, classId]
  );

  // Map studentId → (grade, weakAreas) aggregated across all picked source
  // exams. When the same student appears in multiple exams we keep the lowest
  // grade and merge the weak_areas — that combination drives both the overlay
  // in the student picker and the difficulty preview.
  const sourceStudentInfo = useMemo(() => {
    const m = new Map<string, { grade: number | null; weakAreas: string[] }>();
    if (pickedSourceExamIds.length === 0) return m;
    for (const c of allCorrections) {
      if (!c.studentId || !pickedSourceExamIds.includes(c.examId)) continue;
      const prev = m.get(c.studentId);
      if (!prev) {
        m.set(c.studentId, { grade: c.grade ?? null, weakAreas: [...(c.weakAreas ?? [])] });
      } else {
        const minGrade = (() => {
          if (prev.grade === null) return c.grade ?? null;
          if (c.grade === null || c.grade === undefined) return prev.grade;
          return Math.min(prev.grade, c.grade);
        })();
        m.set(c.studentId, {
          grade: minGrade,
          weakAreas: Array.from(new Set([...prev.weakAreas, ...(c.weakAreas ?? [])])),
        });
      }
    }
    return m;
  }, [allCorrections, pickedSourceExamIds]);

  // Corrected evaluation exams of the current class+subject — source-exam picker.
  // We always filter by class; when a subject is selected we also filter by
  // subject so the teacher only sees exams of that subject (otherwise an
  // English exam would appear when generating a Maths repaso).
  const sourceExamCandidates = useMemo(() => {
    if (!isExerciseFlow || !classId) return [];
    return allExams
      .filter((e) => (e.purpose ?? 'evaluation') === 'evaluation')
      .filter((e) => {
        const matchesClass = e.classId === classId
          || e.assignments?.some((a) => a.classId === classId);
        if (!matchesClass) return false;
        if (!selectedSubjectId) return true;
        return e.subjectId === selectedSubjectId
          || e.assignments?.some((a) => a.classId === classId && a.subjectId === selectedSubjectId);
      })
      .filter((e) => e.status === 'corrected' || e.status === 'pending_correction')
      .sort((a, b) => (a.date && b.date ? new Date(b.date).getTime() - new Date(a.date).getTime() : 0));
  }, [allExams, isExerciseFlow, classId, selectedSubjectId]);

  // Drop any picked source-exam IDs that fall out of the candidate list when
  // the class/subject changes — otherwise stale IDs would still be submitted.
  useEffect(() => {
    if (pickedSourceExamIds.length === 0) return;
    const valid = new Set(sourceExamCandidates.map((e) => e.id));
    const filtered = pickedSourceExamIds.filter((id) => valid.has(id));
    if (filtered.length !== pickedSourceExamIds.length) {
      setPickedSourceExamIds(filtered);
    }
  }, [sourceExamCandidates, pickedSourceExamIds]);

  // Same hygiene for topic selection: when the subject changes (or the
  // topics-by-subject map reloads), drop any selected topics that no longer
  // belong to the active subject.
  useEffect(() => {
    if (selectedTopicIds.length === 0) return;
    if (!selectedSubjectId) return;
    const subj = topicsBySubject.find((s) => s.subjectId === selectedSubjectId);
    if (!subj) return;
    const collectIds = (ts: { id: string; children?: any[] }[]): string[] =>
      ts.flatMap((t) => [t.id, ...collectIds(t.children || [])]);
    const valid = new Set(collectIds(subj.topics));
    const filtered = selectedTopicIds.filter((id) => valid.has(id));
    if (filtered.length !== selectedTopicIds.length) {
      setSelectedTopicIds(filtered);
    }
  }, [selectedSubjectId, topicsBySubject, selectedTopicIds]);

  // One-shot auto-selection when the source-exam data arrives: preselect the
  // students who failed or have flagged weak_areas. Only runs once per
  // source-exam change so manual toggles aren't reverted.
  useEffect(() => {
    if (autoSelectApplied || pickedSourceExamIds.length === 0 || sourceStudentInfo.size === 0) return;
    if (targetStudentIds.length > 0) {
      setAutoSelectApplied(true);
      return; // query-string or previous picker state already populated
    }
    const auto: string[] = [];
    sourceStudentInfo.forEach((info, sid) => {
      const failed = info.grade !== null && info.grade < 5;
      const hasWeak = info.weakAreas.length > 0;
      if (failed || hasWeak) auto.push(sid);
    });
    if (auto.length > 0) {
      setTargetStudentIds(auto);
      setTargetMode('selected');
    }
    setAutoSelectApplied(true);
  }, [pickedSourceExamIds, sourceStudentInfo, autoSelectApplied, targetStudentIds.length]);

  // Reset auto-select flag when the source-exam picks change, so the
  // next selection's low-grade students get auto-selected too.
  const sourceExamKey = pickedSourceExamIds.join(',');
  useEffect(() => { setAutoSelectApplied(false); }, [sourceExamKey]);

  // Aggregated weak_areas across selected students — the exact input the
  // backend will use to seed the generation prompt. Shown in the preview so
  // the teacher sees upfront the focus areas.
  const aggregatedWeakAreas = useMemo(() => {
    if (pickedSourceExamIds.length === 0 || targetStudentIds.length === 0) return [] as string[];
    const collected: string[] = [];
    for (const sid of targetStudentIds) {
      const info = sourceStudentInfo.get(sid);
      if (info?.weakAreas) collected.push(...info.weakAreas);
    }
    // Stable de-dup preserving first occurrence, cap at 8 like the backend.
    return Array.from(new Set(collected)).slice(0, 8);
  }, [pickedSourceExamIds, targetStudentIds, sourceStudentInfo]);

  // Unsaved changes guard — warn on browser back/close when form has data
  const hasUnsavedChanges = isNew && (name.trim().length > 0 || files.length > 0 || selectedTopicIds.length > 0 || referenceFiles.length > 0 || pickedSourceExamIds.length > 0);
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
            description: `Extrayendo preguntas del documento y generando el ${nounLower} digitalizado.`,
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

  const handleDelete = () => {
    if (!exam) return;
    requestDeleteExam({
      id: exam.id,
      name: exam.name,
      gradedCount: exam.gradedCount ?? 0,
      onSuccess: () => navigate(backHref, { replace: true }),
    });
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
      // Unified model: purpose + optional recovery metadata
      purpose,
      source_exam_ids: (isExerciseFlow && pickedSourceExamIds.length > 0)
        ? [...pickedSourceExamIds]
        : undefined,
      // Per-student targets from the in-form picker (takes precedence over
      // query-string preselection). When targetMode='class' we send no
      // targets and the backend creates a single class-level assignment —
      // the simpler "whole class" path.
      targets: (isExerciseFlow && targetMode === 'selected' && targetStudentIds.length > 0)
        ? targetStudentIds.map((sid) => ({ student_id: sid }))
        : undefined,
    };

    generateExam(genData as any).then(({ id: newExamId, batchJobId: jobId }) => {
      // Build destination URL using form-selected values (not URL params).
      // Exercises (practice/recovery) have their own top-level route so the
      // Ejercicios tab stays active after creation; evaluation keeps the
      // existing class/subject-scoped URLs.
      const tCId = classId || urlClassId;
      const tSId = selectedSubjectId || urlSubjectId;
      const detailUrl = isExerciseFlow
        ? `/tabs/exercises/${newExamId}`
        : (tCId && tSId
          ? `/tabs/classes/${tCId}/subjects/${tSId}/exams/${newExamId}`
          : tCId
            ? `/tabs/classes/${tCId}/exams/${newExamId}`
            : `/tabs/exams/${newExamId}`);
      addBackgroundTask({
        type: 'exam',
        label: taskName,
        description: `La IA genera preguntas a partir del material proporcionado y compone el ${nounLower} en PDF.`,
        batchJobId: jobId,
        expectedResultUrl: detailUrl,
        execute: async () => detailUrl,
      });
      // Navigate to detail so teacher sees processing state
      navigate(detailUrl, { replace: true });
    }).catch((err) => {
      console.error('[ExamEditor] Failed to start exam generation:', err);
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al iniciar la generación');
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
      title={isNew ? `Nuevo ${nounLower}` : name || 'Editar'}
      backHref={backHref}
      headerActions={
        !isNew ? (
          <Button variant="destructive" size="icon" onClick={handleDelete}>
            <Trash2 size={18} />
          </Button>
        ) : undefined
      }
      noPadding
      className={editorSubjectColor ? `[--color-primary:${editorSubjectColor}]` : undefined}
    >
      {/* Mode toggle (new exams only): two large choice cards with icon + sub */}
      {isNew && (
        <div className="exam-mode-toggle" role="tablist" aria-label="Modo de creación">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'upload'}
            className={`exam-mode-btn ${mode === 'upload' ? 'exam-mode-btn--active' : ''}`}
            onClick={() => setMode('upload')}
          >
            <span className="exam-mode-btn__icon"><ScanLine size={16} /></span>
            <span className="exam-mode-btn__title">Digitalizar</span>
            <span className="exam-mode-btn__sub">Sube tu {nounLower} en PDF o foto</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'generate'}
            className={`exam-mode-btn ${mode === 'generate' ? 'exam-mode-btn--active' : ''}`}
            onClick={() => setMode('generate')}
          >
            <span className="exam-mode-btn__icon"><Sparkles size={16} /></span>
            <span className="exam-mode-btn__title">Generar con IA</span>
            <span className="exam-mode-btn__sub">A partir de temas o material</span>
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
          {/* --- CLASS/SUBJECT PICKER (top of form, both modes) ---
              Always shown in the exercise flow so the teacher can pick who
              receives the ejercicio. Evaluation keeps the legacy behaviour:
              only shown when the URL already has a class context, otherwise
              a free-text subject field is offered for "global exams". */}
          {isNew && (hasClassContext || isExerciseFlow) && (
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

          {/* --- DESTINATARIOS (exercise flow only) ---
              Two big segmented cards make the choice between "whole class"
              and "specific students" obvious at a glance. The student list
              expands below when "concretos" is active, with weak-area overlays
              from any selected source exam. */}
          {isNew && isExerciseFlow && classId && (
            <div className="ex-card">
              <div className="ex-card__header">
                <div className="ex-card__icon"><Users size={14} /></div>
                <div>
                  <h3 className="ex-card__title">¿A quién va dirigido?</h3>
                  <p className="ex-card__sub">
                    {targetMode === 'class'
                      ? `A todos los alumnos de ${selectedClass?.name ?? 'la clase'}.`
                      : `A ${targetStudentIds.length} alumno${targetStudentIds.length === 1 ? '' : 's'} concreto${targetStudentIds.length === 1 ? '' : 's'}.`}
                  </p>
                </div>
              </div>

              <div className="recipient-toggle" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={targetMode === 'class'}
                  className={`recipient-card ${targetMode === 'class' ? 'recipient-card--active' : ''}`}
                  onClick={() => setTargetMode('class')}
                >
                  <span className="recipient-card__icon"><Users size={18} /></span>
                  <span className="recipient-card__title">Toda la clase</span>
                  <span className="recipient-card__sub">{classStudents.length} alumnos</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={targetMode === 'selected'}
                  className={`recipient-card ${targetMode === 'selected' ? 'recipient-card--active' : ''}`}
                  onClick={() => setTargetMode('selected')}
                >
                  <span className="recipient-card__icon"><User size={18} /></span>
                  <span className="recipient-card__title">Alumnos concretos</span>
                  <span className="recipient-card__sub">
                    {targetStudentIds.length > 0 ? `${targetStudentIds.length} seleccionado${targetStudentIds.length === 1 ? '' : 's'}` : 'Eliges quiénes'}
                  </span>
                </button>
              </div>

              {targetMode === 'selected' && (
                <div className="recipient-list">
                  {classStudents.length === 0 ? (
                    <p className="recipient-list__empty">
                      Aún no hay alumnos en esta clase.
                    </p>
                  ) : (
                    <>
                      <div className="recipient-list__quick">
                        <button type="button" onClick={() => setTargetStudentIds(classStudents.map(s => s.id))}>Todos</button>
                        <button type="button" onClick={() => setTargetStudentIds([])}>Ninguno</button>
                        {pickedSourceExamIds.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const failing = classStudents
                                  .filter(s => {
                                    const info = sourceStudentInfo.get(s.id);
                                    return info && info.grade !== null && info.grade < 5;
                                  })
                                  .map(s => s.id);
                                setTargetStudentIds(failing);
                              }}
                            >
                              Solo suspensos
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const weak = classStudents
                                  .filter(s => (sourceStudentInfo.get(s.id)?.weakAreas.length ?? 0) > 0)
                                  .map(s => s.id);
                                setTargetStudentIds(weak);
                              }}
                            >
                              Con dificultades
                            </button>
                          </>
                        )}
                      </div>
                      <div className="recipient-list__items">
                        {classStudents.map((student) => {
                          const checked = targetStudentIds.includes(student.id);
                          const info = sourceStudentInfo.get(student.id);
                          return (
                            <label
                              key={student.id}
                              className={`recipient-row ${checked ? 'recipient-row--active' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setTargetStudentIds([...targetStudentIds, student.id]);
                                  } else {
                                    setTargetStudentIds(targetStudentIds.filter(id => id !== student.id));
                                  }
                                }}
                              />
                              <div className="recipient-row__main">
                                <div className="recipient-row__name">{student.name}</div>
                                {info && (info.grade !== null || info.weakAreas.length > 0) && (
                                  <div className="recipient-row__meta">
                                    {info.grade !== null && (
                                      <span className={`recipient-row__grade ${info.grade < 5 ? 'recipient-row__grade--fail' : ''}`}>
                                        {info.grade.toFixed(1)}
                                      </span>
                                    )}
                                    {info.weakAreas.length > 0 && (
                                      <span className="recipient-row__weak" title={info.weakAreas.join(', ')}>
                                        {info.weakAreas.slice(0, 2).join(', ')}
                                        {info.weakAreas.length > 2 && ` +${info.weakAreas.length - 2}`}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* --- EXAM IDENTITY (hero) ---
              Title-style input rendered larger and with stronger contrast so
              the teacher immediately sees this is the primary field. Same
              treatment for both examen and ejercicio flows. */}
          <div className="hero-name">
            <label htmlFor="exam-name-input" className="hero-name__label">
              {isExerciseFlow ? '¿Cómo se llamará este ejercicio?' : '¿Cómo se llamará este examen?'}
            </label>
            <input
              id="exam-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isExerciseFlow ? 'Repaso de ecuaciones' : 'Examen T2 — Ecuaciones'}
              className={`hero-name__input ${duplicateName ? 'hero-name__input--error' : ''}`}
              autoComplete="off"
            />
            {duplicateName && (
              <p className="hero-name__warning">
                Ya existe un {nounLower} con este nombre en esta clase
              </p>
            )}
          </div>

          {/* Global context: subject name (only for evaluation exams without
              a class context — exercises always require a real class). */}
          {isNew && !hasClassContext && !isExerciseFlow && (
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
                <div className="upload-item-icon">
                  {files.length > 0 || exam?.documentUrl ? <FileIconLucide size={22} /> : <Upload size={22} />}
                </div>
                <div className="upload-item-text">
                  {(() => {
                    const label = files.length > 0
                      ? (files.length === 1 ? files[0].name : `${files.length} páginas añadidas`)
                      : (exam?.documentUrl ? 'Documento subido' : `Sube tu ${nounLower}`);
                    return <h3 title={label}>{label}</h3>;
                  })()}
                  <p>{files.length > 0
                    ? 'Toca para añadir más páginas'
                    : (exam?.documentUrl ? 'Toca para cambiar' : 'PDF o fotos · varias páginas se combinan')}</p>
                </div>
                {(files.length > 0 || exam?.documentUrl) && (
                  <CheckCircle size={22} className="upload-success-icon" />
                )}
              </label>
              {files.length > 1 && (
                <div className="upload-file-list">
                  {files.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted text-xs">
                      <FileText size={11} className="text-muted-foreground" />
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
            <div className="gen-config">
              <span className="gen-config__label">
                <Layers size={12} /> Formato y personalización
              </span>
              <FormatSelector value={examFormat} onChange={setExamFormat} noun={nounLower} />
              {isNew && <LogoUploader logoUrl={logoUrl} uploading={uploadingLogo} onUpload={handleLogoUpload} />}
            </div>
          )}

          {/* --- MAX SCORE (new exams in upload mode only — generate mode has it in config section) --- */}
          {isNew && mode === 'upload' && (
            <div className="gen-config">
              <span className="gen-config__label">
                <Settings2 size={12} /> Evaluación
              </span>
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

          {/* --- GENERATE MODE — Unified content + config + personalisation ---
              Three cards in a clear hierarchy:
                1. Contenido — combinable sources (exámenes + temas + material extra)
                2. Configuración — numeric and format options
                3. Personalización — collapsible: logo + extra instructions
          */}
          {mode === 'generate' && isNew && (
            <div className="gen-section">
              {/* ──────────────────────  CONTENIDO  ────────────────────── */}
              <div className="ex-card">
                <div className="ex-card__header">
                  <div className="ex-card__icon"><BookOpen size={14} /></div>
                  <div className="ex-card__head-text">
                    <h3 className="ex-card__title">¿Sobre qué contenido?</h3>
                    <p className="ex-card__sub">
                      {isExerciseFlow
                        ? 'Combina exámenes anteriores, temas del temario y material propio. La IA usará todo lo que selecciones.'
                        : 'Selecciona los temas a cubrir y, si quieres, añade tu propio material como referencia.'}
                    </p>
                  </div>
                </div>

                  {/* Summary chips of every active source — gives an at-a-glance
                      view of what will feed the prompt */}
                  {(pickedSourceExamIds.length > 0 || selectedTopicIds.length > 0 || referenceFiles.length > 0) && (
                    <div className="content-summary">
                      {pickedSourceExamIds.length > 0 && (
                        <span className="content-summary__chip">
                          <FileText size={12} />
                          {pickedSourceExamIds.length} examen{pickedSourceExamIds.length === 1 ? '' : 'es'}
                        </span>
                      )}
                      {selectedTopicIds.length > 0 && (
                        <span className="content-summary__chip">
                          <ListChecks size={12} />
                          {selectedTopicIds.length} tema{selectedTopicIds.length === 1 ? '' : 's'}
                        </span>
                      )}
                      {referenceFiles.length > 0 && (
                        <span className="content-summary__chip">
                          <Upload size={12} />
                          {referenceFiles.length} archivo{referenceFiles.length === 1 ? '' : 's'}
                        </span>
                      )}
                      {aggregatedWeakAreas.length > 0 && (
                        <span className="content-summary__chip content-summary__chip--accent">
                          <Wand2 size={12} />
                          {aggregatedWeakAreas.length} área{aggregatedWeakAreas.length === 1 ? '' : 's'} de mejora
                        </span>
                      )}
                    </div>
                  )}

                  {/* ── Source 1: Exámenes anteriores (only ejercicios) ── */}
                  {isExerciseFlow && (
                    <div className="content-source">
                      <button
                        type="button"
                        className="content-source__head"
                        onClick={() => setExamsSectionOpen((v) => !v)}
                        aria-expanded={examsSectionOpen}
                      >
                        <span className="content-source__head-left">
                          <span className="content-source__icon"><GraduationCap size={14} /></span>
                          <span>
                            <span className="content-source__title">Exámenes anteriores</span>
                            <span className="content-source__sub">
                              {pickedSourceExamIds.length > 0
                                ? `${pickedSourceExamIds.length} seleccionado${pickedSourceExamIds.length === 1 ? '' : 's'} · la IA detectará áreas de mejora`
                                : 'Genera repaso a partir de exámenes corregidos'}
                            </span>
                          </span>
                        </span>
                        <span className={`content-source__chevron ${examsSectionOpen ? 'content-source__chevron--open' : ''}`}>›</span>
                      </button>

                      {examsSectionOpen && (
                        <div className="content-source__body">
                          {sourceExamCandidates.length === 0 ? (
                            <p className="content-source__empty">
                              Aún no hay exámenes corregidos en esta clase.
                            </p>
                          ) : (
                            <div className="exam-pick-list">
                              {sourceExamCandidates.map((e) => {
                                const checked = pickedSourceExamIds.includes(e.id);
                                return (
                                  <label key={e.id} className={`exam-pick-row ${checked ? 'exam-pick-row--active' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(ev) => {
                                        if (ev.target.checked) setPickedSourceExamIds([...pickedSourceExamIds, e.id]);
                                        else setPickedSourceExamIds(pickedSourceExamIds.filter(id => id !== e.id));
                                      }}
                                    />
                                    <div className="exam-pick-row__main">
                                      <div className="exam-pick-row__name">{e.name}</div>
                                      {e.date && (
                                        <div className="exam-pick-row__meta">
                                          {new Date(e.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </div>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}

                          {/* Aggregated focus areas — shown as soon as exams + students are picked */}
                          {pickedSourceExamIds.length > 0 && targetStudentIds.length > 0 && (
                            <div className="content-source__preview">
                              <div className="content-source__preview-label">
                                Áreas de mejora detectadas
                              </div>
                              {aggregatedWeakAreas.length > 0 ? (
                                <div className="content-source__preview-chips">
                                  {aggregatedWeakAreas.map((w) => (
                                    <Badge key={w} variant="secondary" className="text-xs">{w}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="content-source__preview-empty">
                                  Los alumnos seleccionados no tienen debilidades marcadas — la IA usará repaso general.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Source 2: Temas del temario ── */}
                  {selectedSubjectId && (
                    <div className="content-source">
                      <button
                        type="button"
                        className="content-source__head"
                        onClick={() => setTopicsSectionOpen((v) => !v)}
                        aria-expanded={topicsSectionOpen}
                      >
                        <span className="content-source__head-left">
                          <span className="content-source__icon"><ListChecks size={14} /></span>
                          <span>
                            <span className="content-source__title">Temas del temario</span>
                            <span className="content-source__sub">
                              {selectedTopicIds.length > 0
                                ? `${selectedTopicIds.length} tema${selectedTopicIds.length === 1 ? '' : 's'} con su material asociado`
                                : 'Selecciona los temas que quieres cubrir'}
                            </span>
                          </span>
                        </span>
                        <span className={`content-source__chevron ${topicsSectionOpen ? 'content-source__chevron--open' : ''}`}>›</span>
                      </button>
                      {topicsSectionOpen && (
                        <div className="content-source__body">
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
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Source 3: Material extra subido por el profesor ── */}
                  <div className="content-source">
                    <button
                      type="button"
                      className="content-source__head"
                      onClick={() => setMaterialsSectionOpen((v) => !v)}
                      aria-expanded={materialsSectionOpen}
                    >
                      <span className="content-source__head-left">
                        <span className="content-source__icon"><FileText size={14} /></span>
                        <span>
                          <span className="content-source__title">Material extra</span>
                          <span className="content-source__sub">
                            {referenceFiles.length > 0
                              ? `${referenceFiles.length} archivo${referenceFiles.length === 1 ? '' : 's'} subido${referenceFiles.length === 1 ? '' : 's'}`
                              : 'Sube tus propios documentos (opcional)'}
                          </span>
                        </span>
                      </span>
                      <span className={`content-source__chevron ${materialsSectionOpen ? 'content-source__chevron--open' : ''}`}>›</span>
                    </button>
                    {materialsSectionOpen && (
                      <div className="content-source__body">
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
                          className="upload-item upload-item--compact"
                          onClick={() => refInputRef.current?.click()}
                        >
                          <div className="upload-item-icon"><Upload size={20} /></div>
                          <div className="upload-item-text">
                            <h3>{referenceFiles.length > 0 ? 'Añadir más archivos' : 'Subir documentos'}</h3>
                            <p>PDF, imágenes, Word o texto</p>
                          </div>
                          {referenceFiles.length > 0 && <CheckCircle size={20} className="upload-success-icon" />}
                        </button>
                        {referenceFiles.length > 0 && (
                          <div className="upload-file-list">
                            {referenceFiles.map((f, i) => (
                              <Badge key={i} variant="outline" className="gap-1">
                                <FileText size={12} />
                                {f.name.length > 25 ? f.name.slice(0, 22) + '...' : f.name}
                                <button type="button" onClick={() => setReferenceFiles(prev => prev.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive">
                                  <Trash2 size={12} />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
              </div>
              {/* /Contenido */}

              {/* ──────────────────────  CONFIGURACIÓN  ────────────────────── */}
              <div className="ex-card">
                <div className="ex-card__header">
                  <div className="ex-card__icon"><Settings2 size={14} /></div>
                  <div className="ex-card__head-text">
                    <h3 className="ex-card__title">Configuración</h3>
                    <p className="ex-card__sub">Ajusta el formato y la dificultad del {nounLower}</p>
                  </div>
                </div>

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

                <FormatSelector value={examFormat} onChange={setExamFormat} noun={nounLower} />

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
                      <span className="gen-config-inline__label">Preguntas multirespuesta</span>
                      <div className="gen-config-stepper">
                        <button type="button" className="gen-config-stepper__btn" onClick={() => setNumMultiAnswer(Math.max(0, numMultiAnswer - 1))} disabled={numMultiAnswer <= 0}>−</button>
                        <span className="gen-config-stepper__value">{numMultiAnswer}</span>
                        <button type="button" className="gen-config-stepper__btn" onClick={() => setNumMultiAnswer(Math.min(numQuestions, numMultiAnswer + 1))} disabled={numMultiAnswer >= numQuestions}>+</button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Las preguntas multirespuesta tendrán varias opciones correctas y se marcarán como tal en el enunciado.
                    </p>
                  </div>
                )}
              </div>

              {/* ──────────────────────  INDICACIONES IA (siempre visible)  ──────────────────────
                   Free-text textarea that lets the teacher steer the model. The
                   backend treats this as a valid source (along with topics,
                   materials and source exams) so it's always reachable here —
                   never hidden inside a collapsed card. */}
              <div className="ex-card">
                <div className="ex-card__header">
                  <div className="ex-card__icon"><Wand2 size={14} /></div>
                  <div className="ex-card__head-text">
                    <h3 className="ex-card__title">Indicaciones para la IA</h3>
                    <p className="ex-card__sub">
                      Cuéntale qué quieres en este {nounLower}: temas a enfatizar, qué evitar, estilo de preguntas…
                    </p>
                  </div>
                </div>
                <Textarea
                  value={refinement}
                  onChange={(e) => setRefinement(e.target.value)}
                  placeholder={isExerciseFlow
                    ? 'Ej: Repaso muy básico de fracciones, sin pasar a decimales. Que cada ejercicio explique paso a paso.'
                    : 'Ej: Incluye 2 problemas de derivadas, evita integrales, dificultad creciente.'}
                  rows={4}
                  className="ai-instructions"
                />
              </div>

              {/* ──────────────────────  PERSONALIZACIÓN (colapsable)  ────────────────────── */}
              <div className={`ex-card ex-card--collapsible ${personalizationOpen ? 'ex-card--open' : ''}`}>
                <button
                  type="button"
                  className="ex-card__toggle"
                  onClick={() => setPersonalizationOpen((v) => !v)}
                  aria-expanded={personalizationOpen}
                >
                  <span className="ex-card__icon"><Layers size={14} /></span>
                  <span className="ex-card__head-text">
                    <span className="ex-card__title">Logo del centro</span>
                    <span className="ex-card__sub">
                      Imprime tu logo en cada {nounLower}
                      {logoUrl && ' · subido'}
                    </span>
                  </span>
                  <span className={`ex-card__chevron ${personalizationOpen ? 'ex-card__chevron--open' : ''}`}>›</span>
                </button>

                {personalizationOpen && (
                  <div className="ex-card__body">
                    <LogoUploader logoUrl={logoUrl} uploading={uploadingLogo} onUpload={handleLogoUpload} />
                  </div>
                )}
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
                    : nounUpper}
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
                  Este PDF incluye una copia del {nounLower} por cada alumno con su nombre y QR impresos. Imprímelo completo para repartir en clase.
                </p>
              )}
              {exam.hasGeneratedQuestions && exam.documentUrl && (
                <p className="exam-downloads__hint">
                  El {nounLower} digitalizado es la versión escrita a ordenador generada a partir del documento original.
                </p>
              )}
            </div>
          )}

          {/* --- ITERATION SECTION (AI-generated exams) --- */}
          {exam && !isNew && exam.hasGeneratedQuestions && exam.status !== 'corrected' && (
            <div className="exam-iteration-section">
              <div className="exam-iteration-header">
                <Pencil size={20} />
                <span>Ajustar {nounLower}</span>
              </div>
              <p className="exam-iteration-description">
                Describe los cambios que quieres hacer y la IA ajustará el {nounLower} manteniendo la estructura.
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
                          <p className="iteration-history-instruction">Generación inicial del {nounLower}</p>
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
              {saving ? <><Spinner size={18} /> Guardando...</> : isNew ? (files.length > 0 ? `Digitalizar ${nounLower}` : `Crear ${nounLower}`) : 'Guardar cambios'}
            </Button>
          )}

          {/* Generate mode actions — disabled when no source provided so the
              teacher gets immediate feedback instead of a backend 400. */}
          {mode === 'generate' && isNew && (() => {
            const hasSource =
              selectedTopicIds.length > 0 ||
              referenceFiles.length > 0 ||
              refinement.trim().length > 0 ||
              (isExerciseFlow && pickedSourceExamIds.length > 0);
            return (
              <Button
                className="w-full save-btn gen-btn"
                onClick={handleGenerate}
                disabled={!name.trim() || uploadingRefs || duplicateName || !hasSource}
                title={!hasSource ? 'Selecciona temas, exámenes, material o escribe indicaciones para la IA' : undefined}
              >
                {uploadingRefs ? (
                  <><Spinner size={16} /> Subiendo documentos...</>
                ) : (
                  <><Sparkles size={16} /> Generar {nounLower}</>
                )}
              </Button>
            );
          })()}

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
              {exam.purpose === 'evaluation' && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    const weakStudentIds = encodeURIComponent(
                      (exam.id)
                    );
                    navigate(
                      `/tabs/exercises/new?purpose=recovery&sourceExamId=${exam.id}&classId=${exam.classId ?? ''}&studentIds=${weakStudentIds}`
                    );
                  }}
                >
                  <Sparkles size={16} />
                  Generar recuperación
                </Button>
              )}
            </>
          )}
        </div>

        <ExamDeleteDialogs />
      </div>
    </PageShell>
  );
};

export default ExamEditor;
