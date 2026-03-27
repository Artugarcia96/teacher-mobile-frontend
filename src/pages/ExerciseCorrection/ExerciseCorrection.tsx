import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonProgressBar, IonBadge, IonSpinner, IonModal, IonChip,
  IonSegment, IonSegmentButton, IonLabel,
} from '@ionic/react';
import { closeOutline, cloudUploadOutline, checkmarkCircleOutline, sparkles, eyeOutline, pencilOutline, downloadOutline, personOutline, peopleOutline, checkmarkOutline, warningOutline, helpOutline } from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { exerciseCorrections as ecApi } from '../../services/api';
import { BulkUploadResult } from '../../types';
import ScanCard from '../../components/ScanCard';
import CorrectionReviewCard from '../../components/CorrectionReviewCard';
import QRReviewTable from '../../components/QRReviewTable';
import EmptyState from '../../components/EmptyState';
import './ExerciseCorrection.css';

const ExerciseCorrection: React.FC = () => {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const history = useHistory();
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
      <IonPage>
        <IonContent className="ion-padding">
          <IonSpinner />
        </IonContent>
      </IonPage>
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

  const getFullPaperUrl = (paperUrl?: string) => {
    if (!paperUrl) return null;
    if (paperUrl.startsWith('http')) return paperUrl;
    let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (paperUrl.startsWith('/uploads/')) {
      return `${baseUrl}/files${paperUrl.replace('/uploads', '')}`;
    }
    return `${baseUrl}${paperUrl}`;
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
      history.goBack();
    } catch (err) {
      console.error('Failed to finish:', err);
    }
  };

  const handleDownloadPaper = (paperUrl: string, studentName?: string) => {
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
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => history.goBack()}>
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonButtons>
          <IonTitle>{exerciseName}</IonTitle>
          <IonButtons slot="end">
            {isReviewMode ? (
              <IonBadge color="success" className="progress-badge">Corregido</IonBadge>
            ) : (
              <IonBadge color={progress >= 1 ? 'success' : 'primary'} className="progress-badge">
                {savedCount}/{totalPapers}
              </IonBadge>
            )}
          </IonButtons>
        </IonToolbar>
        {isReviewMode && (
          <IonToolbar>
            <IonSegment value={viewMode} onIonChange={(e) => setViewMode(e.detail.value as typeof viewMode)}>
              <IonSegmentButton value="review">
                <IonIcon icon={eyeOutline} />
                <IonLabel>Revisar</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="edit">
                <IonIcon icon={pencilOutline} />
                <IonLabel>Editar</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </IonToolbar>
        )}
        {!isReviewMode && <IonProgressBar value={progress} color={progress >= 1 ? 'success' : 'primary'} />}
      </IonHeader>

      <IonContent className="exercise-correction-content">
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
              <div className="bulk-review-section" style={{ margin: 'var(--space-md)', background: 'var(--ion-card-background, #fff)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', padding: 'var(--space-md)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="bulk-review-stats" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
                  <IonChip color="success">
                    <IonIcon icon={checkmarkOutline} />
                    {bulkResult.autoMatched.length} detectados
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
                      {bulkResult.studentsWithoutPapers.length} sin ejercicio
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
                      <IonIcon icon={warningOutline} /> Asigna todos los ejercicios pendientes para analizar con IA
                    </p>
                  )}
                  <IonButton
                    expand="block"
                    onClick={handleConfirmReviewAssignments}
                    disabled={confirmingReview || bulkResult.needsReview.some(item => !reviewAssignments[item.correctionId])}
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

            <div className="exercise-correction-toolbar">
              <IonButton size="small" fill="outline" color="secondary" onClick={handleBulkUploadClick} disabled={bulkUploading}>
                {bulkUploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={peopleOutline} slot="start" /> Subir PDF de toda la clase</>}
              </IonButton>

              <IonButton size="small" fill="outline" onClick={handleUploadClick} disabled={uploading}>
                {uploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={personOutline} slot="start" /> Subir ejercicio individual</>}
              </IonButton>

              {exerciseCorrections.filter(c => !c.aiAnalysis && c.paperUrl).length > 0 && (
                <IonButton
                  size="small"
                  color="tertiary"
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
                  <IonIcon icon={sparkles} slot="start" />
                  Analizar con IA
                </IonButton>
              )}

              {allSaved && (
                <IonButton size="small" color="success" onClick={handleFinish}>
                  <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar
                </IonButton>
              )}
            </div>

            {loading && exerciseCorrections.length === 0 && (
              <div className="exercise-correction-loading"><IonSpinner /></div>
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
                      <IonIcon icon={checkmarkCircleOutline} /> {assignedCorrections.length} asignados
                    </span>
                    <span className="assignment-count assignment-count--unassigned">
                      <IonIcon icon={warningOutline} /> {unassignedCorrections.length} sin asignar
                    </span>
                  </div>
                  <IonProgressBar
                    value={assignedCorrections.length / exerciseCorrections.length}
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

            {/* Assigned corrections */}
            {assignedCorrections.length > 0 && hasUnassigned && (
              <div className="assignment-section-header">
                <IonIcon icon={checkmarkCircleOutline} color="success" />
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
                  <IonIcon icon={warningOutline} color="warning" />
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
                <IonButton expand="block" color="success" onClick={handleFinish}>
                  <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar corrección
                </IonButton>
              </div>
            )}
          </>
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
                  <iframe src={previewUrl} title="Ejercicio" className="paper-preview-pdf" />
                ) : (
                  <img src={previewUrl} alt="Ejercicio" className="paper-preview-img" />
                )}
              </div>
            )}
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default ExerciseCorrection;
