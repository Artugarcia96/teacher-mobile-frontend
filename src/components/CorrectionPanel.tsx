import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonButton, IonIcon, IonProgressBar, IonBadge,
  IonSpinner, IonChip, IonModal, IonAlert,
  IonHeader, IonToolbar, IonTitle, IonButtons, IonContent,
} from '@ionic/react';
import {
  closeOutline, checkmarkCircleOutline, pencilOutline, cloudUploadOutline,
  checkmarkOutline, warningOutline, helpOutline, sparkles, timeOutline,
  peopleOutline, chevronDownOutline, chevronUpOutline,
} from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { useExamsStore } from '../store/examsStore';
import { useStudentsStore } from '../store/studentsStore';
import { useCorrectionStore } from '../store/correctionStore';
import { corrections as correctionsApi, batch } from '../services/api';
import { BulkUploadResult } from '../types';
import ScanCard from './ScanCard';
import QRReviewTable from './QRReviewTable';
import EmptyState from './EmptyState';

import CelebrationOverlay from './CelebrationOverlay';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';

interface CorrectionPanelProps {
  examId: string;
  onFinished?: () => void;
}

const CorrectionPanel: React.FC<CorrectionPanelProps> = ({ examId, onFinished }) => {
  const history = useHistory();

  const allExams = useExamsStore((s) => s.exams);
  const updateExamStatus = useExamsStore((s) => s.updateExam);
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
  const students = useMemo(() => allStudents.filter((st) => st.classId === exam?.classId), [allStudents, exam?.classId]);
  const examCorrections = useMemo(() =>
    corrections
      .filter((c) => c.examId === examId)
      .sort((a, b) => a.id.localeCompare(b.id)),
    [corrections, examId]);

  const [localGrades, setLocalGrades] = useState<Record<string, { grade: number | null; teacherComments: string; studentId: string }>>({});
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
  const [batchEstimate, setBatchEstimate] = useState<{ paper_count: number; time_string: string } | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [duplicateConflict, setDuplicateConflict] = useState<{
    newCorrectionId: string;
    existingCorrectionId: string;
    studentId: string;
    studentName: string;
  } | null>(null);

  // Sync local grades from corrections
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
  }, [examCorrections]);

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

  const getFullPaperUrl = (paperUrl?: string) => {
    if (!paperUrl) return null;
    if (paperUrl.startsWith('http')) return paperUrl;
    let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (paperUrl.startsWith('/files/')) return `${baseUrl}${paperUrl}`;
    if (paperUrl.startsWith('/uploads/')) return `${baseUrl}/files${paperUrl.replace('/uploads', '')}`;
    if (paperUrl.startsWith('uploads/')) return `${baseUrl}/files/${paperUrl.replace('uploads/', '')}`;
    if (!paperUrl.startsWith('/')) return `${baseUrl}/${paperUrl}`;
    return `${baseUrl}${paperUrl}`;
  };

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

  const handleProcessAI = async (correctionId: string, skipRefetch = false) => {
    setAiErrors((prev) => ({ ...prev, [correctionId]: '' }));
    setAiProcessing((prev) => ({ ...prev, [correctionId]: true }));
    try {
      const result = await processAI(correctionId);
      if (result?.suggestedStudentName) {
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
      const newCorrections = await uploadPapers(examId, Array.from(files), uploadingForStudent);
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
      const response = await correctionsApi.bulkUpload(examId, Array.from(files));
      const data = response.data;
      setBulkResult({
        autoMatched: (data.auto_matched || []).map((m: any) => ({
          correctionId: m.correction_id,
          studentId: m.student_id,
          studentName: m.student_name,
          studentCode: m.student_code,
          confidence: m.confidence
        })),
        needsReview: (data.needs_review || []).map((r: any) => ({
          correctionId: r.correction_id,
          detectedCode: r.detected_code,
          reason: r.reason,
          suggestions: (r.suggestions || []).map((s: any) => ({
            studentId: s.student_id,
            studentName: s.student_name,
            code: s.code
          }))
        })),
        studentsWithoutPapers: (data.students_without_papers || []).map((s: any) => ({
          studentId: s.student_id,
          studentName: s.student_name,
          code: s.code
        }))
      });
      await fetchCorrections(examId);
    } catch (err) {
      console.error('Failed to bulk upload papers:', err);
    } finally {
      setBulkUploading(false);
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
      await finishCorrection(examId);
      await updateExamStatus(examId, { status: 'corrected' });
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
    if (!paperUrl || !exam) return;
    const fullUrl = getFullPaperUrl(paperUrl);
    if (!fullUrl) return;
    const token = localStorage.getItem('access_token');
    fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } })
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
    const token = localStorage.getItem('access_token');
    const url = correctionsApi.downloadReportUrl(correctionId);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
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
  const savedCount = examCorrections.filter((c) => c.savedAt).length;
  const allSaved = savedCount === examCorrections.length && examCorrections.length > 0;

  const studentCorrectionMap = useMemo(() => {
    const map: Record<string, { correction: typeof examCorrections[0] | null; status: 'none' | 'uploaded' | 'processing' | 'corrected' }> = {};
    students.forEach(s => {
      const corr = examCorrections.find(c => c.studentId === s.id);
      let status: 'none' | 'uploaded' | 'processing' | 'corrected' = 'none';
      if (corr) {
        if (corr.savedAt) status = 'corrected';
        else if (corr.aiAnalysis || corr.aiProcessed) status = 'processing';
        else status = 'uploaded';
      }
      map[s.id] = { correction: corr || null, status };
    });
    return map;
  }, [students, examCorrections]);

  const missingCount = students.filter(s => studentCorrectionMap[s.id]?.status === 'none').length;

  // Assignment grouping
  const assignedExamCorrections = useMemo(() =>
    examCorrections.filter(c => !!c.studentId),
    [examCorrections]
  );
  const unassignedExamCorrections = useMemo(() =>
    examCorrections.filter(c => !c.studentId),
    [examCorrections]
  );
  const hasUnassignedCorrections = unassignedExamCorrections.length > 0;
  const unassignedSectionRef = useRef<HTMLDivElement>(null);

  if (!exam) return null;

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
            <IonChip color="success">
              <IonIcon icon={checkmarkOutline} />
              {bulkResult.autoMatched.length} asignados
            </IonChip>
            {bulkResult.needsReview.length > 0 && (
              <IonChip color="warning">
                <IonIcon icon={warningOutline} />
                {bulkResult.needsReview.length} pendientes
              </IonChip>
            )}
            {bulkResult.studentsWithoutPapers.length > 0 && (
              <IonChip color="medium">
                <IonIcon icon={helpOutline} />
                {bulkResult.studentsWithoutPapers.length} sin examen
              </IonChip>
            )}
          </div>

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
            {bulkResult.needsReview.some(item => !reviewAssignments[item.correctionId]) && (
              <p className="bulk-review-pending-hint">
                <IonIcon icon={warningOutline} /> Asigna todos los exámenes pendientes para analizar con IA
              </p>
            )}
            <IonButton
              expand="block"
              onClick={handleConfirmReviewAssignments}
              disabled={confirmingReview || bulkResult.needsReview.some(item => !reviewAssignments[item.correctionId])}
              className="bulk-review-confirm-btn"
            >
              {confirmingReview ? (
                <><IonSpinner name="crescent" /> Asignando y analizando...</>
              ) : (
                <><IonIcon icon={sparkles} slot="start" /> Confirmar y analizar con IA</>
              )}
            </IonButton>
            <IonButton
              expand="block"
              fill="clear"
              color="medium"
              onClick={() => { setBulkResult(null); setReviewAssignments({}); }}
              disabled={confirmingReview}
            >
              Omitir
            </IonButton>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="correction-toolbar">
        <IonButton size="small" fill="outline" color="secondary" onClick={handleBulkUploadClick} disabled={bulkUploading}>
          {bulkUploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={peopleOutline} slot="start" /> Subir PDF de toda la clase</>}
        </IonButton>

        {!bulkResult && !hasBatchRunning && !Object.values(aiProcessing).some(Boolean) && examCorrections.filter(c => !c.aiProcessed && c.paperUrl).length > 1 && (
          <IonButton
            size="small"
            color="tertiary"
            onClick={handleBatchProcessAll}
            className="batch-ai-btn"
            disabled={examCorrections.some(c => c.paperUrl && !c.studentId)}
            title={examCorrections.some(c => c.paperUrl && !c.studentId) ? 'Asigna todos los exámenes a un alumno primero' : undefined}
          >
            <IonIcon icon={sparkles} slot="start" />
            Analizar todo ({examCorrections.filter(c => !c.aiProcessed && c.paperUrl).length})
            {batchEstimate && (
              <IonBadge color="light" className="time-badge">
                <IonIcon icon={timeOutline} /> {batchEstimate.time_string}
              </IonBadge>
            )}
          </IonButton>
        )}

        {allSaved && (
          <IonButton size="small" color="success" onClick={handleFinish}>
            <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar
          </IonButton>
        )}

        <IonButton size="small" fill="clear" color="medium" onClick={() => history.push(
          exam?.subjectId
            ? `/tabs/classes/${exam.classId}/subjects/${exam.subjectId}/exams/${examId}/edit`
            : exam?.classId
              ? `/tabs/classes/${exam.classId}/exams/${examId}/edit`
              : `/tabs/exams/${examId}`
        )}>
          <IonIcon icon={pencilOutline} slot="start" /> Editar examen
        </IonButton>
      </div>

      {/* Students without exam */}
      {missingCount > 0 && (
        <div className="student-list-section">
          <div className="student-list-header" onClick={() => setShowStudentList(!showStudentList)}>
            <div className="student-list-header-left">
              <IonIcon icon={peopleOutline} />
              <span>Alumnos sin examen ({missingCount})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IonBadge color="warning">{missingCount} sin examen</IonBadge>
              <IonIcon icon={showStudentList ? chevronUpOutline : chevronDownOutline} />
            </div>
          </div>

          {showStudentList && (
            <div className="student-list-items">
              {students.filter(s => studentCorrectionMap[s.id]?.status === 'none').map(student => {
                const isUploading = uploadingForStudent === student.id;

                return (
                  <div
                    key={student.id}
                    className="student-list-item student-list-item--none"
                  >
                    <div className="student-list-item-info">
                      <div className="student-list-item-name">{student.name}</div>
                      <div className="student-list-item-status">Sin examen</div>
                    </div>
                    <div className="student-list-item-actions">
                      <IonButton
                        size="small"
                        fill="outline"
                        onClick={() => handleStudentUploadClick(student.id)}
                        disabled={isUploading}
                      >
                        {isUploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={cloudUploadOutline} slot="start" /> Subir</>}
                      </IonButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && examCorrections.length === 0 && (
        <div className="correction-loading"><IonSpinner /></div>
      )}

      {/* Empty state */}
      {examCorrections.length === 0 && !loading && (
        <EmptyState
          icon="📷"
          title="Sin exámenes"
          subtitle="Sube los exámenes de los alumnos (PDF de toda la clase o uno por uno)"
          actionLabel="Subir PDF de toda la clase"
          onAction={handleBulkUploadClick}
        />
      )}

      {/* Assignment status banner */}
      {examCorrections.length > 0 && hasUnassignedCorrections && (
        <div className="assignment-status-banner assignment-status-banner--warning">
          <div className="assignment-status-summary">
            <div className="assignment-status-counts">
              <span className="assignment-count assignment-count--assigned">
                <IonIcon icon={checkmarkOutline} /> {assignedExamCorrections.length} asignados
              </span>
              <span className="assignment-count assignment-count--unassigned">
                <IonIcon icon={warningOutline} /> {unassignedExamCorrections.length} sin asignar
              </span>
            </div>
            <IonProgressBar
              value={assignedExamCorrections.length / examCorrections.length}
              color="warning"
              className="assignment-progress"
            />
          </div>
          <IonButton
            size="small"
            fill="outline"
            color="warning"
            onClick={() => unassignedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Ver sin asignar
          </IonButton>
        </div>
      )}

      {/* Assigned ScanCards */}
      {assignedExamCorrections.length > 0 && hasUnassignedCorrections && (
        <div className="assignment-section-header">
          <IonIcon icon={checkmarkCircleOutline} color="success" />
          <span>Asignados ({assignedExamCorrections.length})</span>
        </div>
      )}
      <div className="correction-scans">
        {(hasUnassignedCorrections ? assignedExamCorrections : examCorrections).map((correction, i) => {
          const local = localGrades[correction.id] || { grade: correction.grade, teacherComments: '', studentId: correction.studentId || '' };
          const isSaved = !!correction.savedAt;
          const student = students.find(s => s.id === local.studentId);
          return (
            <div key={correction.id} id={`correction-${correction.id}`}>
              <ScanCard
                index={hasUnassignedCorrections ? examCorrections.indexOf(correction) : i}
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
                onProcessAI={() => handleProcessAI(correction.id)}
                onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                onDownloadPaper={correction.paperUrl ? () => handleDownloadStudentPaper(correction.paperUrl!, student?.name) : undefined}
                onDownloadReport={correction.aiProcessed ? () => handleDownloadReport(correction.id, student?.name) : undefined}
                onDelete={() => handleDeleteCorrection(correction.id)}
                saving={saving[correction.id]}
                aiProcessing={aiProcessing[correction.id]}
                aiError={aiErrors[correction.id]}
              />
            </div>
          );
        })}
      </div>

      {/* Unassigned ScanCards */}
      {hasUnassignedCorrections && (
        <>
          <div className="assignment-section-header assignment-section-header--unassigned" ref={unassignedSectionRef}>
            <IonIcon icon={warningOutline} color="warning" />
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
                    onProcessAI={() => handleProcessAI(correction.id)}
                    onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                    onDownloadPaper={correction.paperUrl ? () => handleDownloadStudentPaper(correction.paperUrl!, student?.name) : undefined}
                    onDownloadReport={correction.aiProcessed ? () => handleDownloadReport(correction.id, student?.name) : undefined}
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
      {allSaved && examCorrections.length > 0 && (
        <div className="correction-finish">
          <IonButton expand="block" color="success" onClick={handleFinish}>
            <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar corrección
          </IonButton>
        </div>
      )}

      {/* Paper preview modal */}
      <IonModal isOpen={!!previewUrl} onDidDismiss={() => setPreviewUrl(null)} className="paper-preview-modal">
        <IonHeader>
          <IonToolbar>
            <IonTitle>Vista previa</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setPreviewUrl(null)}>
                <IonIcon icon={closeOutline} />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="paper-preview-content" scrollY={false}>
          {previewUrl && (
            <div className="paper-preview-container">
              {previewUrl.toLowerCase().endsWith('.pdf') ? (
                <iframe src={previewUrl} title="Examen" className="paper-preview-pdf" />
              ) : (
                <img src={previewUrl} alt="Examen" className="paper-preview-img" />
              )}
            </div>
          )}
        </IonContent>
      </IonModal>

      {/* Duplicate Assignment Conflict Dialog */}
      <IonAlert
        isOpen={!!duplicateConflict}
        header="Examen duplicado"
        message={`${duplicateConflict?.studentName} ya tiene un examen asignado. ¿Qué quieres hacer?`}
        buttons={[
          {
            text: 'Cancelar',
            role: 'cancel',
            handler: () => setDuplicateConflict(null),
          },
          {
            text: 'Eliminar este nuevo',
            cssClass: 'alert-button-danger',
            handler: handleDuplicateKeepExisting,
          },
          {
            text: 'Reemplazar el anterior',
            handler: handleDuplicateReplace,
          },
        ]}
        onDidDismiss={() => setDuplicateConflict(null)}
      />

      <CelebrationOverlay show={showCelebration} onDismiss={handleCelebrationDismiss} />
    </>
  );
};

export default CorrectionPanel;
