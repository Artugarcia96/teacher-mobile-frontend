import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonProgressBar, IonBadge, IonCard, IonCardContent,
  IonSpinner, IonSelect, IonSelectOption, IonChip, IonModal,
} from '@ionic/react';
import { closeOutline, cloudUploadOutline, checkmarkCircleOutline, checkmarkOutline, warningOutline, helpOutline, sparkles, expandOutline } from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { BulkUploadResult } from '../../types';
import ScanCard from '../../components/ScanCard';
import EmptyState from '../../components/EmptyState';
import './ExerciseCorrection.css';

const ExerciseCorrection: React.FC = () => {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const history = useHistory();
  const bulkInputRef = useRef<HTMLInputElement>(null);
  
  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  
  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  
  const corrections = useExerciseCorrectionStore((s) => s.corrections);
  const fetchCorrections = useExerciseCorrectionStore((s) => s.fetchCorrections);
  const bulkUpload = useExerciseCorrectionStore((s) => s.bulkUpload);
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
  
  const exerciseCorrections = useMemo(() => corrections.filter((c) => c.exerciseId === exerciseId), [corrections, exerciseId]);

  const [localGrades, setLocalGrades] = useState<Record<string, { grade: number | null; notes: string; studentId: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [reviewAssignments, setReviewAssignments] = useState<Record<string, string>>({});
  const [confirmingReview, setConfirmingReview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (exercise?.studentId) {
      fetchExercises(exercise.studentId);
    }
  }, [exercise?.studentId, fetchExercises]);

  useEffect(() => {
    if (exerciseStudent?.classId) {
      fetchStudents(exerciseStudent.classId);
    }
    if (exerciseId) {
      fetchCorrections(exerciseId);
    }
  }, [exerciseStudent?.classId, exerciseId, fetchStudents, fetchCorrections]);

  useEffect(() => {
    setLocalGrades((prev) => {
      const next = { ...prev };
      exerciseCorrections.forEach((c) => {
        if (!next[c.id]) {
          next[c.id] = { grade: c.grade, notes: c.teacherNotes || '', studentId: c.studentId || '' };
        } else {
          if (!next[c.id].studentId && c.studentId) {
            next[c.id] = { ...next[c.id], studentId: c.studentId };
          }
        }
      });
      return next;
    });
  }, [exerciseCorrections]);

  if (!exercise) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  const handleBulkUploadClick = () => {
    bulkInputRef.current?.click();
  };

  const handleBulkFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setBulkUploading(true);
    try {
      const result = await bulkUpload(exerciseId, Array.from(files));
      // Pre-populate auto-matched as editable proposals
      const initialAssignments: Record<string, string> = {};
      result.autoMatched.forEach((m: any) => {
        initialAssignments[m.correctionId] = m.studentId;
      });
      setReviewAssignments(initialAssignments);
      setBulkResult(result);
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
    const assignedCorrectionIds: string[] = [];
    
    // All assignments (auto-matched proposals + manual) that have a student
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
    await fetchCorrections(exerciseId);

    for (const cId of assignedCorrectionIds) {
      const correction = exerciseCorrections.find((c) => c.id === cId);
      if (correction && !correction.aiAnalysis) {
        handleProcessAI(cId);
      }
    }
    setConfirmingReview(false);
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

  const assignedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    exerciseCorrections.forEach((c) => { if (c.studentId) ids.add(c.studentId); });
    if (bulkResult) {
      bulkResult.autoMatched.forEach((m) => ids.add(m.studentId));
      Object.values(reviewAssignments).forEach((sid) => { if (sid) ids.add(sid); });
    }
    return ids;
  }, [exerciseCorrections, bulkResult, reviewAssignments]);

  const getReasonText = (reason: string) => {
    const reasons: Record<string, string> = {
      'no_code': 'Sin código detectado',
      'partial_code': 'Código parcialmente legible',
      'no_match': 'Código no coincide con ningún alumno',
      'wrong_exercise': 'Código de otro ejercicio',
      'duplicate_code': 'Código duplicado',
      'already_assigned': 'Alumno ya tiene ejercicio',
      'qr_error': 'Error al leer QR'
    };
    return reasons[reason] || reason;
  };

  const handleStudentChange = (correctionId: string, studentId: string) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], studentId } }));
  };

  const handleGradeChange = (correctionId: string, grade: number) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], grade } }));
  };

  const handleNotesChange = (correctionId: string, notes: string) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], notes } }));
  };

  const handleSavePaper = async (correctionId: string) => {
    const local = localGrades[correctionId];
    if (!local || local.grade === null) return;
    
    setSaving((prev) => ({ ...prev, [correctionId]: true }));
    try {
      const correction = exerciseCorrections.find((c) => c.id === correctionId);
      let weakAreas = correction?.aiAnalysis?.weakAreas || [];
      
      await updateCorrection(correctionId, {
        student_id: local.studentId || undefined,
        grade: local.grade,
        teacher_notes: local.notes,
        weak_areas: weakAreas,
      });
    } catch (err) {
      console.error('Failed to save correction:', err);
    } finally {
      setSaving((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  const [aiProcessing, setAiProcessing] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  
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
      
      await fetchCorrections(exerciseId);
    } catch (err: any) {
      console.error('AI processing failed:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Error desconocido';
      setAiErrors((prev) => ({ ...prev, [correctionId]: errorMsg }));
    } finally {
      setAiProcessing((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  const handleFinish = async () => {
    try {
      await finishCorrection(exerciseId);
      history.goBack();
    } catch (err) {
      console.error('Failed to finish:', err);
    }
  };

  const savedCount = exerciseCorrections.filter((c) => c.savedAt).length;
  const totalPapers = exerciseCorrections.length || students.length;
  const progress = totalPapers > 0 ? savedCount / totalPapers : 0;
  const allSaved = savedCount === exerciseCorrections.length && exerciseCorrections.length > 0;

  const totalPoints = exercise.questions?.reduce((sum, q) => sum + (q.points || 0), 0) || 10;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => history.goBack()}>
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonButtons>
          <IonTitle>Corregir: {exercise.name || 'Ejercicio'}</IonTitle>
          <IonButtons slot="end">
            <IonBadge color={progress >= 1 ? 'success' : 'primary'} className="progress-badge">
              {savedCount}/{totalPapers}
            </IonBadge>
          </IonButtons>
        </IonToolbar>
        <IonProgressBar value={progress} color={progress >= 1 ? 'success' : 'primary'} />
      </IonHeader>

      <IonContent className="exercise-correction-content">
        <input
          type="file"
          ref={bulkInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleBulkFilesSelected}
        />

        {bulkResult && (() => {
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

              <div className="bulk-review-cards">
                <p className="bulk-review-label">Revisa las asignaciones propuestas:</p>
                {reviewItems.map((item, idx) => {
                  const correction = exerciseCorrections.find((c) => c.id === item.correctionId);
                  const paperFullUrl = getFullPaperUrl(correction?.paperUrl);
                  return (
                    <IonCard key={item.correctionId} className={`bulk-review-card ${item.isAutoMatched ? 'bulk-review-card-auto' : ''}`}>
                      <IonCardContent className="bulk-review-card-content">
                        <div className="bulk-review-card-top">
                          {paperFullUrl && (
                            <div
                              className="bulk-review-thumb"
                              onClick={() => setPreviewUrl(paperFullUrl)}
                            >
                              <img src={paperFullUrl} alt={`Ejercicio ${idx + 1}`} />
                              <div className="bulk-review-thumb-overlay">
                                <IonIcon icon={expandOutline} />
                              </div>
                            </div>
                          )}
                          <div className="bulk-review-card-info">
                            <span className="bulk-review-card-index">Ejercicio {idx + 1}</span>
                            <div className="bulk-review-card-meta">
                              {item.detectedCode && <span className="detected-code">{item.detectedCode}</span>}
                              {item.isAutoMatched ? (
                                <IonBadge color="success" className="auto-badge">Auto</IonBadge>
                              ) : (
                                <span className="reason-text">{getReasonText(item.reason)}</span>
                              )}
                            </div>
                            <IonSelect
                              interface="popover"
                              placeholder="Seleccionar alumno"
                              value={reviewAssignments[item.correctionId] || ''}
                              onIonChange={(e) => handleReviewAssignment(item.correctionId, e.detail.value)}
                              className="bulk-review-select"
                            >
                              {students
                                .filter((s) => !assignedStudentIds.has(s.id) || reviewAssignments[item.correctionId] === s.id)
                                .map((s) => (
                                  <IonSelectOption key={`${item.correctionId}-${s.id}`} value={s.id}>
                                    {s.name} {s.studentId ? `(${s.studentId})` : ''}
                                  </IonSelectOption>
                                ))}
                              <IonSelectOption key={`${item.correctionId}-none`} value="">— Sin asignar —</IonSelectOption>
                            </IonSelect>
                          </div>
                        </div>
                      </IonCardContent>
                    </IonCard>
                  );
                })}
              </div>

              <div className="bulk-review-actions">
                <IonButton
                  expand="block"
                  onClick={handleConfirmReviewAssignments}
                  disabled={confirmingReview}
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
          );
        })()}

        <div className="exercise-correction-toolbar">
          <IonButton size="small" fill="outline" color="secondary" onClick={handleBulkUploadClick} disabled={bulkUploading}>
            {bulkUploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={cloudUploadOutline} slot="start" /> Subir correcciones</>}
          </IonButton>
          
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
            subtitle="Sube las hojas de ejercicios completadas por los alumnos"
            actionLabel="Subir"
            onAction={handleBulkUploadClick}
          />
        )}

        <div className="exercise-correction-scans">
          {exerciseCorrections.map((correction, i) => {
            const local = localGrades[correction.id] || { grade: correction.grade, notes: '', studentId: correction.studentId || '' };
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
                teacherNotes={local.notes}
                saved={isSaved}
                paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                onStudentChange={(sid) => handleStudentChange(correction.id, sid)}
                onGradeChange={(g) => handleGradeChange(correction.id, g)}
                onNotesChange={(n) => handleNotesChange(correction.id, n)}
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

        {!allSaved && exerciseCorrections.length > 0 && (
          <div className="exercise-correction-finish">
            <IonButton expand="block" color="success" onClick={handleFinish}>
              <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar corrección
            </IonButton>
          </div>
        )}

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
          <IonContent className="paper-preview-content">
            {previewUrl && (
              <div className="paper-preview-container">
                <img src={previewUrl} alt="Ejercicio" className="paper-preview-img" />
              </div>
            )}
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default ExerciseCorrection;
