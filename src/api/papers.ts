/** Exams & correction (slice D): prepare → collect → review. Backend: app/api/papers.py.
 * Everything the correction UI needs comes from GET /activities/{id}/correction; grades are confirmed with
 * POST /activities/{id}/review/{student_id}. Long work (AI, scans) returns {job} → poll with useActivityJob. */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, uploadWithProgress } from '../lib/api';
import { activityKeys, type ActivityKind, type GradeStatus } from './activities';
import { useJob } from './core';
import type { CourseRef, Job, JobRef, StudentRef } from './types';

export type CorrectionStep = 'prepare' | 'collect' | 'review' | 'done';
export type MatchStatus = 'unmatched' | 'suggested' | 'confirmed';
export type Difficulty = 'facil' | 'medio' | 'dificil';

/** `title`: what the question assesses, 2-4 words ("Operaciones combinadas"); "" when the AI did not give one. */
export interface RubricItem { id: string; label: string; title?: string; text: string; points: number; answer: string; steps: string[] }
export interface Rubric { title: string; items: RubricItem[]; total: number }

/** Which version of the exam a student takes or a paper is («Modelo B», «Adaptado · letra ampliada»); `base` = the
 * activity's own exam. Full versions: src/api/versions.ts. */
export type VersionKind = 'base' | 'modelo' | 'adaptada';
export interface VersionRef { key: string; label: string; kind: VersionKind }

/** `repeat_of`: the original exam when this one is its repeat ("repesca"); `student_ids`: only these students (a repeat
 * or a recovery), null = the whole class. */
export interface ActivityHead {
  id: string; title: string; kind: ActivityKind; category: string; date: string; term: number; max_score: number; course: CourseRef;
  repeat_of: string | null; student_ids: string[] | null;
}
/** `unscored`: questions nobody has scored yet («Sin corregir»). In a suggestion, those the AI did not score: it has no
 * grade (`score` null) until the teacher scores them. In a confirmed grade, those it counted as 0 without anyone
 * scoring them: to look at again. Empty once the teacher sets the grade. */
export interface CorrectionGrade {
  score: number | null; status: GradeStatus; ai_score: number | null; item_scores: Record<string, number> | null; comment?: string | null;
  unscored: string[];
}
/** One scanned page. `id` is the stable handle for page operations (`index` = its position, for display).
 * `back`: the written back of the page before it (duplex scan). `maybe_written`: discarded, but with a little ink. */
export type PageKind = 'exam_page' | 'extra_sheet' | 'blank' | 'other';
export interface ScanPage {
  id: string; index: number; url: string; thumb_url: string; kind: PageKind; page_number: number | null; total_pages: number | null;
  exam_code: string | null; written_name: string; questions: string[]; back: boolean; maybe_written: boolean;
}
/** Warnings: falta_pagina · pagina_duplicada · extra_sin_nombre · pagina_dudosa · nombre_distinto · nombre_repetido ·
 * version_distinta.
 * Info: orden · reverso_escrito · pagina_deducida · pagina_nueva_tras_nota. */
export interface PaperFlag { code: string; pages: number[] }
/** Another exam of the same teacher (a page of it in this pile, or the exam the pile was photocopied from). */
export interface ExamRef { id: string; title: string; course: string }
export type LooseReason = 'otro' | 'otro_examen' | 'sin_examen' | 'extra_sin_examen' | 'sin_leer' | 'movida';
/** `error` (reason `sin_leer`): why the AI could not read it. */
export interface LoosePage extends ScanPage { reason: LooseReason; candidates: StudentRef[]; other_exam: ExamRef | null; error: string | null }
export type Tray = 'unplaced' | 'discarded';

/** No paper and missed the exam: marked absent that day (`absent`) and/or with a repeat exam scheduled (its date and,
 * once corrected there, its grade). Only NP can be given in this exam; they are left out of the review sequence. */
