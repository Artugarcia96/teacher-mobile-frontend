import { useState, useEffect, useRef, useCallback } from 'react';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
  IonButtons, IonIcon, IonSpinner, IonAlert
} from '@ionic/react';
import {
  closeOutline, pauseOutline, playOutline, refreshOutline,
  checkmarkCircleOutline, alertCircleOutline, timeOutline,
  sparkles, documentTextOutline, informationCircleOutline,
  chevronDownOutline, wifiOutline, reloadOutline
} from 'ionicons/icons';
import { batch, BatchJobProgress, BatchJobResponse } from '../services/api';
import './BatchProgressModal.css';

interface ItemError {
  item_id: string;
  item_name: string;
  error: string;
}

interface Props {
  isOpen: boolean;
  jobId: string | null;
  title: string;
  onClose: () => void;
  onComplete?: (job: BatchJobProgress) => void;
}

const formatErrorMessage = (error: string): string => {
  if (error.includes('rate_limit') || error.includes('429')) {
    return 'Límite de velocidad de API alcanzado. Reintenta en unos minutos.';
  }
  if (error.includes('timeout') || error.includes('Timeout')) {
    return 'Tiempo de espera agotado. El servidor tardó demasiado.';
  }
  if (error.includes('invalid_api_key') || error.includes('401')) {
    return 'Error de autenticación con OpenAI.';
  }
  if (error.includes('insufficient_quota') || error.includes('402')) {
    return 'Cuota de API de OpenAI agotada.';
  }
  if (error.includes('model_not_found') || error.includes('404')) {
    return 'Modelo de IA no disponible.';
  }
  if (error.includes('server_error') || error.includes('500')) {
    return 'Error del servidor de OpenAI. Reintentar más tarde.';
  }
  if (error.includes('connection') || error.includes('network')) {
    return 'Error de conexión con el servicio de IA.';
  }
  if (error.length > 100) {
    return error.substring(0, 100) + '...';
  }
  return error;
};

