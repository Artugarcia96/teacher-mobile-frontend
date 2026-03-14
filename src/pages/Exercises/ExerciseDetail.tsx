import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton, IonButton, IonIcon,
  IonSpinner, IonAlert, IonChip, IonList, IonItem, IonLabel,
  IonTextarea, IonModal, IonHeader, IonToolbar, IonTitle,
} from '@ionic/react';
import {
  trashOutline, downloadOutline, chevronForwardOutline, pencilOutline,
  checkmarkCircleOutline, timeOutline, sparkles, cloudUploadOutline,
  documentTextOutline, personOutline, refreshOutline, closeOutline, copyOutline,
  chevronDownOutline, chevronUpOutline
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useClassesStore } from '../../store/classesStore';
import { exercises as exercisesApi } from '../../services/api';
import EmptyState from '../../components/EmptyState';
import { WeakAreasRadar, QuestionStatusBar } from '../../components/charts';
import './ExerciseDetail.css';

const statusConfig: Record<string, { color: string; label: string; bg: string }> = {
  null: { color: '#64748B', label: 'Pendiente', bg: 'rgba(100, 116, 139, 0.1)' },
  in_progress: { color: '#D97706', label: 'En corrección', bg: 'rgba(217, 119, 6, 0.1)' },
  corrected: { color: '#059669', label: 'Corregido', bg: 'rgba(5, 150, 105, 0.1)' },
};

const deliveryStatusConfig: Record<string, { color: string; label: string; bg: string }> = {
  pending: { color: '#64748B', label: 'Pendiente', bg: 'rgba(100, 116, 139, 0.1)' },
  today: { color: '#D97706', label: 'Hoy', bg: 'rgba(217, 119, 6, 0.1)' },
  tomorrow: { color: '#D97706', label: 'Mañana', bg: 'rgba(217, 119, 6, 0.1)' },
  delivered: { color: '#059669', label: 'Entregado', bg: 'rgba(5, 150, 105, 0.1)' },
};

