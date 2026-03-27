import { create } from 'zustand';
import { comments as commentsApi } from '../services/api';

export interface TeacherComment {
  id: string;
  teacher_id: string;
  student_id?: string;
  class_id?: string;
  subject_id?: string;
  event_id?: string;
  event_date?: string;
  note_type: 'student' | 'class_session' | 'general';
  text: string;
  used_for_prep: boolean;
  created_at: string;
  student_name?: string;
  class_name?: string;
  subject_name?: string;
}

export interface RecentSession {
  event_id: string;
  class_id: string;
  class_name: string;
  subject?: string;
  subject_id?: string;
  title: string;
  end_time: string;
}

interface CommentsState {
  comments: TeacherComment[];
  eventObservations: TeacherComment[];
  recentSessions: RecentSession[];
  loading: boolean;
  promptDismissed: boolean;

  fetchComments: (params?: { note_type?: string; class_id?: string; subject_id?: string; days?: number }) => Promise<void>;
  fetchEventObservations: (eventId: string) => Promise<void>;
  createClassComment: (data: { class_id: string; subject_id?: string; event_id?: string; event_date?: string; text: string; mentioned_student_ids?: string[] }) => Promise<TeacherComment>;
  createEventObservation: (data: { event_id: string; text: string; mentioned_student_ids?: string[] }) => Promise<TeacherComment>;
  createGeneralComment: (text: string, mentionedStudentIds?: string[]) => Promise<TeacherComment>;
  fetchRecentSessions: () => Promise<void>;
  dismissPrompt: () => void;
  resetPrompt: () => void;
}

export const useCommentsStore = create<CommentsState>((set, get) => ({
  comments: [],
  eventObservations: [],
  recentSessions: [],
  loading: false,
  promptDismissed: false,

  fetchComments: async (params) => {
    if (!get().comments.length) set({ loading: true });
    try {
      const res = await commentsApi.list(params);
      set({ comments: res.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchEventObservations: async (eventId) => {
    try {
      const res = await commentsApi.list({ event_id: eventId, note_type: 'event_observation', days: 365 });
      set({ eventObservations: res.data });
    } catch {
      // Ignore errors
    }
  },

  createEventObservation: async (data) => {
    const res = await commentsApi.createEventObservation(data);
    const comment = res.data;
    set((s) => ({ eventObservations: [comment, ...s.eventObservations] }));
    return comment;
  },

  createClassComment: async (data) => {
    const res = await commentsApi.createClassComment(data);
    const comment = res.data;
    set((s) => ({ comments: [comment, ...s.comments] }));
    // Remove the session from recentSessions since we just added a comment for it
    if (data.event_id) {
      set((s) => ({
        recentSessions: s.recentSessions.filter((r) => r.event_id !== data.event_id),
      }));
    }
    return comment;
  },

  createGeneralComment: async (text, mentionedStudentIds) => {
    const res = await commentsApi.createGeneralComment({ text, mentioned_student_ids: mentionedStudentIds || [] });
    const comment = res.data;
    set((s) => ({ comments: [comment, ...s.comments] }));
    return comment;
  },

  fetchRecentSessions: async () => {
    try {
      const res = await commentsApi.getRecentSessions();
      set({ recentSessions: res.data });
    } catch {
      // Ignore errors
    }
  },

  dismissPrompt: () => set({ promptDismissed: true, recentSessions: [] }),

  resetPrompt: () => set({ promptDismissed: false }),
}));
