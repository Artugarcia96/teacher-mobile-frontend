import { create } from 'zustand';
import { CorrectionResult, WeakArea, AIAnalysis } from '../types';
import { corrections as correctionsApi } from '../services/api';
import { useExamsStore } from './examsStore';

/** Mirrors the backend response from POST /corrections/{exam_id}/finish.
 *  Tells the caller whether the exam moved to "corrected" or whether some
 *  classes still have ungraded students, so the UI can react accordingly. */
export interface FinishCorrectionResult {
  scope: 'class' | 'global';
  classId?: string;
  classCorrected: boolean;
  allGraded: boolean;
  total: number;
  resolved: number;
  pending: number;
  pendingByClass: { classId: string; className: string; count: number }[];
  status: string;
}

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
  uploadPapers: (examId: string, files: File[], studentId?: string, group?: boolean, classId?: string, anonymousLabel?: string) => Promise<CorrectionResult[]>;
  updateCorrection: (id: string, data: { student_id?: string; anonymous_label?: string; grade?: number; teacher_notes?: string; weak_areas?: string[] }) => Promise<void>;
  processAI: (correctionId: string) => Promise<any>;
  finishCorrection: (examId: string, classId?: string) => Promise<FinishCorrectionResult>;
  markNotTaken: (correctionId: string, notTaken: boolean) => Promise<void>;
  replacePaper: (correctionId: string, file: File) => Promise<CorrectionResult | null>;
  getWeakAreasForStudent: (studentId: string) => WeakArea[];
}


function mapCorrection(c: any): CorrectionResult {
  return {
    id: c.id,
    examId: c.exam_id,
    studentId: c.student_id,
    studentName: c.student_name,
    anonymousLabel: c.anonymous_label ?? undefined,
    classId: c.class_id,
    className: c.class_name,
    paperUrl: c.paper_url,
    aiAnalysis: mapAIResult(c.ai_result),
    aiProcessed: c.ai_processed ?? !!c.ai_result,
    grade: c.grade,
    teacherComments: c.teacher_notes,
    weakAreas: c.weak_areas,
    notTaken: !!c.not_taken,
    savedAt: c.saved_at,
  };
}

export const useCorrectionStore = create<CorrectionState>((set, get) => ({
  corrections: [],
  loading: false,

  fetchAllCorrections: async () => {
    if (!get().corrections.length) set({ loading: true });
    try {
      const res = await correctionsApi.listAll();
      set({ corrections: res.data.map(mapCorrection), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchCorrections: async (examId) => {
    const hasCachedForExam = get().corrections.some((c) => c.examId === examId);
    if (!hasCachedForExam) set({ loading: true });
    try {
      const res = await correctionsApi.list(examId);
      const data = res.data.map(mapCorrection);
      set((s) => {
        const other = s.corrections.filter((c) => c.examId !== examId);
        return { corrections: [...other, ...data], loading: false };
      });
    } catch {
      set({ loading: false });
    }
  },

  uploadPapers: async (examId, files, studentId?, group?, classId?, anonymousLabel?) => {
    const res = await correctionsApi.upload(examId, files, studentId, group, classId, anonymousLabel);
    const returned: CorrectionResult[] = res.data.map(mapCorrection);
    // The backend reuses existing Corrections for already-assigned students,
    // so merge by id rather than blindly appending to avoid duplicate rows in
    // the store state.
    set((s) => {
      const byId = new Map(s.corrections.map((c) => [c.id, c]));
      returned.forEach((c) => byId.set(c.id, c));
      return { corrections: Array.from(byId.values()) };
    });
    return returned;
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
              studentName: res.data.student_name ?? c.studentName,
              classId: res.data.class_id ?? c.classId,
              className: res.data.class_name ?? c.className,
              grade: res.data.grade ?? c.grade,
              teacherComments: res.data.teacher_notes ?? c.teacherComments,
              weakAreas: res.data.weak_areas ?? c.weakAreas,
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

  markNotTaken: async (correctionId, notTaken) => {
    const res = await correctionsApi.markNotTaken(correctionId, notTaken);
    const updated = mapCorrection(res.data);
    set((s) => ({
      corrections: s.corrections.map((c) => (c.id === correctionId ? updated : c)),
    }));
    // Refresh exam status — finishing depends on every row being graded or NP.
    const correction = updated;
    const exam = useExamsStore.getState().exams.find(e => e.id === correction.examId);
    if (exam?.classId) {
      useExamsStore.getState().fetchExams(exam.classId);
    } else {
      useExamsStore.getState().fetchExams();
    }
  },

  replacePaper: async (correctionId, file) => {
    const res = await correctionsApi.replacePaper(correctionId, file);
    const updated = mapCorrection(res.data);
    set((s) => ({
      corrections: s.corrections.map((c) => (c.id === correctionId ? updated : c)),
    }));
    return updated;
  },

  finishCorrection: async (examId, classId) => {
    const res = await correctionsApi.finish(examId, classId);
    const data = res.data || {};
    // Refresh exams to update status - use exam's classId to preserve filters
    const exam = useExamsStore.getState().exams.find(e => e.id === examId);
    if (exam?.classId) {
      useExamsStore.getState().fetchExams(exam.classId);
    } else {
      useExamsStore.getState().fetchExams();
    }
    return {
      scope: data.scope === 'class' ? 'class' : 'global',
      classId: data.class_id ?? undefined,
      classCorrected: !!data.class_corrected,
      allGraded: !!data.all_graded,
      total: data.total ?? 0,
      resolved: data.resolved ?? 0,
      pending: data.pending ?? 0,
      pendingByClass: (data.pending_by_class || []).map((p: any) => ({
        classId: p.class_id,
        className: p.class_name,
        count: p.count,
      })),
      status: data.status || 'pending_correction',
    };
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
