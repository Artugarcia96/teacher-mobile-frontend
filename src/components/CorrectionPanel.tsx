import { useState, useMemo, useEffect, useRef } from 'react';
import { AlertTriangle, Check, CheckCircle, ChevronDown, ChevronUp, Clock, HelpCircle, Pencil, RefreshCw, Sparkles, Upload, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/shared/Spinner';
import Modal from '@/components/shared/Modal';
import { Progress } from '@/components/ui/progress';
import AlertConfirm from '@/components/shared/AlertConfirm';
import { useNavigate } from 'react-router-dom';
import { useExamsStore } from '../store/examsStore';
import { useStudentsStore } from '../store/studentsStore';
import { useCorrectionStore } from '../store/correctionStore';
import { corrections as correctionsApi, batch, authenticatedFetch } from '../services/api';
import { BulkUploadResult } from '../types';
import { getFullPaperUrl } from '../utils/examUrls';
import ScanCard from './ScanCard';
import QRReviewTable from './QRReviewTable';
import PdfViewer from '@/components/shared/PdfViewer';
import EmptyState from './EmptyState';

import CelebrationOverlay from './CelebrationOverlay';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';

interface CorrectionPanelProps {
  examId: string;
  onFinished?: () => void;
  /** When true, allows correction without student assignment (no class context). */
  standalone?: boolean;
  /** Filter corrections to show only students from this class */
  filterClassId?: string;
  /** Reserved for future per-subject scoping. Currently a no-op because all
   * students in a class take all subjects of that class. */
  filterSubjectId?: string;
}

const CorrectionPanel: React.FC<CorrectionPanelProps> = ({ examId, onFinished, standalone = false, filterClassId, filterSubjectId: _filterSubjectId }) => {
  const navigate = useNavigate();

  const allExams = useExamsStore((s) => s.exams);
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);
  const hasBatchRunning = useBackgroundTasksStore((s) =>
    s.tasks.some((t) => t.status === 'running' && t.expectedResultUrl === `/correction/${examId}`)
  );

  const allStudents = useStudentsStore((s) => s.students);

  const corrections = useCorrectionStore((s) => s.corrections);
  const fetchCorrections = useCorrectionStore((s) => s.fetchCorrections);
  const uploadPapers = useCorrectionStore((s) => s.uploadPapers);
  const updateCorrection = useCorrectionStore((s) => s.updateCorrection);
  const processAI = useCorrectionStore((s) => s.processAI);
  const finishCorrection = useCorrectionStore((s) => s.finishCorrection);
  const loading = useCorrectionStore((s) => s.loading);

  const exam = useMemo(() => allExams.find((e) => e.id === examId), [allExams, examId]);
  // CorrectionPanel always operates on ONE class at a time (or standalone).
  // The parent component (ExamDetail) is responsible for picking which class
  // via class tabs and passing it down. There is no longer a "show all
  // classes grouped by header" mode — that confused multi-class exams.
  const effectiveClassId = filterClassId;
  const students = useMemo(
    () => effectiveClassId ? allStudents.filter((st) => st.classId === effectiveClassId) : allStudents,
    [allStudents, effectiveClassId]
  );

  const examCorrections = useMemo(() => {
    let filtered = corrections.filter((c) => c.examId === examId);
    if (effectiveClassId) {
      // Authoritative scoping: only the rows that belong to this class.
      // Legacy rows without classId are matched via the student's classId.
      const classStudentIds = new Set(
        allStudents.filter((s) => s.classId === effectiveClassId).map((s) => s.id)
      );
      filtered = filtered.filter((c) =>
        c.classId
          ? c.classId === effectiveClassId
          : !!c.studentId && classStudentIds.has(c.studentId)
      );
    }
    return filtered.sort((a, b) => a.id.localeCompare(b.id));
  }, [corrections, examId, effectiveClassId, allStudents]);

  const [localGrades, setLocalGrades] = useState<Record<string, { grade: number | null; teacherComments: string; studentId: string }>>({});
  const localGradesRef = useRef(localGrades);
  localGradesRef.current = localGrades;
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  // Standalone mode: free-text student names per correction (not linked to student DB)
  const [standaloneNames, setStandaloneNames] = useState<Record<string, string>>({});

  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [reviewAssignments, setReviewAssignments] = useState<Record<string, string>>({});
  const [confirmingReview, setConfirmingReview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const [uploadingForStudent, setUploadingForStudent] = useState<string | null>(null);
  const studentFileInputRef = useRef<HTMLInputElement>(null);
  const standaloneInputRef = useRef<HTMLInputElement>(null);
  const [standaloneUploading, setStandaloneUploading] = useState(false);

  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [autoSavedIds, setAutoSavedIds] = useState<Set<string>>(new Set());
  const focusedCardIndex = useRef(0);

  const [aiProcessing, setAiProcessing] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const [batchEstimate, setBatchEstimate] = useState<{ paper_count: number; time_string: string } | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [duplicateConflict, setDuplicateConflict] = useState<{
    newCorrectionId: string;
    existingCorrectionId: string;
    studentId: string;
    studentName: string;
  } | null>(null);

  // Reset transient panel state when the active class changes (tab swap).
  // Without this the bulk-result panel and pending review assignments leak
  // from one class to the next, confusing the teacher.
  useEffect(() => {
    setBulkResult(null);
    setReviewAssignments({});
  }, [effectiveClassId]);

  // Sync local grades from corrections + restore standalone names from teacher_notes
  useEffect(() => {
    setLocalGrades((prev) => {
      const next = { ...prev };
      examCorrections.forEach((c) => {
        if (!next[c.id]) {
          next[c.id] = { grade: c.grade, teacherComments: c.teacherComments || '', studentId: c.studentId || '' };
        } else if (!next[c.id].studentId && c.studentId) {
          next[c.id] = { ...next[c.id], studentId: c.studentId };
        }
      });
      return next;
    });
    // Restore standalone names — prefer the dedicated anonymous_label field
    // (new storage), fall back to the legacy "[Alumno: X]" prefix stored in
    // teacher_notes for corrections created before the field existed.
    if (standalone) {
      setStandaloneNames((prev) => {
        const next = { ...prev };
        examCorrections.forEach((c) => {
          if (next[c.id]) return;
          if (c.anonymousLabel) {
            next[c.id] = c.anonymousLabel;
            return;
          }
          if (c.teacherComments) {
            const match = c.teacherComments.match(/^\[Alumno: (.+?)\]/);
            if (match) next[c.id] = match[1];
          }
        });
        return next;
      });
    }
  }, [examCorrections, standalone]);

  // Cleanup auto-save timers on unmount
  useEffect(() => {
    const timers = autoSaveTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const cards = document.querySelectorAll('.scan-card');
        if (cards.length > 0) {
          const idx = Math.min(focusedCardIndex.current, examCorrections.length - 1);
          const correction = examCorrections[idx];
          if (correction) {
            handleSavePaper(correction.id);
          }
        }
        return;
      }

      if (e.key === 'Tab') {
        const target = e.target as HTMLElement;
        const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'ION-INPUT' || target.tagName === 'ION-TEXTAREA' || target.tagName === 'ION-SELECT';
        if (isInInput) return;

        e.preventDefault();
        const cards = document.querySelectorAll('.scan-card');
        if (cards.length === 0) return;

        if (e.shiftKey) {
          focusedCardIndex.current = Math.max(0, focusedCardIndex.current - 1);
        } else {
          focusedCardIndex.current = Math.min(cards.length - 1, focusedCardIndex.current + 1);
        }
        cards[focusedCardIndex.current]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [examCorrections]);

  // Batch estimate
  useEffect(() => {
    const fetchEstimate = async () => {
      const unprocessedCount = examCorrections.filter(c => !c.aiProcessed && c.paperUrl).length;
      if (unprocessedCount > 1) {
        try {
          const res = await batch.estimateCorrectionTime(examId);
          setBatchEstimate(res.data);
        } catch (err) {
          console.error('Failed to fetch estimate:', err);
        }
      } else {
        setBatchEstimate(null);
      }
    };
    fetchEstimate();
  }, [examCorrections, examId]);

  const assignedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    examCorrections.forEach((c) => { if (c.studentId) ids.add(c.studentId); });
    if (bulkResult) {
      bulkResult.autoMatched.forEach((m) => ids.add(m.studentId));
      Object.values(reviewAssignments).forEach((sid) => { if (sid) ids.add(sid); });
    }
    return ids;
  }, [examCorrections, bulkResult, reviewAssignments]);

  // ── Auto-save ──
  const triggerAutoSave = (correctionId: string) => {
    if (autoSaveTimers.current[correctionId]) {
      clearTimeout(autoSaveTimers.current[correctionId]);
    }
    autoSaveTimers.current[correctionId] = setTimeout(() => {
      setLocalGrades((current) => {
        const local = current[correctionId];
        if (local && local.grade !== null && (standalone || local.studentId)) {
          handleSavePaper(correctionId).then(() => {
            setAutoSavedIds((prev) => new Set(prev).add(correctionId));
          });
        }
        return current;
      });
    }, 2000);
  };

  // ── Handlers ──
  const handleStudentChange = (correctionId: string, studentId: string) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], studentId } }));
    triggerAutoSave(correctionId);
  };

  const handleGradeChange = (correctionId: string, grade: number) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], grade } }));
    triggerAutoSave(correctionId);
  };

  const handleCommentsChange = (correctionId: string, teacherComments: string) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], teacherComments } }));
    triggerAutoSave(correctionId);
  };

  const handleSavePaper = async (correctionId: string) => {
    const local = localGradesRef.current[correctionId];
    if (!local || local.grade === null) return;

    setSaving((prev) => ({ ...prev, [correctionId]: true }));
    try {
      // Standalone mode: persist the typed name into the dedicated
      // anonymous_label field (the legacy "[Alumno: X]" teacher_notes prefix
      // is still read for back-compat but we no longer write it).
      const payload: Parameters<typeof updateCorrection>[1] = {
        student_id: local.studentId || undefined,
        grade: local.grade,
        teacher_notes: local.teacherComments,
      };
      if (standalone) {
        payload.anonymous_label = standaloneNames[correctionId] || '';
      }
      await updateCorrection(correctionId, payload);
    } catch (err) {
      console.error('Failed to save correction:', err);
      toast.error('Error al guardar la corrección. Inténtalo de nuevo.');
    } finally {
      setSaving((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  const handleProcessAI = async (correctionId: string, skipRefetch = false) => {
    setAiErrors((prev) => ({ ...prev, [correctionId]: '' }));
    setAiProcessing((prev) => ({ ...prev, [correctionId]: true }));
    try {
      const result = await processAI(correctionId);
      if (result?.suggestedStudentName) {
        if (standalone) {
          // In standalone mode, auto-fill the name text field
          setStandaloneNames((prev) => ({ ...prev, [correctionId]: result.suggestedStudentName }));
        } else {
          // In class mode, try to match to an existing student
          const nameLower = result.suggestedStudentName.toLowerCase();
          const matchedStudent = students.find((s) =>
            s.name.toLowerCase() === nameLower ||
            s.name.toLowerCase().includes(nameLower) ||
            nameLower.includes(s.name.toLowerCase())
          );
          if (matchedStudent) {
            setLocalGrades((prev) => ({
              ...prev,
              [correctionId]: { ...prev[correctionId], studentId: matchedStudent.id }
            }));
          }
        }
      }
      if (!skipRefetch) {
        await fetchCorrections(examId);
      }
    } catch (err: any) {
      console.error('AI processing failed:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Error desconocido';
      setAiErrors((prev) => ({ ...prev, [correctionId]: errorMsg }));
    } finally {
      setAiProcessing((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  // ── NP / replace ──
  const markNotTaken = useCorrectionStore((s) => s.markNotTaken);
  const replacePaperApi = useCorrectionStore((s) => s.replacePaper);

  const [npConfirm, setNpConfirm] = useState<{ correctionId: string; studentName: string; hadGrade: boolean; hadPaper: boolean } | null>(null);
  const [replacingForCorrection, setReplacingForCorrection] = useState<string | null>(null);
  const [replaceWarning, setReplaceWarning] = useState<{ correctionId: string; studentName: string; hadGrade: boolean } | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  const handleMarkNotTakenClick = (correctionId: string) => {
    const c = examCorrections.find((x) => x.id === correctionId);
    if (!c) return;
    const studentName = students.find((s) => s.id === c.studentId)?.name || c.studentName || 'este alumno';
    const hadGrade = c.grade !== null && c.grade !== undefined;
    const hadPaper = !!c.paperUrl;
    if (hadGrade || hadPaper) {
      // Risky: confirm
      setNpConfirm({ correctionId, studentName, hadGrade, hadPaper });
    } else {
      // Safe: just flip
      markNotTaken(correctionId, true).catch((err) => {
        console.error(err);
        toast.error('No se pudo marcar como no presentado');
      });
    }
  };

  const handleConfirmMarkNotTaken = async () => {
    if (!npConfirm) return;
    try {
      await markNotTaken(npConfirm.correctionId, true);
      toast.success(`${npConfirm.studentName} marcado como no presentado`);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo marcar como no presentado');
    } finally {
      setNpConfirm(null);
    }
  };

  const handleUnmarkNotTaken = (correctionId: string) => {
    markNotTaken(correctionId, false).catch((err) => {
      console.error(err);
      toast.error('No se pudo deshacer');
    });
  };

  const handleReplacePaperClick = (correctionId: string) => {
    const c = examCorrections.find((x) => x.id === correctionId);
    if (!c) return;
    const hadGrade = c.grade !== null && c.grade !== undefined;
    if (hadGrade) {
      const studentName = students.find((s) => s.id === c.studentId)?.name || c.studentName || 'este alumno';
      setReplaceWarning({ correctionId, studentName, hadGrade: true });
      return;
    }
    setReplacingForCorrection(correctionId);
    setTimeout(() => replaceFileInputRef.current?.click(), 50);
  };

  const handleConfirmReplaceWarning = () => {
    if (!replaceWarning) return;
    setReplacingForCorrection(replaceWarning.correctionId);
    setReplaceWarning(null);
    setTimeout(() => replaceFileInputRef.current?.click(), 50);
  };

  const handleReplaceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !replacingForCorrection) {
      setReplacingForCorrection(null);
      return;
    }
    try {
      await replacePaperApi(replacingForCorrection, files[0]);
      toast.success('Entrega reemplazada');
      await fetchCorrections(examId);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo reemplazar la entrega');
    } finally {
      setReplacingForCorrection(null);
      e.target.value = '';
    }
  };

  const handleDeleteCorrection = async (correctionId: string) => {
    try {
      await correctionsApi.delete(correctionId);
      if (bulkResult) {
        setBulkResult(prev => prev ? {
          ...prev,
          needsReview: prev.needsReview.filter(r => r.correctionId !== correctionId),
          autoMatched: prev.autoMatched.filter(m => m.correctionId !== correctionId),
        } : null);
        setReviewAssignments(prev => {
          const next = { ...prev };
          delete next[correctionId];
          return next;
        });
      }
      await fetchCorrections(examId);
    } catch (err) {
      console.error('Failed to delete correction:', err);
    }
  };

  // ── Per-student upload ──
  // Track both the student and the class so the backend updates the correct
  // pre-assigned Correction (a student in two classes has one Correction per
  // class and we must not create orphans).
  const [uploadingForClassId, setUploadingForClassId] = useState<string | null>(null);

  const handleStudentUploadClick = (studentId: string, classId?: string) => {
    setUploadingForStudent(studentId);
    setUploadingForClassId(classId || null);
    setTimeout(() => studentFileInputRef.current?.click(), 100);
  };

  const handleStudentFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !uploadingForStudent) {
      setUploadingForStudent(null);
      setUploadingForClassId(null);
      return;
    }
    try {
      const newCorrections = await uploadPapers(
        examId,
        Array.from(files),
        uploadingForStudent,
        true,
        uploadingForClassId || undefined,
      );
      await fetchCorrections(examId);
      const hasUnassigned = examCorrections.some(c => c.paperUrl && !c.studentId);
      if (!hasUnassigned) {
        for (let i = 0; i < newCorrections.length; i++) {
          await handleProcessAI(newCorrections[i].id, i < newCorrections.length - 1);
          if (i < newCorrections.length - 1) {
            await new Promise(r => setTimeout(r, 1500));
          }
        }
      }
    } catch (err) {
      console.error('Failed to upload paper for student:', err);
    } finally {
      setUploadingForStudent(null);
      setUploadingForClassId(null);
      e.target.value = '';
    }
  };

  // ── Bulk upload ──
  // Per-class bulk upload: when the user clicks "Subir PDF de 2B", the class_id
  // is captured here and sent with the next file selection.
  const [bulkUploadClassId, setBulkUploadClassId] = useState<string | null>(null);
  const [bulkUploadOverwrite, setBulkUploadOverwrite] = useState(false);
  const [bulkOverwritePrompt, setBulkOverwritePrompt] = useState<{ classId: string | null; existingCount: number } | null>(null);

  /** Open file picker. If the target class already has papers, ask first
   *  whether the new upload should overwrite existing entries. */
  const handleBulkUploadClick = (classId?: string) => {
    // The panel is already scoped to a single class via filterClassId; we use
    // examCorrections directly without re-filtering.
    const cid = classId || effectiveClassId || null;
    const existing = examCorrections.filter((c) => !!c.paperUrl);
    if (existing.length > 0) {
      setBulkOverwritePrompt({ classId: cid, existingCount: existing.length });
      return;
    }
    setBulkUploadClassId(cid);
    setBulkUploadOverwrite(false);
    setTimeout(() => bulkInputRef.current?.click(), 50);
  };

  const proceedBulkUpload = (overwrite: boolean) => {
    if (!bulkOverwritePrompt) return;
    setBulkUploadClassId(bulkOverwritePrompt.classId);
    setBulkUploadOverwrite(overwrite);
    setBulkOverwritePrompt(null);
    setTimeout(() => bulkInputRef.current?.click(), 50);
  };

  const handleBulkFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setBulkUploading(true);
    try {
      const response = await correctionsApi.bulkUpload(
        examId,
        Array.from(files),
        bulkUploadClassId || undefined,
        bulkUploadOverwrite,
      );
      const data = response.data;
      const mapMatch = (m: any) => ({
        correctionId: m.correction_id,
        studentId: m.student_id,
        studentName: m.student_name,
        studentCode: m.student_code,
        confidence: m.confidence,
      });
      const result = {
        autoMatched: (data.auto_matched || []).map(mapMatch),
        replaced: (data.replaced || []).map(mapMatch),
        skippedAlreadyAssigned: (data.skipped_already_assigned || []).map((s: any) => ({
          correctionId: s.correction_id,
          studentId: s.student_id,
          studentName: s.student_name,
          studentCode: s.student_code,
          hadGrade: !!s.had_grade,
        })),
        needsReview: (data.needs_review || []).map((r: any) => ({
          correctionId: r.correction_id,
          detectedCode: r.detected_code,
          reason: r.reason,
          suggestions: (r.suggestions || []).map((s: any) => ({
            studentId: s.student_id,
            studentName: s.student_name,
            code: s.code,
          })),
        })),
        studentsWithoutPapers: (data.students_without_papers || []).map((s: any) => ({
          studentId: s.student_id,
          studentName: s.student_name,
          code: s.code,
        })),
      };
      await fetchCorrections(examId);

      // Summarise as a transient toast — fire-and-forget, doesn't block the UI.
      // The persistent panel is reserved for needsReview (which requires manual
      // QR assignment); everything else is purely informational.
      const newCount = result.autoMatched.length;
      const replacedCount = result.replaced.length;
      const skippedCount = result.skippedAlreadyAssigned.length;
      const reviewCount = result.needsReview.length;

      const parts: string[] = [];
      if (newCount > 0) parts.push(`${newCount} ${newCount === 1 ? 'nueva' : 'nuevas'}`);
      if (replacedCount > 0) parts.push(`${replacedCount} ${replacedCount === 1 ? 'reemplazada' : 'reemplazadas'}`);
      if (skippedCount > 0) parts.push(`${skippedCount} ${skippedCount === 1 ? 'saltada' : 'saltadas'} (ya tenían entrega)`);
      if (reviewCount > 0) parts.push(`${reviewCount} sin reconocer`);

      if (parts.length === 0) {
        toast.info('No se ha podido reconocer ninguna entrega.');
      } else if (skippedCount > 0 && newCount + replacedCount === 0 && reviewCount === 0) {
        // All skipped — that's the surprising case the user complained about
        // ("ya estaba subido y no me lo dijiste"). Use warning + describe.
        toast.warning(parts.join(' · '), {
          description: skippedCount === 1
            ? 'Si querías sustituirla, vuelve a subir el PDF y elige Reemplazar.'
            : 'Si querías sustituirlas, vuelve a subir el PDF y elige Reemplazar.',
          duration: 8000,
        });
      } else if (reviewCount > 0) {
        toast.warning(parts.join(' · '), {
          description: 'Asigna manualmente los exámenes sin reconocer abajo.',
          duration: 8000,
        });
      } else {
        toast.success(parts.join(' · '));
      }

      // Only persist the panel when there's actual work for the teacher to do
      // (manual QR assignment). Otherwise clear it so it doesn't linger across
      // tab changes.
      if (reviewCount > 0) {
        setBulkResult(result);
      } else {
        setBulkResult(null);
      }
    } catch (err) {
      console.error('Failed to bulk upload papers:', err);
      toast.error('Error al subir los exámenes. Inténtalo de nuevo.');
    } finally {
      setBulkUploading(false);
      setBulkUploadClassId(null);
      setBulkUploadOverwrite(false);
      e.target.value = '';
    }
  };

  // ── Standalone single upload ──
  const handleStandaloneUploadClick = () => {
    standaloneInputRef.current?.click();
  };

  const handleStandaloneFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setStandaloneUploading(true);
    try {
      // group=true: multiple photos/files are merged into one PDF per student
      const newCorrections = await uploadPapers(examId, Array.from(files), undefined, true);
      await fetchCorrections(examId);
      // Launch AI in background — don't block the UI
      for (const c of newCorrections) {
        handleProcessAI(c.id);
      }
    } catch (err) {
      console.error('Failed to upload standalone paper:', err);
    } finally {
      setStandaloneUploading(false);
      e.target.value = '';
    }
  };

  const handleReviewAssignment = (correctionId: string, studentId: string) => {
    setReviewAssignments(prev => ({ ...prev, [correctionId]: studentId }));
  };

  const handleConfirmReviewAssignments = async () => {
    setConfirmingReview(true);
    const assignments = Object.entries(reviewAssignments);
    const assignedCorrectionIds: string[] = [];
    for (const [correctionId, studentId] of assignments) {
      if (studentId) {
        try {
          await updateCorrection(correctionId, { student_id: studentId });
          assignedCorrectionIds.push(correctionId);
        } catch (err) {
          console.error('Failed to assign student:', err);
        }
      }
    }

    await fetchCorrections(examId);

    const allCorrectionIds = [
      ...assignedCorrectionIds,
      ...(bulkResult?.autoMatched.map((m) => m.correctionId) || []),
    ].filter(cId => {
      const correction = examCorrections.find((c) => c.id === cId);
      return correction && !correction.aiAnalysis;
    });

    setBulkResult(null);
    setReviewAssignments({});
    setConfirmingReview(false);

    if (allCorrectionIds.length > 1) {
      try {
        const response = await batch.startBatchCorrection(examId, allCorrectionIds);
        const jobId = response.data.id;
        registerCorrectionBackgroundTask(jobId, exam?.name || 'Examen');
      } catch (err) {
        console.error('Failed to start batch correction, falling back to sequential:', err);
        for (let i = 0; i < allCorrectionIds.length; i++) {
          await handleProcessAI(allCorrectionIds[i], true);
          if (i < allCorrectionIds.length - 1) {
            await new Promise(r => setTimeout(r, 1500));
          }
        }
        await fetchCorrections(examId);
      }
    } else if (allCorrectionIds.length === 1) {
      handleProcessAI(allCorrectionIds[0]);
    }
  };

  const registerCorrectionBackgroundTask = (jobId: string, label: string) => {
    const capturedExamId = examId;
    let lastProcessed = 0;
    addBackgroundTask({
      type: 'exam',
      label: `Corrección: ${label}`,
      description: 'La IA lee cada examen, identifica aciertos y errores, y prepara comentarios por pregunta.',
      batchJobId: jobId,
      expectedResultUrl: `/correction/${capturedExamId}`,
      execute: async () => {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        let interval = 3000;
        while (true) {
          await sleep(interval);
          const res = await batch.getJobProgress(jobId);
          const status = res.data.status;
          const processed = res.data.processed_items || 0;

          // Refresh corrections when new items complete — shows results incrementally
          if (processed > lastProcessed) {
            lastProcessed = processed;
            fetchCorrections(capturedExamId);
          }

          if (status === 'completed') break;
          if (status === 'failed' || status === 'cancelled') {
            throw new Error('Error en la corrección');
          }
          interval = Math.min(interval + 500, 8000);
        }
        await fetchCorrections(capturedExamId);
        return `/correction/${capturedExamId}`;
      },
    });
  };

  const handleBatchProcessAll = async () => {
    const unprocessedIds = examCorrections
      .filter(c => !c.aiProcessed && c.paperUrl)
      .map(c => c.id);
    if (unprocessedIds.length === 0) return;
    try {
      const response = await batch.startBatchCorrection(examId, unprocessedIds);
      const jobId = response.data.id;
      registerCorrectionBackgroundTask(jobId, exam?.name || 'Examen');
    } catch (err) {
      console.error('Failed to start batch correction:', err);
    }
  };

  const handleStudentChangeWithDuplicateCheck = (correctionId: string, studentId: string) => {
    if (!studentId) {
      handleStudentChange(correctionId, studentId);
      return;
    }
    const existing = examCorrections.find(c => c.studentId === studentId && c.id !== correctionId);
    if (existing) {
      const student = students.find(s => s.id === studentId);
      setDuplicateConflict({
        newCorrectionId: correctionId,
        existingCorrectionId: existing.id,
        studentId,
        studentName: student?.name || 'este alumno',
      });
    } else {
      handleStudentChange(correctionId, studentId);
    }
  };

  const handleDuplicateReplace = async () => {
    if (!duplicateConflict) return;
    try {
      await correctionsApi.delete(duplicateConflict.existingCorrectionId);
      await fetchCorrections(examId);
      handleStudentChange(duplicateConflict.newCorrectionId, duplicateConflict.studentId);
    } catch (err) {
      console.error('Failed to replace correction:', err);
    }
    setDuplicateConflict(null);
  };

  const handleDuplicateKeepExisting = async () => {
    if (!duplicateConflict) return;
    try {
      await correctionsApi.delete(duplicateConflict.newCorrectionId);
      await fetchCorrections(examId);
    } catch (err) {
      console.error('Failed to delete duplicate:', err);
    }
    setDuplicateConflict(null);
  };

  const handleFinish = async () => {
    try {
      // The backend evaluates the exam GLOBALLY across every class it's
      // assigned to. From this view the teacher only sees ONE class at a
      // time, so a "1/1 graded here" can still leave the exam pending in
      // other classes. We surface the breakdown as a clear toast/celebration.
      const result = await finishCorrection(examId, effectiveClassId);
      // Per-class scope: celebrate if this class got finalized, even if other
      // classes are still pending in the global exam.
      if (result.scope === 'class' ? result.classCorrected : result.allGraded) {
        setShowCelebration(true);
      } else {
        const lines = result.pendingByClass.map(
          (p) => `${p.className}: ${p.count} sin calificar`
        );
        const description = lines.length
          ? lines.join(' · ')
          : `${result.pending} alumnos sin calificar`;
        toast.warning(
          `Quedan ${result.pending} de ${result.total} alumnos por calificar`,
          {
            description: lines.length > 1
              ? `${description}. Corrige el resto de clases para finalizar el examen.`
              : `${description}.`,
            duration: 8000,
          }
        );
      }
    } catch (err) {
      console.error('Failed to finish:', err);
      toast.error('No se pudo finalizar la corrección. Revisa la conexión.');
    }
  };

  const handleCelebrationDismiss = () => {
    setShowCelebration(false);
    onFinished?.();
  };

  const handlePreviewPaper = async (paperUrl: string) => {
    const fullUrl = getFullPaperUrl(paperUrl);
    if (!fullUrl) return;
    try {
      const res = await authenticatedFetch(fullUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const isPdf = paperUrl.toLowerCase().includes('.pdf');
      setPreviewUrl(blobUrl + (isPdf ? '#.pdf' : ''));
    } catch (err) {
      console.error('Failed to preview paper:', err);
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
        const fileName = studentName
          ? `${exam.name}_${studentName}.${ext}`
          : `${exam.name}_examen.${ext}`;
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

  const handleDownloadReport = (correctionId: string, studentName?: string) => {
    if (!exam) return;
    const url = correctionsApi.downloadReportUrl(correctionId);
    authenticatedFetch(url)
      .then((res) => { if (!res.ok) throw new Error('Download failed'); return res.blob(); })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = studentName ? `informe_${studentName}.pdf` : 'informe_correccion.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Report download error:', err));
  };

  // ── Computed ──
  // NP rows count as "saved" — the teacher has explicitly resolved them and
  // shouldn't be blocked from finishing because of an absent student.
  const savedCount = examCorrections.filter((c) => c.savedAt || c.notTaken).length;
  const allSaved = savedCount === examCorrections.length && examCorrections.length > 0;

  const allHavePapers = examCorrections.length > 0 && examCorrections.every(c => c.paperUrl || c.notTaken);

  // Assignment grouping
  const assignedExamCorrections = useMemo(() =>
    examCorrections.filter(c => !!c.studentId),
    [examCorrections]
  );
  const unassignedExamCorrections = useMemo(() =>
    examCorrections.filter(c => !c.studentId && !c.notTaken),
    [examCorrections]
  );
  const hasUnassignedCorrections = unassignedExamCorrections.length > 0;
  const unassignedSectionRef = useRef<HTMLDivElement>(null);

  if (!exam) return null;

  return (
    <>
      {/* Hidden file inputs */}
      {!standalone && (
        <input
          type="file"
          ref={bulkInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleBulkFilesSelected}
        />
      )}
      <input
        type="file"
        ref={studentFileInputRef}
        style={{ display: 'none' }}
        accept=".jpg,.jpeg,.png,.pdf"
        multiple
        onChange={handleStudentFileSelected}
      />
      {standalone && (
        <input
          type="file"
          ref={standaloneInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleStandaloneFileSelected}
        />
      )}

      {/* Bulk review results (class mode only) */}
      {!standalone && bulkResult && (
        <div className="bulk-review-section">
          <div className="bulk-review-stats">
            {bulkResult.autoMatched.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
                <Check size={14} />
                {bulkResult.autoMatched.length} {bulkResult.autoMatched.length === 1 ? 'nueva' : 'nuevas'}
              </span>
            )}
            {(bulkResult.replaced?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium bg-blue-50 text-blue-700 border-blue-200">
                <RefreshCw size={14} />
                {(bulkResult.replaced?.length ?? 0)} reemplazada{(bulkResult.replaced?.length ?? 0) === 1 ? '' : 's'}
              </span>
            )}
            {(bulkResult.skippedAlreadyAssigned?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
                <AlertTriangle size={14} />
                {(bulkResult.skippedAlreadyAssigned?.length ?? 0)} {(bulkResult.skippedAlreadyAssigned?.length ?? 0) === 1 ? 'saltada' : 'saltadas'}
              </span>
            )}
            {bulkResult.needsReview.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium">
                <HelpCircle size={14} />
                {bulkResult.needsReview.length} sin reconocer
              </span>
            )}
          </div>

          {(bulkResult.skippedAlreadyAssigned?.length ?? 0) > 0 && (
            <div className="bulk-review-skipped">
              <p className="text-xs text-amber-800 mb-1 font-medium">
                Estos alumnos ya tenían entrega y no se han tocado:
              </p>
              <ul className="text-xs text-amber-900 list-disc pl-5 space-y-0.5">
                {(bulkResult.skippedAlreadyAssigned ?? []).map((s) => (
                  <li key={s.correctionId}>
                    <span className="font-medium">{s.studentName}</span>
                    {s.hadGrade && <span className="text-amber-700"> · ya tenía nota</span>}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-700 mt-1">
                Si querías sustituir sus entregas, vuelve a subir el PDF y elige <em>Reemplazar</em>.
              </p>
            </div>
          )}

          {bulkResult.needsReview.length > 0 && (
            <QRReviewTable
              items={bulkResult.needsReview.map((item) => ({
                correctionId: item.correctionId,
                detectedCode: item.detectedCode,
                reason: item.reason,
              }))}
              itemLabel="Examen"
              assignments={reviewAssignments}
              students={students}
              assignedStudentIds={assignedStudentIds}
              thumbnails={Object.fromEntries(
                bulkResult.needsReview
                  .map((item) => {
                    const c = examCorrections.find((c) => c.id === item.correctionId);
                    const url = getFullPaperUrl(c?.paperUrl);
                    return url ? [item.correctionId, url] : null;
                  })
                  .filter(Boolean) as [string, string][]
              )}
              paperUrls={Object.fromEntries(
                bulkResult.needsReview
                  .map((item) => {
                    const c = examCorrections.find((c) => c.id === item.correctionId);
                    const url = getFullPaperUrl(c?.paperUrl);
                    return url ? [item.correctionId, url] : null;
                  })
                  .filter(Boolean) as [string, string][]
              )}
              onAssign={handleReviewAssignment}
              onPreview={(url) => setPreviewUrl(url)}
              onDelete={handleDeleteCorrection}
            />
          )}

          <div className="bulk-review-actions">
            {bulkResult.needsReview.length > 0 && bulkResult.needsReview.some(item => !reviewAssignments[item.correctionId]) && (
              <p className="bulk-review-pending-hint">
                <AlertTriangle size={18} /> Hay exámenes sin asignar — se omitirán del análisis con IA
              </p>
            )}
            {bulkResult.needsReview.length > 0 && (
              <Button className="w-full bulk-review-confirm-btn" onClick={handleConfirmReviewAssignments}>
                {confirmingReview ? (
                  <><Spinner size={18} /> Asignando y analizando...</>
                ) : (
                  <><Sparkles size={18} /> Confirmar y analizar con IA</>
                )}
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={() => { setBulkResult(null); setReviewAssignments({}); }}
              disabled={confirmingReview}
            >
              {bulkResult.needsReview.length > 0 ? 'Omitir' : 'Cerrar'}
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar — context-aware buttons based on correction state */}
      <div className="correction-toolbar">
        {(() => {
          const unprocessedWithPaper = examCorrections.filter(c => !c.aiProcessed && c.paperUrl).length;
          const anyProcessingNow = hasBatchRunning || Object.values(aiProcessing).some(Boolean);
          const hasUnassignedPapers = examCorrections.some(c => c.paperUrl && !c.studentId);

          return (
            <>
              {/* AI processing banner */}
              {anyProcessingNow && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-purple-50 border border-purple-200 text-purple-800 text-xs w-full">
                  <Sparkles size={14} className="animate-pulse flex-shrink-0" />
                  <span>IA corrigiendo exámenes... No subas más hasta que termine.</span>
                </div>
              )}

              {/* Upload button: standalone or class mode when not all have papers */}
              {standalone ? (
                <Button variant="outline" size="sm" onClick={handleStandaloneUploadClick} disabled={standaloneUploading || anyProcessingNow}>
                  {standaloneUploading ? <Spinner size={18} /> : <><Upload size={18} /> Subir examen</>}
                </Button>
              ) : !anyProcessingNow && !bulkResult && effectiveClassId ? (
                <Button variant="outline" size="sm" onClick={() => handleBulkUploadClick(effectiveClassId)} disabled={bulkUploading}>
                  {bulkUploading ? <Spinner size={18} /> : (
                    <><Users size={18} /> {allHavePapers ? 'Añadir / Reemplazar entregas' : 'Subir PDF de toda la clase'}</>
                  )}
                </Button>
              ) : null}

              {/* Batch AI button: when papers exist and need processing */}
              {!standalone && !bulkResult && !anyProcessingNow && unprocessedWithPaper > 0 && (
                <Button size="sm" className="batch-ai-btn" onClick={handleBatchProcessAll}
                  disabled={hasUnassignedPapers}
                  title={hasUnassignedPapers ? 'Asigna todos los exámenes a un alumno primero' : `Analizar ${unprocessedWithPaper} exámenes con IA`}
                >
                  <Sparkles size={16} className="flex-shrink-0" />
                  <span className="batch-ai-btn__label">
                    Analizar{unprocessedWithPaper > 1 ? ` (${unprocessedWithPaper})` : ''}
                  </span>
                  {batchEstimate && (
                    <span className="time-badge">
                      <Clock size={14} className="flex-shrink-0" />
                      <span>{batchEstimate.time_string}</span>
                    </span>
                  )}
                </Button>
              )}

              {/* Finish button lives at the bottom of the corrections list
                  only — having it twice (top + bottom) was redundant. */}
            </>
          );
        })()}
      </div>

      {/* Loading */}
      {loading && examCorrections.length === 0 && (
        <div className="correction-loading"><Spinner size={18} /></div>
      )}

      {/* Empty state */}
      {examCorrections.length === 0 && !loading && (
        standalone ? (
          <EmptyState
            icon="📷"
            title="Sin exámenes"
            subtitle="Sube el examen de un alumno para corregirlo con IA"
            actionLabel="Subir examen"
            onAction={handleStandaloneUploadClick}
          />
        ) : (
          <EmptyState
            icon="📷"
            title="Sin exámenes"
            subtitle="Sube los exámenes de los alumnos (PDF de toda la clase o uno por uno)"
            actionLabel="Subir PDF de toda la clase"
            onAction={() => handleBulkUploadClick()}
          />
        )
      )}

      {/* Assignment status banner (hidden in standalone mode) */}
      {!standalone && examCorrections.length > 0 && hasUnassignedCorrections && (
        <div className="assignment-status-banner assignment-status-banner--warning">
          <div className="assignment-status-summary">
            <div className="assignment-status-counts">
              <span className="assignment-count assignment-count--assigned">
                <Check size={18} /> {assignedExamCorrections.length} asignados
              </span>
              <span className="assignment-count assignment-count--unassigned">
                <AlertTriangle size={18} /> {unassignedExamCorrections.length} sin asignar
              </span>
            </div>
            <Progress value={assignedExamCorrections.length / examCorrections.length}
              color="warning"
              className="assignment-progress"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => unassignedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Ver sin asignar
          </Button>
        </div>
      )}

      {/* Assigned ScanCards */}
      {!standalone && assignedExamCorrections.length > 0 && hasUnassignedCorrections && (
        <div className="assignment-section-header">
          <CheckCircle size={18} />
          <span>Asignados ({assignedExamCorrections.length})</span>
        </div>
      )}
      {(() => {
        const renderCard = (correction: typeof examCorrections[0], i: number) => {
          const local = localGrades[correction.id] || { grade: correction.grade, teacherComments: '', studentId: correction.studentId || '' };
          const isSaved = !!correction.savedAt;
          const student = students.find(s => s.id === local.studentId);
          return (
            <div key={correction.id} id={`correction-${correction.id}`}>
              <ScanCard
                index={i}
                aiAnalysis={correction.aiAnalysis}
                selectedStudentId={local.studentId}
                students={students}
                maxScore={exam.maxScore}
                grade={local.grade}
                originalGrade={correction.grade}
                teacherComments={local.teacherComments}
                saved={isSaved}
                autoSaved={autoSavedIds.has(correction.id)}
                paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                onStudentChange={(sid) => handleStudentChangeWithDuplicateCheck(correction.id, sid)}
                onGradeChange={(g) => handleGradeChange(correction.id, g)}
                onCommentsChange={(n) => handleCommentsChange(correction.id, n)}
                onSave={() => handleSavePaper(correction.id)}
                onProcessAI={!hasBatchRunning ? () => handleProcessAI(correction.id) : undefined}
                onPreviewPaper={correction.paperUrl ? () => handlePreviewPaper(correction.paperUrl!) : undefined}
                onDownloadPaper={correction.paperUrl ? () => handleDownloadStudentPaper(correction.paperUrl!, student?.name) : undefined}
                onDownloadReport={correction.aiProcessed ? () => handleDownloadReport(correction.id, student?.name) : undefined}
                onDelete={() => handleDeleteCorrection(correction.id)}
                onMarkNotTaken={!standalone ? () => handleMarkNotTakenClick(correction.id) : undefined}
                onUnmarkNotTaken={!standalone ? () => handleUnmarkNotTaken(correction.id) : undefined}
                onReplacePaper={correction.paperUrl ? () => handleReplacePaperClick(correction.id) : undefined}
                notTaken={correction.notTaken}
                replacing={replacingForCorrection === correction.id}
                onUploadPaper={!bulkResult && !correction.paperUrl && local.studentId && !correction.notTaken ? () => handleStudentUploadClick(local.studentId, correction.classId) : undefined}
                saving={saving[correction.id]}
                aiProcessing={aiProcessing[correction.id] || (hasBatchRunning && !correction.aiProcessed && !!correction.paperUrl)}
                aiError={aiErrors[correction.id]}
                standalone={standalone}
                studentName={standaloneNames[correction.id] || correction.aiAnalysis?.suggestedStudentName || ''}
                onStudentNameChange={(name) => setStandaloneNames(prev => ({ ...prev, [correction.id]: name }))}
              />
            </div>
          );
        };

        const cardsToRender = standalone ? examCorrections : hasUnassignedCorrections ? assignedExamCorrections : examCorrections;

        return (
          <div className="correction-scans">
            {cardsToRender.map((correction, i) => renderCard(correction, hasUnassignedCorrections ? examCorrections.indexOf(correction) : i))}
          </div>
        );
      })()}

      {/* Unassigned ScanCards */}
      {hasUnassignedCorrections && !standalone && (
        <>
          <div className="assignment-section-header assignment-section-header--unassigned" ref={unassignedSectionRef}>
            <AlertTriangle size={18} />
            <span>Sin asignar ({unassignedExamCorrections.length})</span>
          </div>
          <div className="correction-scans correction-scans--unassigned">
            {unassignedExamCorrections.map((correction) => {
              const local = localGrades[correction.id] || { grade: correction.grade, teacherComments: '', studentId: correction.studentId || '' };
              const isSaved = !!correction.savedAt;
              const student = students.find(s => s.id === local.studentId);
              return (
                <div key={correction.id} id={`correction-${correction.id}`}>
                  <ScanCard
                    index={examCorrections.indexOf(correction)}
                    aiAnalysis={correction.aiAnalysis}
                    selectedStudentId={local.studentId}
                    students={students}
                    maxScore={exam.maxScore}
                    grade={local.grade}
                    originalGrade={correction.grade}
                    teacherComments={local.teacherComments}
                    saved={isSaved}
                    autoSaved={autoSavedIds.has(correction.id)}
                    paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                    onStudentChange={(sid) => handleStudentChangeWithDuplicateCheck(correction.id, sid)}
                    onGradeChange={(g) => handleGradeChange(correction.id, g)}
                    onCommentsChange={(n) => handleCommentsChange(correction.id, n)}
                    onSave={() => handleSavePaper(correction.id)}
                    onProcessAI={!hasBatchRunning ? () => handleProcessAI(correction.id) : undefined}
                    onPreviewPaper={correction.paperUrl ? () => handlePreviewPaper(correction.paperUrl!) : undefined}
                    onDownloadPaper={correction.paperUrl ? () => handleDownloadStudentPaper(correction.paperUrl!, student?.name) : undefined}
                    onDownloadReport={correction.aiProcessed ? () => handleDownloadReport(correction.id, student?.name) : undefined}
                    onDelete={() => handleDeleteCorrection(correction.id)}
                    onMarkNotTaken={!standalone ? () => handleMarkNotTakenClick(correction.id) : undefined}
                    onUnmarkNotTaken={!standalone ? () => handleUnmarkNotTaken(correction.id) : undefined}
                    onReplacePaper={correction.paperUrl ? () => handleReplacePaperClick(correction.id) : undefined}
                    notTaken={correction.notTaken}
                    saving={saving[correction.id]}
                    aiProcessing={aiProcessing[correction.id] || (hasBatchRunning && !correction.aiProcessed && !!correction.paperUrl)}
                    aiError={aiErrors[correction.id]}
                    standalone={standalone}
                    studentName={standaloneNames[correction.id] || correction.aiAnalysis?.suggestedStudentName || ''}
                    onStudentNameChange={(name) => setStandaloneNames(prev => ({ ...prev, [correction.id]: name }))}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom finish button */}
      {allSaved && examCorrections.length > 0 && (
        <div className="correction-finish">
          <Button variant="outline" className="w-full" onClick={handleFinish}>
            <CheckCircle size={18} /> Finalizar corrección
          </Button>
        </div>
      )}

      {/* Paper preview overlay — same pattern as ExamDetail */}
      {previewUrl && (
        <div className="ed-preview-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div className="ed-preview-viewer" style={{ height: '100%' }}>
            {previewUrl.includes('#.pdf') ? (
              <PdfViewer
                url={previewUrl.replace('#.pdf', '')}
                title="Examen del alumno"
                onClose={() => { URL.revokeObjectURL(previewUrl.replace('#.pdf', '')); setPreviewUrl(null); }}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ fontWeight: 600 }}>Examen del alumno</span>
                  <Button variant="ghost" size="sm" onClick={() => setPreviewUrl(null)}><X size={18} /></Button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '16px' }}>
                  <img src={previewUrl} alt="Examen" style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <Modal open={false} onClose={() => {}}><span />
      </Modal>

      {/* Duplicate Assignment Conflict Dialog */}
      <AlertConfirm open={!!duplicateConflict}
        header="Examen duplicado"
        message={`${duplicateConflict?.studentName} ya tiene un examen asignado. ¿Qué quieres hacer?`}
        onConfirm={handleDuplicateReplace}
        confirmText="Reemplazar el anterior"
        variant="destructive"
        onClose={() => setDuplicateConflict(null)}
      />

      {/* Bulk overwrite prompt — appears before the file picker when the
          target class already has uploaded papers. The teacher picks "Añadir
          nuevas" (default, skip duplicates) or "Reemplazar". */}
      <AlertConfirm
        open={!!bulkOverwritePrompt}
        header={bulkOverwritePrompt ? `Esta clase ya tiene ${bulkOverwritePrompt.existingCount} entrega${bulkOverwritePrompt.existingCount === 1 ? '' : 's'}` : ''}
        message="¿Cómo quieres tratar a los alumnos que ya tengan entrega? Puedes añadir solo a los que faltan, o reemplazar las anteriores (se perderán las notas asociadas)."
        confirmText="Reemplazar entregas existentes"
        cancelText="Solo añadir nuevas"
        variant="destructive"
        onConfirm={() => proceedBulkUpload(true)}
        onClose={() => proceedBulkUpload(false)}
      />

      {/* Mark as Not Taken — only confirms when there's something to lose */}
      <AlertConfirm
        open={!!npConfirm}
        header={npConfirm ? `Marcar a ${npConfirm.studentName} como no presentado` : ''}
        message={
          npConfirm
            ? (npConfirm.hadGrade
                ? 'Esto eliminará la nota guardada y la entrega de este alumno. El alumno quedará excluido de la media de la clase.'
                : 'Esto eliminará la entrega subida. El alumno quedará excluido de la media de la clase.')
            : ''
        }
        confirmText="Marcar como no presentado"
        cancelText="Cancelar"
        variant="destructive"
        onConfirm={handleConfirmMarkNotTaken}
        onClose={() => setNpConfirm(null)}
      />

      {/* Replace paper — only confirms when there is a saved grade */}
      <AlertConfirm
        open={!!replaceWarning}
        header={replaceWarning ? `Reemplazar la entrega de ${replaceWarning.studentName}` : ''}
        message="Hay una nota guardada para este alumno. Si reemplazas la entrega, se eliminará la nota y el análisis de IA — tendrás que corregir de nuevo."
        confirmText="Sí, reemplazar"
        cancelText="Cancelar"
        variant="destructive"
        onConfirm={handleConfirmReplaceWarning}
        onClose={() => setReplaceWarning(null)}
      />

      {/* Hidden file input used by the replace-paper flow */}
      <input
        ref={replaceFileInputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={handleReplaceFileSelected}
      />

      <CelebrationOverlay show={showCelebration} onDismiss={handleCelebrationDismiss} />
    </>
  );
};

export default CorrectionPanel;
