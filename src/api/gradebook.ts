/** Cuaderno (gradebook). Backend: GET /courses/{id}/gradebook. Averages come from the server only. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { activityKeys, type ActivityKind, type CountsFor, type GradeInput, type GradeStatus } from './activities';
import type { Category, StudentRef } from './types';

export interface GradebookActivity {
  id: string; title: string; short_title: string; kind: ActivityKind; category: string; date: string;
  max_score: number; weight: number;
  counts_for: CountsFor; recovers_term: number | null;
  /** Only these students have a cell (recoveries, repeats); null = whole class. */
  student_ids: string[] | null;
  /** AI drafts waiting for review (not counted until confirmed). */
  suggested: number;
  pending_absent: number;
  /** Marked absent on the exam day but with a paper or a grade ("¿hoja mal asignada?"). */
  attendance_conflicts: number;
  /** Class average on the activity's own scale. */
  class_average: number | null;
}
export interface GradeCell {
  score: number | null;
  /** pending_absent: missed the exam (attendance list) and nothing fills the slot yet → "Faltó". */
  status: GradeStatus | 'pending_absent';
  absence?: 'absent' | 'justified' | null;
  /** Set when the grade lives in (and is edited through) a repeat exam. */
  activity_id?: string | null;
  repeat?: boolean;
}
export interface GradebookRow {
  student: StudentRef;
  grades: Record<string, GradeCell>;
  average: number | null;
  categories: Record<string, number | null>;
  proposed: number | null;
  qualitative: string | null;
  recovery: { before: number | null; score: number; activity_id: string } | null;
  drafts: number;
}
export interface Gradebook {
  term: number; term_label: string; stage: string; categories: Category[];
  /** Most recent first. */
  activities: GradebookActivity[]; students: GradebookRow[]; class_average: number | null;
  /** Class mean per category (Final: per term, t1..t3). */
  category_averages: Record<string, number | null>;
  drafts: number; recovery_rule: RecoveryRule;
}
export type RecoveryRule = 'replace_if_higher' | 'cap_5' | 'average';

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

/** Save one cell with an optimistic update; averages refresh from the server once the last pending save settles.
 * `activityId` is where the grade lives (a repeat exam, maybe); `columnId` the cuaderno column it shows in. */
export function useSaveCell(courseId: string, term: number) {
  const qc = useQueryClient();
  const key = gradebookKeys.one(courseId, term);
  const mutationKey = ['save-cell', courseId];
  return useMutation({
    mutationKey,
    mutationFn: ({ activityId, grade }: { activityId: string; columnId: string; grade: GradeInput; optimistic: GradeCell }) =>
      api.put(`/activities/${activityId}/grades`, { grades: [grade] }),
    onMutate: async ({ columnId, grade, optimistic }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Gradebook>(key);
      qc.setQueryData<Gradebook>(key, (gb) => gb && {
        ...gb,
        students: gb.students.map((r) => r.student.id !== grade.student_id ? r : {
          ...r, grades: { ...r.grades, [columnId]: optimistic },
        }),
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: (_data, _err, { activityId, columnId }) => {
      qc.invalidateQueries({ queryKey: activityKeys.one(activityId) });
      qc.invalidateQueries({ queryKey: activityKeys.one(columnId) });
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
