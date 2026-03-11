import { useState, useEffect, useMemo, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  IonIcon, IonSpinner, IonBadge, IonSearchbar,
  IonAccordionGroup, IonAccordion, IonItem, IonLabel, IonFab, IonFabButton,
  IonSelect, IonSelectOption, IonChip, IonCard, IonCardContent, IonModal,
  IonToast, IonProgressBar,
} from '@ionic/react';
import {
  sparkles, chevronDownOutline, schoolOutline, globeOutline,
  checkmarkOutline, warningOutline, helpOutline, closeOutline,
} from 'ionicons/icons';
import { useStudentsStore } from '../../store/studentsStore';
import { useClassesStore } from '../../store/classesStore';
import { useExercisesStore } from '../../store/exercisesStore';
import { useExamsStore } from '../../store/examsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { exerciseCorrections } from '../../services/api';
import { ClassBulkUploadResult, Exercise } from '../../types';
import ExerciseGroupCard from '../../components/ExerciseGroupCard';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import EmptyState from '../../components/EmptyState';
import './Exercises.css';

interface ExerciseStructure {
  classId: string;
  className: string;
  classSubject: string;
  exerciseGroups: {
    name: string;
    exercises: Exercise[];
    studentCount: number;
    totalQuestions: number;
    latestDate: string;
  }[];
  totalExercises: number;
  studentCount: number;
}

