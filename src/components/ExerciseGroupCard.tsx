import { useState, useRef } from 'react';
import { 
  IonCard, IonCardContent, IonBadge, IonButton, IonIcon, IonProgressBar,
  IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent,
  IonList, IonItem, IonLabel, IonChip, IonSpinner
} from '@ionic/react';
import { 
  downloadOutline, documentTextOutline, cloudUploadOutline, 
  peopleOutline, timeOutline, checkmarkCircleOutline, ellipseOutline,
  closeOutline, chevronForwardOutline, checkmarkOutline,
  hourglassOutline, alertCircleOutline
} from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { Exercise, Student } from '../types';
import { exercises as exercisesApi } from '../services/api';
import './ExerciseGroupCard.css';

interface ExerciseGroup {
  name: string;
  exercises: Exercise[];
  studentCount: number;
  totalQuestions: number;
  latestDate: string;
}

interface Props {
  group: ExerciseGroup;
  classId: string;
  students: Student[];
  onUploadClick: (classId: string, exerciseIds: string[]) => void;
  onSingleUploadClick: (classId: string, exerciseId: string, studentName: string) => void;
  uploading?: boolean;
}

const ExerciseGroupCard: React.FC<Props> = ({ 
  group, classId, students, onUploadClick, onSingleUploadClick, uploading 
}) => {
  const history = useHistory();
  const [showModal, setShowModal] = useState(false);
  
  // Calculate correction progress
  const correctedCount = group.exercises.filter(
    (ex) => ex.correctionStatus === 'corrected'
  ).length;
  const inProgressCount = group.exercises.filter(
    (ex) => ex.correctionStatus === 'in_progress'
  ).length;
  const pendingCount = group.studentCount - correctedCount - inProgressCount;
  const progress = group.studentCount > 0 ? correctedCount / group.studentCount : 0;

  // Sort exercises by student name
  const sortedExercises = [...group.exercises].sort((a, b) => {
    const studentA = students.find(s => s.id === a.studentId);
    const studentB = students.find(s => s.id === b.studentId);
    return (studentA?.name || '').localeCompare(studentB?.name || '');
  });

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('es-ES', { 
        day: 'numeric', 
        month: 'short' 
      });
    } catch {
      return dateStr;
    }
  };

  const handleDownload = async (e: React.MouseEvent, includeSolutions: boolean) => {
    e.stopPropagation();
    const exerciseIds = group.exercises.map((ex) => ex.id);
    try {
      const res = await exercisesApi.batchDownload(exerciseIds, includeSolutions);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = includeSolutions 
        ? `${group.name}_soluciones.pdf` 
        : `${group.name}_ejercicios.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const handleBatchUpload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const exerciseIds = group.exercises.map((ex) => ex.id);
    onUploadClick(classId, exerciseIds);
  };

  const handleStudentCorrection = (exercise: Exercise, student: Student) => {
    // Navigate to the exercise correction page
    history.push(`/exercise-correction/${exercise.id}`);
    setShowModal(false);
  };

  const handleSingleUpload = (exercise: Exercise, studentName: string) => {
    onSingleUploadClick(classId, exercise.id, studentName);
    setShowModal(false);
  };

  const handleStudentDownload = (exercise: Exercise, studentName: string) => {
    const url = exercisesApi.downloadExercisesPdf(exercise.id);
    const token = localStorage.getItem('access_token');
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${studentName}_ejercicios.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Download error:', err));
  };

  const getStatusColor = () => {
    if (correctedCount === group.studentCount) return 'success';
    if (inProgressCount > 0 || correctedCount > 0) return 'warning';
    return 'medium';
  };

  const getStatusText = () => {
    if (correctedCount === group.studentCount) return 'Completado';
    if (correctedCount > 0) return `${correctedCount}/${group.studentCount}`;
    if (inProgressCount > 0) return 'En progreso';
    return 'Pendiente';
  };

  const getExerciseStatusIcon = (exercise: Exercise) => {
    if (exercise.correctionStatus === 'corrected') {
      return <IonIcon icon={checkmarkCircleOutline} color="success" />;
    }
    if (exercise.correctionStatus === 'in_progress') {
      return <IonIcon icon={hourglassOutline} color="warning" />;
    }
    return <IonIcon icon={alertCircleOutline} color="medium" />;
  };

  const getExerciseStatusText = (exercise: Exercise) => {
    if (exercise.correctionStatus === 'corrected') return 'Corregido';
    if (exercise.correctionStatus === 'in_progress') return 'En progreso';
    return 'Pendiente';
  };

  return (
    <>
      <IonCard className="exercise-group-card" onClick={() => setShowModal(true)} button>
        <IonCardContent className="exercise-group-card-content">
          {/* Header */}
          <div className="exercise-group-card-header">
            <h3 className="exercise-group-card-title">{group.name}</h3>
            <div className="exercise-group-card-header-right">
              <IonBadge color={getStatusColor()} className="exercise-group-card-status">
                {getStatusText()}
              </IonBadge>
              <IonIcon icon={chevronForwardOutline} className="exercise-group-card-chevron" />
            </div>
          </div>

          {/* Meta info */}
          <div className="exercise-group-card-meta">
            <div className="exercise-group-card-meta-item">
              <IonIcon icon={peopleOutline} />
              <span>{group.studentCount} {group.studentCount === 1 ? 'alumno' : 'alumnos'}</span>
            </div>
            <div className="exercise-group-card-meta-item">
              <IonIcon icon={timeOutline} />
              <span>{formatDate(group.latestDate)}</span>
            </div>
            <div className="exercise-group-card-meta-item">
              <span>{group.totalQuestions} preguntas</span>
            </div>
          </div>

          {/* Progress bar */}
          {group.studentCount > 0 && (
            <div className="exercise-group-card-progress">
              <IonProgressBar value={progress} color={getStatusColor()} />
              <div className="exercise-group-card-progress-labels">
                {correctedCount > 0 && (
                  <span className="progress-label corrected">
                    <IonIcon icon={checkmarkCircleOutline} /> {correctedCount}
                  </span>
                )}
                {inProgressCount > 0 && (
                  <span className="progress-label in-progress">
                    <IonIcon icon={ellipseOutline} /> {inProgressCount}
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="progress-label pending">
                    {pendingCount} pendientes
                  </span>
                )}
              </div>
            </div>
          )}
        </IonCardContent>
      </IonCard>

      {/* Detail Modal */}
      <IonModal isOpen={showModal} onDidDismiss={() => setShowModal(false)}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>{group.name}</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setShowModal(false)}>
                <IonIcon icon={closeOutline} />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          {/* Batch actions */}
          <div className="exercise-modal-actions">
            <IonButton
              size="small"
              fill="outline"
              onClick={(e) => handleDownload(e, false)}
            >
              <IonIcon icon={documentTextOutline} slot="start" />
              Descargar PDF
            </IonButton>
            <IonButton
              size="small"
              fill="outline"
              color="success"
              onClick={(e) => handleDownload(e, true)}
            >
              <IonIcon icon={downloadOutline} slot="start" />
              PDF + Soluciones
            </IonButton>
            <IonButton
              size="small"
              fill="solid"
              color="secondary"
              onClick={handleBatchUpload}
              disabled={uploading}
            >
              <IonIcon icon={cloudUploadOutline} slot="start" />
              Subir todas ({group.studentCount})
            </IonButton>
          </div>

          {/* Progress summary */}
          <div className="exercise-modal-summary">
            <IonChip color="success" outline>
              <IonIcon icon={checkmarkOutline} />
              {correctedCount} corregidos
            </IonChip>
            <IonChip color="warning" outline>
              <IonIcon icon={hourglassOutline} />
              {inProgressCount} en progreso
            </IonChip>
            <IonChip color="medium" outline>
              <IonIcon icon={alertCircleOutline} />
              {pendingCount} pendientes
            </IonChip>
          </div>

          {/* Student list */}
          <IonList className="exercise-modal-list">
            {sortedExercises.map((exercise) => {
              const student = students.find(s => s.id === exercise.studentId);
              if (!student) return null;
              
              return (
                <IonItem 
                  key={exercise.id} 
                  className="exercise-modal-student-item"
                  detail={false}
                >
                  <div className="exercise-student-status" slot="start">
                    {getExerciseStatusIcon(exercise)}
                  </div>
                  <IonLabel>
                    <h3>{student.name}</h3>
                    <p>{getExerciseStatusText(exercise)}</p>
                  </IonLabel>
                  <div className="exercise-student-actions" slot="end">
                    <IonButton
                      size="small"
                      fill="clear"
                      color="medium"
                      onClick={() => handleStudentDownload(exercise, student.name)}
                      title="Descargar PDF"
                    >
                      <IonIcon icon={downloadOutline} />
                    </IonButton>
                    {exercise.correctionStatus === 'corrected' ? (
                      <IonButton 
                        size="small" 
                        fill="clear"
                        onClick={() => handleStudentCorrection(exercise, student)}
                      >
                        Ver
                      </IonButton>
                    ) : exercise.correctionStatus === 'in_progress' ? (
                      <IonButton 
                        size="small" 
                        fill="outline"
                        color="warning"
                        onClick={() => handleStudentCorrection(exercise, student)}
                      >
                        Continuar
                      </IonButton>
                    ) : (
                      <IonButton 
                        size="small" 
                        fill="solid"
                        color="secondary"
                        onClick={() => handleSingleUpload(exercise, student.name)}
                      >
                        <IonIcon icon={cloudUploadOutline} slot="start" />
                        Subir
                      </IonButton>
                    )}
                  </div>
                </IonItem>
              );
            })}
          </IonList>
        </IonContent>
      </IonModal>
    </>
  );
};

export default ExerciseGroupCard;
