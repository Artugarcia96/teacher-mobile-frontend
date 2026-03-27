import { create } from 'zustand';
import { feedback as feedbackApi } from '../services/api';

export interface FeedbackItem {
  id: string;
  teacher_id: string;
  category: 'suggestion' | 'bug' | 'other';
  text: string;
  created_at: string;
}

interface FeedbackState {
  items: FeedbackItem[];
  loading: boolean;

  fetchFeedback: () => Promise<void>;
  createFeedback: (data: { category: string; text: string }) => Promise<FeedbackItem>;
  updateFeedback: (id: string, data: { category?: string; text?: string }) => Promise<void>;
  deleteFeedback: (id: string) => Promise<void>;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  items: [],
  loading: false,

  fetchFeedback: async () => {
    if (!get().items.length) set({ loading: true });
    try {
      const res = await feedbackApi.list();
      set({ items: res.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createFeedback: async (data) => {
    const res = await feedbackApi.create(data);
    const item = res.data;
    set((s) => ({ items: [item, ...s.items] }));
    return item;
  },

  updateFeedback: async (id, data) => {
    const res = await feedbackApi.update(id, data);
    set((s) => ({ items: s.items.map((i) => (i.id === id ? res.data : i)) }));
  },

  deleteFeedback: async (id) => {
    await feedbackApi.delete(id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
}));
