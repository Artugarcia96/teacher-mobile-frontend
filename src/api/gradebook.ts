/** Cuaderno (gradebook). Backend: GET /courses/{id}/gradebook (slice C). Averages come from the server only. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { activityKeys, type ActivityKind, type GradeInput, type GradeStatus } from './activities';
import type { Category, StudentRef } from './types';

export interface GradebookActivity {
  id: string; title: string; short_title: string; kind: ActivityKind; category: string; date: string;
  max_score: number; weight: number; has_suggestions: boolean;
}
export interface GradeCell { score: number | null; status: GradeStatus }
export interface GradebookRow {
  student: StudentRef;
  grades: Record<string, GradeCell>;
  average: number | null;
  categories: Record<string, number | null>;
  proposed: number | null;
  qualitative: string | null;
}
export interface Gradebook {
  term: number; term_label: string; stage: string; categories: Category[];
  activities: GradebookActivity[]; students: GradebookRow[]; class_average: number | null;
}

export const gradebookKeys = {
  one: (courseId: string, term: number) => ['course', courseId, 'gradebook', term] as const,
};

export function useGradebook(courseId: string, term: number) {
  return useQuery({
    queryKey: gradebookKeys.one(courseId, term),
    queryFn: () => api.get<Gradebook>(`/courses/${courseId}/gradebook?term=${term}`),
    placeholderData: (prev) => prev,
  });
}

/** Save one cell with an optimistic update; averages refresh from the server once the last pending save settles. */
export function useSaveCell(courseId: string, term: number) {
  const qc = useQueryClient();
  const key = gradebookKeys.one(courseId, term);
  const mutationKey = ['save-cell', courseId];
  return useMutation({
    mutationKey,
    mutationFn: ({ activityId, grade }: { activityId: string; grade: GradeInput; optimistic: GradeCell }) =>
      api.put(`/activities/${activityId}/grades`, { grades: [grade] }),
    onMutate: async ({ activityId, grade, optimistic }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Gradebook>(key);
      qc.setQueryData<Gradebook>(key, (gb) => gb && {
        ...gb,
        students: gb.students.map((r) => r.student.id !== grade.student_id ? r : {
          ...r, grades: { ...r.grades, [activityId]: optimistic },
        }),
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: (_data, _err, { activityId }) => {
      qc.invalidateQueries({ queryKey: activityKeys.one(activityId) });
      if (qc.isMutating({ mutationKey }) <= 1) {
        qc.invalidateQueries({ queryKey: ['course', courseId, 'gradebook'] });
        qc.invalidateQueries({ queryKey: ['course', courseId, 'evaluation'] });
        qc.invalidateQueries({ queryKey: ['course', courseId, 'students'] });
        qc.invalidateQueries({ queryKey: ['inbox'] });
        qc.invalidateQueries({ queryKey: ['today'] });
      }
    },
  });
}
