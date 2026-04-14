import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CalendarEvent } from '../types';
import { calendar as calendarApi, preparation as prepApi } from '../services/api';

function mapEvent(e: any): CalendarEvent {
  return {
    id: e.id,
    classId: e.class_id,
    studentId: e.student_id,
    examId: e.exam_id,
    title: e.title,
    date: e.event_date,
    startTime: e.start_time,
    endTime: e.end_time,
    eventType: e.event_type,
    notes: e.notes,
    isCancelled: e.is_cancelled,
    className: e.class_name,
    classSubject: e.class_subject,
    subjectId: e.subject_id,
    aula: e.aula || undefined,
    studentName: e.student_name,
    examName: e.exam_name,
    examStatus: e.exam_status,
    topicId: e.topic_id || undefined,
    topicName: e.topic_name || undefined,
    topicPdfUrl: e.topic_pdf_url || undefined,
    mentionedStudents: e.mentioned_students || undefined,
  };
}

export type CalendarView = 'week' | 'month';

export interface PlanSession {
  topic_name: string;
  session_title: string;
  session_type: string;
  key_points: string[];
  focus: string;
  topic_pdf_url?: string | null;
}

export interface UpcomingPlanExam {
  name: string;
  date: string;
  days_until: number;
  topic_names: string[];
}

export interface ClassBreakdown {
  class_id: string;
  class_name: string;
  subject: string;
  subject_id?: string | null;
  start_time?: string;
  aula?: string | null;
  class_avg_grade?: number;
  topics_to_cover?: string[];
  student_alerts?: { name: string; issue: string; suggested_action?: string }[];
  positive_highlights?: { name: string; achievement: string }[];
  talking_points?: string[];
  class_weak_points?: string[];
  suggestions?: string[];
  exercises_today?: { type: string; student: string; exercise: string }[];
  recent_comments?: string[];
  grade_alerts?: { student_name: string; class_name: string; avg_grade: number; trend?: string; issue: string }[];
  plan_session?: PlanSession;
  upcoming_plan_exam?: UpcomingPlanExam;
}

export interface PreparedDay {
  id: string;
  prep_date: string;
  summary: string | null;
  class_breakdowns: ClassBreakdown[] | null;
  grade_alerts: any[] | null;
  upcoming_deadlines: any[] | null;
  pending_tasks: any[] | null;
  created_at: string;
}

/** Find the breakdown matching a specific class + subject combination. */
export function getBreakdownForSubject(
  prep: PreparedDay | null,
  classId: string,
  subjectId?: string,
): ClassBreakdown | null {
  if (!prep?.class_breakdowns) return null;
  // Prefer exact match on subject_id
  if (subjectId) {
    const exact = prep.class_breakdowns.find(
      (b) => b.class_id === classId && b.subject_id === subjectId,
    );
    if (exact) return exact;
  }
  // Fallback: match by class_id only (single-subject classes)
  const byClass = prep.class_breakdowns.filter((b) => b.class_id === classId);
  return byClass.length === 1 ? byClass[0] : null;
}

/** Get all breakdowns for a specific class. */
export function getBreakdownsForClass(
  prep: PreparedDay | null,
  classId: string,
): ClassBreakdown[] {
  if (!prep?.class_breakdowns) return [];
  return prep.class_breakdowns.filter((b) => b.class_id === classId);
}

interface CalendarState {
  events: CalendarEvent[];
  loading: boolean;
  view: CalendarView;
  preparedDates: string[];
  currentPreparation: PreparedDay | null;
  preparationLoading: boolean;
  lastScheduleUpdate: number; // Timestamp to trigger re-fetches
  
