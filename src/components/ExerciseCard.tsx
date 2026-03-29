import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge, IonButton, IonIcon, IonAlert, IonTextarea, IonSpinner, IonChip, IonItem } from '@ionic/react';
import { downloadOutline, documentTextOutline, checkmarkCircleOutline, trashOutline, createOutline, checkboxOutline, calendarOutline, refreshOutline, chevronDownOutline, chevronUpOutline, timeOutline } from 'ionicons/icons';
import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Exercise } from '../types';
import { exercises as exercisesApi, authenticatedFetch } from '../services/api';
import { useExercisesStore } from '../store/exercisesStore';
import './ExerciseCard.css';

interface Props {
  exercise: Exercise;
  studentName?: string;
  onDelete?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  showIteration?: boolean;
  grade?: number | null;
  maxScore?: number;
}

const ExerciseCard: React.FC<Props> = ({ exercise, studentName, onDelete, onRename, showIteration = false, grade, maxScore = 10 }) => {
  const history = useHistory();
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showRenameAlert, setShowRenameAlert] = useState(false);
  const [showIterationUI, setShowIterationUI] = useState(false);
  const [iterationInstruction, setIterationInstruction] = useState('');
  const [iterating, setIterating] = useState(false);
  const [iterationError, setIterationError] = useState('');
  const iterateExercise = useExercisesStore((s) => s.iterateExercise);

  const handleCorrection = () => {
    history.push(`/exercise-correction/${exercise.id}`);
  };

  const handleIterate = async () => {
    if (!iterationInstruction.trim()) return;
    setIterating(true);
    setIterationError('');
    try {
      await iterateExercise(exercise.id, iterationInstruction.trim());
      setIterationInstruction('');
      setShowIterationUI(false);
    } catch (err: any) {
      setIterationError(err.response?.data?.detail || 'Error al ajustar ejercicios');
    } finally {
      setIterating(false);
    }
  };

  const getDateStatusColor = (status?: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'ok': return 'success';
      case 'today': return 'warning';
      case 'tomorrow': return 'warning';
      case 'soon': return 'warning';
      case 'urgent': return 'danger';
      case 'overdue': return 'danger';
      default: return 'medium';
    }
  };

  const handleDownload = (type: 'exercises' | 'solutions') => {
    const url = type === 'exercises'
      ? exercisesApi.downloadExercisesPdf(exercise.id)
      : exercisesApi.downloadSolutionsPdf(exercise.id);
    authenticatedFetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const dateStr = exercise.assignedAt ? new Date(exercise.assignedAt).toISOString().slice(0, 10) : '';
        const nameSlug = (studentName || '').replace(/\s+/g, '_');
        const prefix = type === 'exercises' ? 'ejercicios' : 'soluciones';
        a.download = `${prefix}_${exercise.name || 'ejercicio'}${nameSlug ? '_' + nameSlug : ''}${dateStr ? '_' + dateStr : ''}.pdf`;
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
  const baseName = exercise.name
    || (areas.length > 0 ? areas.slice(0, 2).join(', ') : 'Ejercicios de práctica');
  const displayName = baseName;

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
              {exercise.correctionStatus === 'corrected' && (
                <span className="exercise-card-status exercise-card-status--corrected">Corregido</span>
              )}
              {exercise.correctionStatus === 'in_progress' && (
                <span className="exercise-card-status exercise-card-status--in-progress">En corrección</span>
              )}
              {grade != null && (
                <span className={`exercise-card-grade ${grade / maxScore >= 0.5 ? 'exercise-card-grade--pass' : 'exercise-card-grade--fail'}`}>
                  {grade}/{maxScore}
                </span>
              )}
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

        {/* Date indicators */}
        {(exercise.deliveryDate || exercise.correctionDate) && (
          <div className="exercise-card-dates">
            {exercise.deliveryDate && (
              <div className="exercise-card-date">
                <IonIcon icon={calendarOutline} />
                <span>Entrega: {formatDate(exercise.deliveryDate)}</span>
                {exercise.deliveryStatus && (
                  <IonBadge color={getDateStatusColor(exercise.deliveryStatus)}>
                    {exercise.deliveryStatus === 'today' ? 'Hoy' : 
                     exercise.deliveryStatus === 'tomorrow' ? 'Mañana' : 
                     exercise.deliveryStatus === 'delivered' ? 'Entregado' : 'Pendiente'}
                  </IonBadge>
                )}
              </div>
            )}
            {exercise.correctionDate && (
              <div className="exercise-card-date">
                <IonIcon icon={timeOutline} />
                <span>Recogida: {formatDate(exercise.correctionDate)}</span>
                {exercise.correctionDeadlineStatus && (
                  <IonBadge color={getDateStatusColor(exercise.correctionDeadlineStatus)}>
                    {exercise.correctionDeadlineStatus === 'urgent' ? 'Urgente' :
                     exercise.correctionDeadlineStatus === 'overdue' ? 'Atrasado' :
                     exercise.correctionDeadlineStatus === 'completed' ? 'Recogido' :
                     exercise.correctionDeadlineStatus === 'soon' ? 'Próximo' : 'OK'}
                  </IonBadge>
                )}
              </div>
            )}
          </div>
        )}

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

        {/* Iteration UI */}
        {showIteration && exercise.correctionStatus !== 'corrected' && (
          <div className="exercise-card-iteration">
            <button 
              className="exercise-card-iteration-toggle"
              onClick={() => setShowIterationUI(!showIterationUI)}
            >
              <IonIcon icon={createOutline} />
              <span>Ajustar ejercicios</span>
              <IonIcon icon={showIterationUI ? chevronUpOutline : chevronDownOutline} />
            </button>

            {showIterationUI && (
              <div className="exercise-card-iteration-content">
                <p className="exercise-card-iteration-desc">
                  Describe los cambios que quieres y la IA ajustará los ejercicios.
                </p>
                
                <div className="exercise-card-iteration-quick">
                  <IonChip outline onClick={() => setIterationInstruction('Simplifica los ejercicios')}>
                    Simplificar
                  </IonChip>
                  <IonChip outline onClick={() => setIterationInstruction('Añade un ejercicio más')}>
                    +1 ejercicio
                  </IonChip>
                  <IonChip outline onClick={() => setIterationInstruction('Añade más variedad')}>
                    Más variedad
                  </IonChip>
                </div>

                <IonItem lines="none" className="exercise-card-iteration-input">
                  <IonTextarea
                    value={iterationInstruction}
                    onIonInput={(e) => setIterationInstruction(e.detail.value ?? '')}
                    placeholder="Ej: Hazlos más difíciles, añade ejercicios de fracciones..."
                    rows={2}
                  />
                </IonItem>

                {iterationError && <p className="exercise-card-iteration-error">{iterationError}</p>}

                <IonButton
                  expand="block"
                  fill="outline"
                  size="small"
                  onClick={handleIterate}
                  disabled={iterating || !iterationInstruction.trim()}
                >
                  {iterating ? (
                    <><IonSpinner name="crescent" /> Aplicando...</>
                  ) : (
                    <><IonIcon icon={refreshOutline} slot="start" /> Aplicar cambios</>
                  )}
                </IonButton>

                {exercise.iterationHistory && exercise.iterationHistory.length > 0 && (
                  <div className="exercise-card-iteration-history">
                    <span className="exercise-card-iteration-history-label">
                      Versión {exercise.iterationHistory.length + 1}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
