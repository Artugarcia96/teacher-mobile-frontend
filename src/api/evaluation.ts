/** Evaluación trimestral (notas finales, comentarios de boletín), reglas de recuperación e informe del departamento.
 * Backend: app/api/evaluation.py. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatProposal, plural } from '../lib/format';
import type { RecoveryRule } from './gradebook';
import type { CourseRef, Job, JobRef, StudentRef } from './types';

export type Band = 'IN' | 'SU' | 'BI' | 'NT' | 'SB';
/** `short_title`: "Examen U2" for a long "Examen U2 · Divisibilidad". */
export interface ActivityRef { id: string; title: string; short_title: string; date: string; term: number }
export interface ActivityCount { activity_id: string; title: string; count: number }
export interface EvalRow {
  student: StudentRef;
  /** Result that counts (after a recovery, if any). */
  average: number | null;
  proposed: number | null;
  qualitative: Band | null;
  final_grade: number | null;
  /** Effective grade: final_grade ?? proposed. */
  final: number | null;
  /** final_grade is below a proposal that includes a recovery: the recovery doesn't reach the acta ("Usar N"). */
  stale_adjustment: boolean;
  final_qualitative: Band | null;
  comment: string | null;
  comment_status: 'draft' | 'final' | null;
  comment_source: 'ai' | 'manual' | null;
  /** Grade that counted when the comment was written (or accepted, if it had none). */
  comment_grade: number | null;
  /** The comment says another grade than the one that counts: «Escrito para un 6 · nota 4». Never printed. */
  comment_stale: boolean;
  /** The comment's words name another grade than the one that counts, as written («un bien» with a 7): it cannot be
   *  accepted and is never printed. Checked by the server without AI. */
  comment_clash: string | null;
  /** The term's absences, justified ones included (as the student's file counts them). */
  absences: number;
  justified: number;
  /** "4 → 6 (rec.)": proposal before the recovery → proposed. */
  recovery: { before: number | null; before_proposed: number | null; score: number; activity_id: string } | null;
  /** Exams missed (attendance) still without a grade. */
  pending_exams: ActivityRef[];
  /** Past activities of the term without a grade that counts (AI drafts included). */
  missing_grades: ActivityRef[];
  /** ACS: grade referred to the student's curricular adaptation. */
  adapted: boolean;
}
export interface Evaluation {
  term: number; term_label: string; stage: string;
  stats: { average: number | null; pass_rate: number | null; failing: number; distribution: Record<Band, number> };
  rows: EvalRow[];
  recovery_rule: RecoveryRule;
  /** To draft: students with a grade and no comment, or an unreviewed AI draft written for another grade. */
  comments_missing: number;
  /** AI drafts the teacher has not accepted yet. */
  comments_unreviewed: number;
  /** Comments that say another grade: the teacher's, written or accepted for another one, or any with `comment_clash`. */
  comments_stale: number;
  /** What the proposals are still missing — same figures as the Evaluar inbox. AI drafts not counted yet: */
  to_review: ActivityCount[];
  /** Past activities with students without a grade. */
  to_grade: ActivityCount[];
  /** Students who missed an exam that still has no grade. */
  pending_absent: number;
  /** The evaluation session of this term. */
  session: { date: string; title: string; term: number } | null;
  /** Latest comments job of this term while it runs, or failed (until a new one starts). */
  job: Job | null;
}
export interface EvalRowInput { final_grade?: number | null; comment?: string | null; comment_status?: 'draft' | 'final' | null }

export interface DepartmentRow {
  course: CourseRef; stage: string; students: number;
  /** With a grade that counts: pass rate and distribution are over these. */
  graded: number; pass_rate: number | null; average: number | null;
  distribution: Record<Band, number>; units_planned: number; units_done: number; units_in_progress: string[]; units_pending: string[]; notes: string;
}
/** One table per subject: each department reads its own. */
export interface DepartmentReport { term: number; term_label: string; subjects: { subject: string; rows: DepartmentRow[] }[] }

export const evaluationKeys = {
  one: (courseId: string, term: number) => ['course', courseId, 'evaluation', term] as const,
  department: (term: number) => ['department-report', term] as const,
};

/** `live` polls every 2 s (while AI comments are being written, so they appear as each batch finishes).
 * `enabled` false for a term that hasn't started. */