const Exercises: React.FC = () => {
  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  
  const allStudents = useStudentsStore((s) => s.students);
  const fetchAllStudents = useStudentsStore((s) => s.fetchAllStudents);
  
  const exercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const loading = useExercisesStore((s) => s.loading);

  const fetchExams = useExamsStore((s) => s.fetchExams);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [expandedClasses, setExpandedClasses] = useState<string[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Bulk upload state
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [bulkUploadClassId, setBulkUploadClassId] = useState<string | null>(null);
  const [bulkUploadExerciseIds, setBulkUploadExerciseIds] = useState<string[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<ClassBulkUploadResult | null>(null);
  const [reviewAssignments, setReviewAssignments] = useState<Record<string, string>>({});
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [confirmingReview, setConfirmingReview] = useState(false);
  
  // Processing feedback state
  const [processingToast, setProcessingToast] = useState<{
    isOpen: boolean;
    message: string;
    color?: string;
    duration?: number;
  }>({ isOpen: false, message: '' });
  const [aiProcessingCount, setAiProcessingCount] = useState<{ current: number; total: number } | null>(null);

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);

  useEffect(() => {
    fetchClasses();
    fetchAllStudents();
    fetchExercises();
    fetchExams();
    fetchAllCorrections();
  }, [fetchClasses, fetchAllStudents, fetchExercises, fetchExams, fetchAllCorrections]);

  // Stats
  const stats = useMemo(() => {
    const studentIds = new Set(exercises.map((e) => e.studentId));
    return {
      total: exercises.length,
      students: studentIds.size,
      questions: exercises.reduce((acc, e) => acc + (e.questions || []).length, 0),
    };
  }, [exercises]);

  // Filter exercises by search and class
  const filtered = useMemo(() => {
    let result = exercises;
    
    if (search) {
      const term = search.toLowerCase();
      result = result.filter((ex) => {
        const student = allStudents.find((s) => s.id === ex.studentId);
        const studentName = student?.name?.toLowerCase() || '';
        const name = ex.name?.toLowerCase() || '';
        return studentName.includes(term) || name.includes(term);
      });
    }
    
    if (classFilter !== 'all') {
      result = result.filter((ex) => {
        const student = allStudents.find((s) => s.id === ex.studentId);
        const studentClassId = student?.classId || '__global__';
        return studentClassId === classFilter;
      });
    }
    
    return result;
  }, [exercises, search, allStudents, classFilter]);

  // Build hierarchical structure: Class > Exercise Name > Exercises
  const structure = useMemo(() => {
    const result: ExerciseStructure[] = [];
    
    // Group exercises by class (via student)
    const byClass = new Map<string, typeof filtered>();
    filtered.forEach((ex) => {
      const student = allStudents.find((s) => s.id === ex.studentId);
      const classId = student?.classId || '__global__';
      if (!byClass.has(classId)) {
        byClass.set(classId, []);
      }
      byClass.get(classId)!.push(ex);
    });
    
    // Build structure for each class
    byClass.forEach((classExercises, classId) => {
      const cls = classId === '__global__' ? null : classes.find((c) => c.id === classId);
      
      // Group exercises by name within this class
      const byName = new Map<string, typeof classExercises>();
      classExercises.forEach((ex) => {
        const name = ex.name || 'Sin nombre';
        if (!byName.has(name)) {
          byName.set(name, []);
        }
        byName.get(name)!.push(ex);
      });
      
      const exerciseGroups: ExerciseStructure['exerciseGroups'] = [];
      byName.forEach((exs, name) => {
        const sorted = [...exs].sort((a, b) => 
          new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
        );
        exerciseGroups.push({
          name,
          exercises: sorted,
          studentCount: new Set(sorted.map((e) => e.studentId)).size,
          totalQuestions: sorted.reduce((acc, e) => acc + (e.questions || []).length, 0),
          latestDate: sorted[0]?.assignedAt || '',
        });
      });
      
      // Sort groups by latest date
      exerciseGroups.sort((a, b) => 
        new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
      );
      
      const uniqueStudents = new Set(classExercises.map((e) => e.studentId));
      
      result.push({
        classId,
        className: cls?.name || 'Global',
        classSubject: cls?.subject || 'Ejercicios transversales',
        exerciseGroups,
        totalExercises: classExercises.length,
        studentCount: uniqueStudents.size,
      });
    });
    
    // Sort: Global first if exists, then by class name
    result.sort((a, b) => {
      if (a.classId === '__global__') return -1;
      if (b.classId === '__global__') return 1;
      return a.className.localeCompare(b.className);
    });
    
    return result;
  }, [filtered, classes, allStudents]);

  const toggleClass = (classId: string) => {
    setExpandedClasses((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const expandAll = () => {
    setExpandedClasses(structure.map((s) => s.classId));
  };

  const collapseAll = () => {
    setExpandedClasses([]);
  };

  // Bulk upload handlers
  const handleBulkUploadClick = (classId: string, exerciseIds: string[]) => {
    setBulkUploadClassId(classId);
    setBulkUploadExerciseIds(exerciseIds);
    bulkInputRef.current?.click();
  };

  // Single student upload (just one exercise)
  const handleSingleUploadClick = (classId: string, exerciseId: string, studentName: string) => {
    setBulkUploadClassId(classId);
    setBulkUploadExerciseIds([exerciseId]);
    bulkInputRef.current?.click();
  };

  const handleBulkFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !bulkUploadClassId) return;
    
    setBulkUploading(true);
    try {
      const response = await exerciseCorrections.classBulkUpload(
        bulkUploadClassId, 
        Array.from(files),
        bulkUploadExerciseIds  // Pass the expected exercise IDs
      );
      const data = response.data;
      
      const result: ClassBulkUploadResult = {
        autoMatched: (data.auto_matched || []).map((m: any) => ({
          correctionId: m.correction_id,
          exerciseId: m.exercise_id,
          exerciseName: m.exercise_name,
          studentId: m.student_id,
          studentName: m.student_name,
          studentCode: m.student_code,
          confidence: m.confidence,
        })),
        needsReview: (data.needs_review || []).map((r: any) => ({
          correctionId: r.correction_id,
          exerciseId: r.exercise_id,
          exerciseName: r.exercise_name,
          detectedCode: r.detected_code,
          reason: r.reason,
          suggestions: r.suggestions || [],
        })),
        exercisesAffected: (data.exercises_affected || []).map((e: any) => ({
          exerciseId: e.exercise_id,
          exerciseName: e.exercise_name,
          matchedCount: e.matched_count,
        })),
        studentsWithoutPapers: (data.students_without_papers || []).map((s: any) => ({
          studentId: s.student_id,
          studentName: s.student_name,
          code: s.code,
        })),
      };
      
      // Pre-populate reviewAssignments with auto-matched proposals (editable)
      const initialAssignments: Record<string, string> = {};
      result.autoMatched.forEach((m) => {
        initialAssignments[m.correctionId] = m.studentId;
      });
      setReviewAssignments(initialAssignments);
      setBulkResult(result);
      setShowReviewModal(true);
      await fetchExercises();
    } catch (err) {
      console.error('Bulk upload error:', err);
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
    
    // All assignments (auto-matched proposals + manual) that have a student
    const assignedCorrectionIds: string[] = [];
    const allAssignments = Object.entries(reviewAssignments).filter(([_, studentId]) => studentId);
    
    for (const [correctionId, studentId] of allAssignments) {
      try {
        await exerciseCorrections.update(correctionId, { student_id: studentId });
        assignedCorrectionIds.push(correctionId);
      } catch (err) {
        console.error('Failed to assign student:', err);
      }
    }
    
    // Close modal and show processing toast
    setShowReviewModal(false);
    setBulkResult(null);
    setReviewAssignments({});
    setConfirmingReview(false);
    
    if (assignedCorrectionIds.length === 0) {
      setProcessingToast({
        isOpen: true,
        message: 'No hay ejercicios para corregir',
        color: 'warning',
        duration: 3000,
      });
      return;
    }
    
    // Show processing indicator
    setAiProcessingCount({ current: 0, total: assignedCorrectionIds.length });
    setProcessingToast({
      isOpen: true,
      message: `Corrigiendo 0 de ${assignedCorrectionIds.length} ejercicios...`,
      color: 'primary',
      duration: undefined, // Keep open until done
    });
    
    // Process AI for all assigned corrections with progress updates
    let processed = 0;
    for (let i = 0; i < assignedCorrectionIds.length; i += 5) {
      const batch = assignedCorrectionIds.slice(i, i + 5);
      await Promise.all(batch.map(async (id) => {
        try {
          await exerciseCorrections.processAI(id);
        } catch (err) {
          console.error('AI processing failed:', err);
        } finally {
          processed++;
          setAiProcessingCount({ current: processed, total: assignedCorrectionIds.length });
          setProcessingToast({
            isOpen: true,
            message: `Corrigiendo ${processed} de ${assignedCorrectionIds.length} ejercicios...`,
            color: 'primary',
            duration: undefined,
          });
        }
      }));
    }
    
    // Done - show success toast
    setAiProcessingCount(null);
    setProcessingToast({
      isOpen: true,
      message: `✓ ${assignedCorrectionIds.length} ejercicio${assignedCorrectionIds.length > 1 ? 's' : ''} corregido${assignedCorrectionIds.length > 1 ? 's' : ''}`,
      color: 'success',
      duration: 3000,
    });
    
    await fetchExercises();
  };

  const handleDismissReview = () => {
    setShowReviewModal(false);
    setBulkResult(null);
    setReviewAssignments({});
  };

  const getReasonText = (reason: string) => {
    const reasons: Record<string, string> = {
      'no_qr_found': 'Sin QR detectado',
      'no_code': 'Sin código detectado',
      'partial_code': 'Código parcialmente legible',
      'no_match': 'Código no coincide',
      'duplicate_code': 'Código duplicado',
      'already_assigned': 'Alumno ya asignado',
      'wrong_exercise': 'Ejercicio incorrecto',
      'wrong_class_exercise': 'Ejercicio de otra clase',
      'no_exercise_detected': 'Ejercicio no detectado',
      'qr_error': 'Error leyendo QR',
    };
    return reasons[reason] || reason;
  };

  const hasExpandedItems = expandedClasses.length > 0;

  // Classes that have exercises (for the filter dropdown)
  const classesWithExercises = useMemo(() => {
    const classIds = new Set<string>();
    exercises.forEach((ex) => {
      const student = allStudents.find((s) => s.id === ex.studentId);
      if (student?.classId) {
        classIds.add(student.classId);
      }
    });
    return classes.filter((c) => classIds.has(c.id));
  }, [exercises, allStudents, classes]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Ejercicios</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <div className="exercises-controls">
          <IonSearchbar
            value={search}
            onIonInput={(e) => setSearch(e.detail.value ?? '')}
            placeholder="Buscar ejercicios..."
            className="exercises-search"
          />

          {/* Class filter dropdown */}
          {classesWithExercises.length > 1 && (
            <div className="exercises-class-filter">
              <IonSelect
                value={classFilter}
                onIonChange={(e) => setClassFilter(e.detail.value)}
                interface="popover"
                className="exercises-class-select"
              >
                <IonSelectOption value="all">Todas las clases</IonSelectOption>
                {classesWithExercises.map((c) => (
                  <IonSelectOption key={c.id} value={c.id}>
                    {c.name} — {c.subject}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </div>
          )}

          {/* Stats */}
          <div className="exercises-stats">
            <div className="exercises-stat">
              <span className="exercises-stat__value">{stats.total}</span>
              <span className="exercises-stat__label">Ejercicios</span>
            </div>
            <div className="exercises-stat">
              <span className="exercises-stat__value">{stats.students}</span>
              <span className="exercises-stat__label">Alumnos</span>
            </div>
            <div className="exercises-stat">
              <span className="exercises-stat__value">{stats.questions}</span>
              <span className="exercises-stat__label">Preguntas</span>
            </div>
          </div>

          {/* Controls */}
          {structure.length > 0 && (
            <div className="exercises-toolbar">
              <span className="exercises-count">
                {structure.length} {structure.length === 1 ? 'clase' : 'clases'}
              </span>
              <button className="exercises-expand-btn" onClick={hasExpandedItems ? collapseAll : expandAll}>
                {hasExpandedItems ? 'Colapsar todo' : 'Expandir todo'}
              </button>
            </div>
          )}
        </div>

        {loading && exercises.length === 0 ? (
          <div className="exercises-loading"><IonSpinner color="primary" /></div>
        ) : exercises.length === 0 ? (
          <EmptyState
            icon="🏋️"
            title="Sin ejercicios"
            subtitle="Genera ejercicios personalizados para tus alumnos"
            actionLabel="Generar ejercicios"
            onAction={() => setShowGenerateModal(true)}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="Sin resultados"
            subtitle="No hay ejercicios que coincidan"
          />
        ) : (
          <div className="exercises-accordion-container">
            <IonAccordionGroup multiple value={expandedClasses}>
              {structure.map((classData) => (
                <IonAccordion
                  key={classData.classId}
                  value={classData.classId}
                  className="exercises-class-accordion"
                  toggleIcon={chevronDownOutline}
                  toggleIconSlot="end"
                >
                  <IonItem
                    slot="header"
                    className="exercises-class-header"
                    onClick={() => toggleClass(classData.classId)}
                  >
                    <div className="exercises-class-icon" slot="start">
                      <IonIcon icon={classData.classId === '__global__' ? globeOutline : schoolOutline} />
                    </div>
                    <IonLabel>
                      <h2 className="exercises-class-name">{classData.className}</h2>
                      <p className="exercises-class-subject">{classData.classSubject}</p>
                    </IonLabel>
                    <IonBadge color="medium" className="exercises-student-badge">
                      {classData.studentCount} {classData.studentCount === 1 ? 'alumno' : 'alumnos'}
                    </IonBadge>
                    <IonBadge slot="end" color="primary" className="exercises-count-badge">
                      {classData.totalExercises}
                    </IonBadge>
                  </IonItem>

                  <div slot="content" className="exercises-groups-container">
                    {/* Simple list of exercise group cards */}
                    {classData.exerciseGroups.map((group) => {
                      const classStudents = allStudents.filter(s => s.classId === classData.classId);
                      return (
                        <ExerciseGroupCard
                          key={`${classData.classId}-${group.name}`}
                          group={group}
                          classId={classData.classId}
                          students={classStudents}
                          onUploadClick={handleBulkUploadClick}
                          onSingleUploadClick={handleSingleUploadClick}
                          uploading={bulkUploading && bulkUploadClassId === classData.classId}
                        />
                      );
                    })}
                  </div>
                </IonAccordion>
              ))}
            </IonAccordionGroup>
          </div>
        )}

        {/* FAB for generating */}
        <IonFab vertical="bottom" horizontal="end" slot="fixed" className="exercises-fab">
          <IonFabButton onClick={() => setShowGenerateModal(true)}>
            <IonIcon icon={sparkles} />
          </IonFabButton>
        </IonFab>

        {/* Generate Modal */}
        <ExerciseGeneratorModal
          isOpen={showGenerateModal}
          onDismiss={() => setShowGenerateModal(false)}
        />

        {/* Hidden file input for bulk upload */}
        <input
          type="file"
          ref={bulkInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleBulkFilesSelected}
        />

        {/* Bulk upload review modal */}
        <IonModal isOpen={showReviewModal} onDidDismiss={handleDismissReview} className="exercises-bulk-modal">
          <IonHeader>
            <IonToolbar>
              <IonTitle>Resultado de carga</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={handleDismissReview}>
                  <IonIcon icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="exercises-bulk-modal-content">
            {bulkResult && (() => {
              const classStudents = bulkUploadClassId
                ? allStudents.filter((s) => s.classId === bulkUploadClassId)
                : [];
              const assignedStudentIds = new Set(Object.values(reviewAssignments).filter(Boolean));
              const allItems = [
                ...bulkResult.autoMatched.map((m) => ({
                  correctionId: m.correctionId,
                  exerciseName: m.exerciseName,
                  detectedCode: m.studentCode,
                  reason: 'auto_matched' as string,
                  isAutoMatched: true,
                })),
                ...bulkResult.needsReview.map((item) => ({
                  correctionId: item.correctionId,
                  exerciseName: item.exerciseName,
                  detectedCode: item.detectedCode,
                  reason: item.reason,
                  isAutoMatched: false,
                })),
              ];

              return (
                <div className="bulk-review-section">
                  {/* Stats */}
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

                  {/* Exercises affected summary */}
                  {bulkResult.exercisesAffected.length > 0 && (
                    <div className="bulk-exercises-affected">
                      <p className="bulk-section-label">Ejercicios afectados:</p>
                      <div className="bulk-exercises-list">
                        {bulkResult.exercisesAffected.map((ex) => (
                          <IonChip key={ex.exerciseId} color="primary" outline>
                            {ex.exerciseName}: {ex.matchedCount} detectados
                          </IonChip>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All papers as editable proposals */}
                  <div className="bulk-review-cards">
                    <p className="bulk-section-label">
                      Revisa las asignaciones propuestas antes de confirmar:
                    </p>
                    {allItems.map((item, idx) => (
                      <IonCard key={item.correctionId} className={`bulk-review-card ${item.isAutoMatched ? 'bulk-review-card-auto' : ''}`}>
                        <IonCardContent className="bulk-review-card-content">
                          <div className="bulk-review-card-info">
                            <span className="bulk-review-card-index">Papel {idx + 1}</span>
                            <div className="bulk-review-card-meta">
                              {item.detectedCode && (
                                <span className="detected-code">Código: {item.detectedCode}</span>
                              )}
                              {item.exerciseName && (
                                <span className="detected-exercise">Ejercicio: {item.exerciseName}</span>
                              )}
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
                              {classStudents
                                .filter((s) => !assignedStudentIds.has(s.id) || reviewAssignments[item.correctionId] === s.id)
                                .map((s) => (
                                  <IonSelectOption key={`${item.correctionId}-${s.id}`} value={s.id}>
                                    {s.name} {s.studentId ? `(${s.studentId})` : ''}
                                  </IonSelectOption>
                                ))}
                              <IonSelectOption key={`${item.correctionId}-none`} value="">— Sin asignar —</IonSelectOption>
                            </IonSelect>
                          </div>
                        </IonCardContent>
                      </IonCard>
                    ))}
                  </div>

                  {/* Actions */}
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
                      onClick={handleDismissReview}
                      disabled={confirmingReview}
                    >
                      Omitir
                    </IonButton>
                  </div>
                </div>
              );
            })()}
          </IonContent>
        </IonModal>
      </IonContent>

      {/* Processing toast notification */}
      <IonToast
        isOpen={processingToast.isOpen}
        message={processingToast.message}
        color={processingToast.color || 'primary'}
        duration={processingToast.duration ?? 0}
        position="bottom"
        onDidDismiss={() => setProcessingToast({ isOpen: false, message: '' })}
      />

      {/* Floating progress bar when AI is processing */}
      {aiProcessingCount && (
        <div className="ai-processing-overlay">
          <div className="ai-processing-card">
            <IonSpinner name="crescent" color="primary" />
            <div className="ai-processing-text">
              <strong>Corrigiendo ejercicios</strong>
              <span>{aiProcessingCount.current} de {aiProcessingCount.total}</span>
            </div>
            <IonProgressBar 
              value={aiProcessingCount.current / aiProcessingCount.total} 
              color="primary"
            />
          </div>
        </div>
      )}
    </IonPage>
  );
};

export default Exercises;