  setView: (view: CalendarView) => void;
  fetchEvents: (startDate: string, endDate: string, classId?: string, studentId?: string) => Promise<void>;
  createEvent: (data: {
    class_id?: string; student_id?: string; exam_id?: string; title: string; event_date: string;
    start_time?: string; end_time?: string; event_type?: string; notes?: string;
    mentioned_student_ids?: string[];
  }) => Promise<CalendarEvent>;
  updateEvent: (id: string, data: {
    title?: string; event_date?: string; start_time?: string;
    end_time?: string; notes?: string; is_cancelled?: boolean;
    mentioned_student_ids?: string[];
  }) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;
  bulkUpdate: (data: {
    event_ids: string[]; shift_days?: number;
    start_time?: string; end_time?: string;
  }) => Promise<void>;
  invalidateSchedule: () => void; // Signal that schedule needs refresh
  
  // Preparation
  fetchPreparedDates: (startDate: string, endDate: string) => Promise<void>;
  generatePreparation: (date: string, focusTopics?: string) => Promise<PreparedDay>;
  getPreparation: (date: string) => Promise<PreparedDay | null>;
  clearPreparation: () => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      events: [],
      loading: false,
      view: 'week',
      preparedDates: [],
      currentPreparation: null,
      preparationLoading: false,
      lastScheduleUpdate: 0,

      setView: (view) => set({ view }),

      fetchEvents: async (startDate, endDate, classId, studentId) => {
        set({ loading: true });
        try {
          const res = await calendarApi.list(startDate, endDate, classId, studentId);
          set({ events: res.data.map(mapEvent), loading: false });
        } catch {
          set({ loading: false });
        }
      },

      createEvent: async (data) => {
        const res = await calendarApi.create(data);
        const ev = mapEvent(res.data);
        set((s) => ({ events: [...s.events, ev].sort(sortEvents) }));
        return ev;
      },

      updateEvent: async (id, data) => {
        const res = await calendarApi.update(id, data);
        const updated = mapEvent(res.data);
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? updated : e)).sort(sortEvents),
        }));
      },

      deleteEvent: async (id) => {
        await calendarApi.delete(id);
        set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
      },

      bulkDelete: async (ids) => {
        await calendarApi.bulkDelete(ids);
        const idSet = new Set(ids);
        set((s) => ({ 
          events: s.events.filter((e) => !idSet.has(e.id)),
          lastScheduleUpdate: Date.now(),
        }));
      },

      bulkUpdate: async (data) => {
        const res = await calendarApi.bulkUpdate(data);
        const updated: CalendarEvent[] = res.data.map((e: any) => mapEvent(e));
        const updatedMap = new Map(updated.map((e) => [e.id, e]));
        set((s) => ({
          events: s.events.map((e) => updatedMap.get(e.id) || e).sort(sortEvents),
          lastScheduleUpdate: Date.now(),
        }));
      },

      invalidateSchedule: () => {
        set({ lastScheduleUpdate: Date.now() });
      },

      fetchPreparedDates: async (startDate, endDate) => {
        try {
          const res = await prepApi.getPreparedDates(startDate, endDate);
          set({ preparedDates: res.data });
        } catch {
          // Ignore errors
        }
      },

      generatePreparation: async (date, focusTopics) => {
        set({ preparationLoading: true });
        try {
          const res = await prepApi.generate({ prep_date: date, focus_topics: focusTopics });
          const prep = res.data;
          set((s) => ({ 
            currentPreparation: prep,
            preparationLoading: false,
            preparedDates: s.preparedDates.includes(date) ? s.preparedDates : [...s.preparedDates, date],
          }));
          return prep;
        } catch (error) {
          set({ preparationLoading: false });
          throw error;
        }
      },

      getPreparation: async (date) => {
        try {
          const res = await prepApi.get(date);
          if (res.status === 204 || !res.data || !res.data.id) {
            set({ currentPreparation: null });
            return null;
          }
          set({ currentPreparation: res.data });
          return res.data;
        } catch {
          set({ currentPreparation: null });
          return null;
        }
      },

      clearPreparation: () => set({ currentPreparation: null }),
    }),
    {
      name: 'calendar-storage',
      partialize: (state) => ({ view: state.view }),
    }
  )
);

function sortEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.startTime || '').localeCompare(b.startTime || '');
}