export interface Missed { absent: boolean; repeat_id: string | null; repeat_date: string | null; repeat_grade: CorrectionGrade | null }

/** `version`: the version of their paper (or the one they take); null when the exam has no versions. */
export interface CorrectionStudent {
  student: StudentRef; paper_id: string | null; match_status: MatchStatus | null; match_confidence: number | null; detected_name: string | null;
  thumb_url: string | null; grade: CorrectionGrade | null; pages: ScanPage[]; flags: PaperFlag[]; extra_count: number;
  version: VersionRef | null; missed: Missed | null;
}
export interface UnmatchedPaper {
  paper_id: string; detected_name: string | null; confidence: number | null; thumb_url: string | null; pages: number; candidates: StudentRef[];
  page_list: ScanPage[]; flags: PaperFlag[];
}
/** A question the class got wrong: "P5 · Operaciones combinadas" · "0,9 de 1,5 de media · 11 por debajo de la mitad".
 * `title` is short and never cuts a formula; `below_half_ids`: who, in list order. */
export interface FrequentError {
  item_id: string; label: string; title: string; avg_points: number; points: number; below_half: number; below_half_ids: string[];
  graded: number; avg_ratio: number;
}
/** `average`/`pass_rate` include the AI's unreviewed suggestions while there are any (`provisional` of them).
 * `frequent_errors` only add up versions with Modelo A's questions: `excluded_adapted` / `excluded_modelo` papers are
 * left out ("3 exámenes adaptados no cuentan en esta tabla"). */
export interface CorrectionStats {
  papers: number; matched: number; suggested: number; confirmed: number; pending: number;
  average: number | null; pass_rate: number | null; provisional: number; frequent_errors: FrequentError[];
  excluded_adapted: number; excluded_modelo: number;
}
export interface Correction {
  activity: ActivityHead; document_url: string | null; key_url: string | null; generated: boolean; rubric: Rubric | null;
  pages_per_paper: number | null; step: CorrectionStep; students: CorrectionStudent[]; unmatched: UnmatchedPaper[];
  stats: CorrectionStats; next_pending_id: string | null;
  /** The job working on this exam or, until another one starts, an exam generation that failed (`params`: retry). */
  job: Job | null;
  exam_code: string | null; unplaced: LoosePage[]; discarded: ScanPage[]; printed_from: ExamRef | null;
  /** Other versions of the exam (Modelo B, adapted ones); `pending_adapted`: students whose measures ask for an adapted
   * version they do not take yet; `named_print`: the class print was made (named copies go back to their student). */
  versions: VersionRef[]; pending_adapted: StudentRef[]; named_print: boolean;
}

export interface Paper {
  id: string; student: StudentRef | null; detected_name: string | null; match_confidence: number | null; match_status: MatchStatus; pages_urls: string[];
  pages: ScanPage[]; flags: PaperFlag[];
}
/** Where a page goes: another paper, a student's paper (created if needed) or a tray. */
export interface PageTarget { to_paper_id?: string; to_student_id?: string; to?: Tray }
/** `resuggest`: students whose unconfirmed AI suggestion was dropped because their pages changed; `graded`: students
 * whose final grade may need another look; `page_id`/`tray`/`from_paper_id`: what undo needs. */
export interface PageOpResult {
  paper: Paper | null; resuggest: string[]; graded: string[]; page_id: string | null; tray: Tray | null; from_paper_id: string | null;
}

/** `points` null: the AI did not score this question («Sin corregir»). */
export interface AIItem { id: string; points: number | null; feedback: string; confidence: number }
/** Where one question's answer is: `index` into Review.pages, the band as fractions of the image. */
export interface Crop { page_id: string; index: number; x0: number; y0: number; x1: number; y1: number }
/** `pending`: students of the sequence still without a final grade (this one included). `match_status` "suggested":
 * the name read on the paper must be confirmed before its grade can be accepted. `crops`: per rubric item;
 * `page_hints`: for an item without crops, the index into `pages` where it most likely is. */
