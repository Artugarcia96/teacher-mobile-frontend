/** Hoy, calendario, eventos y cancelación de sesiones. Backend: app/api/today.py (slice B). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CourseRef, Ok, StudentRef } from './types';
import type { Audience, LinkKind, MaterialKind } from './units';

export type SessionStatus = 'past' | 'now' | 'next' | 'later';
export type EventKind = 'meeting' | 'tutoring' | 'evaluation' | 'trip' | 'other';

export interface TodaySession {
  course: CourseRef; date: string; start: string; end: string; room?: string | null; status: SessionStatus;
  cancelled: boolean; cancel_note?: string | null;
  attendance: { taken: boolean; absent: number; late: number };
  unit?: string | null; last_note?: { date: string; text: string } | null;
  activities: { id: string; title: string; kind: string }[];
  /** Up to 4 materials of the class's current unit (only in /today). */
  materials?: SessionMaterial[];
}
export interface SessionMaterial {
  id: string; unit_id: string; kind: MaterialKind; title: string; audience: Audience;
  /** Uploads: file name (icon). Links: site (icon) and address (opened directly). */
  filename?: string | null; link_kind?: LinkKind | null; url?: string | null;
}
export interface TodayEvent {
  id: string; title: string; kind: EventKind; date: string; start?: string | null; end?: string | null; note?: string | null; course?: CourseRef | null;
}
export interface PendingItem {
  kind: 'review' | 'attendance' | 'grades' | 'comments'; title: string; sub: string; count: number; course_id: string;
  activity_id?: string | null; date?: string | null; start?: string | null; term?: number | null;
}
export interface WatchItem { student: StudentRef; course: CourseRef; average: number | null; reasons: string[] }
export interface Today {
  date: string; is_today: boolean; term: number; term_label: string; week: number | null; lective: boolean; holiday: string | null;
  now: string | null; sessions: TodaySession[]; events: TodayEvent[]; pending: PendingItem[]; watchlist: WatchItem[];
}
export interface CalendarDay { date: string; lective: boolean; holiday: string | null; sessions: TodaySession[]; events: TodayEvent[] }

export interface EventInput {
  title: string; date: string; start?: string | null; end?: string | null; kind: EventKind; course_id?: string | null; note?: string | null;
}

export const todayKeys = {
  day: (date: string) => ['today', date] as const,
  calendar: (from: string, to: string) => ['today', 'calendar', from, to] as const,
};

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  meeting: 'Reunión', tutoring: 'Tutoría', evaluation: 'Sesión de evaluación', trip: 'Salida', other: 'Otro',
};

export function useDay(date: string) {
  return useQuery({ queryKey: todayKeys.day(date), queryFn: () => api.get<Today>(`/today?date=${date}`), enabled: !!date });
}

export function useCalendar(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: todayKeys.calendar(from, to),
    queryFn: () => api.get<{ days: CalendarDay[] }>(`/calendar?from=${from}&to=${to}`),
    enabled: enabled && !!from && !!to,
    staleTime: 60_000,
  });
}

export function useDayBrief() {
  return useMutation({ mutationFn: (date: string) => api.post<{ bullets: string[] }>('/today/brief', { date }) });
}

function useInvalidateToday() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['today'] });
}

export function useCreateEvent() {
  const done = useInvalidateToday();
  return useMutation({ mutationFn: (body: EventInput) => api.post<TodayEvent>('/events', body), onSuccess: done });
}

export function useUpdateEvent() {
  const done = useInvalidateToday();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<EventInput> & { id: string }) => api.patch<TodayEvent>(`/events/${id}`, body),
    onSuccess: done,
  });
}

export function useDeleteEvent() {
  const done = useInvalidateToday();
  return useMutation({ mutationFn: (id: string) => api.delete<Ok>(`/events/${id}`), onSuccess: done });
}

export function useCancelSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, date, start, note, restore }: { courseId: string; date: string; start: string; note?: string; restore?: boolean }) =>
      restore
        ? api.delete<Ok>(`/courses/${courseId}/sessions/cancel?date=${date}&start=${start}`)
        : api.post<Ok>(`/courses/${courseId}/sessions/cancel`, { date, start, note }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['course', v.courseId] });
      qc.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}
