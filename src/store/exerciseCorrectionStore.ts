import { create } from 'zustand';
import { ExerciseCorrectionResult, AIAnalysis, BulkUploadResult } from '../types';
import { exerciseCorrections as api } from '../services/api';
import { useExercisesStore } from './exercisesStore';

function mapAIResult(aiResult: any): AIAnalysis | undefined {
  if (!aiResult) return undefined;
  
  let questions = aiResult.questions || [];
  questions = questions.map((q: any) => ({
    id: q.id,
    status: q.status,
    feedback: q.feedback || '',
    pointsEarned: q.points_earned,
  }));
  
  return {
    suggestedStudentName: aiResult.suggested_student_name,
    confidence: aiResult.confidence || 0,
    questions,
    weakAreas: aiResult.weak_areas || [],
    summary: aiResult.summary || '',
  };
}

function mapCorrection(c: any): ExerciseCorrectionResult {
  return {
    id: c.id,
    exerciseId: c.exercise_id,
    studentId: c.student_id,
    paperUrl: c.paper_url,
    aiAnalysis: mapAIResult(c.ai_result),
    grade: c.grade,
    teacherComments: c.teacher_notes,
    weakAreas: c.weak_areas,
    savedAt: c.saved_at,
    createdAt: c.created_at,
  };
}

interface ExerciseCorrectionState {
  corrections: ExerciseCorrectionResult[];
  loading: boolean;
  fetchAllCorrections: () => Promise<void>;
  fetchCorrections: (exerciseId: string) => Promise<void>;
  bulkUpload: (exerciseId: string, files: File[]) => Promise<BulkUploadResult>;
  updateCorrection: (id: string, data: { student_id?: string; grade?: number; teacher_notes?: string; weak_areas?: string[] }) => Promise<void>;
  processAI: (correctionId: string) => Promise<AIAnalysis | undefined>;
  finishCorrection: (exerciseId: string) => Promise<void>;
  clearCorrections: () => void;
}

export const useExerciseCorrectionStore = create<ExerciseCorrectionState>((set, get) => ({
  corrections: [],
  loading: false,

  fetchAllCorrections: async () => {
    if (!get().corrections.length) set({ loading: true });
    try {
      const res = await api.listAll();
      const data = res.data.map(mapCorrection);
      set({ corrections: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchCorrections: async (exerciseId) => {
    const hasCachedForExercise = get().corrections.some((c) => c.exerciseId === exerciseId);
    if (!hasCachedForExercise) set({ loading: true });
    try {
      const res = await api.list(exerciseId);
      const data = res.data.map(mapCorrection);
      set((s) => {
        const other = s.corrections.filter((c) => c.exerciseId !== exerciseId);
        return { corrections: [...other, ...data], loading: false };
      });
    } catch {
      set({ loading: false });
    }
  },

  bulkUpload: async (exerciseId, files) => {
    const res = await api.bulkUpload(exerciseId, files);
    const result: BulkUploadResult = {
      autoMatched: res.data.auto_matched.map((m: any) => ({
        correctionId: m.correction_id,
        studentId: m.student_id,
        studentName: m.student_name,
        studentCode: m.student_code,
        confidence: m.confidence,
      })),
      needsReview: res.data.needs_review.map((r: any) => ({
        correctionId: r.correction_id,
        detectedCode: r.detected_code,
        reason: r.reason,
        suggestions: r.suggestions.map((s: any) => ({
          studentId: s.student_id,
          studentName: s.student_name,
          code: s.code,
        })),
      })),
      studentsWithoutPapers: res.data.students_without_papers.map((s: any) => ({
        studentId: s.student_id,
        studentName: s.student_name,
        code: s.code,
      })),
    };
    
    await get().fetchCorrections(exerciseId);
    return result;
  },

  updateCorrection: async (id, data) => {
    const res = await api.update(id, data);
    set((s) => ({
      corrections: s.corrections.map((c) =>
        c.id === id
          ? {
              ...c,
              studentId: res.data.student_id || c.studentId,
              grade: res.data.grade ?? c.grade,
              teacherComments: res.data.teacher_notes ?? c.teacherComments,
              weakAreas: res.data.weak_areas ?? c.weakAreas,
              savedAt: res.data.saved_at,
            }
          : c
      ),
    }));
    
    // Refresh exercises to update status if grade changed
    if (data.grade !== undefined) {
      useExercisesStore.getState().fetchExercises();
    }
  },

  processAI: async (correctionId) => {
    const res = await api.processAI(correctionId);
    const aiAnalysis = mapAIResult(res.data.ai_result);
    set((s) => ({
      corrections: s.corrections.map((c) =>
        c.id === correctionId
          ? { 
              ...c, 
              aiAnalysis,
              grade: res.data.grade ?? c.grade,
              weakAreas: res.data.weak_areas ?? c.weakAreas,
            }
          : c
      ),
    }));
    
    // Refresh exercises to update status if grade was set by AI
    if (res.data.grade !== null && res.data.grade !== undefined) {
      useExercisesStore.getState().fetchExercises();
    }
    
    return aiAnalysis;
  },

  finishCorrection: async (exerciseId) => {
    await api.finish(exerciseId);
    // Refresh exercises to update status
    useExercisesStore.getState().fetchExercises();
  },

  clearCorrections: () => {
    set({ corrections: [] });
  },
}));
