import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge, IonButton, IonIcon, IonAlert } from '@ionic/react';
import { downloadOutline, documentTextOutline, checkmarkCircleOutline, trashOutline, createOutline, checkboxOutline } from 'ionicons/icons';
import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Exercise } from '../types';
import { exercises as exercisesApi } from '../services/api';
import './ExerciseCard.css';

interface Props {
  exercise: Exercise;
  studentName?: string;
  onDelete?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
}

const ExerciseCard: React.FC<Props> = ({ exercise, studentName, onDelete, onRename }) => {
  const history = useHistory();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showRenameAlert, setShowRenameAlert] = useState(false);

  const handleCorrection = () => {
    history.push(`/exercise-correction/${exercise.id}`);
  };

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
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const areas = exercise.weakAreas || [];
  const displayName = exercise.name
    || (areas.length > 0 ? areas.slice(0, 2).join(', ') : 'Ejercicios de práctica');

  return (
    <>
      <IonCard className="exercise-card">
        <IonCardHeader>
          <div className="exercise-card-header">
            <IonCardTitle className="exercise-card-title">
              {displayName}
              {onRename && (
                <IonButton
                  fill="clear"
                  size="small"
                  color="medium"
                  onClick={() => setShowRenameAlert(true)}
                  className="exercise-card-rename-btn"
                >
                  <IonIcon icon={createOutline} />
                </IonButton>
              )}
            </IonCardTitle>
            <div className="exercise-card-header-actions">
              {studentName && <IonBadge color="primary">{studentName}</IonBadge>}
              {onDelete && (
                <IonButton
                  fill="clear"
                  size="small"
                  color="medium"
                  onClick={() => setShowDeleteAlert(true)}
                  className="exercise-card-delete-btn"
                >
                  <IonIcon icon={trashOutline} />
                </IonButton>
              )}
            </div>
          </div>
        </IonCardHeader>
      <IonCardContent>
        <div className="exercise-card-meta">
          <span>{(exercise.questions || []).length} preguntas</span>
          <span>{formatDate(exercise.assignedAt)}</span>
        </div>

        {(exercise.weakAreas || []).length > 0 && (
          <div className="exercise-card-areas">
            {(exercise.weakAreas || []).map((area) => (
              <IonBadge key={area} color="warning" className="exercise-card-area">{area}</IonBadge>
            ))}
          </div>
        )}

        <div className="exercise-card-questions">
          {(exercise.questions || []).slice(0, 2).map((q, i) => (
            <div key={q.id || i} className="exercise-card-q">
              <span className="exercise-card-q-num">{i + 1}.</span>
              <span className="exercise-card-q-text">{q.text?.substring(0, 80)}{q.text?.length > 80 ? '...' : ''}</span>
              {q.solution && <IonIcon icon={checkmarkCircleOutline} color="success" className="exercise-card-solution-icon" />}
            </div>
          ))}
          {(exercise.questions || []).length > 2 && (
            <div className="exercise-card-more">+ {(exercise.questions || []).length - 2} preguntas más</div>
          )}
        </div>

        <div className="exercise-card-downloads">
          <IonButton
            size="small"
            fill="outline"
            onClick={() => handleDownload('exercises')}
            disabled={!exercise.pdfExercisesUrl}
          >
            <IonIcon icon={documentTextOutline} slot="start" />
            PDF ejercicios
          </IonButton>
          <IonButton
            size="small"
            fill="outline"
            color="success"
            onClick={() => handleDownload('solutions')}
            disabled={!exercise.pdfSolutionsUrl}
          >
            <IonIcon icon={downloadOutline} slot="start" />
            Con soluciones
          </IonButton>
          <IonButton
            size="small"
            fill="solid"
            color="tertiary"
            onClick={handleCorrection}
          >
            <IonIcon icon={checkboxOutline} slot="start" />
            Corregir
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

export default ExerciseCard;
