import { create } from 'zustand';
import { notes as notesApi } from '../services/api';

export interface TeacherNote {
  id: string;
  teacher_id: string;
  student_id?: string;
  class_id?: string;
  event_id?: string;
  event_date?: string;
  note_type: 'student' | 'class_session' | 'general';
  text: string;
  used_for_prep: boolean;
  created_at: string;
  student_name?: string;
  class_name?: string;
}

export interface RecentSession {
  event_id: string;
  class_id: string;
  class_name: string;
  subject?: string;
  title: string;
  end_time: string;
}

interface NotesState {
  notes: TeacherNote[];
  recentSessions: RecentSession[];
  loading: boolean;
  promptDismissed: boolean;
  
  fetchNotes: (params?: { note_type?: string; class_id?: string; days?: number }) => Promise<void>;
  createClassNote: (data: { class_id: string; event_id?: string; event_date?: string; text: string }) => Promise<TeacherNote>;
  createGeneralNote: (text: string) => Promise<TeacherNote>;
  fetchRecentSessions: () => Promise<void>;
  dismissPrompt: () => void;
  resetPrompt: () => void;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  recentSessions: [],
  loading: false,
  promptDismissed: false,

  fetchNotes: async (params) => {
    set({ loading: true });
    try {
      const res = await notesApi.list(params);
      set({ notes: res.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createClassNote: async (data) => {
    const res = await notesApi.createClassNote(data);
    const note = res.data;
    set((s) => ({ notes: [note, ...s.notes] }));
    // Remove the session from recentSessions since we just added a note for it
    if (data.event_id) {
      set((s) => ({
        recentSessions: s.recentSessions.filter((r) => r.event_id !== data.event_id),
      }));
    }
    return note;
  },

  createGeneralNote: async (text) => {
    const res = await notesApi.createGeneralNote({ text });
    const note = res.data;
    set((s) => ({ notes: [note, ...s.notes] }));
    return note;
  },

  fetchRecentSessions: async () => {
    try {
      const res = await notesApi.getRecentSessions();
      set({ recentSessions: res.data });
    } catch {
      // Ignore errors
    }
  },

  dismissPrompt: () => set({ promptDismissed: true, recentSessions: [] }),
  
  resetPrompt: () => set({ promptDismissed: false }),
}));
