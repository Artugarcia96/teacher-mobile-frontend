import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Trash2, Download, CheckCircle,
  Clock, AlertCircle, Sparkles,
  FileText, Users, X, Eye,
  FileIcon, ScanLine, CheckSquare, Copy, BarChart3,
  Lock, RefreshCw, ChevronDown, ChevronRight,
  CalendarDays,
} from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useExamDeleteFlow } from '../../hooks/useExamDeleteFlow';
import Spinner from '@/components/shared/Spinner';
import PageShell from '@/components/shared/PageShell';
import PdfViewer from '@/components/shared/PdfViewer';
import { useExamsStore } from '../../store/examsStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useClassesStore } from '../../store/classesStore';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import api, { exams as examsApi, corrections as correctionsApi, authenticatedFetch, calendar as calendarApi } from '../../services/api';
import CorrectionReviewCard from '../../components/CorrectionReviewCard';
import { useCalendarStore } from '../../store/calendarStore';
import CorrectionPanel from '../../components/CorrectionPanel';
import { GradeDonut } from '../../components/charts';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import { useDashboardStore } from '../../store/dashboardStore';
import type { ExamContent } from '../../types';
import { getFullPaperUrl } from '../../utils/examUrls';
import { EXAM_STATUS_CONFIG, EXAM_STATUS_VERBOSE, EXAM_DEADLINE_CONFIG, EXAM_ORIGIN_CONFIG } from './examConstants';
import ExamSheet from './ExamSheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import './ExamDetail.css';
import '../../components/CorrectionShared.css';

// ExamDetail uses verbose labels for the status badge
const statusConfig = Object.fromEntries(
  Object.entries(EXAM_STATUS_CONFIG).map(([k, v]) => [k, { ...v, label: EXAM_STATUS_VERBOSE[k] || v.label }])
);
const deadlineConfig = EXAM_DEADLINE_CONFIG;

