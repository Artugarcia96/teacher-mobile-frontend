/** Activities (cuaderno columns) & grades. Backend: app/api/activities.py (slice C) + papers.py (slice D).
 * Slice C extends this file; keep these exported names and signatures stable — slices D and E import them. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

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
    mutationFn: (grades: GradeInput[]) => api.put(`/activities/${activityId}/grades`, { grades }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.one(activityId) });
      if (courseId) qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}
