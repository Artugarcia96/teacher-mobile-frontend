import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { batch } from '../services/api';

export interface TaskStep {
  label: string;
  status: 'pending' | 'running' | 'done';
  timestamp?: number;
}

export interface BackgroundTask {
  id: string;
  type: 'exam' | 'exercises' | 'textbook' | 'report' | 'preparation' | 'iteration';
  label: string;
  /** Short user-facing paragraph explaining what the AI is doing */
  description?: string;
  status: 'running' | 'completed' | 'error';
  resultUrl?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
  /** Server-side batch job ID — enables recovery after page refresh */
  batchJobId?: string;
  /** Pre-determined result URL for batch jobs (used on resume) */
  expectedResultUrl?: string;
  /** Agentic pipeline progress steps */
  steps?: TaskStep[];
  /** Batch progress counters */
  processedItems?: number;
  totalItems?: number;
}

/** Push a progress step to a running task */
export type StepUpdater = (label: string) => void;

interface BackgroundTasksState {
  tasks: BackgroundTask[];
  addTask: (config: {
    type: BackgroundTask['type'];
    label: string;
    description?: string;
    execute: (onStep: StepUpdater) => Promise<string>; // returns resultUrl
    batchJobId?: string;
    expectedResultUrl?: string;
    /** Initial steps to show immediately */
    initialSteps?: string[];
  }) => string;
  /** Update steps externally (for batch job polling) */
  pushStep: (taskId: string, label: string) => void;
  dismissTask: (id: string) => void;
  clearCompleted: () => void;
  /** Resume polling for persisted running tasks after page refresh */
  _resumePersistedTasks: () => void;
}

let nextId = 1;

// Track which tasks have active polling to avoid duplicates
const activePolling = new Set<string>();

function startBatchPolling(
  taskId: string,
  batchJobId: string,
  expectedResultUrl: string | undefined,
  set: (fn: (s: BackgroundTasksState) => Partial<BackgroundTasksState>) => void
) {
  if (activePolling.has(taskId)) return;
  activePolling.add(taskId);

  let lastStepLabel = '';
  let hadError = false;

  const pushStepIfNew = (label: string) => {
    if (!label || label === lastStepLabel) return;
    lastStepLabel = label;
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const steps = (t.steps || []).map((st) =>
          st.status === 'running' ? { ...st, status: 'done' as const, timestamp: Date.now() } : st
        );
        steps.push({ label, status: 'running' as const, timestamp: Date.now() });
        return { ...t, steps };
      }),
    }));
  };

  // Allow external signal to poll immediately (e.g. on tab focus)
  let resolveWait: (() => void) | null = null;
  const nudge = () => { if (resolveWait) resolveWait(); };
  pollNudges.set(taskId, nudge);

  const poll = async () => {
    let interval = 3000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise<void>((r) => {
        resolveWait = r;
        setTimeout(r, interval);
      });
      resolveWait = null;

      if (!activePolling.has(taskId)) return;

      try {
        const res = await batch.getJobProgress(batchJobId);
        const data = res.data;
        const status = data.status;

        // On successful poll after errors, reset to fast polling
        if (hadError) {
          hadError = false;
          interval = 4000;
        }

        // Push intermediate progress as steps
        if (status === 'processing' || status === 'pending') {
          const itemName = data.current_item_name;
          const processed = data.processed_items;
          const total = data.total_items;

          // Always update counters so the pill shows live progress
          if (processed !== undefined || total !== undefined) {
            set((s) => ({
              tasks: s.tasks.map((t) =>
                t.id === taskId
                  ? { ...t, processedItems: processed ?? t.processedItems, totalItems: total ?? t.totalItems }
                  : t
              ),
            }));
          }

          if (itemName) {
            pushStepIfNew(itemName);
          } else if (status === 'pending' && !lastStepLabel) {
            pushStepIfNew('Preparando...');
          }
        }

        if (status === 'completed') {
          console.log(`[BackgroundTask] Batch ${taskId} completed`);
          activePolling.delete(taskId);
          pollNudges.delete(taskId);
          set((s) => ({
            tasks: s.tasks.map((t) => {
              if (t.id !== taskId) return t;
              const finalSteps = (t.steps || []).map((st) =>
                st.status !== 'done' ? { ...st, status: 'done' as const, timestamp: Date.now() } : st
              );
              return { ...t, status: 'completed' as const, resultUrl: expectedResultUrl, completedAt: Date.now(), steps: finalSteps };
            }),
          }));
          return;
        }
        if (status === 'failed' || status === 'cancelled') {
          activePolling.delete(taskId);
          pollNudges.delete(taskId);
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === taskId
                ? { ...t, status: 'error' as const, error: status === 'failed' ? 'Error en el proceso' : 'Proceso cancelado', completedAt: Date.now() }
                : t
            ),
          }));
          return;
        }
        interval = Math.min(interval + 500, 6000);
      } catch {
        // Network error — back off but mark for fast recovery
        hadError = true;
        interval = Math.min(interval + 2000, 15000);
      }
    }
  };

  poll();
}

