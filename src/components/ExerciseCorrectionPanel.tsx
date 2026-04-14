import { useState, useMemo, useEffect, useRef } from 'react';
import { AlertTriangle, Check, CheckCircle, ChevronDown, ChevronUp, HelpCircle, Sparkles, Upload, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/shared/Spinner';
import Modal from '@/components/shared/Modal';
import { Progress } from '@/components/ui/progress';
import AlertConfirm from '@/components/shared/AlertConfirm';
import { useStudentsStore } from '../store/studentsStore';
import { useExerciseCorrectionStore } from '../store/exerciseCorrectionStore';
import { useExercisesStore } from '../store/exercisesStore';
import { exerciseCorrections as ecApi, batch, authenticatedFetch } from '../services/api';
import { getFullPaperUrl } from '../utils/examUrls';
import { BulkUploadResult } from '../types';
import ScanCard from './ScanCard';
import QRReviewTable from './QRReviewTable';
import EmptyState from './EmptyState';
import CelebrationOverlay from './CelebrationOverlay';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';
import './CorrectionShared.css';

interface ExerciseCorrectionPanelProps {
  classId: string;
  exerciseIds: string[];
  exerciseName: string;
  maxScore: number;
  onFinished?: () => void;
}

const ExerciseCorrectionPanel: React.FC<ExerciseCorrectionPanelProps> = ({
  classId,
  exerciseIds,
  exerciseName,
  maxScore,
  onFinished,
}) => {
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);

  const allStudents = useStudentsStore((s) => s.students);
  const allExercises = useExercisesStore((s) => s.exercises);

  const corrections = useExerciseCorrectionStore((s) => s.corrections);
  const fetchCorrections = useExerciseCorrectionStore((s) => s.fetchCorrections);
  const updateCorrection = useExerciseCorrectionStore((s) => s.updateCorrection);
  const processAI = useExerciseCorrectionStore((s) => s.processAI);
  const finishCorrection = useExerciseCorrectionStore((s) => s.finishCorrection);
  const loading = useExerciseCorrectionStore((s) => s.loading);

  const students = useMemo(
    () => allStudents.filter((st) => st.classId === classId),
    [allStudents, classId]
  );

  const siblingExercises = useMemo(
    () => allExercises.filter((e) => exerciseIds.includes(e.id)),
    [allExercises, exerciseIds]
  );

  const exerciseCorrections = useMemo(
    () =>
      corrections
        .filter((c) => exerciseIds.includes(c.exerciseId))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [corrections, exerciseIds]
  );

  const [localGrades, setLocalGrades] = useState<
    Record<string, { grade: number | null; teacherComments: string; studentId: string }>
  >({});
  const localGradesRef = useRef(localGrades);
  localGradesRef.current = localGrades;
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [reviewAssignments, setReviewAssignments] = useState<Record<string, string>>({});
  const [confirmingReview, setConfirmingReview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const [uploadingForStudent, setUploadingForStudent] = useState<string | null>(null);
  const studentFileInputRef = useRef<HTMLInputElement>(null);
  const [showStudentList, setShowStudentList] = useState(false);

  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [autoSavedIds, setAutoSavedIds] = useState<Set<string>>(new Set());
  const focusedCardIndex = useRef(0);

  const [aiProcessing, setAiProcessing] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const [showCelebration, setShowCelebration] = useState(false);
  const [duplicateConflict, setDuplicateConflict] = useState<{
    newCorrectionId: string;
    existingCorrectionId: string;
    studentId: string;
    studentName: string;
  } | null>(null);

  // Stable key for exerciseIds to avoid re-fetching on every render
  const exerciseIdsKey = useMemo(() => [...exerciseIds].sort().join(','), [exerciseIds]);

  // Fetch corrections for all exercise IDs on mount
  useEffect(() => {
    exerciseIdsKey.split(',').filter(Boolean).forEach((id) => fetchCorrections(id));
  }, [exerciseIdsKey, fetchCorrections]);

  // Sync local grades from corrections
  useEffect(() => {
    setLocalGrades((prev) => {
      const next = { ...prev };
      exerciseCorrections.forEach((c) => {
        if (!next[c.id]) {
          next[c.id] = {
            grade: c.grade,
            teacherComments: c.teacherComments || '',
            studentId: c.studentId || '',
          };
        } else if (!next[c.id].studentId && c.studentId) {
          next[c.id] = { ...next[c.id], studentId: c.studentId };
        }
      });
      return next;
    });
  }, [exerciseCorrections]);

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
          const idx = Math.min(focusedCardIndex.current, exerciseCorrections.length - 1);
          const correction = exerciseCorrections[idx];
          if (correction) {
            handleSavePaper(correction.id);
          }
        }
        return;
      }

      if (e.key === 'Tab') {
        const target = e.target as HTMLElement;
        const isInInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'ION-INPUT' ||
          target.tagName === 'ION-TEXTAREA' ||
          target.tagName === 'ION-SELECT';
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
  }, [exerciseCorrections]);


  const assignedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    exerciseCorrections.forEach((c) => {
      if (c.studentId) ids.add(c.studentId);
    });
    if (bulkResult) {
      bulkResult.autoMatched.forEach((m) => ids.add(m.studentId));
      Object.values(reviewAssignments).forEach((sid) => {
        if (sid) ids.add(sid);
      });
    }
    return ids;
  }, [exerciseCorrections, bulkResult, reviewAssignments]);

  // ── Auto-save ──
  const triggerAutoSave = (correctionId: string) => {
    if (autoSaveTimers.current[correctionId]) {
      clearTimeout(autoSaveTimers.current[correctionId]);
    }
    autoSaveTimers.current[correctionId] = setTimeout(() => {
      setLocalGrades((current) => {
        const local = current[correctionId];
        if (local && local.grade !== null && local.studentId) {
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
    setLocalGrades((prev) => ({
      ...prev,
      [correctionId]: { ...prev[correctionId], studentId },
    }));
    triggerAutoSave(correctionId);
  };

  const handleGradeChange = (correctionId: string, grade: number) => {
    setLocalGrades((prev) => ({
      ...prev,
      [correctionId]: { ...prev[correctionId], grade },
    }));
    triggerAutoSave(correctionId);
  };

  const handleCommentsChange = (correctionId: string, teacherComments: string) => {
    setLocalGrades((prev) => ({
      ...prev,
      [correctionId]: { ...prev[correctionId], teacherComments },
    }));
    triggerAutoSave(correctionId);
  };

  const handleSavePaper = async (correctionId: string) => {
    const local = localGradesRef.current[correctionId];
    if (!local || local.grade === null) return;

    setSaving((prev) => ({ ...prev, [correctionId]: true }));
    try {
      await updateCorrection(correctionId, {
        student_id: local.studentId || undefined,
        grade: local.grade,
        teacher_notes: local.teacherComments,
      });
    } catch (err) {
      console.error('Failed to save correction:', err);
    } finally {
      setSaving((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  const refetchAll = async () => {
    for (const id of exerciseIds) {
      await fetchCorrections(id);
    }
  };

  const handleProcessAI = async (correctionId: string, skipRefetch = false) => {
    setAiErrors((prev) => ({ ...prev, [correctionId]: '' }));
    setAiProcessing((prev) => ({ ...prev, [correctionId]: true }));
    try {
      const result = await processAI(correctionId);
      if (result?.suggestedStudentName) {
        const nameLower = result.suggestedStudentName.toLowerCase();
        const matchedStudent = students.find(
          (s) =>
            s.name.toLowerCase() === nameLower ||
            s.name.toLowerCase().includes(nameLower) ||
            nameLower.includes(s.name.toLowerCase())
        );
        if (matchedStudent) {
          setLocalGrades((prev) => ({
            ...prev,
            [correctionId]: { ...prev[correctionId], studentId: matchedStudent.id },
          }));
        }
      }
      if (!skipRefetch) {
        await refetchAll();
      }
    } catch (err: any) {
      console.error('AI processing failed:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Error desconocido';
      setAiErrors((prev) => ({ ...prev, [correctionId]: errorMsg }));
    } finally {
      setAiProcessing((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  const handleDeleteCorrection = async (correctionId: string) => {
    try {
      await ecApi.delete(correctionId);
      if (bulkResult) {
        setBulkResult((prev) =>
          prev
            ? {
                ...prev,
                needsReview: prev.needsReview.filter((r) => r.correctionId !== correctionId),
                autoMatched: prev.autoMatched.filter((m) => m.correctionId !== correctionId),
              }
            : null
        );
        setReviewAssignments((prev) => {
          const next = { ...prev };
          delete next[correctionId];
          return next;
        });
      }
      await refetchAll();
    } catch (err) {
      console.error('Failed to delete correction:', err);
    }
  };

  // ── Per-student upload ──
  const handleStudentUploadClick = (studentId: string) => {
    setUploadingForStudent(studentId);
    setTimeout(() => studentFileInputRef.current?.click(), 100);
  };

  const handleStudentFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !uploadingForStudent) {
      setUploadingForStudent(null);
      return;
    }
    try {
      const studentExercise = siblingExercises.find(
        (ex) => ex.studentId === uploadingForStudent
      );
      if (!studentExercise) {
        console.error('No exercise found for student:', uploadingForStudent);
        setUploadingForStudent(null);
        return;
      }
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('papers', f));
      await ecApi.bulkUpload(studentExercise.id, Array.from(files));
      await refetchAll();
      const hasUnassigned = exerciseCorrections.some((c) => c.paperUrl && !c.studentId);
      if (!hasUnassigned) {
        // Process AI for newly uploaded corrections
        const newCorrections = corrections.filter(
          (c) => c.exerciseId === studentExercise.id && !c.aiAnalysis
        );
        for (let i = 0; i < newCorrections.length; i++) {
          await handleProcessAI(newCorrections[i].id, i < newCorrections.length - 1);
          if (i < newCorrections.length - 1) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }
    } catch (err) {
      console.error('Failed to upload paper for student:', err);
    } finally {
      setUploadingForStudent(null);
      e.target.value = '';
    }
  };

  // ── Bulk upload ──
  const handleBulkUploadClick = () => {
    bulkInputRef.current?.click();
  };

  const handleBulkFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setBulkUploading(true);
    try {
      const response = await ecApi.classBulkUpload(classId, Array.from(files), exerciseIds);
      const data = response.data;
      setBulkResult({
        autoMatched: (data.auto_matched || []).map((m: any) => ({
          correctionId: m.correction_id,
          studentId: m.student_id,
          studentName: m.student_name,
          studentCode: m.student_code,
          confidence: m.confidence,
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
      });
      await refetchAll();
    } catch (err) {
      console.error('Failed to bulk upload papers:', err);
    } finally {
      setBulkUploading(false);
      e.target.value = '';
    }
  };

  const handleReviewAssignment = (correctionId: string, studentId: string) => {
    setReviewAssignments((prev) => ({ ...prev, [correctionId]: studentId }));
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

    await refetchAll();

    const allCorrectionIds = [
      ...assignedCorrectionIds,
      ...(bulkResult?.autoMatched.map((m) => m.correctionId) || []),
    ].filter((cId) => {
      const correction = exerciseCorrections.find((c) => c.id === cId);
      return correction && !correction.aiAnalysis;
    });

    setBulkResult(null);
    setReviewAssignments({});
    setConfirmingReview(false);

    if (allCorrectionIds.length > 1) {
      try {
        const response = await batch.startBatchExerciseCorrection(
          exerciseIds,
          allCorrectionIds
        );
        const jobId = response.data.id;
        registerCorrectionBackgroundTask(jobId, exerciseName);
      } catch (err) {
        console.error(
          'Failed to start batch correction, falling back to sequential:',
          err
        );
        for (let i = 0; i < allCorrectionIds.length; i++) {
          await handleProcessAI(allCorrectionIds[i], true);
          if (i < allCorrectionIds.length - 1) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
        await refetchAll();
      }
    } else if (allCorrectionIds.length === 1) {
      handleProcessAI(allCorrectionIds[0]);
    }
  };

  const registerCorrectionBackgroundTask = (jobId: string, label: string) => {
    const capturedExerciseIds = [...exerciseIds];
    addBackgroundTask({
      type: 'exercises',
      label: `Corrección: ${label}`,
      description:
        'La IA lee cada ejercicio, identifica aciertos y errores, y prepara comentarios por pregunta.',
      batchJobId: jobId,
      expectedResultUrl: `/exercise-correction/${capturedExerciseIds[0]}`,
      execute: async () => {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        let interval = 3000;
        while (true) {
          await sleep(interval);
          const res = await batch.getJobProgress(jobId);
          const status = res.data.status;
          if (status === 'completed') break;
          if (status === 'failed' || status === 'cancelled') {
            throw new Error('Error en la corrección');
          }
          interval = Math.min(interval + 500, 8000);
        }
        for (const id of capturedExerciseIds) {
          await fetchCorrections(id);
        }
        return `/exercise-correction/${capturedExerciseIds[0]}`;
      },
    });
  };

  const handleBatchProcessAll = async () => {
    const unprocessedIds = exerciseCorrections
      .filter((c) => !c.aiAnalysis && c.paperUrl)
      .map((c) => c.id);
    if (unprocessedIds.length === 0) return;
    try {
      const response = await batch.startBatchExerciseCorrection(exerciseIds, unprocessedIds);
      const jobId = response.data.id;
      registerCorrectionBackgroundTask(jobId, exerciseName);
    } catch (err) {
      console.error('Failed to start batch correction:', err);
    }
  };

  const handleStudentChangeWithDuplicateCheck = (
    correctionId: string,
    studentId: string
  ) => {
    if (!studentId) {
      handleStudentChange(correctionId, studentId);
      return;
    }
    const existing = exerciseCorrections.find(
      (c) => c.studentId === studentId && c.id !== correctionId
    );
    if (existing) {
      const student = students.find((s) => s.id === studentId);
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
      await ecApi.delete(duplicateConflict.existingCorrectionId);
      await refetchAll();
      handleStudentChange(duplicateConflict.newCorrectionId, duplicateConflict.studentId);
    } catch (err) {
      console.error('Failed to replace correction:', err);
    }
    setDuplicateConflict(null);
  };

  const handleDuplicateKeepExisting = async () => {
    if (!duplicateConflict) return;
    try {
      await ecApi.delete(duplicateConflict.newCorrectionId);
      await refetchAll();
    } catch (err) {
      console.error('Failed to delete duplicate:', err);
    }
    setDuplicateConflict(null);
  };

  const handleFinish = async () => {
    try {
      for (const exerciseId of exerciseIds) {
        await finishCorrection(exerciseId);
      }
      setShowCelebration(true);
    } catch (err) {
      console.error('Failed to finish:', err);
    }
  };

  const handleCelebrationDismiss = () => {
    setShowCelebration(false);
    onFinished?.();
  };

  const handleDownloadStudentPaper = (paperUrl: string, studentName?: string) => {
    if (!paperUrl) return;
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
          ? `${exerciseName}_${studentName}.${ext}`
          : `${exerciseName}_ejercicio.${ext}`;
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

  // ── Computed ──
  const savedCount = exerciseCorrections.filter((c) => c.savedAt).length;
  const allSaved = savedCount === exerciseCorrections.length && exerciseCorrections.length > 0;

  const studentCorrectionMap = useMemo(() => {
    const map: Record<
      string,
      {
        correction: (typeof exerciseCorrections)[0] | null;
        status: 'none' | 'uploaded' | 'processing' | 'corrected';
      }
    > = {};
    students.forEach((s) => {
      const corr = exerciseCorrections.find((c) => c.studentId === s.id);
      let status: 'none' | 'uploaded' | 'processing' | 'corrected' = 'none';
      if (corr) {
        if (corr.savedAt) status = 'corrected';
        else if (corr.aiAnalysis) status = 'processing';
        else status = 'uploaded';
      }
      map[s.id] = { correction: corr || null, status };
    });
    return map;
  }, [students, exerciseCorrections]);

  const missingCount = students.filter(
    (s) => studentCorrectionMap[s.id]?.status === 'none'
  ).length;

  // Assignment grouping
  const assignedExerciseCorrections = useMemo(
    () => exerciseCorrections.filter((c) => !!c.studentId),
    [exerciseCorrections]
  );
  const unassignedExerciseCorrections = useMemo(
    () => exerciseCorrections.filter((c) => !c.studentId),
    [exerciseCorrections]
  );
  const hasUnassignedCorrections = unassignedExerciseCorrections.length > 0;
  const unassignedSectionRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={bulkInputRef}
        style={{ display: 'none' }}
        accept=".jpg,.jpeg,.png,.pdf"
        multiple
        onChange={handleBulkFilesSelected}
      />
      <input
        type="file"
        ref={studentFileInputRef}
        style={{ display: 'none' }}
        accept=".jpg,.jpeg,.png,.pdf"
        multiple
        onChange={handleStudentFileSelected}
      />

      {/* Bulk review results */}
      {bulkResult && (
        <div className="bulk-review-section">
          <div className="bulk-review-stats">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium">
              <Check size={18} />
              {bulkResult.autoMatched.length} asignados
            </span>
            {bulkResult.needsReview.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium">
                <AlertTriangle size={18} />
                {bulkResult.needsReview.length} pendientes
              </span>
            )}
            {bulkResult.studentsWithoutPapers.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium">
                <HelpCircle size={18} />
                {bulkResult.studentsWithoutPapers.length} sin ejercicio
              </span>
            )}
          </div>

          {bulkResult.needsReview.length > 0 && (
            <QRReviewTable
              items={bulkResult.needsReview.map((item) => ({
                correctionId: item.correctionId,
                detectedCode: item.detectedCode,
                reason: item.reason,
              }))}
              itemLabel="Ejercicio"
              assignments={reviewAssignments}
              students={students}
              assignedStudentIds={assignedStudentIds}
              thumbnails={Object.fromEntries(
                bulkResult.needsReview
                  .map((item) => {
                    const c = exerciseCorrections.find((c) => c.id === item.correctionId);
                    const url = getFullPaperUrl(c?.paperUrl);
                    return url ? [item.correctionId, url] : null;
                  })
                  .filter(Boolean) as [string, string][]
              )}
              paperUrls={Object.fromEntries(
                bulkResult.needsReview
                  .map((item) => {
                    const c = exerciseCorrections.find((c) => c.id === item.correctionId);
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
            {bulkResult.needsReview.some(
              (item) => !reviewAssignments[item.correctionId]
            ) && (
              <p className="bulk-review-pending-hint">
                <AlertTriangle size={18} /> Asigna todos los ejercicios pendientes para
                analizar con IA
              </p>
            )}
            <Button className="w-full bulk-review-confirm-btn" onClick={handleConfirmReviewAssignments}>
              {confirmingReview ? (
                <>
                  <Spinner size={18} /> Asignando y analizando...
                </>
              ) : (
                <>
                  <Sparkles size={18} /> Confirmar y analizar con IA
                </>
              )}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => {
                setBulkResult(null);
                setReviewAssignments({});
              }}
              disabled={confirmingReview}
            >
              Omitir
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="correction-toolbar">
        <Button variant="outline" size="sm" onClick={handleBulkUploadClick} disabled={bulkUploading}>
          {bulkUploading ? (
            <Spinner size={18} />
          ) : (
            <>
              <Users size={18} /> Subir PDF de toda la clase
            </>
          )}
        </Button>

        {!bulkResult && !Object.values(aiProcessing).some(Boolean) &&
          exerciseCorrections.filter((c) => !c.aiAnalysis && c.paperUrl).length > 1 && (
            <Button size="sm" className="batch-ai-btn" onClick={handleBatchProcessAll}
              disabled={exerciseCorrections.some(c => c.paperUrl && !c.studentId)}
              title={
                exerciseCorrections.some((c) => c.paperUrl && !c.studentId)
                  ? 'Asigna todos los ejercicios a un alumno primero'
                  : undefined
              }
            >
              <Sparkles size={18} />
              Analizar todo (
              {exerciseCorrections.filter((c) => !c.aiAnalysis && c.paperUrl).length})
            </Button>
          )}

        {allSaved && (
          <Button variant="outline" size="sm" onClick={handleFinish}>
            <CheckCircle size={18} /> Finalizar
          </Button>
        )}
      </div>

      {/* Students without exercise */}
      {missingCount > 0 && (
        <div className="student-list-section">
          <div
            className="student-list-header"
            onClick={() => setShowStudentList(!showStudentList)}
          >
            <div className="student-list-header-left">
              <Users size={18} />
              <span>Alumnos sin ejercicio ({missingCount})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span color="warning">{missingCount} sin ejercicio</span>
              {/* icon: showStudentList ? chevronUpOutline : chevronDownOutline */}
            </div>
          </div>

          {showStudentList && (
            <div className="student-list-items">
              {students
                .filter((s) => studentCorrectionMap[s.id]?.status === 'none')
                .map((student) => {
                  const isUploading = uploadingForStudent === student.id;

                  return (
                    <div
                      key={student.id}
                      className="student-list-item student-list-item--none"
                    >
                      <div className="student-list-item-info">
                        <div className="student-list-item-name">{student.name}</div>
                        <div className="student-list-item-status">Sin ejercicio</div>
                      </div>
                      <div className="student-list-item-actions">
                        <Button variant="outline" size="sm" onClick={() => handleStudentUploadClick(student.id)}
                          disabled={isUploading}
                        >
                          {isUploading ? (
                            <Spinner size={18} />
                          ) : (
                            <>
                              <Upload size={18} /> Subir
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && exerciseCorrections.length === 0 && (
        <div className="correction-loading">
          <Spinner size={18} />
        </div>
      )}

      {/* Empty state */}
      {exerciseCorrections.length === 0 && !loading && (
        <EmptyState
          icon="📷"
          title="Sin ejercicios"
          subtitle="Sube los ejercicios de los alumnos (PDF de toda la clase o uno por uno)"
          actionLabel="Subir PDF de toda la clase"
          onAction={handleBulkUploadClick}
        />
      )}

      {/* Assignment status banner */}
      {exerciseCorrections.length > 0 && hasUnassignedCorrections && (
        <div className="assignment-status-banner assignment-status-banner--warning">
          <div className="assignment-status-summary">
            <div className="assignment-status-counts">
              <span className="assignment-count assignment-count--assigned">
                <Check size={18} /> {assignedExerciseCorrections.length}{' '}
                asignados
              </span>
              <span className="assignment-count assignment-count--unassigned">
                <AlertTriangle size={18} /> {unassignedExerciseCorrections.length} sin
                asignar
              </span>
            </div>
            <Progress value={assignedExerciseCorrections.length / exerciseCorrections.length}
              color="warning"
              className="assignment-progress"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() =>
              unassignedSectionRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              })
            }
          >
            Ver sin asignar
          </Button>
        </div>
      )}

      {/* Assigned ScanCards */}
      {assignedExerciseCorrections.length > 0 && hasUnassignedCorrections && (
        <div className="assignment-section-header">
          <CheckCircle size={18} />
          <span>Asignados ({assignedExerciseCorrections.length})</span>
        </div>
      )}
      <div className="correction-scans">
        {(hasUnassignedCorrections ? assignedExerciseCorrections : exerciseCorrections).map(
          (correction, i) => {
            const local = localGrades[correction.id] || {
              grade: correction.grade,
              teacherComments: '',
              studentId: correction.studentId || '',
            };
            const isSaved = !!correction.savedAt;
            const student = students.find((s) => s.id === local.studentId);
            return (
              <div key={correction.id} id={`correction-${correction.id}`}>
                <ScanCard
                  index={
                    hasUnassignedCorrections
                      ? exerciseCorrections.indexOf(correction)
                      : i
                  }
                  aiAnalysis={correction.aiAnalysis}
                  selectedStudentId={local.studentId}
                  students={students}
                  maxScore={maxScore}
                  grade={local.grade}
                  originalGrade={correction.grade}
                  teacherComments={local.teacherComments}
                  saved={isSaved}
                  autoSaved={autoSavedIds.has(correction.id)}
                  paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                  onStudentChange={(sid) =>
                    handleStudentChangeWithDuplicateCheck(correction.id, sid)
                  }
                  onGradeChange={(g) => handleGradeChange(correction.id, g)}
                  onCommentsChange={(n) => handleCommentsChange(correction.id, n)}
                  onSave={() => handleSavePaper(correction.id)}
                  onProcessAI={() => handleProcessAI(correction.id)}
                  onPreviewPaper={
                    correction.paperUrl
                      ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!)
                      : undefined
                  }
                  onDownloadPaper={
                    correction.paperUrl
                      ? () =>
                          handleDownloadStudentPaper(correction.paperUrl!, student?.name)
                      : undefined
                  }
                  onDelete={() => handleDeleteCorrection(correction.id)}
                  saving={saving[correction.id]}
                  aiProcessing={aiProcessing[correction.id]}
                  aiError={aiErrors[correction.id]}
                />
              </div>
            );
          }
        )}
      </div>

      {/* Unassigned ScanCards */}
      {hasUnassignedCorrections && (
        <>
          <div
            className="assignment-section-header assignment-section-header--unassigned"
            ref={unassignedSectionRef}
          >
            <AlertTriangle size={18} />
            <span>Sin asignar ({unassignedExerciseCorrections.length})</span>
          </div>
          <div className="correction-scans correction-scans--unassigned">
            {unassignedExerciseCorrections.map((correction) => {
              const local = localGrades[correction.id] || {
                grade: correction.grade,
                teacherComments: '',
                studentId: correction.studentId || '',
              };
              const isSaved = !!correction.savedAt;
              const student = students.find((s) => s.id === local.studentId);
              return (
                <div key={correction.id} id={`correction-${correction.id}`}>
                  <ScanCard
                    index={exerciseCorrections.indexOf(correction)}
                    aiAnalysis={correction.aiAnalysis}
                    selectedStudentId={local.studentId}
                    students={students}
                    maxScore={maxScore}
                    grade={local.grade}
                    originalGrade={correction.grade}
                    teacherComments={local.teacherComments}
                    saved={isSaved}
                    autoSaved={autoSavedIds.has(correction.id)}
                    paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                    onStudentChange={(sid) =>
                      handleStudentChangeWithDuplicateCheck(correction.id, sid)
                    }
                    onGradeChange={(g) => handleGradeChange(correction.id, g)}
                    onCommentsChange={(n) => handleCommentsChange(correction.id, n)}
                    onSave={() => handleSavePaper(correction.id)}
                    onProcessAI={() => handleProcessAI(correction.id)}
                    onPreviewPaper={
                      correction.paperUrl
                        ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!)
                        : undefined
                    }
                    onDownloadPaper={
                      correction.paperUrl
                        ? () =>
                            handleDownloadStudentPaper(
                              correction.paperUrl!,
                              student?.name
                            )
                        : undefined
                    }
                    onDelete={() => handleDeleteCorrection(correction.id)}
                    saving={saving[correction.id]}
                    aiProcessing={aiProcessing[correction.id]}
                    aiError={aiErrors[correction.id]}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom finish button */}
      {allSaved && exerciseCorrections.length > 0 && (
        <div className="correction-finish">
          <Button variant="outline" className="w-full" onClick={handleFinish}>
            <CheckCircle size={18} /> Finalizar corrección
          </Button>
        </div>
      )}

      {/* Paper preview modal */}
      <Modal open={!!previewUrl} onClose={() => setPreviewUrl(null)} sheetHeight="lg">
        <div className="flex items-center justify-between p-4 border-b">
          
            <h2 className="text-base font-semibold">Vista previa</h2>
            <div className="flex items-center gap-1">
              <Button onClick={() => setPreviewUrl(null)}>
                <X size={18} />
              </Button>
            </div>
          
        </div>
        <div>
          {previewUrl && (
            <div className="paper-preview-container">
              {previewUrl.toLowerCase().endsWith('.pdf') ? (
                <iframe src={previewUrl} title="Ejercicio" className="paper-preview-pdf" />
              ) : (
                <img src={previewUrl} alt="Ejercicio" className="paper-preview-img" />
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Duplicate Assignment Conflict Dialog */}
      <AlertConfirm open={!!duplicateConflict}
        header="Ejercicio duplicado"
        message={`${duplicateConflict?.studentName} ya tiene un ejercicio asignado. ¿Qué quieres hacer?`}
        onConfirm={handleDuplicateReplace}
        confirmText="Reemplazar el anterior"
        variant="destructive"
        onClose={() => setDuplicateConflict(null)}
      />

      <CelebrationOverlay show={showCelebration} onDismiss={handleCelebrationDismiss} />
    </>
  );
};

export default ExerciseCorrectionPanel;
