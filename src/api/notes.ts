/** Observaciones (notes). Backend: app/api/notes.py (slice B). Shared by Hoy, Clase and Alumno. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Note, NoteKind } from './types';

export const noteKeys = {
  list: (params: { studentId?: string; courseId?: string }) => ['notes', params] as const,
};

export interface NoteInput { course_id?: string | null; date?: string; kind: NoteKind; text: string; student_ids: string[] }

export function useNotes(params: { studentId?: string; courseId?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params.studentId) qs.set('student_id', params.studentId);
  if (params.courseId) qs.set('course_id', params.courseId);
  if (params.limit) qs.set('limit', String(params.limit));
  return useQuery({ queryKey: noteKeys.list(params), queryFn: () => api.get<Note[]>(`/notes?${qs}`) });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['notes'] });
  qc.invalidateQueries({ queryKey: ['student'] });
  qc.invalidateQueries({ queryKey: ['today'] });
  qc.invalidateQueries({ queryKey: ['watch'] });
  qc.invalidateQueries({ queryKey: ['course'] });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: NoteInput) => api.post<Note>('/notes', body), onSuccess: () => invalidateAll(qc) });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<NoteInput> & { id: string }) => api.patch<Note>(`/notes/${id}`, body),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`/notes/${id}`), onSuccess: () => invalidateAll(qc) });
}
