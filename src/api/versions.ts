/** Versiones de un examen: Modelo B y versiones adaptadas a las medidas de apoyo, y la impresión con nombre para la
 * clase. Backend: app/api/versions.py (docs/ARCHITECTURE.md §5). Writing a version with the AI is a job
 * (`prepare_versions`) followed with useActivityJob. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { invalidateCorrection, type Rubric, type RubricItem, type VersionKind, type VersionRef } from './papers';
import type { Job, Measure, StudentRef } from './types';

/** `base` = the activity's own exam (key "A"). `draft`: written by the AI and not opened or edited yet.
 * `comparable`: Modelo A's questions (its results add up per question). `stale`: written from an earlier Modelo A.
 * `same_questions`: Modelo A's questions in large print (edited in Modelo A); `enlarged`: the teacher's own PDF on A3.
 * `in_use`: papers or grades of it exist (it can no longer be redone or removed). `warnings`: what to look at before
 * printing it. */
export interface Version {
  key: string; kind: VersionKind; label: string; measures: Measure[]; student_ids: string[]; code: string | null;
  status: 'generating' | 'ready' | 'failed'; error: string | null; draft: boolean; comparable: boolean; stale: boolean;
  same_questions: boolean; in_use: boolean; large_print: boolean; enlarged: boolean; pages: number | null; items: number;
  warnings: string[];
}
export interface Adaptation { student: StudentRef; measures: Measure[]; version: VersionRef }
/** Measures that do not change the document: «Más tiempo: Mario, Lucía». */
export interface Reminder { measure: Measure; label: string; students: StudentRef[] }
/** `pending_adapted`: students whose measures ask for an adapted version they do not take yet.
 * `named_print`: the class print was made (the scans are read with its print map). `numbers`: each student's number on
 * the named copies and the printed class list. */
export interface Versions {
  base: Version; versions: Version[]; adaptations: Adaptation[]; reminders: Reminder[]; pending_adapted: StudentRef[]; named_print: boolean;
  numbers: Record<string, number>;
}
export interface VersionDetail extends Version { rubric: Rubric | null }

export const versionKeys = {
  all: (activityId: string) => ['versions', activityId] as const,
  one: (activityId: string, key: string) => ['versions', activityId, key] as const,
};

export function useVersions(activityId: string, enabled = true) {
  return useQuery({
    queryKey: versionKeys.all(activityId), queryFn: () => api.get<Versions>(`/activities/${activityId}/versions`), enabled,
  });
}

/** Opening a version is reviewing it: it stops being an AI draft, and the list says so. */
export function useVersion(activityId: string, key: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: versionKeys.one(activityId, key!),
    queryFn: async () => {
      const v = await api.get<VersionDetail>(`/activities/${activityId}/versions/${key}`);
      qc.invalidateQueries({ queryKey: versionKeys.all(activityId), exact: true });
      return v;
    },
    enabled: !!key,
  });
}

function useVersionsMutation<I, O>(activityId: string, fn: (input: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['versions', activityId] });
      invalidateCorrection(qc, activityId);
    },
  });
}

/** «+ Modelo B»: the AI writes a parallel exam; A, B, A, B… by list order. */
export function useCreateModelB(activityId: string) {
  return useVersionsMutation(activityId, () => api.post<{ job: Job }>(`/activities/${activityId}/versions`, { kind: 'modelo' }));
}

/** «Preparar versiones adaptadas» from the class's measures. `job` null: every version existed, students moved. */
export function usePrepareAdapted(activityId: string) {
  return useVersionsMutation(activityId, () => api.post<{ job: Job | null }>(`/activities/${activityId}/versions/adapted`));
}

export function useRedoVersion(activityId: string) {
  return useVersionsMutation(activityId, (key: string) => api.post<{ job: Job }>(`/activities/${activityId}/versions/${key}/redo`));
}

export function useRemoveVersion(activityId: string) {
  return useVersionsMutation(activityId, (key: string) => api.delete<Versions>(`/activities/${activityId}/versions/${key}`));
}

/** Who takes which version: {student_id: key} ("A" = Modelo A). */
export function useAssignVersions(activityId: string) {
  return useVersionsMutation(activityId, (students: Record<string, string>) =>
    api.put<Versions>(`/activities/${activityId}/versions/assignment`, { students }));
}

export function useSaveVersionRubric(activityId: string, key: string) {
  return useVersionsMutation(activityId, (items: RubricItem[]) =>
    api.put<Rubric>(`/activities/${activityId}/versions/${key}/rubric`, { items }));
}

/** Signed URL of a version's PDF («Ver», which takes its «Borrador IA» away) or its solutions. */
export function useVersionDocUrl(activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, variant }: { key: string; variant: 'print' | 'key' }) =>
      api.get<{ url: string; notice?: string | null }>(`/activities/${activityId}/versions/${key}/${variant}.pdf`, { slow: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['versions', activityId] }),
  });
}

/** «Imprimir para la clase»: one PDF in list order, each copy with the student's name and version. */
export function useClassPrintUrl(activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.get<{ url: string; notice?: string | null }>(`/activities/${activityId}/class-print.pdf`, { slow: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['versions', activityId] }),
  });
}