// Map of taskId → nudge functions for immediate re-poll (e.g. on tab focus)
const pollNudges = new Map<string, () => void>();

// When tab becomes visible again, immediately re-poll all active tasks
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      pollNudges.forEach((nudge) => nudge());
    }
  });
}

export const useBackgroundTasksStore = create<BackgroundTasksState>()(
  persist(
    (set, get) => ({
      tasks: [],

      addTask: ({ type, label, description, execute, batchJobId, expectedResultUrl, initialSteps }) => {
        const id = `bg-${nextId++}-${Date.now()}`;
        const steps: TaskStep[] = (initialSteps || []).map((s, i) => ({
          label: s,
          status: i === 0 ? 'running' as const : 'pending' as const,
        }));
        const task: BackgroundTask = {
          id,
          type,
          label,
          description,
          status: 'running',
          createdAt: Date.now(),
          batchJobId,
          expectedResultUrl,
          steps: steps.length > 0 ? steps : undefined,
        };

        set((s) => ({ tasks: [...s.tasks, task] }));

        // Step updater function passed to execute()
        const onStep: StepUpdater = (stepLabel: string) => {
          set((s) => ({
            tasks: s.tasks.map((t) => {
              if (t.id !== id) return t;
              const currentSteps = t.steps || [];
              // Mark all previous 'running' steps as 'done'
              const updated = currentSteps.map((st) =>
                st.status === 'running' ? { ...st, status: 'done' as const, timestamp: Date.now() } : st
              );
              // Add the new step as 'running'
              updated.push({ label: stepLabel, status: 'running', timestamp: Date.now() });
              return { ...t, steps: updated };
            }),
          }));
        };

        if (batchJobId) {
          startBatchPolling(id, batchJobId, expectedResultUrl, set);
          execute(onStep).catch(() => {});
        } else {
          execute(onStep)
            .then((resultUrl) => {
              console.log(`[BackgroundTask] ${id} completed`);
              set((s) => ({
                tasks: s.tasks.map((t) => {
                  if (t.id !== id) return t;
                  const finalSteps = (t.steps || []).map((st) =>
                    st.status !== 'done' ? { ...st, status: 'done' as const, timestamp: Date.now() } : st
                  );
                  return { ...t, status: 'completed' as const, resultUrl, completedAt: Date.now(), steps: finalSteps };
                }),
              }));
            })
            .catch((err) => {
              console.error(`[BackgroundTask] ${id} failed:`, err);
              const message =
                err?.response?.data?.detail ||
                err?.message ||
                'Error inesperado';
              set((s) => ({
                tasks: s.tasks.map((t) =>
                  t.id === id
                    ? { ...t, status: 'error' as const, error: message, completedAt: Date.now() }
                    : t
                ),
              }));
            });
        }

        return id;
      },

      pushStep: (taskId, label) => {
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const steps = (t.steps || []).map((st) =>
              st.status === 'running' ? { ...st, status: 'done' as const, timestamp: Date.now() } : st
            );
            steps.push({ label, status: 'running', timestamp: Date.now() });
            return { ...t, steps };
          }),
        }));
      },

      dismissTask: (id) => {
        activePolling.delete(id);
        pollNudges.delete(id);
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
      },

      clearCompleted: () => {
        set((s) => ({ tasks: s.tasks.filter((t) => t.status === 'running') }));
      },

      _resumePersistedTasks: () => {
        const { tasks } = get();
        for (const task of tasks) {
          if (task.status !== 'running') continue;

          if (task.batchJobId) {
            // Resume polling for server-side batch jobs
            startBatchPolling(task.id, task.batchJobId, task.expectedResultUrl, set);
          } else {
            // Simple API call tasks can't be recovered — mark as interrupted
            set((s) => ({
              tasks: s.tasks.map((t) =>
                t.id === task.id
                  ? { ...t, status: 'error' as const, error: 'Proceso interrumpido al recargar la página', completedAt: Date.now() }
                  : t
              ),
            }));
          }
        }
      },
    }),
    {
      name: 'co-teacher-background-tasks',
      partialize: (state) => ({ tasks: state.tasks }),
    }
  )
);
