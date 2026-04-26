import { create } from 'zustand';
import { coursePlans } from '../services/api';
import type { CoursePlan, CoursePlanListItem, CoursePlanProgress } from '../types';

// Snake → camelCase mapping for API responses
const mapPlan = (d: any): CoursePlan => ({
  id: d.id,
  teacherId: d.teacher_id,
  subjectId: d.subject_id,
  classId: d.class_id,
  batchJobId: d.batch_job_id,
  enfoque: d.enfoque,
  depth: d.depth,
  visualDensity: d.visual_density,
  activeTrimesters: d.active_trimesters,
  guidePdfUrls: d.guide_pdf_urls,
  priorityNotes: d.priority_notes,
  examStrategy: d.exam_strategy,
  bufferSessionsPerTrimester: d.buffer_sessions_per_trimester,
  curriculum: d.curriculum,
  topicAnnotations: d.topic_annotations,
  coursePlan: d.course_plan,
  stats: d.stats,
  status: d.status,
  errorMessage: d.error_message,
  isActive: d.is_active,
  validatedAt: d.validated_at,
  plannedAt: d.planned_at,
  createdAt: d.created_at,
  completedAt: d.completed_at,
});

const mapListItem = (d: any): CoursePlanListItem => ({
  id: d.id,
  subjectId: d.subject_id,
  classId: d.class_id,
  status: d.status,
  isActive: d.is_active,
  enfoque: d.enfoque,
  title: d.title,
  totalSessions: d.total_sessions,
  topicsCreated: d.topics_created,
  validatedAt: d.validated_at,
  plannedAt: d.planned_at,
  createdAt: d.created_at,
  completedAt: d.completed_at,
});

const mapProgress = (d: any): CoursePlanProgress => ({
  totalTopics: d.total_topics,
  taughtTopics: d.taught_topics,
  currentTopic: d.current_topic,
  sessionsElapsed: d.sessions_elapsed,
  sessionsTotal: d.sessions_total,
  sessionsAheadBehind: d.sessions_ahead_behind,
  trimesterProgress: d.trimester_progress,
  upcoming: d.upcoming,
});

interface CoursePlanState {
  plans: CoursePlanListItem[];
  currentPlan: CoursePlan | null;
  progress: CoursePlanProgress | null;
  loading: boolean;

  fetchPlans: (subjectId?: string, classId?: string) => Promise<void>;
  fetchPlan: (id: string) => Promise<CoursePlan>;
  createPlan: (data: Parameters<typeof coursePlans.create>[0]) => Promise<{ id: string; batchJobId: string }>;
  /** Fase 1 — guarda edición inline del currículo. Resetea validated_at. */
  updateCurriculum: (id: string, curriculum: any) => Promise<CoursePlan>;
  /** Fase 1 — valida la programación. Habilita la planificación. */
  validatePlan: (id: string) => Promise<CoursePlan>;
  /** Fase 2 — confirma la planificación: crea topics + sesiones de calendario. */
  acceptPlan: (id: string, options?: { skip_exam_units?: string[]; extra_exams?: { name: string; date: string }[] }) => Promise<{ topics_created: number; events_created: number }>;
  generateContent: (id: string) => Promise<{ textbook_id: string; batch_job_id: string }>;
  regeneratePlan: (id: string, data: any) => Promise<{ id: string; batchJobId: string }>;
  adaptPlan: (id: string, notes?: string) => Promise<{ id: string; batchJobId: string }>;
  fetchProgress: (id: string) => Promise<CoursePlanProgress>;
  deletePlan: (id: string) => Promise<void>;
}

export const useCoursePlanStore = create<CoursePlanState>((set, get) => ({
  plans: [],
  currentPlan: null,
  progress: null,
  loading: false,

  fetchPlans: async (subjectId, classId) => {
    const hadData = get().plans.length > 0;
    if (!hadData) set({ loading: true });
    try {
      const res = await coursePlans.list(subjectId, classId);
      set({ plans: res.data.map(mapListItem), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchPlan: async (id) => {
    const res = await coursePlans.get(id);
    const plan = mapPlan(res.data);
    set({ currentPlan: plan });
    return plan;
  },

  createPlan: async (data) => {
    const res = await coursePlans.create(data);
    const plan = mapPlan(res.data);
    set((s) => ({ plans: [mapListItem(res.data), ...s.plans], currentPlan: plan }));
    return { id: plan.id, batchJobId: plan.batchJobId! };
  },

  updateCurriculum: async (id, curriculum) => {
    const res = await coursePlans.updateCurriculum(id, curriculum);
    const plan = mapPlan(res.data);
    set({ currentPlan: plan });
    return plan;
  },

  validatePlan: async (id) => {
    const res = await coursePlans.validate(id);
    const plan = mapPlan(res.data);
    set((s) => ({
      currentPlan: plan,
      plans: s.plans.map((p) => (p.id === id ? mapListItem({ ...p, validated_at: plan.validatedAt }) : p)),
    }));
    return plan;
  },

  acceptPlan: async (id, options) => {
    const res = await coursePlans.accept(id, options);
    // Refresh plan data
    const planRes = await coursePlans.get(id);
    set({ currentPlan: mapPlan(planRes.data) });
    return res.data;
  },

  generateContent: async (id) => {
    const res = await coursePlans.generateContent(id);
    return { textbook_id: res.data.textbook_id, batch_job_id: res.data.batch_job_id };
  },

  regeneratePlan: async (id, data) => {
    const res = await coursePlans.regenerate(id, data);
    const plan = mapPlan(res.data);
    set({ currentPlan: plan });
    return { id: plan.id, batchJobId: plan.batchJobId! };
  },

  adaptPlan: async (id, notes) => {
    const res = await coursePlans.adapt(id, { notes });
    const plan = mapPlan(res.data);
    set({ currentPlan: plan });
    return { id: plan.id, batchJobId: plan.batchJobId! };
  },

  fetchProgress: async (id) => {
    const res = await coursePlans.progress(id);
    const progress = mapProgress(res.data);
    set({ progress });
    return progress;
  },

  deletePlan: async (id) => {
    await coursePlans.delete(id);
    set((s) => ({
      plans: s.plans.filter((p) => p.id !== id),
      currentPlan: s.currentPlan?.id === id ? null : s.currentPlan,
      progress: s.currentPlan?.id === id ? null : s.progress,
    }));
  },
}));
