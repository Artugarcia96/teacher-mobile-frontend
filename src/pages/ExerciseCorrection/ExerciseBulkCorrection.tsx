import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  X, Upload, CheckCircle, Check,
  AlertTriangle, HelpCircle, Sparkles, ArrowLeft,
  Users, ChevronRight, FileText,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useClassesStore } from '../../store/classesStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { exerciseCorrections as ecApi, batch, authenticatedFetch } from '../../services/api';
import { getFullPaperUrl } from '../../utils/examUrls';
import { Exercise, BulkUploadResult } from '../../types';
import ScanCard from '../../components/ScanCard';
import QRReviewTable from '../../components/QRReviewTable';

import EmptyState from '../../components/EmptyState';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import PageShell from '@/components/shared/PageShell';
import Modal from '@/components/shared/Modal';
import Searchbar from '@/components/shared/Searchbar';
import Spinner from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import './ExerciseBulkCorrection.css';

type Step = 'select' | 'upload' | 'review' | 'correct';

interface ExerciseGroup {
  name: string;
  exercises: Exercise[];
  studentCount: number;
  correctedCount: number;
}

const ExerciseBulkCorrection: React.FC = () => {
  const { classId } = useParams() as { classId: string };
  const navigate = useNavigate();
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);

  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);

  const corrections = useExerciseCorrectionStore((s) => s.corrections);
  const fetchCorrections = useExerciseCorrectionStore((s) => s.fetchCorrections);
  const updateCorrection = useExerciseCorrectionStore((s) => s.updateCorrection);
  const processAI = useExerciseCorrectionStore((s) => s.processAI);
  const finishCorrection = useExerciseCorrectionStore((s) => s.finishCorrection);

  const [step, setStep] = useState<Step>('select');
  const [searchText, setSearchText] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<ExerciseGroup | null>(null);

  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [reviewAssignments, setReviewAssignments] = useState<Record<string, string>>({});
  const [confirmingReview, setConfirmingReview] = useState(false);

  const [localGrades, setLocalGrades] = useState<Record<string, { grade: number | null; teacherComments: string; studentId: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [aiProcessing, setAiProcessing] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbBlobUrls, setThumbBlobUrls] = useState<Record<string, string>>({});
  const thumbBlobUrlsRef = useRef<Record<string, string>>({});

  const classGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);
  const studentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);

  const exercises = useMemo(() =>
    allExercises.filter((e) => studentIds.has(e.studentId)),
    [allExercises, studentIds]
  );

  const groupedExercises = useMemo(() => {
    const groups = new Map<string, Exercise[]>();
    exercises.forEach((ex) => {
      const key = ex.name || ex.weakAreas?.join(', ') || 'Ejercicio';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ex);
    });

    return Array.from(groups.entries())
      .map(([name, exs]): ExerciseGroup => ({
        name,
        exercises: exs,
        studentCount: exs.length,
        correctedCount: exs.filter(e => e.correctionStatus === 'corrected').length,
      }))
      .sort((a, b) => b.exercises[0]?.assignedAt?.localeCompare(a.exercises[0]?.assignedAt || '') || 0);
  }, [exercises]);

  const filteredGroups = useMemo(() => {
    if (!searchText.trim()) return groupedExercises;
    const q = searchText.toLowerCase();
    return groupedExercises.filter(g => g.name.toLowerCase().includes(q));
  }, [groupedExercises, searchText]);

  const groupExerciseIds = useMemo(() =>
    selectedGroup?.exercises.map(e => e.id) || [],
    [selectedGroup]
  );

  const groupCorrections = useMemo(() => {
    const ids = new Set(groupExerciseIds);
    return corrections.filter((c) => ids.has(c.exerciseId));
  }, [corrections, groupExerciseIds]);

  useEffect(() => {
    fetchClasses();
    fetchStudents(classId);
    fetchExercises();
  }, [classId, fetchClasses, fetchStudents, fetchExercises]);

  useEffect(() => {
    if (selectedGroup) {
      selectedGroup.exercises.forEach(ex => fetchCorrections(ex.id));
    }
  }, [selectedGroup, fetchCorrections]);

  useEffect(() => {
    setLocalGrades((prev) => {
      const next = { ...prev };
      groupCorrections.forEach((c) => {
        if (!next[c.id]) {
          next[c.id] = { grade: c.grade, teacherComments: c.teacherComments || '', studentId: c.studentId || '' };
        } else if (!next[c.id].studentId && c.studentId) {
          next[c.id] = { ...next[c.id], studentId: c.studentId };
        }
      });
      return next;
    });
  }, [groupCorrections]);

  const handleSelectGroup = (group: ExerciseGroup) => {
    setSelectedGroup(group);
    setStep('upload');
  };

  const handleBulkUploadClick = () => {
    bulkInputRef.current?.click();
  };

  const handleBulkFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setBulkUploading(true);
    try {
      const response = await ecApi.classBulkUpload(classId, Array.from(files), groupExerciseIds);
      const data = response.data;

      const result: BulkUploadResult = {
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
      };

      const initialAssignments: Record<string, string> = {};
      result.autoMatched.forEach((m) => {
        initialAssignments[m.correctionId] = m.studentId;
      });
      setReviewAssignments(initialAssignments);
      setBulkResult(result);
      setStep('review');

      for (const ex of selectedGroup!.exercises) {
        await fetchCorrections(ex.id);
      }
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

  const assignedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    groupCorrections.forEach((c) => { if (c.studentId) ids.add(c.studentId); });
    if (bulkResult) {
      Object.values(reviewAssignments).forEach((sid) => { if (sid) ids.add(sid); });
    }
    return ids;
  }, [groupCorrections, bulkResult, reviewAssignments]);

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

    setBulkResult(null);
    setReviewAssignments({});

    for (const ex of selectedGroup!.exercises) {
      await fetchCorrections(ex.id);
    }

    setStep('correct');

    if (assignedCorrectionIds.length > 1) {
      try {
        const res = await batch.startBatchExerciseCorrection(groupExerciseIds, assignedCorrectionIds);
        const jobId = res.data.id;
        registerExerciseCorrectionBackgroundTask(jobId, selectedGroup?.name || 'Ejercicios');
      } catch (err) {
        console.error('Failed to start batch correction:', err);
        for (const cId of assignedCorrectionIds) {
          handleProcessAI(cId);
        }
      }
    } else if (assignedCorrectionIds.length === 1) {
      handleProcessAI(assignedCorrectionIds[0]);
    }

    setConfirmingReview(false);
  };


  const fetchAuthenticatedImage = useCallback(async (url: string, correctionId: string) => {
    try {
      const res = await authenticatedFetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      thumbBlobUrlsRef.current[correctionId] = blobUrl;
      setThumbBlobUrls((prev) => ({ ...prev, [correctionId]: blobUrl }));
    } catch (err) {
      console.error('Failed to load image:', err);
    }
  }, []);

  // Load thumbnails when entering review step
  useEffect(() => {
    if (step !== 'review' || !bulkResult) return;

    const allItems = [
      ...bulkResult.autoMatched.map((m) => m.correctionId),
      ...bulkResult.needsReview.map((r) => r.correctionId),
    ];

    allItems.forEach((correctionId) => {
      if (thumbBlobUrls[correctionId]) return; // Already loaded
      const correction = groupCorrections.find((c) => c.id === correctionId);
      const paperUrl = getFullPaperUrl(correction?.paperUrl);
      if (paperUrl) {
        fetchAuthenticatedImage(paperUrl, correctionId);
      }
    });
  }, [step, bulkResult, groupCorrections, thumbBlobUrls, getFullPaperUrl, fetchAuthenticatedImage]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(thumbBlobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);


  const handleStudentChange = (correctionId: string, studentId: string) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], studentId } }));
  };

  const handleGradeChange = (correctionId: string, grade: number) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], grade } }));
  };

  const handleCommentsChange = (correctionId: string, teacherComments: string) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], teacherComments } }));
  };

  const handleSavePaper = async (correctionId: string) => {
    const local = localGrades[correctionId];
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

  const handleProcessAI = async (correctionId: string) => {
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
      for (const ex of selectedGroup!.exercises) {
        await fetchCorrections(ex.id);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message || 'Error desconocido';
      setAiErrors((prev) => ({ ...prev, [correctionId]: errorMsg }));
    } finally {
      setAiProcessing((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  const registerExerciseCorrectionBackgroundTask = (jobId: string, label: string) => {
    const capturedClassId = classId;
    const capturedGroup = selectedGroup;
    addBackgroundTask({
      type: 'exercises',
      label: `Correccion: ${label}`,
      description: 'La IA revisa los ejercicios de cada alumno y genera comentarios detallados.',
      batchJobId: jobId,
      expectedResultUrl: `/exercise-bulk-correction/${capturedClassId}`,
      execute: async () => {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        let interval = 3000;
        while (true) {
          await sleep(interval);
          const res = await batch.getJobProgress(jobId);
          const status = res.data.status;
          if (status === 'completed') break;
          if (status === 'failed' || status === 'cancelled') {
            throw new Error('Error en la correccion');
          }
          interval = Math.min(interval + 500, 8000);
        }
        if (capturedGroup) {
          for (const ex of capturedGroup.exercises) {
            await fetchCorrections(ex.id);
          }
        }
        return `/exercise-bulk-correction/${capturedClassId}`;
      },
    });
  };

  const handleBatchProcessAll = async () => {
    const unprocessedIds = groupCorrections
      .filter(c => !c.aiAnalysis && c.studentId)
      .map(c => c.id);
    if (unprocessedIds.length === 0) return;

    try {
      const res = await batch.startBatchExerciseCorrection(groupExerciseIds, unprocessedIds);
      const jobId = res.data.id;
      registerExerciseCorrectionBackgroundTask(jobId, selectedGroup?.name || 'Ejercicios');
    } catch (err) {
      console.error('Failed to start batch:', err);
    }
  };


  const handleFinishAll = async () => {
    if (!selectedGroup) return;
    try {
      for (const ex of selectedGroup.exercises) {
        await finishCorrection(ex.id);
      }
      navigate(-1);
    } catch (err) {
      console.error('Failed to finish:', err);
    }
  };

  const totalPoints = useMemo(() => {
    if (!selectedGroup) return 10;
    const first = selectedGroup.exercises[0];
    return first?.maxScore || 10;
  }, [selectedGroup]);

  const savedCount = groupCorrections.filter((c) => c.savedAt).length;
  const totalPapers = groupCorrections.length;
  const progress = totalPapers > 0 ? savedCount / totalPapers : 0;
  const unprocessedCount = groupCorrections.filter(c => !c.aiAnalysis && c.studentId).length;

  const stepTitle = () => {
    if (step === 'select') return 'Seleccionar ejercicio';
    if (step === 'upload') return selectedGroup?.name || 'Subir correcciones';
    if (step === 'review') return 'Revisar asignaciones';
    return `Corregir: ${selectedGroup?.name || 'Ejercicios'}`;
  };

  const handleBack = () => {
    if (step === 'correct') setStep('upload');
    else if (step === 'review') setStep('upload');
    else if (step === 'upload') { setSelectedGroup(null); setStep('select'); }
    else navigate(-1);
  };

  return (
    <PageShell
      title={stepTitle()}
      headerActions={
        <div className="flex items-center gap-2">
          {step === 'correct' && (
            <Badge variant={progress >= 1 ? 'default' : 'secondary'} className={progress >= 1 ? 'bg-green-600 text-white' : ''}>
              {savedCount}/{totalPapers}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={step === 'select' ? () => navigate(-1) : handleBack}
          >
            {step === 'select' ? <X size={18} /> : <ArrowLeft size={18} />}
          </Button>
        </div>
      }
      noPadding
    >
      {step === 'correct' && (
        <div className="px-4 pt-1">
          <Progress value={progress * 100} className={`h-1.5 ${progress >= 1 ? '[&>div]:bg-green-600' : ''}`} />
        </div>
      )}

      <div className="ebc-content">
        <input
          type="file"
          ref={bulkInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleBulkFilesSelected}
        />

        {/* STEP 1: Select exercise group */}
        {step === 'select' && (
          <div className="ebc-select-step">
            <div className="ebc-select-header">
              <h2 className="ebc-select-title">Selecciona el ejercicio a corregir</h2>
              <p className="ebc-select-subtitle">
                {classGroup?.name} -- {groupedExercises.length} grupo{groupedExercises.length !== 1 ? 's' : ''} de ejercicios
              </p>
            </div>

            <Searchbar
              value={searchText}
              onChange={setSearchText}
              placeholder="Buscar ejercicio..."
              className="mb-3"
            />

            {filteredGroups.length === 0 ? (
              <EmptyState
                icon="📚"
                title="Sin ejercicios"
                subtitle={searchText ? 'No se encontraron ejercicios con ese nombre' : 'Genera ejercicios primero desde la pagina de ejercicios'}
              />
            ) : (
              <div className="ebc-group-list">
                {filteredGroups.map((group) => {
                  const isPending = group.correctedCount < group.studentCount;
                  return (
                    <div
                      key={group.name}
                      className="ebc-group-item"
                      onClick={() => handleSelectGroup(group)}
                    >
                      <div className="ebc-group-icon">
                        <FileText size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="ebc-group-name">{group.name}</h3>
                        <p className="ebc-group-meta">
                          <Users size={12} />
                          {group.studentCount} alumno{group.studentCount !== 1 ? 's' : ''}
                          {' \u00b7 '}
                          {group.correctedCount}/{group.studentCount} corregidos
                        </p>
                      </div>
                      <div className="ebc-group-end">
                        <Badge variant={isPending ? 'outline' : 'default'} className={isPending ? 'text-amber-600 border-amber-300' : 'bg-green-600 text-white'}>
                          {isPending ? 'Pendiente' : 'Completo'}
                        </Badge>
                        <ChevronRight size={16} className="ebc-group-arrow" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Upload papers */}
        {step === 'upload' && selectedGroup && (
          <div className="ebc-upload-step">
            <div className="ebc-upload-info">
              <h2 className="ebc-upload-title">{selectedGroup.name}</h2>
              <p className="ebc-upload-subtitle">
                {selectedGroup.studentCount} alumno{selectedGroup.studentCount !== 1 ? 's' : ''}
                {' \u00b7 '}
                {selectedGroup.correctedCount} corregido{selectedGroup.correctedCount !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="ebc-upload-area" onClick={handleBulkUploadClick}>
              {bulkUploading ? (
                <div className="ebc-upload-loading">
                  <Spinner />
                  <span>Subiendo y detectando alumnos...</span>
                </div>
              ) : (
                <>
                  <Upload size={48} className="ebc-upload-icon" />
                  <h3>Subir correcciones</h3>
                  <p>Sube fotos o PDFs de las hojas completadas por los alumnos.</p>
                  <p className="ebc-upload-hint">Los codigos QR se detectaran automaticamente.</p>
                </>
              )}
            </div>

            {groupCorrections.length > 0 && (
              <div className="ebc-existing-corrections">
                <p className="ebc-existing-label">
                  Ya hay {groupCorrections.length} correccion{groupCorrections.length !== 1 ? 'es' : ''} cargada{groupCorrections.length !== 1 ? 's' : ''}.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep('correct')}
                >
                  Ver correcciones existentes
                </Button>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Review assignments */}
        {step === 'review' && bulkResult && (() => {
          const reviewItems = [
            ...bulkResult.autoMatched.map((m) => ({
              correctionId: m.correctionId,
              detectedCode: m.studentCode,
              reason: 'auto_matched' as string,
              isAutoMatched: true,
            })),
            ...bulkResult.needsReview.map((item) => ({
              correctionId: item.correctionId,
              detectedCode: item.detectedCode,
              reason: item.reason,
              isAutoMatched: false,
            })),
          ];
          return (
            <div className="bulk-review-section">
              <div className="bulk-review-stats">
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

              <QRReviewTable
                items={reviewItems}
                itemLabel="Ejercicio"
                assignments={reviewAssignments}
                students={students}
                assignedStudentIds={assignedStudentIds}
                thumbnails={thumbBlobUrls}
                paperUrls={Object.fromEntries(
                  reviewItems
                    .map((item) => {
                      const c = groupCorrections.find((c) => c.id === item.correctionId);
                      const url = getFullPaperUrl(c?.paperUrl);
                      return url ? [item.correctionId, url] : null;
                    })
                    .filter(Boolean) as [string, string][]
                )}
                thumbsLoading={Object.keys(thumbBlobUrls).length < reviewItems.length}
                onAssign={handleReviewAssignment}
                onPreview={(url) => setPreviewUrl(url)}
              />

              <div className="bulk-review-actions">
                {bulkResult.needsReview.some(item => !reviewAssignments[item.correctionId]) && (
                  <p className="bulk-review-pending-hint">
                    <AlertTriangle size={16} /> Asigna todos los ejercicios pendientes para analizar con IA
                  </p>
                )}
                <Button
                  className="w-full bulk-review-confirm-btn"
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
                  className="w-full"
                  variant="ghost"
                  onClick={() => {
                    setBulkResult(null);
                    setReviewAssignments({});
                    setStep('correct');
                  }}
                  disabled={confirmingReview}
                >
                  Omitir analisis IA
                </Button>
              </div>
            </div>
          );
        })()}

        {/* STEP 4: Correct papers */}
        {step === 'correct' && selectedGroup && (
          <>
            <div className="ebc-correct-toolbar">
              <Button size="sm" variant="outline" onClick={handleBulkUploadClick} disabled={bulkUploading}>
                {bulkUploading ? <Spinner size={16} /> : <><Upload size={14} /> Subir mas</>}
              </Button>

              {unprocessedCount > 1 && (
                <Button
                  size="sm"
                  onClick={handleBatchProcessAll}
                  disabled={groupCorrections.some(c => c.paperUrl && !c.studentId)}
                  title={groupCorrections.some(c => c.paperUrl && !c.studentId) ? 'Asigna todos los ejercicios a un alumno primero' : undefined}
                >
                  <Sparkles size={14} /> Analizar todo ({unprocessedCount})
                </Button>
              )}

              {groupCorrections.length > 0 && (
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleFinishAll}>
                  <CheckCircle size={14} /> Finalizar
                </Button>
              )}
            </div>

            {groupCorrections.length === 0 ? (
              <EmptyState
                icon="📝"
                title="Sin correcciones"
                subtitle="Sube las hojas de ejercicios completadas por los alumnos"
                actionLabel="Subir"
                onAction={handleBulkUploadClick}
              />
            ) : (
              <div className="ebc-scans">
                {groupCorrections.map((correction, i) => {
                  const local = localGrades[correction.id] || { grade: correction.grade, teacherComments: '', studentId: correction.studentId || '' };
                  const isSaved = !!correction.savedAt;
                  return (
                    <ScanCard
                      key={correction.id}
                      index={i}
                      aiAnalysis={correction.aiAnalysis}
                      selectedStudentId={local.studentId}
                      students={students}
                      maxScore={totalPoints}
                      grade={local.grade}
                      teacherComments={local.teacherComments}
                      saved={isSaved}
                      paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                      onStudentChange={(sid) => handleStudentChange(correction.id, sid)}
                      onGradeChange={(g) => handleGradeChange(correction.id, g)}
                      onCommentsChange={(n) => handleCommentsChange(correction.id, n)}
                      onSave={() => handleSavePaper(correction.id)}
                      onProcessAI={() => handleProcessAI(correction.id)}
                      onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                      saving={saving[correction.id]}
                      aiProcessing={aiProcessing[correction.id]}
                      aiError={aiErrors[correction.id]}
                    />
                  );
                })}
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
                <img src={previewUrl} alt="Ejercicio" className="paper-preview-img" />
              </div>
            )}
          </div>
        </Modal>
      </div>
    </PageShell>
  );
};

export default ExerciseBulkCorrection;