const AVATAR_COLORS = [
  '#6C3AED', '#8B5CF6', '#059669', '#0891B2', '#D97706',
  '#DC2626', '#2563EB', '#7C3AED', '#DB2777', '#4F46E5',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const ExerciseDetail: React.FC = () => {
  const { classId, exerciseId } = useParams<{ classId: string; exerciseId: string }>();
  const history = useHistory();
  
  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const deleteExercise = useExercisesStore((s) => s.deleteExercise);
  const iterateExercise = useExercisesStore((s) => s.iterateExercise);
  
  const corrections = useExerciseCorrectionStore((s) => s.corrections);
  const fetchCorrections = useExerciseCorrectionStore((s) => s.fetchCorrections);
  
  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  
  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showIterateModal, setShowIterateModal] = useState(false);
  const [iterateInstruction, setIterateInstruction] = useState('');
  const [iterating, setIterating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const exercise = useMemo(() => allExercises.find((e) => e.id === exerciseId), [allExercises, exerciseId]);
  const classGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const exerciseCorrections = useMemo(() => corrections.filter((c) => c.exerciseId === exerciseId), [corrections, exerciseId]);
  
  const student = useMemo(() => {
    if (!exercise) return null;
    return allStudents.find((s) => s.id === exercise.studentId);
  }, [exercise, allStudents]);

  const stats = useMemo(() => {
    const gradedCorrections = exerciseCorrections.filter(c => c.grade !== null && c.grade !== undefined);
    const totalGraded = gradedCorrections.length;
    const totalPapers = exerciseCorrections.length;
    
    if (totalGraded === 0) {
      return { average: null, totalGraded: 0, totalPapers };
    }
    
    const sum = gradedCorrections.reduce((acc, c) => acc + (c.grade || 0), 0);
    const average = sum / totalGraded;
    
    return { average, totalGraded, totalPapers };
  }, [exerciseCorrections]);

  const correctionsList = useMemo(() => {
    return exerciseCorrections
      .map(c => {
        const corrStudent = allStudents.find(s => s.id === c.studentId);
        return { ...c, studentName: corrStudent?.name || 'Sin asignar' };
      });
  }, [exerciseCorrections, allStudents]);

  useEffect(() => {
    fetchClasses();
    fetchExercises();
    fetchStudents(classId);
    if (exerciseId) {
      fetchCorrections(exerciseId);
    }
  }, [classId, exerciseId, fetchClasses, fetchExercises, fetchStudents, fetchCorrections]);

  const handleDelete = async () => {
    try {
      await deleteExercise(exerciseId);
      history.replace(`/tabs/classes/${classId}/exercises`);
    } catch (err) {
      console.error('Failed to delete exercise:', err);
    }
    setShowDeleteAlert(false);
  };

  const handleDownload = async (type: 'exercises' | 'solutions') => {
    if (!exercise) return;
    setDownloading(true);
    try {
      const url = type === 'exercises' 
        ? exercisesApi.downloadExercisesPdf(exerciseId)
        : exercisesApi.downloadSolutionsPdf(exerciseId);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Failed to download:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleIterate = async () => {
    if (!iterateInstruction.trim()) return;
    setIterating(true);
    try {
      await iterateExercise(exerciseId, iterateInstruction);
      setShowIterateModal(false);
      setIterateInstruction('');
    } catch (err) {
      console.error('Failed to iterate:', err);
    } finally {
      setIterating(false);
    }
  };

  const quickIterations = [
    'Hazlo más fácil',
    'Hazlo más difícil',
    'Añade más ejercicios',
    'Más contexto práctico',
  ];

  if (!exercise) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="exd-loading"><IonSpinner color="primary" /></div>
        </IonContent>
      </IonPage>
    );
  }

  const status = statusConfig[exercise.correctionStatus || 'null'] || statusConfig.null;
  const deliveryStatus = exercise.deliveryStatus ? deliveryStatusConfig[exercise.deliveryStatus] : null;

  return (
    <IonPage>
      <IonContent className="exd-content" scrollY>
        {/* Hero Header */}
        <div className="exd-hero">
          <div className="exd-hero__nav">
            <IonButtons>
              <IonBackButton defaultHref={`/tabs/classes/${classId}/exercises`} text="" color="light" />
            </IonButtons>
            <div className="exd-hero__center">
              <h1 className="exd-hero__title">
                {exercise.name || exercise.weakAreas?.join(', ') || 'Ejercicio'}
              </h1>
              {classGroup && (
                <p className="exd-hero__subtitle">{classGroup.name}</p>
              )}
            </div>
            <div className="exd-hero__actions">
              <IonButton 
                fill="clear" 
                size="small"
                onClick={() => setShowIterateModal(true)}
                className="exd-hero__action-btn"
              >
                <IonIcon icon={refreshOutline} slot="icon-only" />
              </IonButton>
              <IonButton 
                fill="clear" 
                size="small"
                onClick={() => setShowDeleteAlert(true)}
                className="exd-hero__action-btn exd-hero__action-btn--danger"
              >
                <IonIcon icon={trashOutline} slot="icon-only" />
              </IonButton>
            </div>
          </div>
        </div>

        {/* Info Ribbon */}
        <div className="exd-ribbon">
          <div className="exd-ribbon__item">
            <span className="exd-ribbon__value">
              <IonIcon icon={personOutline} className="exd-ribbon__icon" />
              {student?.name || '—'}
            </span>
          </div>
          <div className="exd-ribbon__divider" />
          <div className="exd-ribbon__item">
            <span className="exd-ribbon__value">{exercise.questions?.length || 0}</span>
            <span className="exd-ribbon__label">Preg.</span>
          </div>
          <div className="exd-ribbon__divider" />
          <div className="exd-ribbon__item">
            <span
              className="exd-ribbon__status"
              style={{ color: status.color, background: status.bg }}
            >
              {status.label}
            </span>
          </div>
          {exercise.deliveryDate && (
            <>
              <div className="exd-ribbon__divider" />
              <div className="exd-ribbon__item">
                <span className="exd-ribbon__value">
                  {new Date(exercise.deliveryDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </span>
                {deliveryStatus && (
                  <span className="exd-ribbon__deadline" style={{ color: deliveryStatus.color }}>
                    <IonIcon icon={timeOutline} />
                    {deliveryStatus.label}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Weak Areas */}
        {exercise.weakAreas && exercise.weakAreas.length > 0 && (
          <div className="exd-areas-section">
            <h3 className="exd-section-title">Áreas de refuerzo</h3>
            {exercise.weakAreas.length >= 3 ? (
              <div className="exd-areas-radar">
                <WeakAreasRadar
                  areas={exercise.weakAreas.map(area => ({ area, count: 1 }))}
                  size={160}
                />
              </div>
            ) : (
              <div className="exd-areas-list">
                {exercise.weakAreas.map((area, i) => (
                  <IonChip key={i} color="primary" outline>
                    {area}
                  </IonChip>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats Dashboard */}
        {exerciseCorrections.length > 0 && (
          <div className="exd-stats">
            <div className="exd-stat-card">
              <div className="exd-stat-icon">
                <IonIcon icon={documentTextOutline} />
              </div>
              <div className="exd-stat-content">
                <span className="exd-stat-value">{stats.totalPapers}</span>
                <span className="exd-stat-label">Entregas</span>
              </div>
            </div>
            <div className="exd-stat-card">
              <div className="exd-stat-icon exd-stat-icon--success">
                <IonIcon icon={checkmarkCircleOutline} />
              </div>
              <div className="exd-stat-content">
                <span className="exd-stat-value">{stats.totalGraded}</span>
                <span className="exd-stat-label">Corregidos</span>
              </div>
            </div>
            {stats.average !== null && (
              <div className="exd-stat-card">
                <div className="exd-stat-icon exd-stat-icon--primary">
                  <IonIcon icon={sparkles} />
                </div>
                <div className="exd-stat-content">
                  <span className="exd-stat-value">{stats.average.toFixed(1)}</span>
                  <span className="exd-stat-label">Nota media</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="exd-actions">
          <IonButton 
            expand="block" 
            onClick={() => history.push(`/exercise-correction/${exerciseId}`)}
            className="exd-action-btn"
          >
            <IonIcon icon={exercise.correctionStatus === 'corrected' ? checkmarkCircleOutline : cloudUploadOutline} slot="start" />
            {exercise.correctionStatus === 'corrected' ? 'Ver corrección' : 'Subir y corregir'}
          </IonButton>
          
          <div className="exd-actions-row">
            <IonButton 
              expand="block"
              fill="outline"
              onClick={() => handleDownload('exercises')}
              disabled={downloading}
            >
              <IonIcon icon={downloadOutline} slot="start" />
              PDF Ejercicios
            </IonButton>
            <IonButton 
              expand="block"
              fill="outline"
              onClick={() => handleDownload('solutions')}
              disabled={downloading}
            >
              <IonIcon icon={downloadOutline} slot="start" />
              PDF Soluciones
            </IonButton>
          </div>

          <IonButton 
            expand="block"
            fill="outline"
            color="secondary"
            onClick={() => setShowIterateModal(true)}
          >
            <IonIcon icon={refreshOutline} slot="start" />
            Ajustar ejercicios
          </IonButton>
        </div>

        {/* Questions Preview */}
        {exercise.questions && exercise.questions.length > 0 && (
          <div className="exd-questions-section">
            <h2 className="exd-section-title">Preguntas ({exercise.questions.length})</h2>
            <div className="exd-questions-list">
              {(showAllQuestions ? exercise.questions : exercise.questions.slice(0, 3)).map((q, i) => (
                <div key={q.id || i} className="exd-question-card">
                  <div className="exd-question-number">{i + 1}</div>
                  <div className="exd-question-content">
                    <p className="exd-question-text">{q.text}</p>
                    {q.hint && (
                      <p className="exd-question-hint">
                        <IonIcon icon={sparkles} /> {q.hint}
                      </p>
                    )}
                    {q.points && (
                      <span className="exd-question-points">{q.points} pts</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {exercise.questions.length > 3 && (
              <button
                className="exd-toggle-btn"
                onClick={() => setShowAllQuestions(!showAllQuestions)}
                type="button"
              >
                {showAllQuestions ? 'Ocultar' : `Ver todas (${exercise.questions.length})`}
                <IonIcon icon={showAllQuestions ? chevronUpOutline : chevronDownOutline} />
              </button>
            )}
          </div>
        )}

        {/* Corrections List */}
        <div className="exd-corrections-section">
          <h2 className="exd-section-title">Correcciones ({correctionsList.length})</h2>
          
          {correctionsList.length === 0 ? (
            <EmptyState
              icon="📄"
              title="Sin entregas"
              subtitle="Sube las entregas de los ejercicios para corregirlas"
              actionLabel="Subir entregas"
              onAction={() => history.push(`/exercise-correction/${exerciseId}`)}
            />
          ) : (
            <IonList className="exd-corrections-list">
              {correctionsList.map((correction) => (
                <IonItem 
                  key={correction.id}
                  button
                  onClick={() => history.push(`/exercise-correction/${exerciseId}?correctionId=${correction.id}`)}
                  className="exd-correction-item"
                >
                  <div 
                    className="exd-correction-avatar" 
                    slot="start"
                    style={{ background: avatarColor(correction.studentName) }}
                  >
                    {correction.studentName.charAt(0)}
                  </div>
                  <IonLabel>
                    <h3 className="exd-correction-name">{correction.studentName}</h3>
                    {correction.aiAnalysis?.questions && correction.aiAnalysis.questions.length > 0 && (
                      <div className="exd-correction-bar">
                        <QuestionStatusBar questions={correction.aiAnalysis.questions} compact />
                      </div>
                    )}
                    {!correction.aiAnalysis?.questions?.length && correction.aiAnalysis?.summary && (
                      <p className="exd-correction-summary">{correction.aiAnalysis.summary}</p>
                    )}
                  </IonLabel>
                  <div className="exd-correction-grade" slot="end">
                    {correction.grade !== null && correction.grade !== undefined ? (
                      <span className="exd-grade-value">
                        {correction.grade}
                      </span>
                    ) : (
                      <span className="exd-grade-pending">Pendiente</span>
                    )}
                    <IonIcon icon={chevronForwardOutline} className="exd-correction-arrow" />
                  </div>
                </IonItem>
              ))}
            </IonList>
          )}
        </div>

        {/* Iteration History */}
        {exercise.iterationHistory && exercise.iterationHistory.length > 0 && (
          <div className="exd-history-section">
            <button
              className="exd-toggle-btn exd-history-toggle"
              onClick={() => setShowHistory(!showHistory)}
              type="button"
            >
              Historial de ajustes ({exercise.iterationHistory.length})
              <IonIcon icon={showHistory ? chevronUpOutline : chevronDownOutline} />
            </button>
            {showHistory && (
              <div className="exd-history-list">
                {exercise.iterationHistory.map((item, i) => (
                  <div key={i} className="exd-history-item">
                    <div className="exd-history-icon">
                      <IonIcon icon={refreshOutline} />
                    </div>
                    <div className="exd-history-content">
                      <p className="exd-history-instruction">{item.instruction}</p>
                      <span className="exd-history-date">
                        {new Date(item.timestamp).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Delete Alert */}
        <IonAlert
          isOpen={showDeleteAlert}
          onDidDismiss={() => setShowDeleteAlert(false)}
          header="Eliminar ejercicio"
          message={`¿Eliminar este ejercicio? También se eliminarán las correcciones asociadas. Esta acción no se puede deshacer.`}
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Eliminar', role: 'destructive', handler: handleDelete }
          ]}
        />

        {/* Iterate Modal */}
        <IonModal 
          isOpen={showIterateModal} 
          onDidDismiss={() => {
            setShowIterateModal(false);
            setIterateInstruction('');
          }}
          className="exd-iterate-modal"
        >
          <IonHeader>
            <IonToolbar>
              <IonTitle>Ajustar ejercicios</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setShowIterateModal(false)}>
                  <IonIcon icon={closeOutline} slot="icon-only" />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="exd-iterate-content">
            <p className="exd-iterate-description">
              Describe cómo quieres modificar los ejercicios. La IA regenerará las preguntas según tus instrucciones.
            </p>
            
            <div className="exd-quick-options">
              {quickIterations.map((opt, i) => (
                <IonChip
                  key={i}
                  outline
                  onClick={() => setIterateInstruction(opt)}
                  color={iterateInstruction === opt ? 'primary' : undefined}
                >
                  {opt}
                </IonChip>
              ))}
            </div>

            <IonTextarea
              value={iterateInstruction}
              onIonInput={(e) => setIterateInstruction(e.detail.value || '')}
              placeholder="Ej: Añade más ejercicios de fracciones y reduce la dificultad..."
              rows={4}
              className="exd-iterate-textarea"
            />

            <IonButton 
              expand="block" 
              onClick={handleIterate}
              disabled={!iterateInstruction.trim() || iterating}
              className="exd-iterate-btn"
            >
              {iterating ? (
                <IonSpinner name="crescent" />
              ) : (
                <>
                  <IonIcon icon={sparkles} slot="start" />
                  Aplicar cambios
                </>
              )}
            </IonButton>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default ExerciseDetail;
