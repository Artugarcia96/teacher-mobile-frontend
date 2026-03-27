import { create } from 'zustand';
import { Textbook } from '../types';
import { textbooks as textbooksApi } from '../services/api';

interface GenerateTextbookParams {
  subject_id: string;
  class_id: string;
  title?: string;
  enfoque: string;
  notas?: string;
  topic_ids?: string[];
  target_pages?: number;
  exercises_per_chapter?: number;
  examples_per_section?: number;
  depth?: number;
  visual_density?: string;
  guide_pdfs?: File[];
}

interface TextbooksState {
  textbooks: Textbook[];
  loading: boolean;
  fetchTextbooks: (subjectId?: string) => Promise<void>;
  generateTextbook: (data: GenerateTextbookParams) => Promise<{ id: string; batchJobId: string }>;
  iterateChapter: (textbookId: string, chapterNumber: number, instruction: string) => Promise<void>;
  deleteTextbook: (id: string) => Promise<void>;
}

const mapTextbook = (t: any): Textbook => ({
  id: t.id,
  subjectId: t.subject_id,
  batchJobId: t.batch_job_id,
  enfoque: t.enfoque,
  notas: t.notas,
  educationLevel: t.education_level,
  topicIds: t.topic_ids,
  title: t.title,
  bookPlan: t.book_plan,
  stats: t.stats,
  pdfUrl: t.pdf_url,
  iterationHistory: t.iteration_history,
  status: t.status,
  errorMessage: t.error_message,
  createdAt: t.created_at,
  completedAt: t.completed_at,
  temasCreated: t.temas_created || false,
  depth: t.depth || 3,
  visualDensity: t.visual_density || 'equilibrado',
});

export const useTextbooksStore = create<TextbooksState>((set, get) => ({
  textbooks: [],
  loading: false,

  fetchTextbooks: async (subjectId) => {
    if (!get().textbooks.length) set({ loading: true });
    try {
      const res = await textbooksApi.list(subjectId);
      set({ textbooks: res.data.map(mapTextbook) });
    } catch (err) {
      console.error('Failed to fetch textbooks:', err);
    } finally {
      set({ loading: false });
    }
  },

  generateTextbook: async (data) => {
    const res = await textbooksApi.generate(data);
    const textbook = mapTextbook(res.data);
    set({ textbooks: [textbook, ...get().textbooks] });
    return { id: textbook.id, batchJobId: textbook.batchJobId || '' };
  },

  iterateChapter: async (textbookId, chapterNumber, instruction) => {
    await textbooksApi.iterate(textbookId, { chapter_number: chapterNumber, instruction });
    // Refresh the textbook to get updated content
    try {
      const res = await textbooksApi.get(textbookId);
      const updated = mapTextbook(res.data);
      set({
        textbooks: get().textbooks.map(t => t.id === textbookId ? updated : t),
      });
    } catch (err) {
      console.error('Failed to refresh textbook after iteration:', err);
    }
  },

  deleteTextbook: async (id) => {
    await textbooksApi.delete(id);
    set({ textbooks: get().textbooks.filter(t => t.id !== id) });
  },
}));
