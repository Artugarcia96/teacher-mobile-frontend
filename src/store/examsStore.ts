import { create } from 'zustand';
import { Exam } from '../types';
import { exams as examsApi } from '../services/api';

interface GenerateExamParams {
  class_id?: string;
  lecture_id?: string;
  subject_id?: string;
  topic_ids: string[];
  name: string;
  exam_date: string;
  num_questions?: number;
  max_score?: number;
  difficulty?: string;
  question_types?: string[];
  refinement_prompt?: string;
  is_personalized?: boolean;
  correction_deadline?: string;
  blank_pages_count?: number;
}

interface IterateExamParams {
  instruction: string;
  preserve_questions?: number[];
}

interface ExamsState {
  exams: Exam[];
  loading: boolean;
  fetchExams: (classId?: string, subjectId?: string) => Promise<void>;
  addExam: (data: { name: string; classId?: string; lectureId?: string; subjectId?: string; date: string; maxScore: number; isPersonalized?: boolean; correctionDeadline?: string; blankPagesCount?: number }, file?: File) => Promise<string>;
  generateExam: (data: GenerateExamParams) => Promise<string>;
  updateExam: (id: string, data: Partial<Exam>) => Promise<void>;
  iterateExam: (id: string, data: IterateExamParams) => Promise<Exam>;
  assignExam: (id: string) => Promise<void>;
  deleteExam: (id: string) => Promise<void>;
}

export const useExamsStore = create<ExamsState>((set, get) => ({
  exams: [],
  loading: false,

  fetchExams: async (classId, subjectId) => {
    set({ loading: true });
    try {
      const res = await examsApi.list(classId, subjectId);
      const data = res.data.map((e: any) => ({
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
      }));
      set({ exams: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addExam: async (data, file) => {
    const res = await examsApi.create(
      {
        name: data.name,
        class_id: data.classId || undefined,
        lecture_id: data.lectureId || undefined,
        subject_id: data.subjectId || undefined,
        exam_date: data.date,
        max_score: data.maxScore,
        is_personalized: data.isPersonalized,
        correction_deadline: data.correctionDeadline,
        blank_pages_count: data.blankPagesCount,
      },
      file
    );
    const newExam: Exam = {
      id: res.data.id,
      name: res.data.name,
      classId: res.data.class_id,
      lectureId: res.data.lecture_id,
      subjectId: res.data.subject_id,
      date: res.data.exam_date,
      maxScore: res.data.max_score,
      status: res.data.status,
      documentUrl: res.data.document_url,
      documentType: res.data.document_type,
      isPersonalized: res.data.is_personalized || false,
      hasGeneratedQuestions: res.data.has_generated_questions || false,
      className: res.data.class_name,
      lectureName: res.data.lecture_name,
      subjectName: res.data.subject_name,
      correctionDeadline: res.data.correction_deadline,
      blankPagesCount: res.data.blank_pages_count || 0,
      deadlineStatus: res.data.deadline_status,
    };
    set((s) => ({ exams: [...s.exams, newExam] }));
    return res.data.id;
  },

  generateExam: async (data) => {
    const res = await examsApi.generate(data);
    const newExam: Exam = {
      id: res.data.id,
      name: res.data.name,
      classId: res.data.class_id,
      lectureId: res.data.lecture_id,
      date: res.data.exam_date,
      maxScore: res.data.max_score,
      status: res.data.status,
      documentUrl: res.data.document_url,
      documentType: res.data.document_type,
      isPersonalized: res.data.is_personalized || false,
      hasGeneratedQuestions: res.data.has_generated_questions || false,
      className: res.data.class_name,
      lectureName: res.data.lecture_name,
      subjectId: res.data.subject_id,
      subjectName: res.data.subject_name,
      correctionDeadline: res.data.correction_deadline,
      blankPagesCount: res.data.blank_pages_count || 0,
      iterationHistory: res.data.iteration_history,
      deadlineStatus: res.data.deadline_status,
    };
    set((s) => ({ exams: [...s.exams, newExam] }));
    return res.data.id;
  },

  updateExam: async (id, data) => {
    await examsApi.update(id, {
      name: data.name,
      exam_date: data.date,
      max_score: data.maxScore,
      status: data.status,
      correction_deadline: data.correctionDeadline,
      blank_pages_count: data.blankPagesCount,
    });
    set((s) => ({
      exams: s.exams.map((e) => (e.id === id ? { ...e, ...data } : e)),
    }));
  },

  iterateExam: async (id, data) => {
    const res = await examsApi.iterate(id, data);
    const updatedExam: Exam = {
      id: res.data.id,
      name: res.data.name,
      classId: res.data.class_id,
      lectureId: res.data.lecture_id,
      subjectId: res.data.subject_id,
      date: res.data.exam_date,
      maxScore: res.data.max_score,
      status: res.data.status,
      documentUrl: res.data.document_url,
      documentType: res.data.document_type,
      isPersonalized: res.data.is_personalized || false,
      hasGeneratedQuestions: res.data.has_generated_questions || false,
      className: res.data.class_name,
      lectureName: res.data.lecture_name,
      subjectName: res.data.subject_name,
      correctionDeadline: res.data.correction_deadline,
      blankPagesCount: res.data.blank_pages_count || 0,
      iterationHistory: res.data.iteration_history,
      deadlineStatus: res.data.deadline_status,
    };
    set((s) => ({
      exams: s.exams.map((e) => (e.id === id ? updatedExam : e)),
    }));
    return updatedExam;
  },

  assignExam: async (id) => {
    await examsApi.assign(id);
    set((s) => ({
      exams: s.exams.map((e) => (e.id === id ? { ...e, status: 'assigned' as const } : e)),
    }));
  },

  deleteExam: async (id) => {
    await examsApi.delete(id);
    set((s) => ({ exams: s.exams.filter((e) => e.id !== id) }));
  },
}));
