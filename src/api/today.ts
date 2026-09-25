/** Hoy, calendario, eventos y «A vigilar». Backend: app/api/today.py. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CourseRef, Note, Ok, StudentRef } from './types';
import type { Audience, LinkKind, MaterialKind } from './units';

export type SessionStatus = 'past' | 'now' | 'next' | 'later';
export type EventKind = 'meeting' | 'tutoring' | 'evaluation' | 'trip' | 'other';

/** A class log («Cerrar clase»): what was done, what comes next and homework. */
export interface LogBrief { date: string; start: string; done?: string | null; next?: string | null; homework?: string | null }
/** Homework to check in a session (from the previous log) and whether it was checked. */
export interface HomeworkState { text?: string | null; checked: boolean; not_done: number; partial: number }

export interface TodaySession {
  course: CourseRef; date: string; start: string; end: string; room?: string | null; status: SessionStatus;
  cancelled: boolean; cancel_note?: string | null;
  /** Cancelled because the teacher is absent; cancel_note = task for the substitute. */
  guardia: boolean;
  /** «Hoja de guardia» (PDF) this session was left in. */
  guardia_pdf?: string | null;
  attendance: { taken: boolean; absent: number; late: number };
  /** The list is still due (same rule as Pendiente: last lective days, not before the class existed). */
  pending: boolean;
  unit?: string | null;
  previous?: LogBrief | null;
  log?: LogBrief | null;
  homework?: HomeworkState | null;
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
  kind: 'review' | 'attendance' | 'grades' | 'comments'; title: string; sub: string; count: number;
  /** null for comments of several classes. */
  course_id?: string | null;
  activity_id?: string | null; date?: string | null; start?: string | null; term?: number | null;
}
export interface WatchItem {
  student: StudentRef; course: CourseRef; average: number | null;
  /** One concrete line per signal, most severe first. */
  reasons: string[]; reason: string; severity: 1 | 2 | 3;
  /** Date of the latest triggering fact. */
  since: string;
}
export interface Today {
  date: string; is_today: boolean; term: number; term_label: string; week: number | null; lective: boolean; holiday: string | null;
  now: string | null; sessions: TodaySession[]; events: TodayEvent[];
  /** Sorted by urgency by the server. */
  pending: PendingItem[];
  /** Students of the classes of this day, most severe first. */
  watchlist: WatchItem[];
  /** All classes (useWatch). */
  watch_total: number;
}
export interface CalendarDay { date: string; lective: boolean; holiday: string | null; sessions: TodaySession[]; events: TodayEvent[] }

export interface EventInput {
  title: string; date: string; start?: string | null; end?: string | null; kind: EventKind; course_id?: string | null; note?: string | null;
}

export const todayKeys = {
  day: (date: string) => ['today', date] as const,
  calendar: (from: string, to: string) => ['today', 'calendar', from, to] as const,
  watch: ['watch'] as const,
  message: (studentId: string, courseId: string) => ['watch', 'message', studentId, courseId] as const,
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

// ── A vigilar ────────────────────────────────────────────────────────────────
/** Every class (Hoy only brings the classes of the day). */
export function useWatch(enabled = true) {
  return useQuery({ queryKey: todayKeys.watch, queryFn: () => api.get<WatchItem[]>('/watch'), enabled });
}

function invalidateWatch(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [['today'], ['watch'], ['student'], ['course'], ['notes']]) qc.invalidateQueries({ queryKey: key });
}

/** «Ya lo sé»: hidden in that class until a newer fact. */
export function useAckWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, courseId }: { studentId: string; courseId: string }) =>
      api.post<Ok>(`/watch/${studentId}/ack`, { course_id: courseId }),
    onSuccess: () => invalidateWatch(qc),
  });
}

/** Deterministic message for the family, built from the facts. */
export function useFamilyMessage(studentId: string, courseId: string) {
  return useQuery({
    queryKey: todayKeys.message(studentId, courseId),
    queryFn: () => api.get<{ text: string }>(`/watch/${studentId}/message?course_id=${courseId}`),
    staleTime: 0,
  });
}

/** «Guardar como observación (Familia)»: also acknowledges the student. */
export function useSaveFamilyNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, courseId, text }: { studentId: string; courseId: string; text: string }) =>
      api.post<Note>(`/watch/${studentId}/family`, { course_id: courseId, text }),
    onSuccess: () => invalidateWatch(qc),
  });
}
