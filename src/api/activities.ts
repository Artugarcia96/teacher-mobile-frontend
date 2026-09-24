/** Activities (cuaderno columns) & grades. Backend: app/api/activities.py (slice C) + papers.py (slice D).
 * Slice C extends this file; keep these exported names and signatures stable — slices D and E import them. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CourseRef, Ok, StudentRef } from './types';

export type ActivityKind = 'exam' | 'worksheet' | 'task' | 'oral' | 'notebook' | 'attitude' | 'other';
export type GradeStatus = 'empty' | 'suggested' | 'confirmed' | 'absent' | 'exempt';

export interface ActivityInput {
  title: string; kind: ActivityKind; category?: string; date: string; max_score?: number; weight?: number; unit_ids?: string[];
}
export interface ActivityBrief { id: string; course_id: string; title: string; kind: ActivityKind; category: string; date: string; term: number; max_score: number; weight: number }

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

// ── Slice C: activity detail, edit and delete ────────────────────────────────

export type ActivityStatus = 'preparing' | 'collecting' | 'reviewing' | 'done';

export interface SheetRow {
  student: StudentRef; score: number | null; status: GradeStatus; comment: string | null; has_paper: boolean; ai_score: number | null;
}

export interface ActivityDetail extends ActivityBrief {
  course: CourseRef;
  category_label: string;
  unit_ids: string[];
  material_id: string | null;
  document_url: string | null;
  rubric: Record<string, unknown> | null;
  pages_per_paper: number | null;
  status: ActivityStatus;
  stats: { graded: number; total: number; average: number | null; pass_rate: number | null; suggested: number };
  sheet: SheetRow[];
  papers: { total: number; confirmed: number; suggested: number; unmatched: number };
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

/** Default category for a kind (mirrors grading.KIND_CATEGORY; the server validates). */
export const KIND_CATEGORY: Record<ActivityKind, string> = {
  exam: 'exams', worksheet: 'work', task: 'work', notebook: 'work', oral: 'exams', attitude: 'observation', other: 'work',
};
