import { create } from 'zustand';
import { CalendarEvent } from '../types';
import { calendar as calendarApi } from '../services/api';

function mapEvent(e: any): CalendarEvent {
  return {
    id: e.id,
    classId: e.class_id,
    title: e.title,
    date: e.event_date,
    startTime: e.start_time,
    endTime: e.end_time,
    eventType: e.event_type,
    notes: e.notes,
    isCancelled: e.is_cancelled,
    className: e.class_name,
    classSubject: e.class_subject,
  };
}

interface CalendarState {
  events: CalendarEvent[];
  loading: boolean;
  fetchEvents: (startDate: string, endDate: string, classId?: string) => Promise<void>;
  createEvent: (data: {
    class_id?: string; title: string; event_date: string;
    start_time?: string; end_time?: string; event_type?: string; notes?: string;
  }) => Promise<CalendarEvent>;
  updateEvent: (id: string, data: {
    title?: string; event_date?: string; start_time?: string;
    end_time?: string; notes?: string; is_cancelled?: boolean;
  }) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  generateSchedule: (data: {
    class_id: string; days: string[]; start_time: string;
    end_time: string; start_date: string; end_date: string;
  }) => Promise<CalendarEvent[]>;
  bulkDelete: (ids: string[]) => Promise<void>;
  bulkUpdate: (data: {
    event_ids: string[]; shift_days?: number;
    start_time?: string; end_time?: string;
  }) => Promise<void>;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  events: [],
  loading: false,

  fetchEvents: async (startDate, endDate, classId) => {
    set({ loading: true });
    try {
      const res = await calendarApi.list(startDate, endDate, classId);
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

  generateSchedule: async (data) => {
    const res = await calendarApi.generate(data);
    const newEvents = res.data.map(mapEvent);
    set((s) => ({ events: [...s.events, ...newEvents].sort(sortEvents) }));
    return newEvents;
  },

  bulkDelete: async (ids) => {
    await calendarApi.bulkDelete(ids);
    const idSet = new Set(ids);
    set((s) => ({ events: s.events.filter((e) => !idSet.has(e.id)) }));
  },

  bulkUpdate: async (data) => {
    const res = await calendarApi.bulkUpdate(data);
    const updated: CalendarEvent[] = res.data.map((e: any) => mapEvent(e));
    const updatedMap = new Map(updated.map((e) => [e.id, e]));
    set((s) => ({
      events: s.events.map((e) => updatedMap.get(e.id) || e).sort(sortEvents),
    }));
  },
}));

function sortEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return (a.startTime || '').localeCompare(b.startTime || '');
}