const BatchProgressModal: React.FC<Props> = ({
  isOpen,
  jobId,
  title,
  onClose,
  onComplete
}) => {
  const [progress, setProgress] = useState<BatchJobProgress | null>(null);
  const [itemErrors, setItemErrors] = useState<ItemError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [connectionRetries, setConnectionRetries] = useState(0);
  const [showCancelAlert, setShowCancelAlert] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef(3000); // Start with 3 seconds
  const lastProgressRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const isPollingRef = useRef(false);
  const maxConnectionRetries = 5;

  // Keep onComplete ref up to date without triggering re-renders
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const stopPolling = useCallback(() => {
    isPollingRef.current = false;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fetchProgress = useCallback(async () => {
    if (!jobId) return;

    try {
      const res = await batch.getJobProgress(jobId);
      setProgress(res.data);
      setError(null);
      setConnectionLost(false);
      setConnectionRetries(0);
      setLoading(false);

      // Adaptive polling: if progress changed, use faster interval
      const currentProgress = res.data.processed_items;
      if (currentProgress !== lastProgressRef.current) {
        lastProgressRef.current = currentProgress;
        pollIntervalRef.current = 3000; // Reset to 3s when active
      } else {
        // No change, slow down polling (max 8 seconds)
        pollIntervalRef.current = Math.min(pollIntervalRef.current + 1000, 8000);
      }

      if (['completed', 'failed', 'cancelled'].includes(res.data.status)) {
        stopPolling();
        // Fetch full job details to get error information
        try {
          const jobRes = await batch.getJob(jobId);
          if (jobRes.data.errors && jobRes.data.errors.length > 0) {
            setItemErrors(jobRes.data.errors as ItemError[]);
          }
        } catch (e) {
          console.error('Error fetching job details:', e);
        }
        if (onCompleteRef.current) {
          onCompleteRef.current(res.data);
        }
      }
    } catch (err: any) {
      console.error('Error fetching batch progress:', err);
      setConnectionRetries(prev => prev + 1);
      
      if (connectionRetries >= maxConnectionRetries) {
        setConnectionLost(true);
        stopPolling();
        setError('Se perdió la conexión con el servidor. El proceso continúa en segundo plano.');
      } else {
        // On error, slow down polling but keep trying
        pollIntervalRef.current = Math.min(5000 + (connectionRetries * 2000), 15000);
      }
      setLoading(false);
    }
  }, [jobId, stopPolling, connectionRetries]);

  const startPolling = useCallback(() => {
    // Prevent multiple polling loops
    if (isPollingRef.current) return;
    
    stopPolling();
    isPollingRef.current = true;
    
    const poll = async () => {
      if (!isPollingRef.current) return;
      await fetchProgress();
      if (isPollingRef.current) {
        pollingRef.current = setTimeout(poll, pollIntervalRef.current);
      }
    };
    pollingRef.current = setTimeout(poll, pollIntervalRef.current);
  }, [fetchProgress, stopPolling]);

  useEffect(() => {
    if (isOpen && jobId) {
      // Reset all state for new job
      pollIntervalRef.current = 3000;
      lastProgressRef.current = 0;
      setProgress(null);
      setItemErrors([]);
      setError(null);
      setConnectionLost(false);
      setConnectionRetries(0);
      setLoading(true);
      setShowAllErrors(false);
      
      fetchProgress();
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [isOpen, jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePause = async () => {
    if (!jobId) return;
    try {
      await batch.pauseJob(jobId);
      fetchProgress();
    } catch (err) {
      console.error('Error pausing job:', err);
    }
  };

  const handleResume = async () => {
    if (!jobId) return;
    try {
      await batch.resumeJob(jobId);
      startPolling();
      fetchProgress();
    } catch (err) {
      console.error('Error resuming job:', err);
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    try {
      await batch.cancelJob(jobId);
      stopPolling();
      fetchProgress();
    } catch (err) {
      console.error('Error cancelling job:', err);
    }
  };

  const handleRetry = async () => {
    if (!jobId) return;
    try {
      await batch.retryJob(jobId);
      startPolling();
      fetchProgress();
    } catch (err) {
      console.error('Error retrying job:', err);
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds} seg`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} min ${secs} seg` : `${mins} min`;
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'completed': return 'Completado';
      case 'failed': return 'Fallido';
      case 'cancelled': return 'Cancelado';
      case 'paused': return 'Pausado';
      case 'processing': return 'Procesando';
      case 'pending': return 'Pendiente';
      default: return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return checkmarkCircleOutline;
      case 'failed': return alertCircleOutline;
      case 'cancelled': return closeOutline;
      default: return null;
    }
  };

  const isActive = progress?.status === 'processing' || progress?.status === 'pending';
  const isPaused = progress?.status === 'paused';
  const isFinished = ['completed', 'failed', 'cancelled'].includes(progress?.status || '');
  const hasFailed = progress && progress.failed_items > 0;
  const progressPercent = progress ? Math.round(progress.progress_percentage) : 0;

  // Minimized view - shows as a small floating bar at the bottom
  if (isMinimized && isOpen && !isFinished) {
    return (
      <div className="bpm-minimized-bar" onClick={() => setIsMinimized(false)}>
        <div className="bpm-minimized-content">
          <IonIcon icon={sparkles} className="bpm-minimized-icon" />
          <div className="bpm-minimized-info">
            <span className="bpm-minimized-title">{title}</span>
            <span className="bpm-minimized-progress">
              {progress?.processed_items || 0}/{progress?.total_items || 0} • {progressPercent}%
            </span>
          </div>
          <div className="bpm-minimized-bar-track">
            <div 
              className="bpm-minimized-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <IonModal 
      isOpen={isOpen} 
      onDidDismiss={onClose} 
      className="batch-progress-modal"
      backdropDismiss={isFinished}
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>{title}</IonTitle>
          <IonButtons slot="end">
            {isActive && (
              <IonButton onClick={() => setIsMinimized(true)} title="Minimizar">
                <IonIcon icon={chevronDownOutline} />
              </IonButton>
            )}
            {isFinished ? (
              <IonButton onClick={onClose}>
                <IonIcon icon={closeOutline} />
              </IonButton>
            ) : (
              <IonButton onClick={() => setShowCancelAlert(true)} color="medium">
                <IonIcon icon={closeOutline} />
              </IonButton>
            )}
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        {loading && !progress ? (
          <div className="bpm-loading">
            <div className="bpm-loading-animation">
              <div className="bpm-loading-brain">
                <div className="bpm-brain-pulse"></div>
                <div className="bpm-brain-pulse delay-1"></div>
                <div className="bpm-brain-pulse delay-2"></div>
                <IonIcon icon={sparkles} className="bpm-loading-sparkle" />
              </div>
              <div className="bpm-loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
            <div className="bpm-loading-text">
              <h3>Iniciando análisis con IA</h3>
              <p>Preparando los modelos de inteligencia artificial...</p>
            </div>
          </div>
        ) : connectionLost ? (
          <div className="bpm-connection-lost">
            <div className="bpm-connection-icon">
              <IonIcon icon={wifiOutline} />
              <div className="bpm-connection-x"></div>
            </div>
            <h3>Conexión interrumpida</h3>
            <p>Se perdió la conexión con el servidor después de {connectionRetries} intentos.</p>
            <p className="bpm-connection-note">El análisis continúa procesándose en segundo plano.</p>
            <div className="bpm-connection-actions">
              <IonButton expand="block" onClick={() => {
                setConnectionLost(false);
                setConnectionRetries(0);
                startPolling();
                fetchProgress();
              }}>
                <IonIcon icon={reloadOutline} slot="start" />
                Reconectar
              </IonButton>
              <IonButton expand="block" fill="outline" color="medium" onClick={onClose}>
                Cerrar y continuar después
              </IonButton>
            </div>
          </div>
        ) : error && !progress ? (
          <div className="bpm-error">
            <IonIcon icon={alertCircleOutline} />
            <p>{error}</p>
            <IonButton onClick={fetchProgress} fill="outline" size="small">
              Reintentar
            </IonButton>
          </div>
        ) : progress ? (
          <div className="bpm-content">
            {/* AI Visual Header */}
            <div className={`bpm-ai-header ${progress.status}`}>
              <div className="bpm-ai-icon-wrapper">
                <div className="bpm-ai-icon-bg" />
                <IonIcon icon={sparkles} className="bpm-ai-icon" />
                {isActive && (
                  <div className="bpm-sparkles">
                    <span className="bpm-sparkle" />
                    <span className="bpm-sparkle" />
                    <span className="bpm-sparkle" />
                    <span className="bpm-sparkle" />
                    <span className="bpm-sparkle" />
                  </div>
                )}
              </div>

              {/* Status Badge */}
              <div className="bpm-status">
                <div className={`bpm-status-chip ${progress.status}`}>
                  {isActive && <IonSpinner name="crescent" />}
                  {getStatusIcon(progress.status) && (
                    <IonIcon icon={getStatusIcon(progress.status)!} />
                  )}
                  {isPaused && <IonIcon icon={pauseOutline} />}
                  <span>{getStatusText(progress.status)}</span>
                </div>
              </div>
            </div>

            {/* Progress Section */}
            <div className="bpm-progress-section">
              <div className="bpm-progress-track">
                <div 
                  className={`bpm-progress-fill ${isFinished && hasFailed ? 'warning' : ''}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="bpm-progress-stats">
                <span className="bpm-progress-count">
                  <strong>{progress.processed_items}</strong> de {progress.total_items} exámenes
                </span>
                <span className="bpm-progress-percent">{progressPercent}%</span>
              </div>
            </div>

            {/* Current Item */}
            {progress.current_item_name && isActive && (
              <div className="bpm-current-item">
                <IonIcon icon={documentTextOutline} />
                <div className="bpm-current-item-text">
                  <div className="bpm-current-item-label">Analizando</div>
                  <div className="bpm-current-item-name">{progress.current_item_name}</div>
                </div>
              </div>
            )}

            {/* Time Estimate */}
            {progress.estimated_remaining_seconds && progress.estimated_remaining_seconds > 0 && isActive && (
              <div className="bpm-time-estimate">
                <IonIcon icon={timeOutline} />
                <span>Tiempo restante: <strong>{formatTime(progress.estimated_remaining_seconds)}</strong></span>
              </div>
            )}

            {/* Connection retry indicator */}
            {connectionRetries > 0 && !connectionLost && isActive && (
              <div className="bpm-connection-warning">
                <IonIcon icon={wifiOutline} />
                <span>Reconectando... (intento {connectionRetries}/{maxConnectionRetries})</span>
              </div>
            )}

            {/* Partial failures during processing */}
            {isActive && progress.failed_items > 0 && (
              <div className="bpm-partial-failures">
                <IonIcon icon={alertCircleOutline} />
                <span>{progress.failed_items} {progress.failed_items === 1 ? 'examen' : 'exámenes'} con error - se reintentarán al finalizar</span>
              </div>
            )}

            {/* Results Summary */}
            {isFinished && (
              <>
                <div className="bpm-results">
                  <div className="bpm-result-card success">
                    <div className="bpm-result-icon">
                      <IonIcon icon={checkmarkCircleOutline} />
                    </div>
                    <div className="bpm-result-count">{progress.successful_items}</div>
                    <div className="bpm-result-label">Corregidos</div>
                  </div>
                  {progress.failed_items > 0 && (
                    <div className="bpm-result-card failed">
                      <div className="bpm-result-icon">
                        <IonIcon icon={alertCircleOutline} />
                      </div>
                      <div className="bpm-result-count">{progress.failed_items}</div>
                      <div className="bpm-result-label">Fallidos</div>
                    </div>
                  )}
                </div>

                {/* Item Errors Detail */}
                {itemErrors.length > 0 && (
                  <div className="bpm-errors-section">
                    <div 
                      className="bpm-errors-header"
                      onClick={() => setShowAllErrors(!showAllErrors)}
                    >
                      <span>
                        <IonIcon icon={alertCircleOutline} />
                        {itemErrors.length} exámenes con error
                      </span>
                      <IonIcon icon={chevronDownOutline} className={showAllErrors ? 'rotated' : ''} />
                    </div>
                    {showAllErrors && (
                      <div className="bpm-errors-list">
                        {itemErrors.map((err, idx) => (
                          <div key={idx} className="bpm-error-item">
                            <div className="bpm-error-item-name">{err.item_name || `Examen ${idx + 1}`}</div>
                            <div className="bpm-error-item-message">{formatErrorMessage(err.error)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Action Buttons */}
            <div className="bpm-actions">
              {isActive && (
                <>
                  <IonButton expand="block" fill="outline" color="medium" onClick={() => setIsMinimized(true)}>
                    <IonIcon icon={chevronDownOutline} slot="start" />
                    Minimizar y seguir trabajando
                  </IonButton>
                  <IonButton expand="block" color="warning" onClick={handlePause}>
                    <IonIcon icon={pauseOutline} slot="start" />
                    Pausar
                  </IonButton>
                </>
              )}

              {isPaused && (
                <IonButton expand="block" className="bpm-primary-action" onClick={handleResume}>
                  <IonIcon icon={playOutline} slot="start" />
                  Continuar
                </IonButton>
              )}

              {isFinished && hasFailed && (
                <IonButton expand="block" color="warning" onClick={handleRetry}>
                  <IonIcon icon={refreshOutline} slot="start" />
                  Reintentar fallidos ({progress.failed_items})
                </IonButton>
              )}

              {isFinished && (
                <IonButton expand="block" className="bpm-primary-action" onClick={onClose}>
                  Ver resultados
                </IonButton>
              )}
            </div>

            {/* Background Processing Note */}
            {isActive && (
              <div className="bpm-bg-note">
                <IonIcon icon={informationCircleOutline} />
                <p>La IA está analizando cada examen. Puedes minimizar esta ventana y seguir trabajando.</p>
              </div>
            )}
          </div>
        ) : null}
      </IonContent>

      <IonAlert
        isOpen={showCancelAlert}
        onDidDismiss={() => setShowCancelAlert(false)}
        header="Cancelar análisis"
        message="¿Cancelar el análisis de IA? Los exámenes ya procesados se conservarán."
        buttons={[
          { text: 'Continuar', role: 'cancel' },
          { 
            text: 'Sí, cancelar', 
            role: 'destructive',
            handler: () => {
              handleCancel();
              onClose();
            }
          }
        ]}
      />
    </IonModal>
  );
};

export default BatchProgressModal;
