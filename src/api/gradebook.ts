/** Cuaderno (gradebook). Backend: GET /courses/{id}/gradebook. Averages come from the server only. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
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
  /** The grade that counts: the teacher's adjustment in Evaluación, else `proposed`. */
  final: number | null;
  adjusted: boolean;
  /** Of `final`. */
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

/** One cell save: `activityId` is where the grade lives (a repeat exam, maybe); `columnId` the cuaderno column it shows in. */
export interface CellSave { term: number; activityId: string; columnId: string; grade: GradeInput; optimistic: GradeCell }

// Saves that failed, per class: the typed value stays on screen as «Sin guardar» until a retry succeeds.
const unsaved = new Map<string, CellSave[]>();
const listeners = new Set<() => void>();
const EMPTY: CellSave[] = [];
const sameCell = (a: CellSave, b: CellSave) => a.term === b.term && a.columnId === b.columnId && a.grade.student_id === b.grade.student_id;
function setUnsaved(courseId: string, list: CellSave[]) {
  if (list.length) unsaved.set(courseId, list); else unsaved.delete(courseId);
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Failed saves of this class (all terms), to show as «Sin guardar» and retry. */
export function useUnsavedCells(courseId: string): CellSave[] {
  return useSyncExternalStore(subscribe, () => unsaved.get(courseId) ?? EMPTY);
}

/** Save one cell with an optimistic update. A failure puts back only that cell and keeps the typed value as unsaved
 * (`useUnsavedCells`); averages refresh from the server once the last pending save settles. */
export function useSaveCell(courseId: string) {
  const qc = useQueryClient();
  const mutationKey = ['save-cell', courseId];
  const patch = (term: number, studentId: string, columnId: string, cell: GradeCell | undefined) =>
    qc.setQueryData<Gradebook>(gradebookKeys.one(courseId, term), (gb) => gb && {
      ...gb,
      students: gb.students.map((r) => {
        if (r.student.id !== studentId) return r;
        const grades = { ...r.grades };
        if (cell) grades[columnId] = cell; else delete grades[columnId];
        return { ...r, grades };
      }),
    });
  return useMutation({
    mutationKey,
    mutationFn: ({ activityId, grade }: CellSave) => api.put(`/activities/${activityId}/grades`, { grades: [grade] }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: gradebookKeys.one(courseId, v.term) });
      setUnsaved(courseId, (unsaved.get(courseId) ?? []).filter((u) => !sameCell(u, v)));
      const prev = qc.getQueryData<Gradebook>(gradebookKeys.one(courseId, v.term))
        ?.students.find((r) => r.student.id === v.grade.student_id)?.grades[v.columnId];
      patch(v.term, v.grade.student_id, v.columnId, v.optimistic);
      return { prev };
    },
    onError: (_err, v, ctx) => {
      patch(v.term, v.grade.student_id, v.columnId, ctx?.prev);
      setUnsaved(courseId, [...(unsaved.get(courseId) ?? []).filter((u) => !sameCell(u, v)), v]);
    },
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
