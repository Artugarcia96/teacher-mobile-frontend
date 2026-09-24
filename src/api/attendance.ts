/** Asistencia (pasar lista y resumen). Backend: app/api/attendance.py. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { StudentRef } from './types';

export type MarkStatus = 'present' | 'absent' | 'late' | 'justified';

export interface AttendanceRow { student: StudentRef; status: MarkStatus; note?: string | null }
export interface Attendance { date: string; start: string; end?: string | null; taken: boolean; students: AttendanceRow[] }
export interface AttendanceInput { date: string; start: string; marks: { student_id: string; status: MarkStatus; note?: string | null }[] }

export interface SessionSlot { date: string; start: string; end?: string | null }
export interface AttendanceSummary {
  term: number;
  /** Last 14 lective days, most recent first. */
  sessions_missing: SessionSlot[];
  today: (SessionSlot & { taken: boolean })[];
  /** Only students with some mark, most unjustified absences first. */
  students: { student: StudentRef; absent: number; justified: number; late: number }[];
}

export const attendanceKeys = {
  session: (courseId: string, date: string, start: string) => ['course', courseId, 'attendance', date, start] as const,
  summary: (courseId: string, term: number) => ['course', courseId, 'attendance', 'summary', term] as const,
};

export const MARK_LABEL: Record<MarkStatus, string> = { present: 'Presente', absent: 'Falta', late: 'Retraso', justified: 'Justificada' };

export function useAttendance(courseId: string, date: string, start: string, enabled = true) {
  return useQuery({
    queryKey: attendanceKeys.session(courseId, date, start),
    queryFn: () => api.get<Attendance>(`/courses/${courseId}/attendance?date=${date}&start=${start}`),
    enabled: enabled && !!courseId && !!date && !!start,
    staleTime: 0,
  });
}

export function useSaveAttendance(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AttendanceInput) => api.put<Attendance>(`/courses/${courseId}/attendance`, body),
    onSuccess: (data) => qc.setQueryData(attendanceKeys.session(courseId, data.date, data.start), data),
  });
}

/** Call after the sheet closes: refresh everything that shows attendance. */
export function invalidateAttendance(qc: ReturnType<typeof useQueryClient>, courseId: string) {
  qc.invalidateQueries({ queryKey: ['today'] });
  qc.invalidateQueries({ queryKey: ['course', courseId] });
  qc.invalidateQueries({ queryKey: ['student'] });
  qc.invalidateQueries({ queryKey: ['watch'] });
}

export function useAttendanceSummary(courseId: string, term: number) {
  return useQuery({
    queryKey: attendanceKeys.summary(courseId, term),
    queryFn: () => api.get<AttendanceSummary>(`/courses/${courseId}/attendance/summary?term=${term}`),
  });
}

/** «Dar por pasadas (todos presentes)»: lists already taken are left untouched. */
export function useBulkTaken(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessions: SessionSlot[]) =>
      api.post<{ count: number }>(`/courses/${courseId}/attendance/bulk`, { sessions: sessions.map(({ date, start }) => ({ date, start })) }),
    onSuccess: () => invalidateAttendance(qc, courseId),
  });
}