export interface Review {
  student: StudentRef; activity: ActivityHead; position: number; total: number; pending: number;
  prev_student_id: string | null; next_student_id: string | null; next_pending_id: string | null;
  paper_id: string | null; match_status: MatchStatus | null; detected_name: string | null;
  pages_urls: string[]; pages: ScanPage[]; flags: PaperFlag[]; items: RubricItem[]; rubric_total: number;
  grade: CorrectionGrade | null; ai: { items: AIItem[]; summary: string; suggested_score: number | null } | null;
  crops: Record<string, Crop[]>; page_hints: Record<string, number>;
  /** The paper's version («Modelo B», «Adaptado · letra ampliada»): its questions are the ones in `items`. */
  version: VersionRef | null;
  /** Missed the exam: only NP here (or wait for the repeat). */
  missed: Missed | null;
}
export interface ReviewInput { item_scores?: Record<string, number>; score?: number | null; comment?: string | null; absent?: boolean }
/** `reviewed` of `total` students of the sequence have a final grade after this one. */
export interface ReviewResult { grade: CorrectionGrade; next_student_id: string | null; reviewed: number; total: number }

export interface GenerateInput { unit_ids: string[]; n_items: number; difficulty: Difficulty; instructions?: string }

export const correctionKeys = {
  one: (activityId: string) => ['correction', activityId] as const,
  review: (activityId: string, studentId: string) => ['correction', activityId, 'review', studentId] as const,
  papers: (activityId: string) => ['correction', activityId, 'papers'] as const,
};

