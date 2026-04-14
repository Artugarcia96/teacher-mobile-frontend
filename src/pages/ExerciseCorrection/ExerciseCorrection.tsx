import { useState, useMemo, useEffect, useRef } from 'react';
import {
  X, Upload, CheckCircle, Sparkles, Eye, Pencil, Download,
  User, Users, Check, AlertTriangle, HelpCircle,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { exerciseCorrections as ecApi, authenticatedFetch } from '../../services/api';
import { getFullPaperUrl } from '../../utils/examUrls';
import { BulkUploadResult } from '../../types';
import ScanCard from '../../components/ScanCard';
import CorrectionReviewCard from '../../components/CorrectionReviewCard';
import QRReviewTable from '../../components/QRReviewTable';
import EmptyState from '../../components/EmptyState';
import PageShell from '@/components/shared/PageShell';
import Modal from '@/components/shared/Modal';
import Spinner from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import './ExerciseCorrection.css';

const ExerciseCorrection: React.FC = () => {
  const { exerciseId } = useParams() as { exerciseId: string };
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);

  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);

  const corrections = useExerciseCorrectionStore((s) => s.corrections);
  const fetchCorrections = useExerciseCorrectionStore((s) => s.fetchCorrections);
  const updateCorrection = useExerciseCorrectionStore((s) => s.updateCorrection);
  const processAI = useExerciseCorrectionStore((s) => s.processAI);
  const finishCorrection = useExerciseCorrectionStore((s) => s.finishCorrection);
  const loading = useExerciseCorrectionStore((s) => s.loading);

  const exercise = useMemo(() => allExercises.find((e) => e.id === exerciseId), [allExercises, exerciseId]);
  const exerciseStudent = useMemo(() => allStudents.find((s) => s.id === exercise?.studentId), [allStudents, exercise?.studentId]);
  const students = useMemo(() => {
    if (!exerciseStudent) return [];
    return allStudents.filter((st) => st.classId === exerciseStudent.classId);
  }, [allStudents, exerciseStudent]);

  // Find sibling exercises (same name, same class) — mirrors ExerciseDetail logic
  const siblingExercises = useMemo<typeof allExercises>(() => {
    if (!exercise) return [];
    if (students.length === 0) return [exercise];
    const exerciseName = exercise.name || exercise.weakAreas?.join(', ') || 'Ejercicio';
    const studentIds = new Set(students.map(s => s.id));
    return allExercises.filter(e => {
      if (!studentIds.has(e.studentId)) return false;
      const eName = e.name || e.weakAreas?.join(', ') || 'Ejercicio';
      return eName === exerciseName;
    });
  }, [exercise, allExercises, students]);

  // Aggregate corrections across all sibling exercises, sorted stably by creation date
  const exerciseCorrections = useMemo(() => {
    const siblingIds = new Set(siblingExercises.map(e => e.id));
    return corrections
      .filter(c => siblingIds.has(c.exerciseId))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
  }, [corrections, siblingExercises]);

  // Group-level review mode: all siblings corrected
  const isReviewMode = useMemo(() => {
    if (siblingExercises.length === 0) return false;
    return siblingExercises.every(e => e.correctionStatus === 'corrected');
  }, [siblingExercises]);

  const [viewMode, setViewMode] = useState<'review' | 'edit'>(isReviewMode ? 'review' : 'edit');

  const [localGrades, setLocalGrades] = useState<Record<string, { grade: number | null; teacherComments: string; studentId: string }>>({});
  const localGradesRef = useRef(localGrades);
  localGradesRef.current = localGrades;
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [reviewAssignments, setReviewAssignments] = useState<Record<string, string>>({});
  const [confirmingReview, setConfirmingReview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [aiProcessing, setAiProcessing] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});

  // Auto-save (debounced 2s)
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [autoSavedIds, setAutoSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (exercise?.studentId) {
      fetchExercises(exercise.studentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise?.studentId]);

  useEffect(() => {
    if (exerciseStudent?.classId) {
      fetchStudents(exerciseStudent.classId);
    }
    if (exerciseId) {
      fetchCorrections(exerciseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseStudent?.classId, exerciseId]);

  // Fetch corrections for all sibling exercises
  const siblingIds = useMemo(() => siblingExercises.map(e => e.id).sort().join(','), [siblingExercises]);
  useEffect(() => {
    siblingIds.split(',').filter(Boolean).forEach(id => {
      if (id !== exerciseId) {
        fetchCorrections(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siblingIds, exerciseId]);

  useEffect(() => {
    setLocalGrades((prev) => {
      const next = { ...prev };
      exerciseCorrections.forEach((c) => {
        if (!next[c.id]) {
          next[c.id] = { grade: c.grade, teacherComments: c.teacherComments || '', studentId: c.studentId || '' };
        } else if (!next[c.id].studentId && c.studentId) {
          next[c.id] = { ...next[c.id], studentId: c.studentId };
        }
      });
      return next;
    });
  }, [exerciseCorrections]);

  useEffect(() => {
    if (isReviewMode) {
      setViewMode('review');
    }
  }, [isReviewMode]);

  // Cleanup auto-save timers on unmount
  useEffect(() => {
    const timers = autoSaveTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  if (!exercise) {
    return (
      <PageShell>
        <div className="flex justify-center items-center py-20">
          <Spinner />
        </div>
      </PageShell>
    );
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newCorrections: string[] = [];
      for (const file of Array.from(files)) {
        const response = await ecApi.upload(exerciseId, file);
        newCorrections.push(response.data.id);
      }
      await fetchCorrections(exerciseId);
      // Only auto-trigger AI if no unassigned corrections exist
      const hasUnassigned = exerciseCorrections.some(c => c.paperUrl && !c.studentId);
      if (!hasUnassigned) {
        // Process sequentially to avoid rate limits and DB conflicts
        for (const cId of newCorrections) {
          await handleProcessAI(cId);
        }
      }
    } catch (err) {
      console.error('Failed to upload paper:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleBulkUploadClick = () => {
    bulkInputRef.current?.click();
  };

  const handleBulkFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const classId = exerciseStudent?.classId;
    if (!classId) return;
    setBulkUploading(true);
    try {
      // Use class-level bulk upload so each student's QR routes to their own exercise
      const siblingIds = siblingExercises.map(ex => ex.id);
      const response = await ecApi.classBulkUpload(classId, Array.from(files), siblingIds);
      const data = response.data;
      const result: BulkUploadResult = {
        autoMatched: (data.auto_matched || []).map((m: any) => ({
          correctionId: m.correction_id,
          studentId: m.student_id,
          studentName: m.student_name,
          studentCode: m.student_code || '',
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
      };

      const initialAssignments: Record<string, string> = {};
      result.autoMatched.forEach((m) => {
        initialAssignments[m.correctionId] = m.studentId;
      });
      setReviewAssignments(initialAssignments);
      setBulkResult(result);

      // Fetch corrections for all sibling exercises
      for (const ex of siblingExercises) {
        await fetchCorrections(ex.id);
      }
    } catch (err) {
      console.error('Failed to bulk upload papers:', err);
    } finally {
      setBulkUploading(false);
      e.target.value = '';
    }
  };

  const assignedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    exerciseCorrections.forEach((c) => { if (c.studentId) ids.add(c.studentId); });
    if (bulkResult) {
      bulkResult.autoMatched.forEach((m) => ids.add(m.studentId));
      Object.values(reviewAssignments).forEach((sid) => { if (sid) ids.add(sid); });
    }
    return ids;
  }, [exerciseCorrections, bulkResult, reviewAssignments]);

  const handleReviewAssignment = (correctionId: string, studentId: string) => {
    setReviewAssignments(prev => ({ ...prev, [correctionId]: studentId }));
  };

  const handleConfirmReviewAssignments = async () => {
    setConfirmingReview(true);
    const assignedCorrectionIds: string[] = [];

    for (const [correctionId, studentId] of Object.entries(reviewAssignments)) {
      if (studentId) {
        try {
          await updateCorrection(correctionId, { student_id: studentId });
          assignedCorrectionIds.push(correctionId);
        } catch (err) {
          console.error('Failed to assign student:', err);
        }
      }
    }

    for (const ex of siblingExercises) {
      await fetchCorrections(ex.id);
    }

    const allCorrectionIds = [
      ...assignedCorrectionIds,
      ...(bulkResult?.autoMatched.map((m) => m.correctionId) || []),
    ].filter(cId => {
      const correction = exerciseCorrections.find((c) => c.id === cId);
      return correction && !correction.aiAnalysis;
    });

    setBulkResult(null);
    setReviewAssignments({});
    setConfirmingReview(false);

    // Process AI sequentially with delay to avoid 429 rate limits
    for (let i = 0; i < allCorrectionIds.length; i++) {
      await handleProcessAI(allCorrectionIds[i], true);
      if (i < allCorrectionIds.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    // Batch re-fetch at the end
    const fetchedIds = new Set<string>();
    for (const cId of allCorrectionIds) {
      const c = exerciseCorrections.find(x => x.id === cId);
      const exId = c?.exerciseId || exerciseId;
      if (!fetchedIds.has(exId)) {
        fetchedIds.add(exId);
        await fetchCorrections(exId);
      }
    }
  };


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
        const correction = exerciseCorrections.find(c => c.id === correctionId);
        await fetchCorrections(correction?.exerciseId || exerciseId);
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
      const correction = exerciseCorrections.find(c => c.id === correctionId);
      await ecApi.delete(correctionId);
      await fetchCorrections(correction?.exerciseId || exerciseId);
    } catch (err) {
      console.error('Failed to delete correction:', err);
    }
  };

  const handleFinish = async () => {
    try {
      // Finish all sibling exercises
      for (const ex of siblingExercises) {
        await finishCorrection(ex.id);
      }
      navigate(-1);
    } catch (err) {
      console.error('Failed to finish:', err);
    }
  };

  const handleDownloadPaper = (paperUrl: string, studentName?: string) => {
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
          ? `${exercise.name || 'Ejercicio'}_${studentName}.${ext}`
          : `${exercise.name || 'Ejercicio'}.${ext}`;
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

  const savedCount = exerciseCorrections.filter((c) => c.savedAt).length;
  const totalPapers = exerciseCorrections.length || 1;
  const progress = totalPapers > 0 ? savedCount / totalPapers : 0;
  const allSaved = savedCount === exerciseCorrections.length && exerciseCorrections.length > 0;
  const totalPoints = exercise.maxScore || 10;
  const exerciseName = exercise.name || exercise.weakAreas?.join(', ') || 'Ejercicio';

  // Assignment grouping
  const assignedCorrections = useMemo(() =>
    exerciseCorrections.filter(c => !!c.studentId),
    [exerciseCorrections]
  );
  const unassignedCorrections = useMemo(() =>
    exerciseCorrections.filter(c => !c.studentId),
    [exerciseCorrections]
  );
  const hasUnassigned = unassignedCorrections.length > 0;
  const unassignedSectionRef = useRef<HTMLDivElement>(null);

  return (
    <PageShell
      title={exerciseName}
      headerActions={
        <div className="flex items-center gap-2">
          {isReviewMode ? (
            <Badge className="bg-green-600 text-white">Corregido</Badge>
          ) : (
            <Badge variant={progress >= 1 ? 'default' : 'secondary'} className={progress >= 1 ? 'bg-green-600 text-white' : ''}>
              {savedCount}/{totalPapers}
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <X size={18} />
          </Button>
        </div>
      }
      noPadding
    >
      {/* View mode tabs for review mode */}
      {isReviewMode && (
        <div className="px-4 py-2 border-b border-border">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
            <TabsList className="w-full">
              <TabsTrigger value="review" className="flex-1 gap-1">
                <Eye size={14} />
                Revisar
              </TabsTrigger>
              <TabsTrigger value="edit" className="flex-1 gap-1">
                <Pencil size={14} />
                Editar
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}
      {!isReviewMode && (
        <div className="px-4 pt-1">
          <Progress value={progress * 100} className={`h-1.5 ${progress >= 1 ? '[&>div]:bg-green-600' : ''}`} />
        </div>
      )}

      <div className="exercise-correction-content">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleFilesSelected}
        />
        <input
          type="file"
          ref={bulkInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleBulkFilesSelected}
        />

        {viewMode === 'review' ? (
          <>
            {exerciseCorrections.length === 0 ? (
              <EmptyState
                icon="📋"
                title="Sin correcciones"
                subtitle="No hay correcciones para este ejercicio"
              />
            ) : (
              <div className="correction-review-list">
                {exerciseCorrections
                  .map(correction => {
                    const student = students.find(s => s.id === correction.studentId);
                    return { ...correction, studentName: student?.name || 'Alumno' };
                  })
                  .sort((a, b) => a.studentName.localeCompare(b.studentName))
                  .map((correction, i) => (
                    <CorrectionReviewCard
                      key={correction.id}
                      index={i}
                      studentName={correction.studentName}
                      grade={correction.grade}
                      maxScore={totalPoints}
                      teacherComments={correction.teacherComments}
                      weakAreas={correction.weakAreas}
                      aiAnalysis={correction.aiAnalysis}
                      aiProcessed={!!correction.aiAnalysis}
                      paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                      onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                      onDownloadPaper={correction.paperUrl ? () => handleDownloadPaper(correction.paperUrl!, correction.studentName) : undefined}
                      onGradeChange={async (newGrade) => {
                        setSaving((prev) => ({ ...prev, [correction.id]: true }));
                        try {
                          await updateCorrection(correction.id, { grade: newGrade });
                          await fetchCorrections(correction.exerciseId);
                        } catch (err) {
                          console.error('Failed to update grade:', err);
                        } finally {
                          setSaving((prev) => ({ ...prev, [correction.id]: false }));
                        }
                      }}
                      savingGrade={saving[correction.id]}
                    />
                  ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Bulk review results */}
            {bulkResult && (
              <div className="bulk-review-section" style={{ margin: 'var(--space-md)', background: 'var(--color-surface, #fff)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', padding: 'var(--space-md)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="bulk-review-stats" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                    <Check size={14} />
                    {bulkResult.autoMatched.length} detectados
                  </span>
                  {bulkResult.needsReview.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                      <AlertTriangle size={14} />
                      {bulkResult.needsReview.length} pendientes
                    </span>
                  )}
                  {bulkResult.studentsWithoutPapers.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                      <HelpCircle size={14} />
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

                <div style={{ marginTop: 'var(--space-md)' }}>
                  {bulkResult.needsReview.some(item => !reviewAssignments[item.correctionId]) && (
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                      <AlertTriangle size={16} /> Asigna todos los ejercicios pendientes para analizar con IA
                    </p>
                  )}
                  <Button
                    className="w-full"
                    onClick={handleConfirmReviewAssignments}
                    disabled={confirmingReview || bulkResult.needsReview.some(item => !reviewAssignments[item.correctionId])}
                  >
                    {confirmingReview ? (
                      <><Spinner size={18} /> Asignando y analizando...</>
                    ) : (
                      <><Sparkles size={16} /> Confirmar y analizar con IA</>
                    )}
                  </Button>
                  <Button
                    className="w-full mt-2"
                    variant="ghost"
                    onClick={() => { setBulkResult(null); setReviewAssignments({}); }}
                    disabled={confirmingReview}
                  >
                    Omitir
                  </Button>
                </div>
              </div>
            )}

            <div className="exercise-correction-toolbar">
              <Button size="sm" variant="outline" onClick={handleBulkUploadClick} disabled={bulkUploading}>
                {bulkUploading ? <Spinner size={16} /> : <><Users size={14} /> Subir PDF de toda la clase</>}
              </Button>

              <Button size="sm" variant="outline" onClick={handleUploadClick} disabled={uploading}>
                {uploading ? <Spinner size={16} /> : <><User size={14} /> Subir ejercicio individual</>}
              </Button>

              {exerciseCorrections.filter(c => !c.aiAnalysis && c.paperUrl).length > 0 && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={async () => {
                    const toProcess = exerciseCorrections
                      .filter(c => !c.aiAnalysis && c.paperUrl && c.studentId);
                    for (let i = 0; i < toProcess.length; i++) {
                      await handleProcessAI(toProcess[i].id, true);
                      // Small delay between calls to avoid 429 rate limits
                      if (i < toProcess.length - 1) {
                        await new Promise(r => setTimeout(r, 1500));
                      }
                    }
                    // Batch re-fetch all sibling corrections at the end
                    const fetchedIds = new Set<string>();
                    for (const c of toProcess) {
                      const exId = c.exerciseId;
                      if (!fetchedIds.has(exId)) {
                        fetchedIds.add(exId);
                        await fetchCorrections(exId);
                      }
                    }
                  }}
                  disabled={exerciseCorrections.some(c => c.paperUrl && !c.studentId)}
                  title={exerciseCorrections.some(c => c.paperUrl && !c.studentId) ? 'Asigna todos los ejercicios a un alumno primero' : undefined}
                >
                  <Sparkles size={14} />
                  Analizar con IA
                </Button>
              )}

              {allSaved && (
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleFinish}>
                  <CheckCircle size={14} /> Finalizar
                </Button>
              )}
            </div>

            {loading && exerciseCorrections.length === 0 && (
              <div className="exercise-correction-loading"><Spinner /></div>
            )}

            {exerciseCorrections.length === 0 && !loading && (
              <EmptyState
                icon="📝"
                title="Sin correcciones"
                subtitle="Sube los ejercicios de los alumnos (PDF de toda la clase o uno por uno)"
                actionLabel="Subir PDF de toda la clase"
                onAction={handleBulkUploadClick}
              />
            )}

            {/* Assignment status banner */}
            {exerciseCorrections.length > 0 && hasUnassigned && (
              <div className="assignment-status-banner assignment-status-banner--warning">
                <div className="assignment-status-summary">
                  <div className="assignment-status-counts">
                    <span className="assignment-count assignment-count--assigned">
                      <CheckCircle size={14} /> {assignedCorrections.length} asignados
                    </span>
                    <span className="assignment-count assignment-count--unassigned">
                      <AlertTriangle size={14} /> {unassignedCorrections.length} sin asignar
                    </span>
                  </div>
                  <Progress
                    value={(assignedCorrections.length / exerciseCorrections.length) * 100}
                    className="assignment-progress h-1"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => unassignedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  Ver sin asignar
                </Button>
              </div>
            )}

            {/* Assigned corrections */}
            {assignedCorrections.length > 0 && hasUnassigned && (
              <div className="assignment-section-header">
                <CheckCircle size={16} className="text-green-600" />
                <span>Asignados ({assignedCorrections.length})</span>
              </div>
            )}
            <div className="exercise-correction-scans">
              {assignedCorrections.map((correction, i) => {
                const local = localGrades[correction.id] || { grade: correction.grade, teacherComments: '', studentId: correction.studentId || '' };
                const isSaved = !!correction.savedAt;
                return (
                  <ScanCard
                    key={correction.id}
                    index={exerciseCorrections.indexOf(correction)}
                    aiAnalysis={correction.aiAnalysis}
                    selectedStudentId={local.studentId}
                    students={students}
                    maxScore={totalPoints}
                    grade={local.grade}
                    originalGrade={correction.grade}
                    teacherComments={local.teacherComments}
                    saved={isSaved}
                    autoSaved={autoSavedIds.has(correction.id)}
                    paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                    onStudentChange={(sid) => handleStudentChange(correction.id, sid)}
                    onGradeChange={(g) => handleGradeChange(correction.id, g)}
                    onCommentsChange={(n) => handleCommentsChange(correction.id, n)}
                    onSave={() => handleSavePaper(correction.id)}
                    onProcessAI={() => handleProcessAI(correction.id)}
                    onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                    onDelete={() => handleDeleteCorrection(correction.id)}
                    saving={saving[correction.id]}
                    aiProcessing={aiProcessing[correction.id]}
                    aiError={aiErrors[correction.id]}
                  />
                );
              })}
            </div>

            {/* Unassigned corrections */}
            {unassignedCorrections.length > 0 && (
              <>
                <div className="assignment-section-header assignment-section-header--unassigned" ref={unassignedSectionRef}>
                  <AlertTriangle size={16} className="text-amber-600" />
                  <span>Sin asignar ({unassignedCorrections.length})</span>
                </div>
                <div className="exercise-correction-scans exercise-correction-scans--unassigned">
                  {unassignedCorrections.map((correction) => {
                    const local = localGrades[correction.id] || { grade: correction.grade, teacherComments: '', studentId: correction.studentId || '' };
                    const isSaved = !!correction.savedAt;
                    return (
                      <ScanCard
                        key={correction.id}
                        index={exerciseCorrections.indexOf(correction)}
                        aiAnalysis={correction.aiAnalysis}
                        selectedStudentId={local.studentId}
                        students={students}
                        maxScore={totalPoints}
                        grade={local.grade}
                        originalGrade={correction.grade}
                        teacherComments={local.teacherComments}
                        saved={isSaved}
                        autoSaved={autoSavedIds.has(correction.id)}
                        paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                        onStudentChange={(sid) => handleStudentChange(correction.id, sid)}
                        onGradeChange={(g) => handleGradeChange(correction.id, g)}
                        onCommentsChange={(n) => handleCommentsChange(correction.id, n)}
                        onSave={() => handleSavePaper(correction.id)}
                        onProcessAI={() => handleProcessAI(correction.id)}
                        onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                        onDelete={() => handleDeleteCorrection(correction.id)}
                        saving={saving[correction.id]}
                        aiProcessing={aiProcessing[correction.id]}
                        aiError={aiErrors[correction.id]}
                      />
                    );
                  })}
                </div>
              </>
            )}


            {!allSaved && exerciseCorrections.length > 0 && (
              <div className="exercise-correction-finish">
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={handleFinish}>
                  <CheckCircle size={16} /> Finalizar correccion
                </Button>
              </div>
            )}
          </>
        )}

        {/* Paper preview modal */}
        <Modal
          open={!!previewUrl}
          onClose={() => setPreviewUrl(null)}
          title="Vista previa"
          sheetHeight="full"
        >
          <div className="paper-preview-content">
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
      </div>
    </PageShell>
  );
};

export default ExerciseCorrection;
