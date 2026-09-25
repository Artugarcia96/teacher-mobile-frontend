/** One session of a class: «Cerrar clase», «Revisar deberes» and «Voy a faltar». Backend: app/api/sessions.py. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CourseRef, StudentRef } from './types';

export interface UnitRef { id: string; title: string }
export interface SessionLog {
  date: string; start: string; end?: string | null; saved: boolean;
  done?: string | null; next?: string | null; homework?: string | null;
  /** Latest log before this session: what it planned («next») prefills «Hecho hoy». */
  previous?: { date: string; start: string; done?: string | null; next?: string | null; homework?: string | null } | null;
  /** Unit in progress and the one «empezar la siguiente» would start. */
  unit?: UnitRef | null; next_unit?: UnitRef | null;
}
export interface SessionLogInput {
  date: string; start: string; done?: string | null; next?: string | null; homework?: string | null; finish_unit?: boolean;
}

export type HomeworkStatus = 'done' | 'not_done' | 'partial';
export interface HomeworkCheck {
  date: string; start: string; end?: string | null; homework?: string | null; checked: boolean;
  /** absent = not in class that day (does not count). */
  students: { student: StudentRef; status: HomeworkStatus; absent: boolean }[];
}
export interface HomeworkInput { date: string; start: string; homework?: string | null; marks: { student_id: string; status: HomeworkStatus }[] }

export interface MaterialRef { id: string; title: string; kind: string }
export interface AbsenceSession {
  course: CourseRef; date: string; start: string; end: string; room?: string | null;
  unit?: UnitRef | null; materials: MaterialRef[];
  /** Already marked as «Guardia» (task = what was saved). */
  guardia: boolean; task?: string | null;
}
export interface AbsenceInput {
  reason?: string | null;
  sessions: { course_id: string; date: string; start: string; task: string; material_ids: string[] }[];
}

export const sessionKeys = {
  log: (courseId: string, date: string, start: string) => ['course', courseId, 'session-log', date, start] as const,
  homework: (courseId: string, date: string, start: string) => ['course', courseId, 'homework', date, start] as const,
  absence: (from: string, to: string) => ['absences', from, to] as const,
};

export const HOMEWORK_LABEL: Record<HomeworkStatus, string> = { done: 'Hecho', not_done: 'Sin hacer', partial: 'Incompleto' };

function invalidateSession(qc: ReturnType<typeof useQueryClient>, courseId: string) {
  for (const key of [['today'], ['course', courseId], ['unit'], ['student'], ['watch']]) qc.invalidateQueries({ queryKey: key });
}

export function useSessionLog(courseId: string, date: string, start: string) {
  return useQuery({
    queryKey: sessionKeys.log(courseId, date, start),
    queryFn: () => api.get<SessionLog>(`/courses/${courseId}/sessions/log?date=${date}&start=${start}`),
    staleTime: 0,
  });
}

export function useSaveSessionLog(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SessionLogInput) => api.put<SessionLog>(`/courses/${courseId}/sessions/log`, body),
    onSuccess: (data) => {
      qc.setQueryData(sessionKeys.log(courseId, data.date, data.start), data);
      invalidateSession(qc, courseId);
    },
  });
}

export function useHomeworkCheck(courseId: string, date: string, start: string) {
  return useQuery({
    queryKey: sessionKeys.homework(courseId, date, start),
    queryFn: () => api.get<HomeworkCheck>(`/courses/${courseId}/homework?date=${date}&start=${start}`),
    staleTime: 0,
  });
}

/** Saves the marks and re-derives the term's «Deberes» grades (suggested until the teacher confirms them). */
export function useSaveHomeworkCheck(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: HomeworkInput) => api.put<HomeworkCheck>(`/courses/${courseId}/homework`, body),
    onSuccess: (data) => qc.setQueryData(sessionKeys.homework(courseId, data.date, data.start), data),
  });
}

/** Call after the homework sheet closes. */
export function invalidateHomework(qc: ReturnType<typeof useQueryClient>, courseId: string) {
  invalidateSession(qc, courseId);
  qc.invalidateQueries({ queryKey: ['inbox'] });
}

export function useAbsenceSessions(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: sessionKeys.absence(from, to),
    queryFn: () => api.get<{ sessions: AbsenceSession[] }>(`/absences/sessions?from=${from}&to=${to}`),
    enabled: enabled && !!from && !!to && from <= to,
  });
}

/** Marks the sessions as «Guardia» and returns the PDF for jefatura. */
export function useCreateAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AbsenceInput) => api.post<{ pdf_url: string; count: number }>('/absences', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['absences'] });
    },
  });
}