/** Everything that shows grades or pending work for this activity. */
export function invalidateCorrection(qc: QueryClient, activityId: string, courseId?: string) {
  qc.invalidateQueries({ queryKey: correctionKeys.one(activityId) });
  qc.invalidateQueries({ queryKey: ['versions', activityId] });
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

/** `onProgress`: the fraction sent (0-1), for «Subiendo el examen · 34 %». */
export function useUploadDocument(activityId: string) {
  return useCorrectionMutation(activityId, ({ files, onProgress }: { files: File[]; onProgress: (fraction: number) => void }) =>
    uploadWithProgress<JobRef>(`/activities/${activityId}/document`, filesForm(files), onProgress));
}

export function useGenerateExam(activityId: string) {
  return useCorrectionMutation(activityId, (body: GenerateInput) => api.post<JobRef>(`/activities/${activityId}/generate`, body));
}

export function useSaveRubric(activityId: string) {
  return useCorrectionMutation(activityId, (items: RubricItem[]) => api.put<Rubric>(`/activities/${activityId}/rubric`, { items }));
}

/** Signed URL of the printable exam (with the page marker), the answer key or the blank "Hoja extra".
 * `notice`: e.g. the marker could not be stamped on this PDF (it is served as it is). */
export function useDocumentUrl(activityId: string) {
  return useMutation({
    mutationFn: (variant: 'print' | 'key' | 'extra-sheet') => api.get<{ url: string; notice?: string | null }>(`/activities/${activityId}/${variant}.pdf`, { slow: true }),
  });
}

/** The scanned pile: pages are sorted into papers by their printed marker and written name (no page count needed).
 * `onProgress`: the fraction sent (0-1). */
export function useUploadPapers(activityId: string) {
  return useCorrectionMutation(activityId, ({ files, mode, onProgress }: {
    files: File[]; mode: 'names' | 'list_order'; onProgress: (fraction: number) => void;
  }) => uploadWithProgress<JobRef>(`/activities/${activityId}/papers`, filesForm(files, { mode }), onProgress));
}

/** Pages are identified by their stable id: a stale screen gets 409 «La página ha cambiado», never the wrong page. */
export function useMovePage(activityId: string) {
  return useCorrectionMutation(activityId, ({ paperId, pageId, ...target }: PageTarget & { paperId: string; pageId: string }) =>
    api.post<PageOpResult>(`/papers/${paperId}/pages/move`, { page_id: pageId, ...target }));
}

export function useSplitPaper(activityId: string) {
  return useCorrectionMutation(activityId, ({ paperId, pageId }: { paperId: string; pageId: string }) =>
    api.post<PageOpResult>(`/papers/${paperId}/split`, { page_id: pageId }));
}

/** The pages of `otherId` join `paperId`. */
export function useMergePapers(activityId: string) {
  return useCorrectionMutation(activityId, ({ paperId, otherId }: { paperId: string; otherId: string }) =>
    api.post<PageOpResult>(`/papers/${paperId}/merge`, { paper_id: otherId }));
}

/** Place a loose page (tray "unplaced") or restore a discarded one. */
export function useMoveLoosePage(activityId: string) {
  return useCorrectionMutation(activityId, ({ tray, pageId, ...target }: PageTarget & { tray: Tray; pageId: string }) =>
    api.post<PageOpResult>(`/activities/${activityId}/scan/${tray}/${encodeURIComponent(pageId)}/move`, target));
}

export function useDeleteLoosePage(activityId: string) {
  return useCorrectionMutation(activityId, ({ tray, pageId }: { tray: Tray; pageId: string }) =>
    api.delete(`/activities/${activityId}/scan/${tray}/${encodeURIComponent(pageId)}`));
}

/** «Volver a leer» the loose pages the AI could not read → {job} `reclassify_pages`. */
export function useReclassify(activityId: string) {
  return useCorrectionMutation(activityId, () => api.post<JobRef>(`/activities/${activityId}/scan/reclassify`));
}

/** The teacher looked at a flagged paper and it is fine: clear its flags. */
export function useFlagsChecked(activityId: string) {
  return useCorrectionMutation(activityId, (paperId: string) => api.patch<Paper>(`/papers/${paperId}`, { flags_ok: true }));
}

export function usePapers(activityId: string | undefined) {
  return useQuery({ queryKey: correctionKeys.papers(activityId!), queryFn: () => api.get<Paper[]>(`/activities/${activityId}/papers`), enabled: !!activityId });
}

/** Assign a paper: its AI grading goes along; joined to pages the student already had, it is graded again (`job`). */
export function useAssignPaper(activityId: string) {
  return useCorrectionMutation(activityId, ({ paperId, studentId }: { paperId: string; studentId: string | null }) =>
    api.patch<Paper & { job: Job | null }>(`/papers/${paperId}`, { student_id: studentId }));
}

/** «Descartar hoja»: its pages go to the discarded tray (recoverable). */
export function useDeletePaper(activityId: string) {
  return useCorrectionMutation(activityId, (paperId: string) => api.delete<{ count: number }>(`/papers/${paperId}`));
}

export function useSuggest(activityId: string) {
  return useCorrectionMutation(activityId, (studentIds?: string[]) =>
    api.post<JobRef>(`/activities/${activityId}/suggest`, { student_ids: studentIds ?? null }));
}

/** Confirms every AI suggestion except those whose paper's name is still to confirm (`skipped`) and those with a
 * question still to score (`unscored`). */
export function useAcceptAll(activityId: string, courseId?: string) {
  return useCorrectionMutation(activityId,
    () => api.post<{ count: number; skipped: number; unscored: number }>(`/activities/${activityId}/accept-all`), courseId);
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
    api.post<ReviewResult>(`/activities/${activityId}/review/${studentId}`, body), courseId);
}

/** Poll a job that works on this activity; refresh the correction when it ends. */
export function useActivityJob(activityId: string, jobId: string | null | undefined, opts?: { onDone?: (job: Job) => void; onFail?: (job: Job) => void }) {
  const qc = useQueryClient();
  return useJob(jobId, {
    onDone: (job) => { invalidateCorrection(qc, activityId); opts?.onDone?.(job); },
    onFail: (job) => { invalidateCorrection(qc, activityId); opts?.onFail?.(job); },
  });
}
