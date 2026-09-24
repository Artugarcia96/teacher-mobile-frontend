/** Exams & correction (slice D): prepare → collect → review. Backend: app/api/papers.py.
 * Everything the correction UI needs comes from GET /activities/{id}/correction; grades are confirmed with
 * POST /activities/{id}/review/{student_id}. Long work (AI, scans) returns {job} → poll with useActivityJob. */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { activityKeys, type ActivityKind, type GradeStatus } from './activities';
import { useJob } from './core';
import type { CourseRef, Job, JobRef, StudentRef } from './types';

export type CorrectionStep = 'prepare' | 'collect' | 'review' | 'done';
export type MatchStatus = 'unmatched' | 'suggested' | 'confirmed';
export type Difficulty = 'facil' | 'medio' | 'dificil';

export interface RubricItem { id: string; label: string; text: string; points: number; answer: string; steps: string[] }
export interface Rubric { title: string; items: RubricItem[]; total: number }

export interface ActivityHead {
  id: string; title: string; kind: ActivityKind; category: string; date: string; term: number; max_score: number; course: CourseRef;
}
export interface CorrectionGrade {
  score: number | null; status: GradeStatus; ai_score: number | null; item_scores: Record<string, number> | null; comment?: string | null;
}
export interface CorrectionStudent {
  student: StudentRef; paper_id: string | null; match_status: MatchStatus | null; match_confidence: number | null; detected_name: string | null;
  thumb_url: string | null; grade: CorrectionGrade | null;
}
export interface UnmatchedPaper {
  paper_id: string; detected_name: string | null; confidence: number | null; thumb_url: string | null; pages: number; candidates: StudentRef[];
}
export interface FrequentError { item_id: string; label: string; text: string; avg_ratio: number }
export interface CorrectionStats {
  papers: number; matched: number; suggested: number; confirmed: number; pending: number;
  average: number | null; pass_rate: number | null; frequent_errors: FrequentError[];
}
export interface Correction {
  activity: ActivityHead; document_url: string | null; key_url: string | null; generated: boolean; rubric: Rubric | null;
  pages_per_paper: number | null; step: CorrectionStep; students: CorrectionStudent[]; unmatched: UnmatchedPaper[];
  stats: CorrectionStats; next_pending_id: string | null; job: Job | null;
}

export interface Paper {
  id: string; student: StudentRef | null; detected_name: string | null; match_confidence: number | null; match_status: MatchStatus; pages_urls: string[];
}

export interface AIItem { id: string; points: number; feedback: string; confidence: number }
export interface Review {
  student: StudentRef; activity: ActivityHead; position: number; total: number;
  prev_student_id: string | null; next_student_id: string | null; next_pending_id: string | null;
  paper_id: string | null; pages_urls: string[]; items: RubricItem[]; rubric_total: number;
  grade: CorrectionGrade | null; ai: { items: AIItem[]; summary: string; suggested_score: number | null } | null;
}
export interface ReviewInput { item_scores?: Record<string, number>; score?: number | null; comment?: string | null; absent?: boolean }

export interface GenerateInput { unit_ids: string[]; n_items: number; difficulty: Difficulty; instructions?: string }

export const correctionKeys = {
  one: (activityId: string) => ['correction', activityId] as const,
  review: (activityId: string, studentId: string) => ['correction', activityId, 'review', studentId] as const,
  papers: (activityId: string) => ['correction', activityId, 'papers'] as const,
};

/** Everything that shows grades or pending work for this activity. */
export function invalidateCorrection(qc: QueryClient, activityId: string, courseId?: string) {
  qc.invalidateQueries({ queryKey: correctionKeys.one(activityId) });
  qc.invalidateQueries({ queryKey: activityKeys.one(activityId) });
  qc.invalidateQueries({ queryKey: ['inbox'] });
  qc.invalidateQueries({ queryKey: ['today'] });
  if (courseId) qc.invalidateQueries({ queryKey: ['course', courseId] });
}

export function useCorrection(activityId: string | undefined) {
  return useQuery({
    queryKey: correctionKeys.one(activityId!),
    queryFn: () => api.get<Correction>(`/activities/${activityId}/correction`),
    enabled: !!activityId,
  });
}

