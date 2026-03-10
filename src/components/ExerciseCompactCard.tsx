import { IonCard, IonCardContent, IonBadge, IonButton, IonIcon, IonAlert } from '@ionic/react';
import { downloadOutline, documentTextOutline, trashOutline, personOutline, timeOutline, createOutline } from 'ionicons/icons';
import { useState } from 'react';
import { Exercise } from '../types';
import { exercises as exercisesApi } from '../services/api';
import './ExerciseCompactCard.css';

interface Props {
  exercise: Exercise;
  studentName?: string;
  onDelete?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const ExerciseCompactCard: React.FC<Props> = ({ exercise, studentName, onDelete, onRename, selected, onToggleSelect }) => {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showRenameAlert, setShowRenameAlert] = useState(false);

  const handleDownload = (type: 'exercises' | 'solutions') => {
    const url = type === 'exercises'
      ? exercisesApi.downloadExercisesPdf(exercise.id)
      : exercisesApi.downloadSolutionsPdf(exercise.id);
    const token = localStorage.getItem('access_token');
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${type === 'exercises' ? 'ejercicios' : 'soluciones'}_${exercise.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Download error:', err));
  };

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

  const getDisplayName = () => {
    if (exercise.name) return exercise.name;
    if (exercise.weakAreas.length === 0) return 'Ejercicios de práctica';
    if (exercise.weakAreas.length === 1) return exercise.weakAreas[0];
    return `${exercise.weakAreas[0]} y ${exercise.weakAreas.length - 1} más`;
  };

  return (
    <>
      <IonCard className={`exercise-compact-card ${selected ? 'exercise-compact-card--selected' : ''}`}>
        <IonCardContent className="exercise-compact-content">
          <div className="exercise-compact-header">
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(exercise.id)}
                className="exercise-compact-checkbox"
              />
            )}
            <div
              className="exercise-compact-topic"
              onClick={() => onRename && setShowRenameAlert(true)}
              style={onRename ? { cursor: 'pointer' } : undefined}
            >
              {getDisplayName()}
              {onRename && <IonIcon icon={createOutline} className="exercise-compact-rename-icon" />}
            </div>
            {onDelete && (
              <IonButton
                fill="clear"
                size="small"
                color="medium"
                className="exercise-compact-delete"
                onClick={() => setShowDeleteAlert(true)}
              >
                <IonIcon icon={trashOutline} />
              </IonButton>
            )}
          </div>

          <div className="exercise-compact-meta">
            <div className="exercise-compact-meta-item">
              <IonIcon icon={personOutline} />
              <span>{studentName || 'Estudiante'}</span>
            </div>
            <div className="exercise-compact-meta-item">
              <IonIcon icon={timeOutline} />
              <span>{formatDate(exercise.assignedAt)}</span>
            </div>
          </div>

          <div className="exercise-compact-info">
            <IonBadge color="primary" className="exercise-compact-questions">
              {exercise.questions.length} preguntas
            </IonBadge>
            {exercise.weakAreas.length > 1 && (
              <IonBadge color="warning" className="exercise-compact-areas">
                {exercise.weakAreas.length} áreas
              </IonBadge>
            )}
          </div>

          <div className="exercise-compact-actions">
            <IonButton
              size="small"
              fill="outline"
              onClick={() => handleDownload('exercises')}
              disabled={!exercise.pdfExercisesUrl}
              className="exercise-compact-btn"
            >
              <IonIcon icon={documentTextOutline} slot="start" />
              Ejercicios
            </IonButton>
            <IonButton
              size="small"
              fill="outline"
              color="success"
              onClick={() => handleDownload('solutions')}
              disabled={!exercise.pdfSolutionsUrl}
              className="exercise-compact-btn"
            >
              <IonIcon icon={downloadOutline} slot="start" />
              Soluciones
            </IonButton>
          </div>
        </IonCardContent>
      </IonCard>

      <IonAlert
        isOpen={showDeleteAlert}
        onDidDismiss={() => setShowDeleteAlert(false)}
        header="Eliminar ejercicio"
        message={`¿Estás seguro de que quieres eliminar este ejercicio para ${studentName}?`}
        buttons={[
          { text: 'Cancelar', role: 'cancel' },
          {
            text: 'Eliminar',
            role: 'destructive',
            handler: () => { if (onDelete) onDelete(exercise.id); }
          }
        ]}
      />

      <IonAlert
        isOpen={showRenameAlert}
        onDidDismiss={() => setShowRenameAlert(false)}
        header="Renombrar ejercicio"
        inputs={[
          {
            name: 'name',
            type: 'text',
            placeholder: 'Nombre del ejercicio',
            value: exercise.name || '',
          }
        ]}
        buttons={[
          { text: 'Cancelar', role: 'cancel' },
          {
            text: 'Guardar',
            handler: (data) => { if (onRename) onRename(exercise.id, data.name); }
          }
        ]}
      />
    </>
  );
};

export default ExerciseCompactCard;
