/** Activities (cuaderno columns) & grades. Backend: app/api/activities.py + papers.py.
 * Keep these exported names and signatures stable: papers.ts and the activity pages import them. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CourseRef, Ok, StudentRef } from './types';

export type ActivityKind = 'exam' | 'worksheet' | 'task' | 'oral' | 'notebook' | 'attitude' | 'other';
export type GradeStatus = 'empty' | 'suggested' | 'confirmed' | 'absent' | 'exempt';
/** What an activity counts for: the term average, nothing (evaluación inicial) or the recovery of a term (4 = final). */
export type CountsFor = 'average' | 'none' | 'recovery';

export interface ActivityInput {
  title: string; kind: ActivityKind; category?: string; date: string; max_score?: number; weight?: number; unit_ids?: string[];
  counts_for?: CountsFor; recovers_term?: number | null;
  /** Only these students (recovery for the failing ones); null = whole class. */
  student_ids?: string[] | null;
}
export interface ActivityBrief {
  id: string; course_id: string; title: string; kind: ActivityKind; category: string; date: string; term: number; max_score: number; weight: number;
  counts_for: CountsFor; recovers_term: number | null; student_ids: string[] | null;
  /** Repeat exam ("repesca"): the original activity whose slot its grades fill. */
  repeat_of: string | null;
}

/** Body of PUT /activities/{id}/grades (one or many students). */
export interface GradeInput {
  student_id: string;
  score?: number | null;
  status?: GradeStatus;
  item_scores?: Record<string, number> | null;
  comment?: string | null;
}

export const activityKeys = {
  one: (id: string) => ['activity', id] as const,
};

export function useCreateActivity(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ActivityInput) => api.post<ActivityBrief>(`/courses/${courseId}/activities`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course', courseId] }); qc.invalidateQueries({ queryKey: ['inbox'] }); },
  });
}

export function useSaveGrades(activityId: string, courseId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (grades: GradeInput[]) => api.put<ActivityDetail>(`/activities/${activityId}/grades`, { grades }),
    onSuccess: (data) => {
      qc.setQueryData(activityKeys.one(activityId), data);
      if (courseId) qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

// ── Activity detail, edit and delete ─────────────────────────────────────────

export type ActivityStatus = 'preparing' | 'collecting' | 'reviewing' | 'done';

export interface SheetRow {
  student: StudentRef; score: number | null; status: GradeStatus; comment: string | null; has_paper: boolean; ai_score: number | null;
  /** Attendance list of the exam day. */
  absence?: 'absent' | 'justified' | null;
  /** Missed it and nothing fills the slot yet: show "Faltó". */
  pending_absent?: boolean;
}
export interface AbsentStudent { student: StudentRef; justified: boolean; pending: boolean; repeat_id: string | null }
export interface AttendanceConflict { student: StudentRef; has_paper: boolean; score: number | null; status: GradeStatus }
export interface ActivityLink { id: string; title: string; date: string; student_ids: string[] | null }

export interface ActivityDetail extends ActivityBrief {
  course: CourseRef;
  category_label: string;
  unit_ids: string[];
  material_id: string | null;
  document_url: string | null;
  rubric: Record<string, unknown> | null;
  pages_per_paper: number | null;
  status: ActivityStatus;
  stats: { graded: number; total: number; average: number | null; pass_rate: number | null; suggested: number; pending_absent: number };
  sheet: SheetRow[];
  papers: { total: number; confirmed: number; suggested: number; unmatched: number };
  /** Exams: students marked absent on the exam day. */
  absent_students: AbsentStudent[];
  /** Marked absent but with a paper or a grade ("¿hoja mal asignada o lista mal pasada?"). */
  attendance_conflicts: AttendanceConflict[];
  repeats: ActivityLink[];
  original: ActivityLink | null;
}

export function useActivity(id: string | undefined) {
  return useQuery({ queryKey: activityKeys.one(id!), queryFn: () => api.get<ActivityDetail>(`/activities/${id}`), enabled: !!id });
}

export function usePatchActivity(id: string, courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ActivityInput>) => api.patch<ActivityDetail>(`/activities/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(activityKeys.one(id), data);
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
}

export function useDeleteActivity(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<Ok>(`/activities/${id}`),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: activityKeys.one(id) });
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

/** Repeat exam for students who missed it (default: those still pending). Its grades fill the original's column. */
export function useScheduleRepeat(activityId: string, courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; student_ids?: string[] }) => api.post<ActivityBrief>(`/activities/${activityId}/repeat`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.one(activityId) });
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

/** Default category for a kind (mirrors grading.KIND_CATEGORY; the server validates). */
export const KIND_CATEGORY: Record<ActivityKind, string> = {
  exam: 'exams', worksheet: 'work', task: 'work', notebook: 'work', oral: 'exams', attitude: 'observation', other: 'work',
};
