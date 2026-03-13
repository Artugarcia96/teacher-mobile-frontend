import { create } from 'zustand';
import { Exercise } from '../types';
import { exercises as exercisesApi } from '../services/api';

function mapExercise(e: any): Exercise {
  const questions = Array.isArray(e.questions) ? e.questions : [];
  const weakAreas = Array.isArray(e.weak_areas) ? e.weak_areas : [];
  
  return {
    id: e.id,
    name: e.name,
    studentId: e.student_id,
    sourceExamId: e.source_exam_id,
    sourceExamIds: e.source_exam_ids,
    weakAreas,
    questions: questions.map((q: any) => ({
      id: q.id || String(Math.random()),
      text: q.text || '',
      hint: q.hint,
      solution: q.solution,
      points: q.points,
    })),
    assignedAt: e.assigned_at || new Date().toISOString(),
    refinementPrompt: e.refinement_prompt,
    pdfExercisesUrl: e.pdf_exercises_url,
    pdfSolutionsUrl: e.pdf_solutions_url,
    correctionStatus: e.correction_status || null,
    deliveryDate: e.delivery_date,
    correctionDate: e.correction_date,
    iterationHistory: e.iteration_history,
    deliveryStatus: e.delivery_status,
    correctionDeadlineStatus: e.correction_deadline_status,
  };
}

interface GenerateParams {
  studentIds: string[];
  name: string;
  sourceExamIds?: string[];
  sourceTopicIds?: string[];
  refinementPrompt?: string;
  difficulty?: 'easier' | 'same' | 'harder';
  numQuestions?: number;
  numBlankPages?: number;
  focusTopics?: string[];
  deliveryDate?: string;
  correctionDate?: string;
}

interface ExercisesState {
  exercises: Exercise[];
  loading: boolean;
  fetchExercises: (studentId?: string) => Promise<void>;
  generateExercises: (params: GenerateParams) => Promise<Exercise[]>;
  iterateExercise: (id: string, instruction: string) => Promise<Exercise>;
  renameExercise: (id: string, name: string) => Promise<void>;
  deleteExercise: (id: string) => Promise<void>;
}

export const useExercisesStore = create<ExercisesState>((set) => ({
  exercises: [],
  loading: false,

  fetchExercises: async (studentId) => {
    set({ loading: true });
    try {
      const res = await exercisesApi.list(studentId);
      const data = res.data.map(mapExercise);
      set({ exercises: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  generateExercises: async (params) => {
    const res = await exercisesApi.generate(params);
    const newExercises = res.data.map(mapExercise);
    set((s) => ({ exercises: [...newExercises, ...s.exercises] }));
    return newExercises;
  },

  iterateExercise: async (id, instruction) => {
    const res = await exercisesApi.iterate(id, { instruction });
    const updatedExercise = mapExercise(res.data);
    set((s) => ({
      exercises: s.exercises.map((e) => (e.id === id ? updatedExercise : e)),
    }));
    return updatedExercise;
  },

  renameExercise: async (id, name) => {
    await exercisesApi.rename(id, name);
    set((s) => ({
      exercises: s.exercises.map((e) => (e.id === id ? { ...e, name } : e)),
    }));
  },

  deleteExercise: async (id) => {
    // Optimistically remove from state first
    const currentExercises = useExercisesStore.getState().exercises;
    set({ exercises: currentExercises.filter((e) => e.id !== id) });
    
    try {
      await exercisesApi.delete(id);
    } catch (error) {
      // Restore on failure
      set({ exercises: currentExercises });
      throw error;
    }
  },
}));
