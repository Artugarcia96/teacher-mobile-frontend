import { create } from 'zustand';
import { Exam } from '../types';
import { exams as examsApi } from '../services/api';

interface GenerateExamParams {
  class_id?: string;
  lecture_id?: string;
  subject_id?: string;
  subject_name?: string;
  topic_ids?: string[];
  reference_material_paths?: string[];
  name: string;
  exam_date: string;
  num_questions?: number;
  max_score?: number;
  difficulty?: string;
  question_types?: string[];
  refinement_prompt?: string;
  is_test_format?: boolean;
  exam_format?: string;
  education_level?: string;
  trimester?: number;
}

interface IterateExamParams {
  instruction: string;
  preserve_questions?: number[];
}

function mapExam(e: any): Exam {
  return {
    id: e.id,
    name: e.name,
    classId: e.class_id,
    lectureId: e.lecture_id,
    subjectId: e.subject_id,
    date: e.exam_date,
    maxScore: e.max_score,
    status: e.status,
    documentUrl: e.document_url,
    documentType: e.document_type,
    isPersonalized: e.is_personalized || false,
    hasGeneratedQuestions: e.has_generated_questions || false,
    className: e.class_name,
    lectureName: e.lecture_name,
    subjectName: e.subject_name,
    correctionDeadline: e.correction_deadline,
    blankPagesCount: e.blank_pages_count || 0,
    iterationHistory: e.iteration_history,
    deadlineStatus: e.deadline_status,
    weight: e.weight ?? 1.0,
    examOrigin: e.exam_origin,
    isTestFormat: e.is_test_format || false,
    examFormat: e.exam_format || 'boxes',
    trimester: e.trimester ?? undefined,
    categoryId: e.category_id ?? undefined,
    categoryName: e.category_name ?? undefined,
    originalDocumentUrl: e.original_document_url ?? undefined,
    refinementPrompt: e.refinement_prompt ?? undefined,
    assignments: e.assignments?.map((a: any) => ({
      classId: a.class_id,
      className: a.class_name,
      subjectId: a.subject_id,
      subjectName: a.subject_name,
      correctionDeadline: a.correction_deadline ?? undefined,
      deadlineStatus: a.deadline_status ?? undefined,
      studentCount: a.student_count ?? 0,
      hasClassPdf: a.has_class_pdf ?? false,
    })) || undefined,
  };
}

interface ExamsState {
  exams: Exam[];
  loading: boolean;
  _lastScope: string | null;
  fetchExams: (classId?: string, subjectId?: string) => Promise<void>;
  addExam: (data: { name: string; classId?: string; lectureId?: string; subjectId?: string; date?: string; maxScore: number; examFormat?: string; trimester?: number; refinementPrompt?: string }, files?: File | File[]) => Promise<{ id: string; batchJobId: string }>;
  generateExam: (data: GenerateExamParams) => Promise<{ id: string; batchJobId: string }>;
  updateExam: (id: string, data: Partial<Exam>) => Promise<void>;
  iterateExam: (id: string, data: IterateExamParams) => Promise<Exam>;
  validateExam: (id: string) => Promise<Exam>;
  assignExam: (id: string, data?: { assignments?: Array<{ class_id: string; subject_id: string; correction_deadline?: string; exam_date?: string }>; student_ids?: string[]; blank_pages_count?: number }) => Promise<any>;
  deleteExam: (id: string, force?: boolean) => Promise<void>;
}

export const useExamsStore = create<ExamsState>((set, get) => ({
  exams: [],
  loading: false,
  _lastScope: null,

  fetchExams: async (classId, subjectId) => {
    const scope = classId ? `${classId}:${subjectId ?? ''}` : 'global';
    const cached = get().exams;
    const scopeChanged = scope !== get()._lastScope;
    const hasCachedForScope = !scopeChanged && (classId
      ? cached.some((e) => e.classId === classId)
      : cached.length > 0);
    if (!hasCachedForScope) set({ loading: true });
    try {
      const res = await examsApi.list(classId, subjectId);
      const data = res.data.map(mapExam);
      set({ exams: data, loading: false, _lastScope: scope });
    } catch {
      set({ loading: false });
    }
  },

  addExam: async (data, file) => {
    const payload: Record<string, any> = {
      name: data.name,
      max_score: data.maxScore,
    };
    if (data.classId) payload.class_id = data.classId;
    if (data.lectureId) payload.lecture_id = data.lectureId;
    if (data.subjectId) payload.subject_id = data.subjectId;
    if (data.date) payload.exam_date = data.date;
    if (data.examFormat) payload.exam_format = data.examFormat;
    if (data.refinementPrompt) payload.refinement_prompt = data.refinementPrompt;

    const res = await examsApi.create(
      payload,
      file
    );
    const newExam = mapExam(res.data);
    set((s) => ({ exams: [...s.exams, newExam] }));
    return { id: res.data.id, batchJobId: res.data.batch_job_id || '' };
  },

  generateExam: async (data) => {
    const res = await examsApi.generate(data as any);
    const newExam = mapExam(res.data);
    set((s) => ({ exams: [...s.exams, newExam] }));
    return { id: res.data.id, batchJobId: res.data.batch_job_id || '' };
  },

  updateExam: async (id, data) => {
    await examsApi.update(id, {
      name: data.name,
      class_id: data.classId,
      lecture_id: data.lectureId,
      subject_id: data.subjectId,
      exam_date: data.date,
      max_score: data.maxScore,
      status: data.status,
      correction_deadline: data.correctionDeadline,
      blank_pages_count: data.blankPagesCount,
      exam_format: data.examFormat,
    });
    set((s) => ({
      exams: s.exams.map((e) => (e.id === id ? { ...e, ...data } : e)),
    }));
  },

  iterateExam: async (id, data) => {
    const res = await examsApi.iterate(id, data);
    const updatedExam = mapExam(res.data);
    set((s) => ({
      exams: s.exams.map((e) => (e.id === id ? updatedExam : e)),
    }));
    return updatedExam;
  },

  validateExam: async (id) => {
    const res = await examsApi.validate(id);
    const updatedExam = mapExam(res.data);
    set((s) => ({
      exams: s.exams.map((e) => (e.id === id ? updatedExam : e)),
    }));
    return updatedExam;
  },

  assignExam: async (id, data) => {
    const res = await examsApi.assign(id, data);
    set((s) => ({
      exams: s.exams.map((e) => (e.id === id ? { ...e, status: 'scheduled' as const } : e)),
    }));
    return res.data;
  },

  deleteExam: async (id, force) => {
    await examsApi.delete(id, force);
    set((s) => ({ exams: s.exams.filter((e) => e.id !== id) }));
  },
}));
