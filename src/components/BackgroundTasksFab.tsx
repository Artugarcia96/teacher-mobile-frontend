import { useState, useEffect, useRef } from 'react';
import { IonIcon, IonSpinner } from '@ionic/react';
import {
  sparkles,
  checkmarkCircleOutline,
  alertCircleOutline,
  closeOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { useBackgroundTasksStore, BackgroundTask, TaskStep } from '../store/backgroundTasksStore';
import { batch } from '../services/api';
import './BackgroundTasksFab.css';

const TYPE_LABELS: Record<string, string> = {
  exam: 'Examen',
  exercises: 'Ejercicios',
  textbook: 'Contenido',
  report: 'Informe',
  preparation: 'Preparación',
  iteration: 'Ajuste IA',
};

const BackgroundTasksFab: React.FC = () => {
  const history = useHistory();
  const tasks = useBackgroundTasksStore((s) => s.tasks);
  const dismissTask = useBackgroundTasksStore((s) => s.dismissTask);
  const resumePersistedTasks = useBackgroundTasksStore((s) => s._resumePersistedTasks);
  const [expanded, setExpanded] = useState(false);
  const autoDismissTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const resumedRef = useRef(false);

  // Resume persisted batch jobs on mount (after page refresh)
  useEffect(() => {
    if (!resumedRef.current) {
      resumedRef.current = true;
      resumePersistedTasks();
    }
  }, [resumePersistedTasks]);

  const runningTasks = tasks.filter((t) => t.status === 'running');
  const finishedTasks = tasks.filter((t) => t.status !== 'running');

  // Auto-dismiss completed tasks after 30 seconds if not interacted with
  useEffect(() => {
    finishedTasks.forEach((task) => {
      if (!autoDismissTimers.current.has(task.id)) {
        const timer = setTimeout(() => {
          dismissTask(task.id);
          autoDismissTimers.current.delete(task.id);
        }, 60000);
        autoDismissTimers.current.set(task.id, timer);
      }
    });

    return () => {
      // Cleanup timers for tasks that no longer exist
      autoDismissTimers.current.forEach((timer, id) => {
        if (!tasks.find((t) => t.id === id)) {
          clearTimeout(timer);
          autoDismissTimers.current.delete(id);
        }
      });
    };
  }, [finishedTasks, tasks, dismissTask]);

  // Nothing to show
  if (tasks.length === 0) return null;

  const handleTaskClick = (task: BackgroundTask) => {
    if (task.status === 'completed' && task.resultUrl) {
      // Clear auto-dismiss timer
      const timer = autoDismissTimers.current.get(task.id);
      if (timer) {
        clearTimeout(timer);
        autoDismissTimers.current.delete(task.id);
      }
      dismissTask(task.id);
      history.push(task.resultUrl);
      setExpanded(false);
    }
  };

  const handleDismiss = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    const timer = autoDismissTimers.current.get(taskId);
    if (timer) {
      clearTimeout(timer);
      autoDismissTimers.current.delete(taskId);
    }
    dismissTask(taskId);
  };

  const handleCancel = (e: React.MouseEvent, task: BackgroundTask) => {
    e.stopPropagation();
    if (task.batchJobId) {
      batch.cancelJob(task.batchJobId).catch(() => {});
    }
    dismissTask(task.id);
  };

  // Collapsed view: compact pill
  if (!expanded) {
    // Show most relevant task: running > recently completed > error
    const displayTask = runningTasks[0] || finishedTasks[0];
    if (!displayTask) return null;

    return (
      <div className="bgtasks-pill" onClick={() => setExpanded(true)}>
        {displayTask.status === 'running' ? (
          <div className="bgtasks-pill__icon bgtasks-pill__icon--running">
            <IonIcon icon={sparkles} />
            <span className="bgtasks-pill__pulse" />
          </div>
        ) : displayTask.status === 'completed' ? (
          <div className="bgtasks-pill__icon bgtasks-pill__icon--done">
            <IonIcon icon={checkmarkCircleOutline} />
          </div>
        ) : (
          <div className="bgtasks-pill__icon bgtasks-pill__icon--error">
            <IonIcon icon={alertCircleOutline} />
          </div>
        )}

        <div className="bgtasks-pill__text">
          <span className="bgtasks-pill__label">
            {displayTask.status === 'running'
              ? displayTask.label + (runningTasks.length > 1 ? ` (+${runningTasks.length - 1})` : '')
              : displayTask.status === 'completed'
                ? `${displayTask.label} listo`
                : 'Error'}
          </span>
          {displayTask.status === 'running' && (() => {
            const activeStep = displayTask.steps?.find((s: TaskStep) => s.status === 'running');
            const processed = displayTask.processedItems ?? 0;
            const total = displayTask.totalItems ?? 0;
            const hasProgress = total > 0;
            const desc = activeStep ? activeStep.label : displayTask.description;
            return (
              <>
                {desc && <span className="bgtasks-pill__desc">{desc}</span>}
                {hasProgress && (
                  <div className="bgtasks-pill__bar">
                    <div className="bgtasks-pill__bar-fill" style={{ width: `${Math.round((processed / total) * 100)}%` }} />
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {finishedTasks.length > 0 && runningTasks.length > 0 && (
          <span className="bgtasks-pill__badge">{tasks.length}</span>
        )}
      </div>
    );
  }

  // Expanded view: task list
  return (
    <div className="bgtasks-panel">
      <div className="bgtasks-panel__header">
        <span className="bgtasks-panel__title">Procesos en segundo plano</span>
        <button className="bgtasks-panel__close" onClick={() => setExpanded(false)}>
          <IonIcon icon={closeOutline} />
        </button>
      </div>

      <div className="bgtasks-panel__list">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`bgtasks-item bgtasks-item--${task.status}`}
            onClick={() => handleTaskClick(task)}
          >
            <div className="bgtasks-item__icon">
              {task.status === 'running' ? (
                <IonSpinner name="crescent" />
              ) : task.status === 'completed' ? (
                <IonIcon icon={checkmarkCircleOutline} />
              ) : (
                <IonIcon icon={alertCircleOutline} />
              )}
            </div>

            <div className="bgtasks-item__content">
              <span className="bgtasks-item__type">{TYPE_LABELS[task.type] || task.type}</span>
              <span className="bgtasks-item__label">{task.label}</span>
              {task.status === 'running' && task.totalItems && task.totalItems > 0 && (
                <div className="bgtasks-item__progress-row">
                  <span className="bgtasks-item__counter">{task.processedItems ?? 0}/{task.totalItems}</span>
                  <div className="bgtasks-item__bar">
                    <div className="bgtasks-item__bar-fill" style={{ width: `${Math.round(((task.processedItems ?? 0) / task.totalItems) * 100)}%` }} />
                  </div>
                </div>
              )}
              {task.status === 'running' && task.description && !(task.totalItems && task.totalItems > 0) && (
                <span className="bgtasks-item__desc">{task.description}</span>
              )}
              {task.status === 'error' && task.error && (
                <span className="bgtasks-item__error">{task.error}</span>
              )}
              {/* Agentic pipeline steps */}
              {task.steps && task.steps.length > 0 && (
                <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {task.steps.map((step, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 11, lineHeight: 1.3,
                      color: step.status === 'done' ? '#059669' : step.status === 'running' ? '#6366F1' : '#94A3B8',
                    }}>
                      {step.status === 'done' ? (
                        <IonIcon icon={checkmarkCircleOutline} style={{ fontSize: 12, flexShrink: 0 }} />
                      ) : step.status === 'running' ? (
                        <IonSpinner name="crescent" style={{ width: 12, height: 12, flexShrink: 0 }} />
                      ) : (
                        <span style={{ width: 12, height: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>·</span>
                      )}
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {task.status === 'completed' && task.resultUrl ? (
              <>
                <button
                  className="bgtasks-item__dismiss"
                  onClick={(e) => handleDismiss(e, task.id)}
                >
                  <IonIcon icon={closeOutline} />
                </button>
                <IonIcon icon={chevronForwardOutline} className="bgtasks-item__nav" />
              </>
            ) : task.status === 'running' ? (
              <button
                className="bgtasks-item__dismiss"
                onClick={(e) => handleCancel(e, task)}
                title="Cancelar"
              >
                <IonIcon icon={closeOutline} />
              </button>
            ) : (
              <button
                className="bgtasks-item__dismiss"
                onClick={(e) => handleDismiss(e, task.id)}
              >
                <IonIcon icon={closeOutline} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BackgroundTasksFab;