function useCorrectionMutation<I, O>(activityId: string, fn: (input: I) => Promise<O>, courseId?: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidateCorrection(qc, activityId, courseId) });
}

function filesForm(files: File[], extra?: Record<string, string>) {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  Object.entries(extra ?? {}).forEach(([k, v]) => form.append(k, v));
  return form;
}

export function useUploadDocument(activityId: string) {
  return useCorrectionMutation(activityId, (files: File[]) => api.upload<JobRef>(`/activities/${activityId}/document`, filesForm(files)));
}

export function useGenerateExam(activityId: string) {
  return useCorrectionMutation(activityId, (body: GenerateInput) => api.post<JobRef>(`/activities/${activityId}/generate`, body));
}

export function useSaveRubric(activityId: string) {
  return useCorrectionMutation(activityId, (items: RubricItem[]) => api.put<Rubric>(`/activities/${activityId}/rubric`, { items }));
}

/** Signed URL of the printable exam or the answer key (rendered on first request). */
export function useDocumentUrl(activityId: string) {
  return useMutation({
    mutationFn: (variant: 'print' | 'key') => api.get<{ url: string }>(`/activities/${activityId}/${variant}.pdf`),
  });
}

export function useUploadPapers(activityId: string) {
  return useCorrectionMutation(activityId, ({ files, pagesPerPaper, mode }: { files: File[]; pagesPerPaper: number; mode: 'names' | 'list_order' }) =>
    api.upload<JobRef>(`/activities/${activityId}/papers`, filesForm(files, { pages_per_paper: String(pagesPerPaper), mode })));
}

export function usePapers(activityId: string | undefined) {
  return useQuery({ queryKey: correctionKeys.papers(activityId!), queryFn: () => api.get<Paper[]>(`/activities/${activityId}/papers`), enabled: !!activityId });
}

export function useAssignPaper(activityId: string) {
  return useCorrectionMutation(activityId, ({ paperId, studentId }: { paperId: string; studentId: string | null }) =>
    api.patch<Paper>(`/papers/${paperId}`, { student_id: studentId }));
}

export function useDeletePaper(activityId: string) {
  return useCorrectionMutation(activityId, (paperId: string) => api.delete(`/papers/${paperId}`));
}

export function useSuggest(activityId: string) {
  return useCorrectionMutation(activityId, (studentIds?: string[]) =>
    api.post<JobRef>(`/activities/${activityId}/suggest`, { student_ids: studentIds ?? null }));
}

export function useAcceptAll(activityId: string, courseId?: string) {
  return useCorrectionMutation(activityId, () => api.post<{ count: number }>(`/activities/${activityId}/accept-all`), courseId);
}

export function useReview(activityId: string | undefined, studentId: string | null | undefined) {
  return useQuery({
    queryKey: correctionKeys.review(activityId!, studentId!),
    queryFn: () => api.get<Review>(`/activities/${activityId}/review/${studentId}`),
    enabled: !!activityId && !!studentId,
  });
}

export function prefetchReview(qc: QueryClient, activityId: string, studentId: string | null | undefined) {
  if (!studentId) return;
  qc.prefetchQuery({
    queryKey: correctionKeys.review(activityId, studentId),
    queryFn: () => api.get<Review>(`/activities/${activityId}/review/${studentId}`),
    staleTime: 30_000,
  });
}

export function useConfirmReview(activityId: string, courseId?: string) {
  return useCorrectionMutation(activityId, ({ studentId, ...body }: ReviewInput & { studentId: string }) =>
    api.post<{ grade: CorrectionGrade; next_student_id: string | null }>(`/activities/${activityId}/review/${studentId}`, body), courseId);
}

/** Poll a job that works on this activity; refresh the correction when it ends. */
export function useActivityJob(activityId: string, jobId: string | null | undefined, opts?: { onDone?: (job: Job) => void; onFail?: (job: Job) => void }) {
  const qc = useQueryClient();
  return useJob(jobId, {
    onDone: (job) => { invalidateCorrection(qc, activityId); opts?.onDone?.(job); },
    onFail: (job) => { invalidateCorrection(qc, activityId); opts?.onFail?.(job); },
  });
}
