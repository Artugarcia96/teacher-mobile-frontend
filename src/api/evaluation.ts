/** Evaluación trimestral: notas finales y comentarios de boletín. Backend: app/api/evaluation.py (slice C). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { JobRef, StudentRef } from './types';

export type Band = 'IN' | 'SU' | 'BI' | 'NT' | 'SB';
export interface EvalRow {
  student: StudentRef;
  average: number | null;
  proposed: number | null;
  qualitative: Band | null;
  final_grade: number | null;
  /** Effective grade: final_grade ?? proposed. */
  final: number | null;
  final_qualitative: Band | null;
  comment: string | null;
  comment_status: 'draft' | 'final' | null;
  comment_source: 'ai' | 'manual' | null;
  absences: number;
}
export interface Evaluation {
  term: number; term_label: string; stage: string;
  stats: { average: number | null; pass_rate: number | null; failing: number; distribution: Record<Band, number> };
  rows: EvalRow[];
}
export interface EvalRowInput { final_grade?: number | null; comment?: string | null; comment_status?: 'draft' | 'final' | null }

export const evaluationKeys = {
  one: (courseId: string, term: number) => ['course', courseId, 'evaluation', term] as const,
};

export function useEvaluation(courseId: string | undefined, term: number) {
  return useQuery({
    queryKey: evaluationKeys.one(courseId!, term),
    queryFn: () => api.get<Evaluation>(`/courses/${courseId}/evaluation/${term}`),
    enabled: !!courseId,
    placeholderData: (prev) => prev,
  });
}

export function useSaveEvalRow(courseId: string, term: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, ...body }: EvalRowInput & { studentId: string }) =>
      api.put<EvalRow>(`/courses/${courseId}/evaluation/${term}/students/${studentId}`, body),
    onSuccess: (row) => {
      qc.setQueryData<Evaluation>(evaluationKeys.one(courseId, term), (ev) => ev && {
        ...ev, rows: ev.rows.map((r) => (r.student.id === row.student.id ? row : r)),
      });
      qc.invalidateQueries({ queryKey: evaluationKeys.one(courseId, term) });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['student', row.student.id] });
    },
  });
}

export function useDraftComments(courseId: string, term: number) {
  return useMutation({
    mutationFn: (body: { student_ids?: string[]; tone?: string }) =>
      api.post<JobRef>(`/courses/${courseId}/evaluation/${term}/comments`, body),
  });
}
