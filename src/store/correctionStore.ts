import { create } from 'zustand';
import { CorrectionResult, WeakArea, AIAnalysis } from '../types';
import { corrections as correctionsApi } from '../services/api';
import { useExamsStore } from './examsStore';

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
  uploadPapers: (examId: string, files: File[], studentId?: string) => Promise<CorrectionResult[]>;
  updateCorrection: (id: string, data: { student_id?: string; grade?: number; teacher_notes?: string; weak_areas?: string[]; delivered?: boolean }) => Promise<void>;
  processAI: (correctionId: string) => Promise<any>;
  finishCorrection: (examId: string) => Promise<void>;
  getWeakAreasForStudent: (studentId: string) => WeakArea[];
}

export const useCorrectionStore = create<CorrectionState>((set, get) => ({
  corrections: [],
  loading: false,

  fetchAllCorrections: async () => {
    if (!get().corrections.length) set({ loading: true });
    try {
      const res = await correctionsApi.listAll();
      const data = res.data.map((c: any) => ({
        id: c.id,
        examId: c.exam_id,
        studentId: c.student_id,
        paperUrl: c.paper_url,
        aiAnalysis: mapAIResult(c.ai_result),
        aiProcessed: c.ai_processed ?? !!c.ai_result,
        grade: c.grade,
        teacherComments: c.teacher_notes,
        weakAreas: c.weak_areas,
        savedAt: c.saved_at,
      }));
      set({ corrections: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchCorrections: async (examId) => {
    const hasCachedForExam = get().corrections.some((c) => c.examId === examId);
    if (!hasCachedForExam) set({ loading: true });
    try {
      const res = await correctionsApi.list(examId);
      const data = res.data.map((c: any) => ({
        id: c.id,
        examId: c.exam_id,
        studentId: c.student_id,
        paperUrl: c.paper_url,
        aiAnalysis: mapAIResult(c.ai_result),
        aiProcessed: c.ai_processed ?? !!c.ai_result,
        grade: c.grade,
        teacherComments: c.teacher_notes,
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

  uploadPapers: async (examId, files, studentId?) => {
    const res = await correctionsApi.upload(examId, files, studentId);
    const newCorrections: CorrectionResult[] = res.data.map((c: any) => ({
      id: c.id,
      examId: c.exam_id,
      studentId: c.student_id,
      paperUrl: c.paper_url,
      aiAnalysis: mapAIResult(c.ai_result),
      aiProcessed: c.ai_processed ?? !!c.ai_result,
      grade: c.grade,
      teacherComments: c.teacher_notes,
      weakAreas: c.weak_areas,
      delivered: c.delivered ?? false,
      savedAt: c.saved_at,
    }));
    set((s) => ({ corrections: [...s.corrections, ...newCorrections] }));
    return newCorrections;
  },

  updateCorrection: async (id, data) => {
    const res = await correctionsApi.update(id, data);
    const correction = get().corrections.find((c) => c.id === id);
    set((s) => ({
      corrections: s.corrections.map((c) =>
        c.id === id
          ? {
              ...c,
              studentId: res.data.student_id || c.studentId,
              grade: res.data.grade ?? c.grade,
              teacherComments: res.data.teacher_notes ?? c.teacherComments,
              weakAreas: res.data.weak_areas ?? c.weakAreas,
              delivered: res.data.delivered ?? c.delivered,
              savedAt: res.data.saved_at,
            }
          : c
      ),
    }));

    // Refresh exams to update status if grade changed
    // Find the exam's classId to avoid overwriting filtered data
    if (data.grade !== undefined && correction) {
      const exam = useExamsStore.getState().exams.find(e => e.id === correction.examId);
      if (exam?.classId) {
        useExamsStore.getState().fetchExams(exam.classId);
      } else {
        useExamsStore.getState().fetchExams();
      }
    }
  },

  processAI: async (correctionId) => {
    const res = await correctionsApi.processAI(correctionId);
    const correction = get().corrections.find((c) => c.id === correctionId);
    const aiAnalysis = mapAIResult(res.data);
    set((s) => ({
      corrections: s.corrections.map((c) =>
        c.id === correctionId
          ? {
              ...c,
              aiAnalysis,
              grade: res.data.grade ?? c.grade,
              weakAreas: res.data.weak_areas ?? c.weakAreas,
              aiProcessed: true,
            }
          : c
      ),
    }));

    // Refresh exams to update status if grade was set by AI
    if (res.data.grade !== null && res.data.grade !== undefined && correction) {
      const exam = useExamsStore.getState().exams.find(e => e.id === correction.examId);
      if (exam?.classId) {
        useExamsStore.getState().fetchExams(exam.classId);
      } else {
        useExamsStore.getState().fetchExams();
      }
    }

    return aiAnalysis;
  },

  finishCorrection: async (examId) => {
    await correctionsApi.finish(examId);
    // Refresh exams to update status - use exam's classId to preserve filters
    const exam = useExamsStore.getState().exams.find(e => e.id === examId);
    if (exam?.classId) {
      useExamsStore.getState().fetchExams(exam.classId);
    } else {
      useExamsStore.getState().fetchExams();
    }
  },

  getWeakAreasForStudent: (studentId) => {
    const studentCorrections = get().corrections.filter((c) => c.studentId === studentId && c.weakAreas);
    const exams = useExamsStore.getState().exams;
    const areas: WeakArea[] = [];
    studentCorrections.forEach((c) => {
      const exam = exams.find(e => e.id === c.examId);
      c.weakAreas?.forEach((topic) => {
        areas.push({
          topic,
          examId: c.examId,
          examName: exam?.name || 'Examen',
          score: c.grade || 0,
          maxScore: exam?.maxScore || 10,
        });
      });
    });
    return areas;
  },
}));