export function useEvaluation(courseId: string | undefined, term: number, { live = false, enabled = true } = {}) {
  return useQuery({
    queryKey: evaluationKeys.one(courseId!, term),
    queryFn: () => api.get<Evaluation>(`/courses/${courseId}/evaluation/${term}`),
    enabled: !!courseId && enabled,
    placeholderData: (prev) => prev,
    refetchInterval: live ? 2000 : false,
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
      qc.invalidateQueries({ queryKey: ['department-report'] });
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

/** Department rule for recoveries (replace if higher, cap at 5, average both). */
export function useSetRecoveryRule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recovery_rule: RecoveryRule) => api.put<{ recovery_rule: RecoveryRule }>(`/courses/${courseId}/grading`, { recovery_rule }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['department-report'] });
    },
  });
}

export function useDepartmentReport(term: number, enabled = true) {
  return useQuery({
    queryKey: evaluationKeys.department(term),
    queryFn: () => api.get<DepartmentReport>(`/evaluation/department?term=${term}`),
    enabled,
  });
}

/** "Causas y propuestas" line of one class in the department report. */
export function useSaveDepartmentNote(term: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, text }: { courseId: string; text: string }) =>
      api.put<{ text: string }>(`/courses/${courseId}/evaluation/${term}/department-note`, { text }),
    onSuccess: ({ text }, { courseId }) => {
      qc.setQueryData<DepartmentReport>(evaluationKeys.department(term), (rep) => rep && {
        ...rep,
        subjects: rep.subjects.map((s) => ({ ...s, rows: s.rows.map((r) => (r.course.id === courseId ? { ...r, notes: text } : r)) })),
      });
    },
  });
}

export const RECOVERY_RULES: { value: RecoveryRule; label: string; hint: string }[] = [
  { value: 'replace_if_higher', label: 'Sustituye si es mayor', hint: 'Cuenta la nota de la recuperación si mejora la de la evaluación.' },
  { value: 'cap_5', label: 'Como máximo un 5', hint: 'Aprobar la recuperación deja la evaluación en 5.' },
  { value: 'average', label: 'Media de ambas', hint: 'Media entre la evaluación y la recuperación.' },
];

const BANDS: { key: Band; numeric: string }[] = [
  { key: 'IN', numeric: '<5' }, { key: 'SU', numeric: '5' }, { key: 'BI', numeric: '6' }, { key: 'NT', numeric: '7-8' }, { key: 'SB', numeric: '9-10' },
];

/** "IN 4 · SU 3 · BI 5 · NT 10 · SB 2" (ESO) or "<5: 4 · 5: 3 · 6: 5 · 7-8: 10 · 9-10: 2" (other stages), one string per
 * band: render each in a nowrap span so the line only wraps at " · ". Evaluación KPIs and the department report. */
export function distributionParts(distribution: Record<Band, number>, stage: string): string[] {
  const qualitative = stage === 'eso' || stage === 'primaria';
  return BANDS.map((b) => `${qualitative ? b.key : `${b.numeric}:`} ${distribution[b.key] ?? 0}`);
}

/** «2 faltas (1 just.)»: all the term's absences, as the student's file counts them. */
export function absencesText(r: Pick<EvalRow, 'absences' | 'justified'>): string {
  return plural(r.absences, 'falta', 'faltas') + (r.justified ? ` (${r.justified} just.)` : '');
}

/** «Escrito para un 6 · nota 4»: what a comment that no longer matches the grade says instead of its text. */
export function staleText(commentGrade: number | null, grade: number | null): string {
  return `Escrito para un ${formatProposal(commentGrade)} · nota ${formatProposal(grade)}`;
}

/** «Dice «un bien» · nota 7»: what a comment whose words name another grade says instead of its text. */
export function clashText(clash: string, grade: number | null): string {
  return `Dice «${clash}» · nota ${formatProposal(grade)}`;
}

/** An AI draft the teacher has not accepted yet. */
export function unreviewed(r: EvalRow): boolean {
  return !!r.comment && r.comment_source === 'ai' && r.comment_status !== 'final';
}

/** A comment the acta, the CSV and «Copiar» carry: written or accepted by the teacher and matching the grade. */
export function printable(r: EvalRow): boolean {
  return !!r.comment && !unreviewed(r) && !r.comment_stale && !r.comment_clash;
}

/** Since LOMLOE only Bachillerato keeps the extraordinaria; elsewhere the last recovery is "final". */
export function finalRecoveryLabel(stage: string): string {
  return stage === 'bachillerato' ? 'extraordinaria' : 'final';
}