const ExamDetail: React.FC = () => {
  const { classId, examId, subjectId } = useParams() as { classId?: string; examId: string; subjectId?: string };
  const location = useLocation();
  const navigate = useNavigate();

  /* ── stores ── */
  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const { requestDelete: requestDeleteExam, DeleteDialogs: ExamDeleteDialogs } = useExamDeleteFlow();
  const validateExam = useExamsStore((s) => s.validateExam);
  const iterateExam = useExamsStore((s) => s.iterateExam);
  const assignExam = useExamsStore((s) => s.assignExam);
  const finalizeExam = useExamsStore((s) => s.finalizeExam);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);
  const updateExam = useExamsStore((s) => s.updateExam);
  const updateExamContent = useExamsStore((s) => s.updateExamContent);

  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const fetchAllStudents = useStudentsStore((s) => s.fetchAllStudents);

  const corrections = useCorrectionStore((s) => s.corrections);
  const fetchCorrections = useCorrectionStore((s) => s.fetchCorrections);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const createCalendarEvent = useCalendarStore((s) => s.createEvent);
  const bulkDeleteCalendarEvents = useCalendarStore((s) => s.bulkDelete);

  /* ── local state ── */
  // Filter / sort state for the corrections list (review mode).
  // 'all' shows everyone including NP; 'pending' = no grade & not NP;
  // 'passed' / 'failed' = grade against passing threshold.
  const [correctionsFilter, setCorrectionsFilter] = useState<'all' | 'pending' | 'passed' | 'failed'>('all');
  const [correctionsSort, setCorrectionsSort] = useState<'name' | 'grade-desc' | 'grade-asc'>('name');

  // Deep-link from StudentFile or similar: ?studentId=X scrolls to and
  // briefly highlights that student's correction row.
  const [highlightedCorrectionId, setHighlightedCorrectionId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [savingGrade, setSavingGrade] = useState<Record<string, boolean>>({});
  // Live content shown in the Validar preview. Fetched lazily on mount and
  // refreshed whenever the iteration history grows (signal that questions
  // changed on the backend).
  const [generatedContent, setGeneratedContent] = useState<ExamContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  // Iteration instruction for the PDF-preview drawer (a secondary surface
  // that lets the teacher tweak from inside the preview overlay).
  const [previewIterationText, setPreviewIterationText] = useState('');
  const [section1Expanded, setSection1Expanded] = useState(false);
  const [section2Expanded, setSection2Expanded] = useState(true);
  const [downloadingReports, setDownloadingReports] = useState(false);

  // Inline date editing state
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [editDeadline, setEditDeadline] = useState('');

  // Step 2: Planificar state
  // selectedAssignments: [{ classId, subjectId, examDate?, deadline? }]
  const [selectedAssignments, setSelectedAssignments] = useState<Array<{
    classId: string; subjectId: string; examDate?: string; deadline?: string;
  }>>([]);
  const [blankPages, setBlankPages] = useState(0);
  const [assigning, setAssigning] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});

  // Legacy compat — selectedStudentIds derived from selectedAssignments
  const selectedStudentIds = useMemo(() => {
    const ids: string[] = [];
    selectedAssignments.forEach(a => {
      allStudents.filter(s => s.classId === a.classId).forEach(s => {
        if (!ids.includes(s.id)) ids.push(s.id);
      });
    });
    return ids;
  }, [selectedAssignments, allStudents]);


  const isNewExam = examId === 'new';
  // When the URL is under /tabs/exercises, keep the back link inside that
  // tab so the Ejercicios nav entry stays active.
  const isExercisesUrl = location.pathname.startsWith('/tabs/exercises');
  const backPath = classId && subjectId
    ? `/tabs/classes/${classId}/subjects/${subjectId}/exams`
    : classId
    ? `/tabs/classes/${classId}/exams`
    : isExercisesUrl
      ? '/tabs/exercises'
      : '/tabs/exams';

  /* ── derived data ── */
  const exam = useMemo(() => isNewExam ? null : allExams.find((e) => e.id === examId), [allExams, examId, isNewExam]);
  const classGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const examCorrectionsAll = useMemo(
    () => isNewExam ? [] : corrections.filter((c) => c.examId === examId),
    [corrections, examId, isNewExam]
  );

  // ── Tabs source of truth ──────────────────────────────────────────────
  // The exam can have multiple assignments (one per class+subject pair).
  // Each becomes a tab. We key them by `${classId}|${subjectId}` so the same
  // class with different subjects shows as two distinct tabs.
  const assignmentList = useMemo(
    () => exam?.assignments || [],
    [exam?.assignments]
  );

  const assignmentKey = (a: { classId: string; subjectId: string }) => `${a.classId}|${a.subjectId}`;

  // ── activeAssignmentKey: the single source of truth for scoping ───────
  // Rule: if the URL pins a (class[, subject]), the matching assignment is
  // selected and never switches. Otherwise the first assignment is picked
  // and tabs let the teacher swap.
  const [tabKey, setTabKey] = useState<string | null>(null);

  const urlPinnedKey = useMemo(() => {
    if (!classId) return null;
    if (subjectId) return `${classId}|${subjectId}`;
    // class without subject in URL — pick the first assignment of that class.
    const firstForClass = assignmentList.find((a) => a.classId === classId);
    return firstForClass ? assignmentKey(firstForClass) : null;
  }, [classId, subjectId, assignmentList]);

  const activeAssignmentKey =
    urlPinnedKey ||
    (tabKey && assignmentList.some((a) => assignmentKey(a) === tabKey) ? tabKey : null) ||
    (assignmentList[0] ? assignmentKey(assignmentList[0]) : null);

  const activeAssignment = useMemo(
    () => assignmentList.find((a) => assignmentKey(a) === activeAssignmentKey) || null,
    [assignmentList, activeAssignmentKey]
  );
  const activeClassId = activeAssignment?.classId || classId || null;
  const activeSubjectId = activeAssignment?.subjectId || subjectId || null;

  // Reset tab if the active assignment disappears (e.g. after re-assign)
  useEffect(() => {
    if (urlPinnedKey) return;
    if (tabKey && !assignmentList.some((a) => assignmentKey(a) === tabKey)) {
      setTabKey(null);
    }
  }, [assignmentList, urlPinnedKey, tabKey]);

  // Fetch the exam's generated_questions so we can show a live preview in the
  // Validar section. Re-fetch when the iteration_history grows — that's the
  // signal that the backend has new content (AI iteration, manual edit, or
  // validation with solutions merged).
  const iterationVersion = exam?.iterationHistory?.length ?? 0;
  useEffect(() => {
    if (!examId || !exam?.hasGeneratedQuestions) {
      setGeneratedContent(null);
      return;
    }
    let cancelled = false;
    setLoadingContent(true);
    examsApi.getQuestions(examId)
      .then((res) => {
        if (cancelled) return;
        const data = (res.data?.questions || null) as ExamContent | null;
        if (data && !Array.isArray(data.sections)) data.sections = [];
        setGeneratedContent(data);
      })
      .catch(() => { if (!cancelled) setGeneratedContent(null); })
      .finally(() => { if (!cancelled) setLoadingContent(false); });
    return () => { cancelled = true; };
  }, [examId, exam?.hasGeneratedQuestions, iterationVersion]);

  // Assignments shown in Step 2 (downloads / deadlines): when the URL pins a
  // (class, subject) pair we show ONLY that one. From the global view we show
  // all of them because the teacher came in to see everything at once.
  const scopedAssignments = useMemo(() => {
    if (urlPinnedKey) {
      return assignmentList.filter((a) => assignmentKey(a) === urlPinnedKey);
    }
    return assignmentList;
  }, [assignmentList, urlPinnedKey]);

  // Scoped corrections — drives stats, lists, counters in Step 3.
  // Filtered by activeClassId because students of a class take all subjects
  // of that class with the same physical paper (one Correction per student
  // per class, not per subject).
  const examCorrections = useMemo(
    () => activeClassId
      ? examCorrectionsAll.filter((c) => c.classId === activeClassId)
      : examCorrectionsAll,
    [examCorrectionsAll, activeClassId]
  );

  const students = useMemo(
    () => allStudents.filter((st) => st.classId === activeClassId),
    [allStudents, activeClassId]
  );

  const lectureName = useMemo(() => {
    if (!exam?.lectureId || !classGroup?.lectures) return null;
    return classGroup.lectures.find((l: any) => l.id === exam.lectureId)?.name;
  }, [exam?.lectureId, classGroup?.lectures]);

  // Status checks
  const isValidated = exam?.status !== 'pending_validation'; // pending_schedule, scheduled, pending_correction, or corrected
  const isAssigned = exam?.status === 'scheduled' || exam?.status === 'pending_correction' || exam?.status === 'corrected';
  // Practice/recovery sheets don't go through the solver validation cycle —
  // the "Validar examen" CTA and blank-pages counter only make sense for
  // classic evaluation exams.
  const isEvaluation = !exam?.purpose || exam?.purpose === 'evaluation';
  const isContentLocked = exam?.status === 'pending_correction' || exam?.status === 'corrected';
  // URL prefix mirrors the route segment we came in through (/tabs/exams/...
  // vs /tabs/exercises/...) so manual-edit navigation keeps the active nav
  // tab highlighted.
  const exerciseSegment = isExercisesUrl ? 'exercises' : 'exams';
  const contentEditorHref = classId && exam?.subjectId
    ? `/tabs/classes/${classId}/subjects/${exam.subjectId}/${exerciseSegment}/${examId}/content`
    : classId
      ? `/tabs/classes/${classId}/${exerciseSegment}/${examId}/content`
      : `/tabs/${exerciseSegment}/${examId}/content`;
  const isCorrected = exam?.status === 'corrected';
  // Per-assignment view: teacher can finalize a single class independently of
  // the rest. When scoped to one assignment, reflect that class's own state.
  const isActiveCorrected = activeAssignment
    ? !!activeAssignment.corrected
    : isCorrected;
  const isAiGenerated = exam?.examOrigin === 'ai_generated';
  const isDigitalized = exam?.examOrigin === 'digitalized';
  const hasClass = !!exam?.classId;
  const hasStudents = students.length > 0 || allStudents.length > 0;
  const showPlanStep = hasStudents;

  // For global exams (no classId): group allStudents by classId
  const studentsByClass = useMemo(() => {
    if (classId) return {}; // Not needed for class-attached exams
    const grouped: Record<string, typeof allStudents> = {};
    allStudents.forEach((s) => {
      const key = s.classId || '__no_class__';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    });
    return grouped;
  }, [allStudents, classId]);

  // Students available for selection in step 2
  const selectableStudents = useMemo(() => {
    if (classId) return students;
    return allStudents;
  }, [classId, students, allStudents]);

  // Per-assignment quick stats for the tab strip — one entry per
  // (class, subject) so multi-subject exams compare cleanly. Average
  // is computed over the corrections of that class (subject doesn't
  // change which corrections exist).
  const perAssignmentSummary = useMemo(() => {
    const map: Record<string, { className: string; subjectName: string; count: number; average: number | null }> = {};
    assignmentList.forEach((a) => {
      const corrs = examCorrectionsAll.filter((c) => c.classId === a.classId);
      const eligibles = corrs.filter((c) => !c.notTaken && c.grade !== null && c.grade !== undefined);
      const avg = eligibles.length > 0
        ? eligibles.reduce((acc, c) => acc + (c.grade || 0), 0) / eligibles.length
        : null;
      map[assignmentKey(a)] = {
        className: a.className || a.classId.slice(0, 6),
        subjectName: a.subjectName || '',
        count: a.studentCount ?? corrs.length,
        average: avg,
      };
    });
    return map;
  }, [assignmentList, examCorrectionsAll]);

  const stats = useMemo(() => {
    // NP students are EXCLUDED from class averages (per teacher request).
    // They still count toward the total roster, just not toward the mean.
    const eligibleCorrections = examCorrections.filter(c => !c.notTaken);
    const gradedCorrections = eligibleCorrections.filter(c => c.grade !== null && c.grade !== undefined);
    const totalGraded = gradedCorrections.length;
    const totalPapers = eligibleCorrections.length;

    if (totalGraded === 0) {
      return { average: null, passRate: null, totalGraded: 0, totalPapers, studentsCount: students.length };
    }

    const sum = gradedCorrections.reduce((acc, c) => acc + (c.grade || 0), 0);
    const average = sum / totalGraded;
    const passed = gradedCorrections.filter(c => (c.grade || 0) >= (exam?.maxScore || 10) * 0.5).length;
    const passRate = (passed / totalGraded) * 100;

    return { average, passRate, totalGraded, totalPapers, studentsCount: students.length };
  }, [examCorrections, students.length, exam?.maxScore]);

  const pipeline = useMemo(() => {
    // Counters describe the active class only — this is what the teacher cares
    // about when looking at "this class's progress on this exam".
    const total = students.length;
    const uploaded = examCorrections.filter(c => c.paperUrl || c.notTaken).length;
    const aiProcessed = examCorrections.filter(c => c.aiProcessed || c.notTaken).length;
    const graded = examCorrections.filter(c => c.grade !== null && c.grade !== undefined || c.notTaken).length;
    return { total, uploaded, aiProcessed, graded, delivered: graded };
  }, [examCorrections, students.length]);

  const correctionsList = useMemo(() => {
    const passingScore = (exam?.maxScore || 10) * 0.5;
    const enriched = examCorrections.map((c) => {
      const student = allStudents.find((s) => s.id === c.studentId);
      return { ...c, studentName: student?.name || 'Sin asignar' };
    });

    const filtered = enriched.filter((c) => {
      if (correctionsFilter === 'all') return true;
      if (correctionsFilter === 'pending') {
        return !c.notTaken && (c.grade === null || c.grade === undefined);
      }
      if (c.notTaken || c.grade === null || c.grade === undefined) return false;
      const passed = (c.grade ?? 0) >= passingScore;
      return correctionsFilter === 'passed' ? passed : !passed;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (correctionsSort) {
        case 'grade-desc':
          // NP and ungraded sink to bottom on grade sorts so the teacher
          // sees real numbers first.
          return (b.grade ?? -Infinity) - (a.grade ?? -Infinity);
        case 'grade-asc':
          return (a.grade ?? Infinity) - (b.grade ?? Infinity);
        case 'name':
        default:
          return a.studentName.localeCompare(b.studentName);
      }
    });
    return sorted;
  }, [examCorrections, allStudents, correctionsFilter, correctionsSort, exam?.maxScore]);

  const gradeDistribution = useMemo(() => {
    const dist = { excellent: 0, good: 0, borderline: 0, fail: 0 };
    const maxScore = exam?.maxScore || 10;
    examCorrections.forEach((c) => {
      if (c.grade === null || c.grade === undefined) return;
      const pct = c.grade / maxScore;
      if (pct >= 0.8) dist.excellent++;
      else if (pct >= 0.6) dist.good++;
      else if (pct >= 0.5) dist.borderline++;
      else dist.fail++;
    });
    return dist;
  }, [examCorrections, exam?.maxScore]);

  const classWeakAreas = useMemo(() => {
    const areaCount: Record<string, number> = {};
    examCorrections.forEach((c) => {
      const areas = c.weakAreas || c.aiAnalysis?.weakAreas || [];
      areas.forEach((area: string) => {
        areaCount[area] = (areaCount[area] || 0) + 1;
      });
    });
    return Object.entries(areaCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([area, count]) => ({ area, count }));
  }, [examCorrections]);

  /* ── effects ── */
  useEffect(() => {
    if (isNewExam) return;
    fetchExams(classId);
    fetchCorrections(examId);
    fetchClasses();
    // Always load all students (exam may have students from multiple classes)
    fetchAllStudents();
    if (classId) {
      fetchClassSubjects(classId);
    } else {
      // Load subjects for all classes (needed for assignment selector)
      allClasses.forEach(c => { if (!c.archived) fetchClassSubjects(c.id); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, examId, isNewExam]);


  // Deep-link: ?studentId=X scrolls to and briefly highlights that
  // student's correction row. Triggered after the corrections list is ready.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sid = params.get('studentId');
    if (!sid || !exam || exam.status !== 'corrected') return;
    const target = correctionsList.find((c) => c.studentId === sid);
    if (!target) return;
    setHighlightedCorrectionId(target.id);
    // Scroll after the layout settles.
    const t = window.setTimeout(() => {
      const el = document.getElementById(`correction-${target.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    // Auto-clear the highlight after a few seconds so it's not permanent.
    const clear = window.setTimeout(() => setHighlightedCorrectionId(null), 4000);
    return () => { window.clearTimeout(t); window.clearTimeout(clear); };
  }, [location.search, exam?.status, correctionsList.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select assignment when viewing from a class+subject context
  useEffect(() => {
    if (classId && subjectId && selectedAssignments.length === 0 && !isAssigned) {
      const today = new Date();
      const deadline = new Date(today);
      deadline.setDate(deadline.getDate() + 15);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      setSelectedAssignments([{ classId, subjectId, examDate: fmt(today), deadline: fmt(deadline) }]);
    }
  }, [classId, subjectId, isAssigned]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize from exam data
  useEffect(() => {
    if (exam) {
      if (exam.blankPagesCount) setBlankPages(exam.blankPagesCount);
    }
  }, [exam?.blankPagesCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // If examId is "new", this component was loaded by mistake
  if (isNewExam) {
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     HANDLERS
     ═══════════════════════════════════════════════════════════════════════ */

  const handleDelete = () => {
    if (!exam) return;
    requestDeleteExam({
      id: examId,
      name: exam.name,
      gradedCount: exam.gradedCount ?? 0,
      onSuccess: () => {
        fetchDashboard();
        navigate(backPath, { replace: true });
      },
    });
  };

  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);
  const runningExamTask = useBackgroundTasksStore((s) =>
    s.tasks.find((t) => t.status === 'running' && t.type === 'exam' && t.expectedResultUrl?.includes(examId))
  );
  const examTaskRunning = !!runningExamTask;

  // Refresh exam data when background task finishes
  const prevTaskRunning = useRef(examTaskRunning);
  useEffect(() => {
    if (prevTaskRunning.current && !examTaskRunning) {
      fetchExams(classId);
      fetchCorrections(examId);
    }
    prevTaskRunning.current = examTaskRunning;
  }, [examTaskRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleValidate = () => {
    if (!exam) return;
    const capturedExamId = examId;
    const capturedClassId = classId;
    const capturedBlankPages = blankPages;
    addBackgroundTask({
      type: 'exam',
      label: `Validar: ${exam.name}`,
      description: 'Generando solucionario con IA...',
      expectedResultUrl: capturedClassId
        ? `/tabs/classes/${capturedClassId}/exams/${capturedExamId}`
        : `/tabs/exams/${capturedExamId}`,
      execute: async () => {
        // Persist blank_pages_count first so the validator's PDF generation
        // uses the value the teacher just picked (blank pages was moved from
        // Planificar to Validar — it's now part of the "prepare" step).
        if (exam.blankPagesCount !== capturedBlankPages) {
          await updateExam(capturedExamId, { blankPagesCount: capturedBlankPages });
        }
        await validateExam(capturedExamId);
        fetchExams(capturedClassId);
        return capturedClassId
          ? `/tabs/classes/${capturedClassId}/exams/${capturedExamId}`
          : `/tabs/exams/${capturedExamId}`;
      },
    });
    toast.success('Validacion iniciada — puedes seguir navegando');
  };

  // Shared dispatcher for AI iterate jobs. `preserveQuestions` lets the
  // per-question flow keep every other question intact — the backend only
  // regenerates the targeted one. Without it, the AI may rewrite anything.
  const dispatchIterate = (rawInstruction: string, preserveQuestions?: number[]) => {
    if (!exam) return;
    const instruction = rawInstruction.trim();
    if (!instruction) return;
    const capturedExamId = examId;
    const capturedClassId = classId;
    const isScoped = !!preserveQuestions && preserveQuestions.length > 0;
    addBackgroundTask({
      type: 'exam',
      label: isScoped ? `Editar pregunta: ${exam.name}` : `Editar: ${exam.name}`,
      description: `Aplicando: "${instruction.slice(0, 60)}${instruction.length > 60 ? '...' : ''}"`,
      expectedResultUrl: capturedClassId
        ? `/tabs/classes/${capturedClassId}/exams/${capturedExamId}`
        : `/tabs/exams/${capturedExamId}`,
      execute: async () => {
        try {
          await iterateExam(capturedExamId, {
            instruction,
            ...(isScoped ? { preserve_questions: preserveQuestions } : {}),
          });
        } catch (err) {
          // 409 = changes were saved but the solver step failed. Refresh so the
          // UI reflects the new questions + downgraded status, then re-throw so
          // the BackgroundTask shows the error and the user can retry validate.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const status = (err as any)?.response?.status;
          if (status === 409) {
            fetchExams(capturedClassId);
          }
          throw err;
        }
        fetchExams(capturedClassId);
        return capturedClassId
          ? `/tabs/classes/${capturedClassId}/exams/${capturedExamId}`
          : `/tabs/exams/${capturedExamId}`;
      },
    });
    toast.success('Cambios en proceso — puedes seguir navegando');
  };

  const handleIterate = (rawInstruction: string) => dispatchIterate(rawInstruction);

  // Per-question AI: scope the iterate call so only the targeted question is
  // regenerated. We collect every OTHER numeric question id from the current
  // content snapshot and pass them as preserve_questions.
  const handleIterateQuestion = (questionId: string, rawInstruction: string) => {
    const allIds = (generatedContent?.sections || [])
      .flatMap((s) => s.questions.map((q) => Number(q.id)))
      .filter((n) => Number.isFinite(n));
    const preserve = allIds.filter((id) => String(id) !== questionId);
    const prefix = `En la pregunta ${questionId}: `;
    dispatchIterate(prefix + rawInstruction, preserve);
  };

  const handleDownloadByClass = async (classId: string, className: string) => {
    if (!exam) return;
    setDownloading(true);
    try {
      const url = examsApi.downloadExamByClassUrl(examId!, classId);
      const res = await authenticatedFetch(url);
      if (!res.ok) {
        toast.error('PDF de esta clase no disponible. Reasigna para regenerarlo.');
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${exam.name}_${className}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Failed to download class PDF:', err);
      toast.error('Error al descargar el PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownload = async (type: 'exam' | 'solutions' | 'digitalized' | 'original') => {
    if (!exam) return;
    setDownloading(true);
    try {
      const urlMap: Record<string, string> = {
        exam: examsApi.downloadExamUrl(examId!),
        solutions: examsApi.downloadSolutionsUrl(examId!),
        digitalized: examsApi.downloadDigitalizedUrl(examId!),
        original: examsApi.downloadOriginalUrl(examId!),
      };
      const url = urlMap[type];
      const res = await authenticatedFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const suffixMap: Record<string, string> = { solutions: '_soluciones', digitalized: '_digitalizado', original: '_original' };
      const suffix = suffixMap[type] || (exam.isPersonalized ? '_personalizado' : '');
      a.download = `${exam.name}${suffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Failed to download:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = async (type: 'exam' | 'solutions' | 'digitalized' | 'original') => {
    if (!exam) return;
    setPreviewLoading(true);
    try {
      const pathMap: Record<string, string> = {
        exam: `/exams/${examId}/download?preview=true`,
        solutions: `/exams/${examId}/solutions`,
        digitalized: `/exams/${examId}/digitalized`,
        original: `/exams/${examId}/original`,
      };
      const path = pathMap[type];
      const res = await api.get(path, { responseType: 'blob' });
      // Honour the server's content-type so image originals (jpg/png) render
      // as <img>, not through the PDF viewer. The overlay checks for a
      // trailing "#.pdf" marker in the URL to decide which renderer to use.
      const contentType = (res.headers?.['content-type'] as string | undefined) || 'application/pdf';
      const isPdf = contentType.includes('pdf') || (type !== 'original' && type !== 'digitalized');
      const blob = new Blob([res.data], { type: isPdf ? 'application/pdf' : contentType });
      const blobUrl = window.URL.createObjectURL(blob);
      setPreviewUrl(isPdf ? blobUrl + '#.pdf' : blobUrl);
    } catch (err) {
      console.error('Failed to preview:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadStudentPaper = (paperUrl: string, studentName?: string) => {
    if (!paperUrl || !exam) return;
    const fullUrl = getFullPaperUrl(paperUrl);
    if (!fullUrl) return;
    authenticatedFetch(fullUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const ext = paperUrl.toLowerCase().includes('.pdf') ? 'pdf' : 'jpg';
        const fileName = studentName ? `${exam.name}_${studentName}.${ext}` : `${exam.name}_examen.${ext}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Download error:', err));
  };

  const handleGradeChange = async (correctionId: string, newGrade: number) => {
    setSavingGrade((prev) => ({ ...prev, [correctionId]: true }));
    try {
      await correctionsApi.update(correctionId, { grade: newGrade });
      fetchCorrections(examId);
    } catch (err) {
      console.error('Failed to update grade:', err);
    } finally {
      setSavingGrade((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  /** Finalize without assigning to any class.
   *
   *  "Continuar sin clase" path: the teacher generated a standalone exam,
   *  wants to download the generic PDF and later upload anonymous
   *  corrections. Transitions the exam to `scheduled` without creating
   *  ExamAssignment rows. */
  const handleFinalize = async () => {
    setAssigning(true);
    toast.loading('Finalizando examen...', { id: 'assign' });
    try {
      await finalizeExam(examId);
      fetchExams(classId);
      fetchCorrections(examId);
      toast.success('Examen listo. Ya puedes subir correcciones.', { id: 'assign' });
    } catch (err) {
      toast.error('Error al finalizar', { id: 'assign' });
    } finally {
      setAssigning(false);
    }
  };

  const handleAssign = async () => {
    setAssigning(true);
    toast.loading('Asignando examen...', { id: 'assign' });
    try {
      // Clean up old calendar events if re-assigning (exam was previously assigned)
      if (isAssigned) {
        try {
          const oldEventsRes = await calendarApi.listByExam(examId);
          const oldEventIds = (oldEventsRes.data || []).map((e: any) => e.id);
          if (oldEventIds.length > 0) {
            await bulkDeleteCalendarEvents(oldEventIds);
          }
        } catch { /* non-blocking — old events may already be gone */ }
      }

      // Build assignments payload
      const assignmentsPayload = selectedAssignments.length > 0
        ? selectedAssignments.map(a => ({
            class_id: a.classId,
            subject_id: a.subjectId,
            exam_date: a.examDate || undefined,
            correction_deadline: a.deadline || undefined,
          }))
        : (classId && subjectId ? [{ class_id: classId, subject_id: subjectId }] : []);

      const result = await assignExam(examId, {
        assignments: assignmentsPayload,
        blank_pages_count: blankPages,
      });

      // Create calendar events for each assigned class
      for (const a of selectedAssignments) {
        if (a.examDate) {
          try {
            await createCalendarEvent({
              exam_id: examId,
              class_id: a.classId,
              title: `Examen: ${exam!.name}`,
              event_date: a.examDate,
              event_type: 'exam',
            });
          } catch { /* non-blocking */ }
        }
        if (a.deadline) {
          try {
            await createCalendarEvent({
              exam_id: examId,
              class_id: a.classId,
              title: `Corregir: ${exam!.name}`,
              event_date: a.deadline,
              event_type: 'custom',
            });
          } catch { /* non-blocking */ }
        }
      }

      fetchExams(classId);
      fetchCorrections(examId);

      const totalStudents = result?.total_students || selectedStudentIds.length;
      toast.success(`Examen asignado a ${totalStudents} alumnos`, { id: 'assign' });
    } catch (err) {
      toast.error('Error al asignar', { id: 'assign' });
    } finally {
      setAssigning(false);
    }
  };

  const handleBatchDownloadReports = async () => {
    if (!exam) return;
    setDownloadingReports(true);
    try {
      const res = await correctionsApi.batchDownloadReports(examId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `correcciones_${exam.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Failed to download reports:', err);
      toast.error('Error al generar los informes');
    } finally {
      setDownloadingReports(false);
    }
  };

  // Student selection helpers
  const toggleAssignment = (cId: string, sId: string) => {
    setSelectedAssignments(prev => {
      const exists = prev.some(a => a.classId === cId && a.subjectId === sId);
      if (exists) return prev.filter(a => !(a.classId === cId && a.subjectId === sId));
      // Default dates: today for exam, +15 days for correction deadline
      const today = new Date();
      const deadline = new Date(today);
      deadline.setDate(deadline.getDate() + 15);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      return [...prev, { classId: cId, subjectId: sId, examDate: fmt(today), deadline: fmt(deadline) }];
    });
  };

  /* ═══════════════════════════════════════════════════════════════════════
     LOADING STATE
     ═══════════════════════════════════════════════════════════════════════ */

  if (!exam) {
    return (
      <PageShell>
        <div className="ed-loading"><Spinner /></div>
      </PageShell>
    );
  }

  const status = statusConfig[exam.status] || statusConfig.pending_validation;
  const deadline = exam.deadlineStatus ? deadlineConfig[exam.deadlineStatus] : null;
  const subjectColor = exam.subjectId && classId ? classSubjects[classId]?.find((s: any) => s.subjectId === exam.subjectId)?.subjectColor : undefined;

  // Step numbering: if step 2 is skipped, correction step becomes step 2
  const correctionStepNumber = 3;
  // Correction step unlocked when assigned OR (validated AND no students)
  const correctionUnlocked = isAssigned || (isValidated && !showPlanStep);

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════ */

  return (
    <PageShell noPadding contentClassName="ed-content">
      {/* ─── Hero Header ─── */}
      <div className="ed-hero" style={subjectColor ? { background: subjectColor } : undefined}>
        <div className="ed-hero__nav">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(backPath)}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-white/90 hover:bg-white/10 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
          </div>
          <div className="ed-hero__center">
            <h1 className="ed-hero__title">{exam.name}</h1>
            {lectureName && (
              <p className="ed-hero__subtitle">{lectureName}</p>
            )}
            {/* Origin + Status badges */}
            <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
              {exam.examOrigin && EXAM_ORIGIN_CONFIG[exam.examOrigin] && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
                >
                  {EXAM_ORIGIN_CONFIG[exam.examOrigin].icon === 'sparkles' ? <Sparkles size={12} /> : <ScanLine size={12} />}
                  {EXAM_ORIGIN_CONFIG[exam.examOrigin].label}
                </span>
              )}
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
              >
                {status.label}
              </span>
            </div>
          </div>
          <div className="ed-hero__actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="ed-hero__action-btn text-red-400 hover:text-red-300 hover:bg-red-500/20"
            >
              <Trash2 size={20} />
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Info Ribbon ─────────────────────────────────────────────────
          The "Fecha examen" cell used to live here, but with multi-class
          assignments each (class, subject) can have its own date. Showing
          a single date at the top was misleading — the real per-class dates
          live in the Planificar step. We keep the date persisted internally
          (calendar / reports rely on it) but stop competing for header space. */}
      {/* The class-association UI used to live here as a top banner. It
          belongs inside the "Planificar" step of the lifecycle (assignments)
          rather than as a persistent notice — the teacher opts into it when
          ready, instead of being nagged on every open. */}
      <div className="ed-ribbon">
        <div className="ed-ribbon__item">
          <span className="ed-ribbon__value">{exam.maxScore}</span>
          <span className="ed-ribbon__label">Max.</span>
        </div>
        {exam.correctionDeadline && (
          <>
            <div className="ed-ribbon__divider" />
            <div className="ed-ribbon__item">
              {editingDeadline ? (
                <input
                  type="date"
                  className="ed-schedule-input text-xs"
                  style={{ width: 'auto', maxWidth: '140px' }}
                  value={editDeadline}
                  autoFocus
                  onChange={(e) => setEditDeadline(e.target.value)}
                  onBlur={async () => {
                    setEditingDeadline(false);
                    if (editDeadline && editDeadline !== exam.correctionDeadline?.slice(0, 10)) {
                      try {
                        await updateExam(examId, { correctionDeadline: editDeadline });
                        toast.success('Fecha límite actualizada');
                        fetchExams(classId);
                      } catch {
                        toast.error('Error al actualizar la fecha límite');
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { setEditingDeadline(false); }
                  }}
                />
              ) : (
                <span
                  className="ed-ribbon__value"
                  style={!isCorrected ? { cursor: 'pointer' } : undefined}
                  title={isCorrected ? undefined : 'Clic para editar fecha límite'}
                  onClick={() => {
                    if (isCorrected) return;
                    setEditDeadline(exam.correctionDeadline?.slice(0, 10) || '');
                    setEditingDeadline(true);
                  }}
                >
                  {new Date(exam.correctionDeadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </span>
              )}
              {deadline && exam.status !== 'corrected' && !editingDeadline && (
                <span
                  className="ed-ribbon__deadline"
                  style={{ color: deadline.color }}
                >
                  {deadline.label === 'Vencido' ? <AlertCircle size={10} /> : <Clock size={10} />}
                  {deadline.label}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
         STEP 1: VALIDAR
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="ed-section" style={{ margin: 'var(--space-md) var(--space-lg) 0' }}>
        {/* Section header — clickable to expand/collapse when validated */}
        <div
          className="ed-section__header"
          style={isValidated ? { cursor: 'pointer' } : undefined}
          onClick={isValidated ? () => setSection1Expanded(v => !v) : undefined}
        >
          <div
            className="ed-section__number"
            style={{ background: isValidated ? '#059669' : '#8B5CF6', color: '#fff', width: 28, height: 28, fontSize: 13 }}
          >
            {isValidated ? <CheckCircle size={14} /> : '1'}
          </div>
          <h2 className="ed-section__title">Revisar y validar</h2>
          {isValidated && (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-medium" style={{ color: '#059669' }}>
              <CheckCircle size={14} />
              Validado
            </span>
          )}
        </div>

        {/* Content — hidden when validated and collapsed */}
        {isValidated && !section1Expanded ? null : (
          <>
            {/* Config summary chips (AI-generated) */}
            {isAiGenerated && (
              <div className="flex flex-wrap gap-1.5 mt-3 mb-3">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                  {exam.maxScore} puntos
                </span>
                {exam.isTestFormat !== undefined && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                    Tipo test: {exam.isTestFormat ? 'Si' : 'No'}
                  </span>
                )}
              </div>
            )}

            {/* Hint when exam has questions but no PDF (generation error) */}
            {!exam.documentUrl && exam.hasGeneratedQuestions && !examTaskRunning && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <AlertCircle size={14} className="flex-shrink-0" />
                <span>El PDF no se pudo generar. Prueba a aplicar un cambio o valida el examen para regenerarlo.</span>
              </div>
            )}

            {/* Documents list — preview & download */}
            {exam.documentUrl && (
              <div className="ed-downloads-section" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
                <span className="ed-section-label">
                  Documentos
                  {exam.iterationHistory && exam.iterationHistory.length > 0 && (
                    <Badge className="ml-2 align-middle" variant="secondary">
                      v{exam.iterationHistory.length + 1}
                    </Badge>
                  )}
                </span>
                <div className="ed-doc-list">
                  {/* Original uploaded file — only for digitalized exams */}
                  {isDigitalized && exam.documentUrl && (
                    <div className="ed-doc-item">
                      <div className="ed-doc-info">
                        <FileIcon size={18} className="ed-doc-icon" />
                        <span className="ed-doc-name">Archivo original</span>
                      </div>
                      <div className="ed-doc-actions">
                        <button className="ed-doc-btn" onClick={() => handlePreview('original')} title="Ver">
                          <Eye size={18} />
                        </button>
                        <button className="ed-doc-btn" onClick={() => handleDownload('original')} disabled={downloading} title="Descargar">
                          <Download size={18} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Digitalized version / AI-generated exam PDF */}
                  {exam.documentUrl && (isAiGenerated || (isDigitalized && exam.hasGeneratedQuestions)) && (
                    <div className="ed-doc-item">
                      <div className="ed-doc-info">
                        {isDigitalized ? <ScanLine size={18} className="ed-doc-icon" /> : <Sparkles size={18} className="ed-doc-icon" />}
                        <span className="ed-doc-name">
                          {isDigitalized ? 'Examen digitalizado' : 'Examen PDF'}
                        </span>
                      </div>
                      <div className="ed-doc-actions">
                        <button className="ed-doc-btn" onClick={() => handlePreview(isDigitalized ? 'digitalized' : 'exam')} title="Ver">
                          <Eye size={18} />
                        </button>
                        <button className="ed-doc-btn" onClick={() => handleDownload(isDigitalized ? 'digitalized' : 'exam')} disabled={downloading} title="Descargar">
                          <Download size={18} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Plain exam PDF — non-digitalized, non-AI exams */}
                  {exam.documentUrl && !isDigitalized && !isAiGenerated && (
                    <div className="ed-doc-item">
                      <div className="ed-doc-info">
                        <FileIcon size={18} className="ed-doc-icon" />
                        <span className="ed-doc-name">Examen PDF</span>
                      </div>
                      <div className="ed-doc-actions">
                        <button className="ed-doc-btn" onClick={() => handlePreview('exam')} title="Ver">
                          <Eye size={18} />
                        </button>
                        <button className="ed-doc-btn" onClick={() => handleDownload('exam')} disabled={downloading} title="Descargar">
                          <Download size={18} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Solutions PDF — only after validation */}
                  {isValidated && exam.hasGeneratedQuestions && (
                    <div className="ed-doc-item">
                      <div className="ed-doc-info">
                        <CheckSquare size={18} className="ed-doc-icon" />
                        <span className="ed-doc-name">Solucionario PDF</span>
                      </div>
                      <div className="ed-doc-actions">
                        <button className="ed-doc-btn" onClick={() => handlePreview('solutions')} title="Ver">
                          <Eye size={18} />
                        </button>
                        <button className="ed-doc-btn" onClick={() => handleDownload('solutions')} disabled={downloading} title="Descargar">
                          <Download size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Instrucciones aplicadas — if the teacher gave AI prompt instructions
                at creation, show them here as reference throughout the lifecycle. */}
            {exam.refinementPrompt && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs">
                <Sparkles size={14} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[11px] uppercase tracking-wide text-indigo-700 mb-0.5">
                    Instrucciones aplicadas
                  </div>
                  <em className="not-italic">"{exam.refinementPrompt}"</em>
                </div>
              </div>
            )}

            {/* AI task in progress */}
            {examTaskRunning && (
              <div className="ed-processing-banner mt-3">
                <Spinner size={16} />
                <div>
                  <p className="ed-processing-banner__title">{runningExamTask?.label || 'Procesando con IA...'}</p>
                  <p className="ed-processing-banner__desc">{runningExamTask?.description || 'Puedes seguir navegando.'}</p>
                </div>
              </div>
            )}

            {/* ── Unified editor: preview + inline edit + AI refine in one
                   surface. Replaces the old triad (preview + two mode cards
                   + separate editor page). The sheet autosaves inline edits
                   and forwards AI instructions to handleIterate. */}
            {exam.hasGeneratedQuestions && !examTaskRunning && (
              <div className="mt-4">
                <ExamSheet
                  content={generatedContent}
                  loading={loadingContent}
                  readOnly={isContentLocked}
                  aiBusy={examTaskRunning}
                  onChange={async (next) => {
                    try {
                      const updated = await updateExamContent(examId, next);
                      setGeneratedContent(next);
                      if (updated.status !== exam.status) fetchExams(classId);
                    } catch (e: any) {
                      const msg = e?.response?.data?.detail || 'No se pudo guardar';
                      toast.error(msg);
                      throw e;
                    }
                  }}
                  onAiRefine={handleIterate}
                  onAiRefineQuestion={handleIterateQuestion}
                  onOpenAdvancedEditor={isContentLocked ? undefined : () => navigate(contentEditorHref)}
                  history={exam.iterationHistory && exam.iterationHistory.length > 0 ? {
                    items: exam.iterationHistory,
                    onDownloadCurrent: () => handleDownload('exam'),
                    onDownloadVersion: (version) => {
                      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/exams/${examId}/download/version/${version}`;
                      authenticatedFetch(url).then(r => r.blob()).then(blob => {
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = `${exam.name}_v${version}.pdf`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      });
                    },
                  } : undefined}
                />
              </div>
            )}

            {/* ── Validar CTA — single primary button for evaluation exams.
                   Blank-pages setting is folded into a popover on the right
                   side of the button so it stops competing for attention. */}
            {isEvaluation && exam.status === 'pending_validation' && !examTaskRunning && (
              <div className="ed-validate">
                <div className="ed-validate__bar">
                  <Button
                    className="ed-validate__primary"
                    onClick={handleValidate}
                  >
                    <CheckCircle size={16} />
                    <span className="ml-2">Validar examen</span>
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="ed-validate__options" title="Opciones de validación">
                        <ChevronDown size={14} />
                        <span className="ed-validate__options-label">
                          {blankPages === 0 ? 'Sin páginas' : `${blankPages} pág.`}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-60">
                      <div className="text-xs font-medium mb-1">Páginas en blanco</div>
                      <div className="text-[11px] text-muted-foreground mb-2.5">
                        Se añadirán al final para que el alumno responda.
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center w-7 h-7 rounded border border-border text-sm hover:bg-muted"
                          onClick={() => setBlankPages(Math.max(0, blankPages - 1))}
                          disabled={blankPages <= 0}
                        >−</button>
                        <span className="text-sm font-semibold w-5 text-center">{blankPages}</span>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center w-7 h-7 rounded border border-border text-sm hover:bg-muted"
                          onClick={() => setBlankPages(Math.min(20, blankPages + 1))}
                          disabled={blankPages >= 20}
                        >+</button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <p className="ed-validate__caption">
                  Se generarán las soluciones con IA. Puede tardar unos segundos.
                </p>
              </div>
            )}

            {/* Version history now lives inside ExamSheet as a side drawer
                triggered from the sheet's meta bar — fewer surfaces at once,
                and history is consulted rarely. */}
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
         STEP 2: PLANIFICAR (only if teacher has students)
         ═══════════════════════════════════════════════════════════════════ */}
      {(
        isValidated ? (
          <div className="ed-section" style={{ margin: 'var(--space-md) var(--space-lg) 0' }}>
            {/* Section header */}
            <div
              className="ed-section__header"
              style={isAssigned ? { cursor: 'pointer' } : undefined}
              onClick={isAssigned ? () => setSection2Expanded(v => !v) : undefined}
            >
              <div
                className="ed-section__number"
                style={{ background: isAssigned ? '#059669' : '#2563EB', color: '#fff', width: 28, height: 28, fontSize: 13 }}
              >
                {isAssigned ? <CheckCircle size={14} /> : '2'}
              </div>
              <h2 className="ed-section__title">Planificar</h2>
              {isAssigned && (() => {
                const standaloneExam = !hasClass && (exam?.assignments?.length ?? 0) === 0;
                return (
                  <span className="ml-auto flex items-center gap-1.5 text-xs font-medium" style={{ color: '#059669' }}>
                    <CheckCircle size={14} />
                    {standaloneExam
                      ? 'Sin clase asignada'
                      : `Asignado — ${examCorrections.length} alumnos`}
                  </span>
                );
              })()}
            </div>

            {/* Assigned: show downloads (collapsed hides, expanded shows) */}
            {isAssigned && !section2Expanded ? null : isAssigned ? (
              <div className="mt-3">
                {/* Solucionario download */}
                {exam.hasGeneratedQuestions && (
                  <div className="ed-doc-list mb-3">
                    <div className="ed-doc-item">
                      <div className="ed-doc-info">
                        <CheckSquare size={18} className="ed-doc-icon" />
                        <span className="ed-doc-name">Solucionario PDF</span>
                      </div>
                      <div className="ed-doc-actions">
                        <button className="ed-doc-btn" onClick={() => handlePreview('solutions')} title="Ver"><Eye size={18} /></button>
                        <button className="ed-doc-btn" onClick={() => handleDownload('solutions')} disabled={downloading} title="Descargar"><Download size={18} /></button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Per-class assignment list — scoped to the URL pin or to
                    the active tab. Coming in from a class+subject shows only
                    that one assignment; coming in from the global view shows
                    all of them. One row per (class, subject). */}
                {(scopedAssignments.length > 0) ? (
                  <div className="flex flex-col gap-2">
                    {scopedAssignments.map((a) => {
                      const badgeColor =
                        a.deadlineStatus === 'overdue' ? 'bg-red-100 text-red-800 border-red-200' :
                        a.deadlineStatus === 'urgent' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                        a.deadlineStatus === 'soon' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                        a.deadlineStatus === 'completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                        'bg-slate-100 text-slate-700 border-slate-200';
                      return (
                        <div
                          key={`${a.classId}-${a.subjectId}`}
                          className="rounded-lg border border-border p-3 flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold truncate">{a.className}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {a.subjectName} · {a.studentCount ?? 0} alumnos
                              </div>
                            </div>
                            {a.correctionDeadline && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${badgeColor}`}>
                                Entrega: {a.correctionDeadline}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            disabled={downloading || !a.hasClassPdf}
                            onClick={() => handleDownloadByClass(a.classId, a.className)}
                            title={a.hasClassPdf ? 'Descargar PDF con QRs de esta clase' : 'PDF no disponible. Reasigna para regenerarlo.'}
                          >
                            <Download size={14} className="mr-2" />
                            {a.hasClassPdf ? `Descargar (${a.studentCount ?? 0} exámenes)` : 'PDF no disponible'}
                          </Button>
                        </div>
                      );
                    })}
                    {exam.isPersonalized && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        El PDF de cada clase incluye una copia por alumno con nombre y QR impreso.
                      </p>
                    )}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleDownload('exam')}
                    disabled={downloading}
                  >
                    <Download size={16} className="mr-2" />
                    {!hasClass && (exam?.assignments?.length ?? 0) === 0
                      ? 'Descargar examen'
                      : `Descargar examenes (${examCorrections.length} alumnos)`}
                  </Button>
                )}
              </div>
            ) : (
              /* Not yet assigned: show class+subject selector */
              <div className="mt-3">
                {/* If within a class/subject context, auto-select that assignment */}
                {classId && subjectId ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border">
                      <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
                      <span className="text-sm">
                        <strong>{classGroup?.name}</strong> — {exam?.subjectName || 'Asignatura'}
                        <span className="text-muted-foreground ml-1">({students.length} alumnos)</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
                      <div>
                        <label className="text-[9px] text-muted-foreground">Fecha examen</label>
                        <input
                          type="date"
                          className="ed-schedule-input text-[11px] w-full"
                          value={selectedAssignments[0]?.examDate || ''}
                          onChange={(e) => setSelectedAssignments(prev => prev.length > 0
                            ? prev.map((a, i) => i === 0 ? { ...a, examDate: e.target.value } : a)
                            : [{ classId: classId!, subjectId: subjectId!, examDate: e.target.value }]
                          )}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-muted-foreground">Límite corrección</label>
                        <input
                          type="date"
                          className="ed-schedule-input text-[11px] w-full"
                          value={selectedAssignments[0]?.deadline || ''}
                          min={selectedAssignments[0]?.examDate || ''}
                          onChange={(e) => setSelectedAssignments(prev => prev.length > 0
                            ? prev.map((a, i) => i === 0 ? { ...a, deadline: e.target.value } : a)
                            : [{ classId: classId!, subjectId: subjectId!, deadline: e.target.value }]
                          )}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Global exam: select class+subject pairs with per-assignment dates */
                  <div>
                    <span className="text-xs font-medium text-muted-foreground mb-2 block">
                      Selecciona los alumnos participantes y establece la fecha del examen
                    </span>
                    <div className="flex flex-col gap-2">
                      {allClasses.filter(c => !c.archived).map(cls => {
                        const subjects = classSubjects[cls.id] || [];
                        if (subjects.length === 0) return null;
                        const isExpanded = expandedClasses[cls.id] !== false; // default expanded
                        const classStudentCount = allStudents.filter(s => s.classId === cls.id).length;
                        const selectedInClass = selectedAssignments.filter(a => a.classId === cls.id);

                        return (
                          <div key={cls.id} className="rounded-lg border border-border overflow-hidden">
                            {/* Class header */}
                            <button
                              className="flex items-center gap-2 w-full py-2 px-3 bg-muted/30 hover:bg-muted/50 text-left"
                              onClick={() => setExpandedClasses(prev => ({ ...prev, [cls.id]: !isExpanded }))}
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              <span className="text-sm font-semibold flex-1">{cls.name}</span>
                              <span className="text-xs text-muted-foreground">{classStudentCount} alumnos</span>
                              {selectedInClass.length > 0 && (
                                <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-600">{selectedInClass.length}</Badge>
                              )}
                            </button>
                            {/* Subjects in this class */}
                            {isExpanded && (
                              <div className="px-3 py-2 flex flex-col gap-2">
                                {subjects.map((cs: any) => {
                                  const sId = cs.subjectId || cs.subject_id;
                                  const sName = cs.subjectName || cs.subject_name || cs.name;
                                  const assignment = selectedAssignments.find(a => a.classId === cls.id && a.subjectId === sId);
                                  const isSelected = !!assignment;

                                  return (
                                    <div key={`${cls.id}-${sId}`} className={`rounded-md border ${isSelected ? 'border-blue-300 bg-blue-50/50' : 'border-transparent'} transition-colors`}>
                                      <label className="flex items-center gap-2.5 py-1.5 px-2 cursor-pointer">
                                        <Checkbox
                                          checked={isSelected}
                                          onCheckedChange={() => toggleAssignment(cls.id, sId)}
                                        />
                                        <span className="text-sm flex-1">{sName}</span>
                                      </label>
                                      {/* Per-assignment dates — compact grid */}
                                      {isSelected && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 px-2 pb-2 ml-7">
                                          <div>
                                            <label className="text-[9px] text-muted-foreground">Fecha</label>
                                            <input
                                              type="date"
                                              className="ed-schedule-input text-[11px] w-full"
                                              value={assignment?.examDate || ''}
                                              onChange={(e) => setSelectedAssignments(prev => prev.map(a =>
                                                a.classId === cls.id && a.subjectId === sId
                                                  ? { ...a, examDate: e.target.value }
                                                  : a
                                              ))}
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[9px] text-muted-foreground">Límite</label>
                                            <input
                                              type="date"
                                              className="ed-schedule-input text-[11px] w-full"
                                              value={assignment?.deadline || ''}
                                              min={assignment?.examDate || ''}
                                              onChange={(e) => setSelectedAssignments(prev => prev.map(a =>
                                                a.classId === cls.id && a.subjectId === sId
                                                  ? { ...a, deadline: e.target.value }
                                                  : a
                                              ))}
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Primary action — morphs based on whether any class is
                    selected. No selection → "Continuar sin clase" finalizes
                    the exam without assignments (anonymous corrections flow).
                    Any selection → the regular assign flow. */}
                {(() => {
                  const hasPicked = selectedAssignments.length > 0 || !!classId;
                  if (hasPicked) {
                    return (
                      <Button
                        className="w-full mt-4"
                        onClick={handleAssign}
                        disabled={assigning}
                        style={{ background: '#2563EB', color: '#fff', borderColor: '#2563EB' }}
                      >
                        {assigning ? (
                          <><Spinner size={16} className="mr-2" /> Asignando...</>
                        ) : (
                          <><Users size={16} className="mr-2" /> Asignar a {selectedStudentIds.length} alumno{selectedStudentIds.length === 1 ? '' : 's'}</>
                        )}
                      </Button>
                    );
                  }
                  return (
                    <Button
                      className="w-full mt-4"
                      variant="outline"
                      onClick={handleFinalize}
                      disabled={assigning}
                    >
                      {assigning ? (
                        <><Spinner size={16} className="mr-2" /> Finalizando...</>
                      ) : (
                        <>No asignar a ninguna asignatura</>
                      )}
                    </Button>
                  );
                })()}
              </div>
            )}
          </div>
        ) : (
          /* Not validated yet — locked placeholder */
          <div className="ed-section ed-section--pending" style={{ margin: 'var(--space-md) var(--space-lg) 0' }}>
            <div className="ed-section__header">
              <div className="ed-section__number" style={{ background: '#94A3B8', width: 28, height: 28, fontSize: 13 }}>
                <Lock size={12} />
              </div>
              <h2 className="ed-section__title" style={{ color: 'var(--color-muted-foreground)' }}>Planificar</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-10">Selecciona los alumnos participantes y establece la fecha del examen. Valida el examen primero.</p>
          </div>
        )
      )}

      {/* ═══════════════════════════════════════════════════════════════════
         STEP 3 (or 2): CORREGIR
         ═══════════════════════════════════════════════════════════════════ */}
      {correctionUnlocked ? (
        <div className="ed-section" style={{ margin: 'var(--space-md) var(--space-lg) 0' }}>
          <div className="ed-section__header">
            <div
              className="ed-section__number"
              style={{ background: isActiveCorrected ? '#059669' : '#2563EB', color: '#fff', width: 28, height: 28, fontSize: 13 }}
            >
              {isActiveCorrected ? <CheckCircle size={14} /> : correctionStepNumber}
            </div>
            <h2 className="ed-section__title">Corregir</h2>
          </div>

          {/* Assignment tabs — only when entered from global view AND the
              exam has more than one assignment. One tab per (class, subject)
              pair. iOS-style segmented control: gray track + elevated active
              pill. Each tab shows class name + media (or alumno count). */}
          {!urlPinnedKey && assignmentList.length > 1 && (
            <div className="ed-class-tabs" role="tablist" aria-label="Asignaciones del examen">
              {assignmentList.map((a) => {
                const key = assignmentKey(a);
                const summary = perAssignmentSummary[key];
                const active = key === activeAssignmentKey;
                const hasAvg = summary?.average !== null && summary?.average !== undefined;
                return (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={active}
                    className={`ed-class-tab${active ? ' ed-class-tab--active' : ''}`}
                    onClick={() => setTabKey(key)}
                  >
                    <span className="ed-class-tab__name" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {a.corrected && <CheckCircle size={12} color="#059669" />}
                      {summary?.className || a.className}
                    </span>
                    <span className="ed-class-tab__meta">
                      {hasAvg
                        ? <>media <strong>{summary!.average!.toFixed(1)}</strong></>
                        : <>{summary?.count ?? 0} alumno{(summary?.count ?? 0) === 1 ? '' : 's'}</>
                      }
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pipeline Status Counters (only when class attached and students assigned) */}
          {(hasClass || activeClassId) && pipeline.total > 0 && (
            <div className="ed-pipeline" style={{ margin: 'var(--space-md) 0' }}>
              {[
                { label: 'Subido', count: pipeline.uploaded, done: pipeline.uploaded >= pipeline.total },
                { label: 'Corregido', count: pipeline.aiProcessed, done: pipeline.aiProcessed >= pipeline.uploaded && pipeline.uploaded > 0 },
                { label: 'Evaluado', count: pipeline.graded, done: pipeline.graded >= pipeline.uploaded && pipeline.uploaded > 0 },
              ].map((step, i, arr) => (
                <div key={step.label} className="ed-pipeline__step-wrapper">
                  <div className={`ed-pipeline__step${step.done ? ' ed-pipeline__step--done' : step.count > 0 ? ' ed-pipeline__step--active' : ''}`}>
                    <div className="ed-pipeline__count">{`${step.count}/${pipeline.total}`}</div>
                    <div className="ed-pipeline__label">{step.label}</div>
                  </div>
                  {i < arr.length - 1 && <div className="ed-pipeline__connector" />}
                </div>
              ))}
            </div>
          )}

          {/* Generate-recovery CTA — only for evaluation exams that have been
              corrected. Navigates to the Ejercicios wizard with purpose=recovery
              and sourceExamId preset; the wizard auto-preselects students who
              failed or have detected weak_areas. Keeps the repaso one click
              away from the grading view where the teacher forms the intent. */}
          {isActiveCorrected && (exam.purpose ?? 'evaluation') === 'evaluation' && (
            <div style={{ margin: 'var(--space-md) 0 0' }}>
              <Button
                className="w-full"
                variant="default"
                onClick={() => {
                  const params = new URLSearchParams({
                    purpose: 'recovery',
                    sourceExamId: exam.id,
                  });
                  if (exam.classId) params.set('classId', exam.classId);
                  navigate(`/tabs/exercises/new?${params.toString()}`);
                }}
              >
                <Sparkles size={16} />
                Generar repaso para estos alumnos
              </Button>
            </div>
          )}

          {/* Stats Summary — only after the exam is fully corrected.
             Showing partial averages mid-grading misleads the teacher: a single
             5/10 doesn't represent the class. We wait until "Finalizar" so the
             panel only ever reflects final results. */}
          {isActiveCorrected && stats.totalGraded > 0 && (
            <div className="ed-stats" style={{ margin: 'var(--space-md) 0 0' }}>
              <div className="ed-stat-card">
                <div className="ed-stat-icon ed-stat-icon--primary">
                  <BarChart3 size={20} />
                </div>
                <div className="ed-stat-content">
                  <span className="ed-stat-value">{stats.average !== null ? stats.average.toFixed(1) : '\u2014'}</span>
                  <span className="ed-stat-label">Media</span>
                </div>
              </div>
              {stats.passRate !== null && (
                <div className="ed-stat-card">
                  <div className="ed-stat-icon ed-stat-icon--warning">
                    <Users size={20} />
                  </div>
                  <div className="ed-stat-content">
                    <span className="ed-stat-value">{stats.passRate.toFixed(0)}%</span>
                    <span className="ed-stat-label">Aprobados</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Performance Charts — same gate as stats above */}
          {isActiveCorrected && stats.totalGraded > 0 && (
            <div className="ed-performance" style={{ margin: 'var(--space-md) 0' }}>
              <div className="ed-performance__charts">
                <GradeDonut
                  distribution={[
                    { label: 'Excelente', count: gradeDistribution.excellent, color: 'var(--chart-excellent, #10B981)' },
                    { label: 'Bien', count: gradeDistribution.good, color: 'var(--chart-good, #3B82F6)' },
                    { label: 'Suficiente', count: gradeDistribution.borderline, color: 'var(--chart-borderline, #F59E0B)' },
                    { label: 'Suspenso', count: gradeDistribution.fail, color: 'var(--chart-fail, #EF4444)' },
                  ]}
                  centerLabel={stats.average !== null ? stats.average.toFixed(1) : '\u2014'}
                  centerSubLabel="Promedio"
                  size={140}
                />
              </div>
              {classWeakAreas.length > 0 && (
                <div className="ed-performance__weak-tags">
                  {classWeakAreas.map(({ area, count }) => (
                    <span key={area} className="ed-weak-tag">
                      {area} <span className="ed-weak-count">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Post-correction actions */}
          {isActiveCorrected && (
            <div className="flex flex-col gap-2 mb-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleBatchDownloadReports}
                disabled={downloadingReports}
              >
                {downloadingReports
                  ? <><Spinner size={18} className="mr-2" /> Generando informes...</>
                  : <><Download size={18} className="mr-2" /> Descargar todos los informes</>
                }
              </Button>
            </div>
          )}

          {/* Corrections section — unified branch.
              When status === 'corrected': review cards with filter+sort.
              Otherwise: CorrectionPanel (the full edit workflow), which
              degrades to standalone mode when there's no class attached. */}
          <div className={`ed-corrections-section${!isActiveCorrected ? ' ed-corrections-section--inline' : ''}`} style={{ padding: 0 }}>
            {isActiveCorrected ? (
              <>
                <div className="ed-corrections-header">
                  <h2 className="ed-section-title">
                    Correcciones ({examCorrections.length})
                    {correctionsFilter !== 'all' && correctionsList.length !== examCorrections.length && (
                      <span className="text-xs font-normal text-muted-foreground ml-2">
                        — mostrando {correctionsList.length}
                      </span>
                    )}
                  </h2>
                </div>

                {/* Filter + sort toolbar. Gated by the *unfiltered* count so
                    that filtering down to zero doesn't hide the toolbar and
                    trap the teacher with no way to reset. */}
                {examCorrections.length > 0 && (
                  <div className="ed-corrections-toolbar">
                    <div className="ed-corrections-toolbar__group" role="tablist" aria-label="Filtrar correcciones">
                      {[
                        { v: 'all', label: 'Todos' },
                        { v: 'passed', label: 'Aprobados' },
                        { v: 'failed', label: 'Suspensos' },
                        { v: 'pending', label: 'Sin corregir' },
                      ].map((f) => (
                        <button
                          key={f.v}
                          type="button"
                          role="tab"
                          aria-selected={correctionsFilter === f.v}
                          className={`ed-chip${correctionsFilter === f.v ? ' ed-chip--active' : ''}`}
                          onClick={() => setCorrectionsFilter(f.v as typeof correctionsFilter)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <div className="ed-corrections-toolbar__group" role="tablist" aria-label="Ordenar correcciones">
                      {[
                        { v: 'name', label: 'Nombre' },
                        { v: 'grade-desc', label: 'Nota ↓' },
                        { v: 'grade-asc', label: 'Nota ↑' },
                      ].map((s) => (
                        <button
                          key={s.v}
                          type="button"
                          role="tab"
                          aria-selected={correctionsSort === s.v}
                          className={`ed-chip${correctionsSort === s.v ? ' ed-chip--active' : ''}`}
                          onClick={() => setCorrectionsSort(s.v as typeof correctionsSort)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {correctionsList.length > 0 ? (
                  <div className="correction-review-list">
                    {correctionsList.map((correction, i) => (
                      <div
                        key={correction.id}
                        id={`correction-${correction.id}`}
                        className={highlightedCorrectionId === correction.id ? 'ed-correction-row--highlight' : ''}
                      >
                        <CorrectionReviewCard
                          index={i}
                          studentName={correction.studentName}
                          grade={correction.grade}
                          maxScore={exam.maxScore}
                          teacherComments={correction.teacherComments}
                          weakAreas={correction.weakAreas}
                          aiAnalysis={correction.aiAnalysis}
                          aiProcessed={correction.aiProcessed}
                          paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                          onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                          onDownloadPaper={correction.paperUrl ? () => handleDownloadStudentPaper(correction.paperUrl!, correction.studentName) : undefined}
                          onGradeChange={(newGrade) => handleGradeChange(correction.id, newGrade)}
                          savingGrade={savingGrade[correction.id]}
                        />
                      </div>
                    ))}
                  </div>
                ) : examCorrections.length > 0 && (
                  /* The unfiltered list isn't empty — the active filter just
                     hits zero. Show an empty state with a quick reset so the
                     teacher isn't trapped. */
                  <div className="ed-corrections-empty">
                    <p className="ed-corrections-empty__text">
                      Ningún alumno coincide con este filtro.
                    </p>
                    <button
                      type="button"
                      className="ed-chip ed-chip--active"
                      onClick={() => setCorrectionsFilter('all')}
                    >
                      Ver todos
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="ed-corrections-header" style={{ padding: '0 var(--space-md)' }}>
                  <h2 className="ed-section-title">Correcciones</h2>
                </div>
                {/* standalone mode fires when there's no class roster driving
                    the upload — either because the exam was never tied to a
                    class OR it was finalized with "No asignar a ninguna
                    asignatura" (scheduled status, zero assignments). In both
                    cases CorrectionPanel renders: free-text name input per
                    correction, single "Subir examen" upload instead of the
                    bulk QR-match flow, and a "+ añadir" row at the empty
                    state. */}
                <CorrectionPanel
                  examId={examId}
                  standalone={!hasClass && (exam?.assignments?.length ?? 0) === 0}
                  filterClassId={activeClassId || undefined}
                  filterSubjectId={activeSubjectId || undefined}
                  onFinished={() => {
                    fetchExams(classId);
                    fetchCorrections(examId);
                  }}
                />
              </>
            )}
          </div>

        </div>
      ) : (
        /* Not yet unlocked — locked placeholder */
        <div className="ed-section ed-section--pending" style={{ margin: 'var(--space-md) var(--space-lg) 0' }}>
          <div className="ed-section__header">
            <div className="ed-section__number" style={{ background: '#94A3B8', width: 28, height: 28, fontSize: 13 }}>
              <Lock size={12} />
            </div>
            <h2 className="ed-section__title" style={{ color: 'var(--color-muted-foreground)' }}>Corregir</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-10">Asigna el examen a los alumnos para poder corregir.</p>
        </div>
      )}

      {/* ─── Preview overlay with iteration panel ─── */}
      {previewUrl && (
        <div className="ed-preview-overlay">
          {/* Preview area */}
          <div className="ed-preview-viewer">
            {previewUrl.includes('#.pdf') ? (
              <PdfViewer
                url={previewUrl.replace('#.pdf', '')}
                title={exam?.name || 'Vista previa'}
                onClose={() => { window.URL.revokeObjectURL(previewUrl.replace('#.pdf', '')); setPreviewUrl(null); }}
              />
            ) : (
              <div className="pdf-preview-overlay__image">
                <div className="pdf-viewer__toolbar">
                  <span className="pdf-viewer__title">{exam?.name || 'Vista previa'}</span>
                  <Button variant="ghost" size="sm" onClick={() => setPreviewUrl(null)} className="pdf-viewer__btn">
                    <X size={18} />
                  </Button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '16px' }}>
                  <img src={previewUrl} alt="Examen" style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain' }} />
                </div>
              </div>
            )}
          </div>

          {/* Bottom iteration drawer — only for AI-generated exams that are
              still in pending_validation. Lets the teacher tweak from inside
              the preview overlay without closing it. Uses its own local
              state (previewIterationText) to stay independent of the main
              sheet's AI bar on the detail page. */}
          {isAiGenerated && !isValidated && !examTaskRunning && (
            <div className={`ed-preview-drawer${previewIterationText.trim() || exam.status === 'pending_validation' ? ' ed-preview-drawer--expanded' : ''}`}>
              <div className="ed-preview-drawer__handle" />
              <div className="ed-preview-drawer__content">
                <Textarea
                  value={previewIterationText}
                  onChange={(e) => setPreviewIterationText(e.target.value)}
                  placeholder="Modifica la pregunta 2, anade mas espacio..."
                  rows={1}
                  className="ed-preview-drawer__input"
                />
                {previewIterationText.trim() ? (
                  <Button
                    size="sm"
                    className="ed-preview-drawer__btn"
                    onClick={() => {
                      const instruction = previewIterationText;
                      setPreviewIterationText('');
                      handleIterate(instruction);
                      setPreviewUrl(null);
                    }}
                  >
                    <RefreshCw size={14} />
                  </Button>
                ) : exam.status === 'pending_validation' ? (
                  <Button
                    size="sm"
                    className="ed-preview-drawer__btn"
                    style={{ background: '#059669', borderColor: '#059669' }}
                    onClick={() => { handleValidate(); setPreviewUrl(null); }}
                  >
                    <CheckCircle size={14} />
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Preview loading indicator ─── */}
      {previewLoading && (
        <div className="ed-preview-overlay" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: 'white' }}>
            <Spinner size={28} />
            <span style={{ fontSize: '14px' }}>Cargando documento...</span>
          </div>
        </div>
      )}

      {/* Two-step delete flow (primary confirm + 409 force-confirm) */}
      <ExamDeleteDialogs />
    </PageShell>
  );
};

export default ExamDetail;
