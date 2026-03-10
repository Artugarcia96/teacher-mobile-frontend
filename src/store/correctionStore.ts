import { create } from 'zustand';
import { CorrectionResult, WeakArea, AIAnalysis } from '../types';
import { corrections as correctionsApi } from '../services/api';

function mapAIResult(aiResult: any): AIAnalysis | undefined {
  if (!aiResult) return undefined;
  
  let questions = aiResult.questions || [];
  if (questions.length === 0 && aiResult.highlights?.length > 0) {
    questions = aiResult.highlights.map((h: any) => ({
      id: h.area?.replace(/^(Pregunta|Question)\s*/i, '') || h.area,
      status: h.status === 'answered' ? 'partial' : h.status === 'blank' ? 'blank' : 'partial',
      feedback: h.feedback || '',
    }));
  }
  
  questions = questions.map((q: any) => ({
    id: q.id,
    status: q.status,
    feedback: q.feedback || '',
  }));
  
  return {
    suggestedStudentName: aiResult.suggested_student_name,
    confidence: aiResult.confidence || 0,
    questions,
    weakAreas: aiResult.weak_areas || [],
    summary: aiResult.summary || aiResult.preliminary_analysis || '',
  };
}

interface CorrectionState {
  corrections: CorrectionResult[];
  loading: boolean;
  fetchAllCorrections: () => Promise<void>;
  fetchCorrections: (examId: string) => Promise<void>;
  uploadPapers: (examId: string, files: File[]) => Promise<void>;
  updateCorrection: (id: string, data: { student_id?: string; grade?: number; teacher_notes?: string; weak_areas?: string[] }) => Promise<void>;
  processAI: (correctionId: string) => Promise<any>;
  finishCorrection: (examId: string) => Promise<void>;
  getWeakAreasForStudent: (studentId: string) => WeakArea[];
}

export const useCorrectionStore = create<CorrectionState>((set, get) => ({
  corrections: [],
  loading: false,

  fetchAllCorrections: async () => {
    set({ loading: true });
    try {
      const res = await correctionsApi.listAll();
      const data = res.data.map((c: any) => ({
        id: c.id,
        examId: c.exam_id,
        studentId: c.student_id,
        paperUrl: c.paper_url,
        aiAnalysis: mapAIResult(c.ai_result),
        grade: c.grade,
        teacherNotes: c.teacher_notes,
        weakAreas: c.weak_areas,
        savedAt: c.saved_at,
      }));
      set({ corrections: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchCorrections: async (examId) => {
    set({ loading: true });
    try {
      const res = await correctionsApi.list(examId);
      const data = res.data.map((c: any) => ({
        id: c.id,
        examId: c.exam_id,
        studentId: c.student_id,
        paperUrl: c.paper_url,
        aiAnalysis: mapAIResult(c.ai_result),
        grade: c.grade,
        teacherNotes: c.teacher_notes,
        weakAreas: c.weak_areas,
        savedAt: c.saved_at,
      }));
      set((s) => {
        const other = s.corrections.filter((c) => c.examId !== examId);
        return { corrections: [...other, ...data], loading: false };
      });
    } catch {
      set({ loading: false });
    }
  },

  uploadPapers: async (examId, files) => {
    const res = await correctionsApi.upload(examId, files);
    const newCorrections = res.data.map((c: any) => ({
      id: c.id,
      examId: c.exam_id,
      studentId: c.student_id,
      paperUrl: c.paper_url,
      grade: c.grade,
      teacherNotes: c.teacher_notes,
      weakAreas: c.weak_areas,
      savedAt: c.saved_at,
    }));
    set((s) => ({ corrections: [...s.corrections, ...newCorrections] }));
  },

  updateCorrection: async (id, data) => {
    const res = await correctionsApi.update(id, data);
    set((s) => ({
      corrections: s.corrections.map((c) =>
        c.id === id
          ? {
              ...c,
              studentId: res.data.student_id || c.studentId,
              grade: res.data.grade ?? c.grade,
              teacherNotes: res.data.teacher_notes ?? c.teacherNotes,
              weakAreas: res.data.weak_areas ?? c.weakAreas,
              savedAt: res.data.saved_at,
            }
          : c
      ),
    }));
  },

  processAI: async (correctionId) => {
    const res = await correctionsApi.processAI(correctionId);
    const aiAnalysis = mapAIResult(res.data);
    set((s) => ({
      corrections: s.corrections.map((c) =>
        c.id === correctionId
          ? { ...c, aiAnalysis }
          : c
      ),
    }));
    return aiAnalysis;
  },

  finishCorrection: async (examId) => {
    await correctionsApi.finish(examId);
  },

  getWeakAreasForStudent: (studentId) => {
    const studentCorrections = get().corrections.filter((c) => c.studentId === studentId && c.weakAreas);
    const areas: WeakArea[] = [];
    studentCorrections.forEach((c) => {
      c.weakAreas?.forEach((topic) => {
        areas.push({
          topic,
          examId: c.examId,
          examName: c.examId,
          score: c.grade || 0,
          maxScore: 10,
        });
      });
    });
    return areas;
  },
}));
