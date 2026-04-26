/**
 * sessionsStore — estado del SessionDetail (sesión = evento de calendario).
 *
 * Centraliza el detalle operativo de una sesión: tema, materiales vinculados
 * y notas. La generación de material se sigue lanzando desde el TallerDialog,
 * pero el binding (calendar_event_id) se persiste en el backend, así que tras
 * generar volvemos a fetchSession() para refrescar la lista de materiales.
 */

import { create } from 'zustand';
import { sessions } from '../services/api';
import type { SessionDetail, SessionMaterial } from '../types';

const mapMaterial = (d: any): SessionMaterial => ({
  id: d.id,
  type: d.type,
  title: d.title,
  status: d.status ?? null,
  purpose: d.purpose ?? null,
  href: d.href,
  external: !!d.external,
});

const mapSession = (d: any): SessionDetail => ({
  id: d.id,
  title: d.title,
  eventDate: d.event_date,
  eventType: d.event_type,
  startTime: d.start_time ?? null,
  endTime: d.end_time ?? null,
  notes: d.notes ?? null,
  isCancelled: !!d.is_cancelled,
  classId: d.class_id ?? null,
  className: d.class_name ?? null,
  subjectId: d.subject_id ?? null,
  subjectName: d.subject_name ?? null,
  topicId: d.topic_id ?? null,
  topicName: d.topic_name ?? null,
  materials: Array.isArray(d.materials) ? d.materials.map(mapMaterial) : [],
});

interface SessionsState {
  byId: Record<string, SessionDetail>;
  loading: Record<string, boolean>;
  fetchSession: (eventId: string) => Promise<SessionDetail>;
  attach: (eventId: string, type: SessionMaterial['type'], materialId: string) => Promise<SessionDetail>;
  detach: (eventId: string, type: SessionMaterial['type'], materialId: string) => Promise<SessionDetail>;
  updateNotes: (eventId: string, notes: string) => Promise<SessionDetail>;
  invalidate: (eventId: string) => void;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  byId: {},
  loading: {},

  fetchSession: async (eventId) => {
    set((s) => ({ loading: { ...s.loading, [eventId]: true } }));
    try {
      const res = await sessions.get(eventId);
      const detail = mapSession(res.data);
      set((s) => ({
        byId: { ...s.byId, [eventId]: detail },
        loading: { ...s.loading, [eventId]: false },
      }));
      return detail;
    } catch (err) {
      set((s) => ({ loading: { ...s.loading, [eventId]: false } }));
      throw err;
    }
  },

  attach: async (eventId, type, materialId) => {
    const res = await sessions.attach(eventId, type, materialId);
    const detail = mapSession(res.data);
    set((s) => ({ byId: { ...s.byId, [eventId]: detail } }));
    return detail;
  },

  detach: async (eventId, type, materialId) => {
    const res = await sessions.detach(eventId, type, materialId);
    const detail = mapSession(res.data);
    set((s) => ({ byId: { ...s.byId, [eventId]: detail } }));
    return detail;
  },

  updateNotes: async (eventId, notes) => {
    const res = await sessions.updateNotes(eventId, notes);
    const detail = mapSession(res.data);
    set((s) => ({ byId: { ...s.byId, [eventId]: detail } }));
    return detail;
  },

  invalidate: (eventId) => {
    set((s) => {
      const next = { ...s.byId };
      delete next[eventId];
      return { byId: next };
    });
  },
}));
