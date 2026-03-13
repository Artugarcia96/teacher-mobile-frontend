import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonProgressBar, IonBadge, IonCard, IonCardContent,
  IonSpinner, IonSelect, IonSelectOption, IonChip, IonModal,
  IonSearchbar, IonList, IonItem, IonLabel,
} from '@ionic/react';
import {
  closeOutline, cloudUploadOutline, checkmarkCircleOutline, checkmarkOutline,
  warningOutline, helpOutline, sparkles, expandOutline, arrowBackOutline,
  peopleOutline, chevronForwardOutline, documentTextOutline,
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useClassesStore } from '../../store/classesStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { exerciseCorrections as ecApi, batch } from '../../services/api';
import { Exercise, BulkUploadResult } from '../../types';
import ScanCard from '../../components/ScanCard';
import BatchProgressModal from '../../components/BatchProgressModal';
import EmptyState from '../../components/EmptyState';
import './ExerciseBulkCorrection.css';

type Step = 'select' | 'upload' | 'review' | 'correct';

interface ExerciseGroup {
  name: string;
  exercises: Exercise[];
  studentCount: number;
  correctedCount: number;
}

const ExerciseBulkCorrection: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const history = useHistory();
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);

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

  const [localGrades, setLocalGrades] = useState<Record<string, { grade: number | null; notes: string; studentId: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [aiProcessing, setAiProcessing] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});

  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  const [showBatchProgress, setShowBatchProgress] = useState(false);

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
          next[c.id] = { grade: c.grade, notes: c.teacherNotes || '', studentId: c.studentId || '' };
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
        setBatchJobId(res.data.id);
        setShowBatchProgress(true);
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

  const getFullPaperUrl = useCallback((paperUrl?: string) => {
    if (!paperUrl) return null;
    if (paperUrl.startsWith('http')) return paperUrl;
    let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (paperUrl.startsWith('/uploads/')) {
      return `${baseUrl}/files${paperUrl.replace('/uploads', '')}`;
    }
    return `${baseUrl}${paperUrl}`;
  }, []);

  const fetchAuthenticatedImage = useCallback(async (url: string, correctionId: string) => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  const getReasonText = (reason: string) => {
    const reasons: Record<string, string> = {
      'no_code': 'Sin código detectado',
      'partial_code': 'Código parcialmente legible',
      'no_match': 'Código no coincide con ningún alumno',
      'wrong_exercise': 'Código de otro ejercicio',
      'wrong_class_exercise': 'Código de otro ejercicio/clase',
      'no_exercise_detected': 'Sin ejercicio detectado',
      'no_qr_found': 'Sin QR detectado',
      'duplicate_code': 'Código duplicado',
      'already_assigned': 'Alumno ya tiene corrección',
      'qr_error': 'Error al leer QR',
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
      const correction = groupCorrections.find((c) => c.id === correctionId);
      const weakAreas = correction?.aiAnalysis?.weakAreas || [];
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

  const handleBatchProcessAll = async () => {
    const unprocessedIds = groupCorrections
      .filter(c => !c.aiAnalysis && c.studentId)
      .map(c => c.id);
    if (unprocessedIds.length === 0) return;

    try {
      const res = await batch.startBatchExerciseCorrection(groupExerciseIds, unprocessedIds);
      setBatchJobId(res.data.id);
      setShowBatchProgress(true);
    } catch (err) {
      console.error('Failed to start batch:', err);
    }
  };

  const handleBatchComplete = async () => {
    setShowBatchProgress(false);
    setBatchJobId(null);
    if (selectedGroup) {
      for (const ex of selectedGroup.exercises) {
        await fetchCorrections(ex.id);
      }
    }
  };

  const handleFinishAll = async () => {
    if (!selectedGroup) return;
    try {
      for (const ex of selectedGroup.exercises) {
        await finishCorrection(ex.id);
      }
      history.goBack();
    } catch (err) {
      console.error('Failed to finish:', err);
    }
  };

  const totalPoints = useMemo(() => {
    if (!selectedGroup) return 10;
    const first = selectedGroup.exercises[0];
    return first?.questions?.reduce((sum, q) => sum + (q.points || 0), 0) || 10;
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
    else history.goBack();
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={step === 'select' ? () => history.goBack() : handleBack}>
              <IonIcon icon={step === 'select' ? closeOutline : arrowBackOutline} />
            </IonButton>
          </IonButtons>
          <IonTitle>{stepTitle()}</IonTitle>
          {step === 'correct' && (
            <IonButtons slot="end">
              <IonBadge color={progress >= 1 ? 'success' : 'primary'} className="ebc-progress-badge">
                {savedCount}/{totalPapers}
              </IonBadge>
            </IonButtons>
          )}
        </IonToolbar>
        {step === 'correct' && <IonProgressBar value={progress} color={progress >= 1 ? 'success' : 'primary'} />}
      </IonHeader>

      <IonContent className="ebc-content">
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
                {classGroup?.name} — {groupedExercises.length} grupo{groupedExercises.length !== 1 ? 's' : ''} de ejercicios
              </p>
            </div>

            <IonSearchbar
              value={searchText}
              onIonInput={(e) => setSearchText(e.detail.value || '')}
              placeholder="Buscar ejercicio..."
              className="ebc-search"
              debounce={200}
            />

            {filteredGroups.length === 0 ? (
              <EmptyState
                icon="📚"
                title="Sin ejercicios"
                subtitle={searchText ? 'No se encontraron ejercicios con ese nombre' : 'Genera ejercicios primero desde la página de ejercicios'}
              />
            ) : (
              <IonList className="ebc-group-list">
                {filteredGroups.map((group) => {
                  const isPending = group.correctedCount < group.studentCount;
                  return (
                    <IonItem
                      key={group.name}
                      button
                      onClick={() => handleSelectGroup(group)}
                      className="ebc-group-item"
                      detail={false}
                    >
                      <div className="ebc-group-icon" slot="start">
                        <IonIcon icon={documentTextOutline} />
                      </div>
                      <IonLabel>
                        <h3 className="ebc-group-name">{group.name}</h3>
                        <p className="ebc-group-meta">
                          <IonIcon icon={peopleOutline} />
                          {group.studentCount} alumno{group.studentCount !== 1 ? 's' : ''}
                          {' · '}
                          {group.correctedCount}/{group.studentCount} corregidos
                        </p>
                      </IonLabel>
                      <div slot="end" className="ebc-group-end">
                        <IonBadge color={isPending ? 'warning' : 'success'}>
                          {isPending ? 'Pendiente' : 'Completo'}
                        </IonBadge>
                        <IonIcon icon={chevronForwardOutline} className="ebc-group-arrow" />
                      </div>
                    </IonItem>
                  );
                })}
              </IonList>
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
                {' · '}
                {selectedGroup.correctedCount} corregido{selectedGroup.correctedCount !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="ebc-upload-area" onClick={handleBulkUploadClick}>
              {bulkUploading ? (
                <div className="ebc-upload-loading">
                  <IonSpinner name="crescent" />
                  <span>Subiendo y detectando alumnos...</span>
                </div>
              ) : (
                <>
                  <IonIcon icon={cloudUploadOutline} className="ebc-upload-icon" />
                  <h3>Subir correcciones</h3>
                  <p>Sube fotos o PDFs de las hojas completadas por los alumnos.</p>
                  <p className="ebc-upload-hint">Los códigos QR se detectarán automáticamente.</p>
                </>
              )}
            </div>

            {groupCorrections.length > 0 && (
              <div className="ebc-existing-corrections">
                <p className="ebc-existing-label">
                  Ya hay {groupCorrections.length} corrección{groupCorrections.length !== 1 ? 'es' : ''} cargada{groupCorrections.length !== 1 ? 's' : ''}.
                </p>
                <IonButton
                  fill="outline"
                  size="small"
                  onClick={() => setStep('correct')}
                >
                  Ver correcciones existentes
                </IonButton>
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
                  const correction = groupCorrections.find((c) => c.id === item.correctionId);
                  const paperFullUrl = getFullPaperUrl(correction?.paperUrl);
                  const thumbUrl = thumbBlobUrls[item.correctionId];
                  return (
                    <IonCard key={item.correctionId} className={`bulk-review-card ${item.isAutoMatched ? 'bulk-review-card-auto' : ''}`}>
                      <IonCardContent className="bulk-review-card-content">
                        <div className="bulk-review-card-top">
                          <div
                            className="bulk-review-thumb"
                            onClick={() => paperFullUrl && setPreviewUrl(thumbUrl || paperFullUrl)}
                          >
                            {thumbUrl ? (
                              <img src={thumbUrl} alt={`Ejercicio ${idx + 1}`} />
                            ) : (
                              <div className="bulk-review-thumb-loading">
                                <IonSpinner name="crescent" />
                              </div>
                            )}
                            <div className="bulk-review-thumb-overlay">
                              <IonIcon icon={expandOutline} />
                            </div>
                          </div>
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
                  onClick={() => {
                    setBulkResult(null);
                    setReviewAssignments({});
                    setStep('correct');
                  }}
                  disabled={confirmingReview}
                >
                  Omitir análisis IA
                </IonButton>
              </div>
            </div>
          );
        })()}

        {/* STEP 4: Correct papers */}
        {step === 'correct' && selectedGroup && (
          <>
            <div className="ebc-correct-toolbar">
              <IonButton size="small" fill="outline" color="secondary" onClick={handleBulkUploadClick} disabled={bulkUploading}>
                {bulkUploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={cloudUploadOutline} slot="start" /> Subir más</>}
              </IonButton>

              {unprocessedCount > 1 && (
                <IonButton size="small" fill="solid" color="tertiary" onClick={handleBatchProcessAll}>
                  <IonIcon icon={sparkles} slot="start" /> Analizar todo ({unprocessedCount})
                </IonButton>
              )}

              {groupCorrections.length > 0 && (
                <IonButton size="small" color="success" onClick={handleFinishAll}>
                  <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar
                </IonButton>
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
            )}
          </>
        )}

        {/* Batch progress modal */}
        <BatchProgressModal
          isOpen={showBatchProgress}
          jobId={batchJobId}
          title={`Corrigiendo: ${selectedGroup?.name || 'Ejercicios'}`}
          onClose={() => setShowBatchProgress(false)}
          onComplete={handleBatchComplete}
        />

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

export default ExerciseBulkCorrection;
