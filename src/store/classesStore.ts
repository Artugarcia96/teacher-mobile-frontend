import { create } from 'zustand';
import { ClassGroup, ClassSubjectSummary } from '../types';
import { classes as classesApi } from '../services/api';

export interface DeletePreview {
  class_id: string;
  class_name: string;
  counts: {
    students: number;
    lectures: number;
    exams: number;
    corrections: number;
    calendar_events: number;
    notes: number;
    exercises: number;
    comments: number;
  };
}

interface ClassesState {
  classes: ClassGroup[];
  classSubjects: Record<string, ClassSubjectSummary[]>;
  /** Tracks which classIds have had their subjects fetched at least once.
   *  Allows components to distinguish "still loading" from "truly empty". */
  classSubjectsLoaded: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  fetchClasses: () => Promise<void>;
  fetchClassSubjects: (classId: string) => Promise<ClassSubjectSummary[]>;
  addClass: (c: { name: string; subject?: string; year: string; education_level?: string }) => Promise<string>;
  archiveClass: (id: string) => Promise<void>;
  deleteClassPermanently: (id: string) => Promise<void>;
  bulkDeleteClasses: (ids: string[]) => Promise<{ deleted: number; errors: string[] }>;
  getDeletePreview: (id: string) => Promise<DeletePreview>;
  importStudents: (classId: string, file: File) => Promise<number>;
}

export const useClassesStore = create<ClassesState>((set, get) => ({
  classes: [],
  classSubjects: {},
  classSubjectsLoaded: {},
  loading: false,
  error: null,

  fetchClassSubjects: async (classId: string) => {
    try {
      const res = await classesApi.getSubjectsSummary(classId);
      const subjects: ClassSubjectSummary[] = res.data.map((s: any) => ({
        subjectId: s.subject_id,
        subjectName: s.subject_name,
        subjectColor: s.subject_color || undefined,
        lectureId: s.lecture_id,
        examCount: s.exam_count,
        pendingCorrections: s.pending_corrections,
        exerciseCount: s.exercise_count,
        pendingExerciseCount: s.pending_exercise_count ?? 0,
        topicCount: s.topic_count,
        averageGrade: s.average_grade ?? null,
        correctedCount: s.corrected_count ?? 0,
        passRate: s.pass_rate ?? null,
        aula: s.aula || undefined,
        schedule: s.schedule || [],
        examWeightPct: s.exam_weight_pct ?? 70,
      }));
      set((state) => ({
        classSubjects: { ...state.classSubjects, [classId]: subjects },
        classSubjectsLoaded: { ...state.classSubjectsLoaded, [classId]: true },
      }));
      return subjects;
    } catch {
      // Mark as loaded even on error so components show "Sin asignaturas" instead of skeleton
      set((state) => ({
        classSubjectsLoaded: { ...state.classSubjectsLoaded, [classId]: true },
      }));
      return [];
    }
  },

  fetchClasses: async () => {
    const hasCachedClasses = get().classes.length > 0;
    // Only show loading spinner on initial load; when we have cached data, refresh in background
    if (!hasCachedClasses) {
      set({ loading: true, error: null });
    }
    try {
      const res = await classesApi.list();
      const data = res.data.map((c: any) => ({
        id: c.id,
        name: c.name,
        subject: c.subject || '',
        year: c.year,
        educationLevel: c.education_level || 'secundaria',
        studentCount: c.student_count,
        lectureCount: c.lecture_count || 0,
        examWeightPct: c.exam_weight_pct ?? 70,
        lastActivity: c.last_activity || c.updated_at || null,
        archived: c.archived,
        lecturesBasic: c.lectures || [],
      }));
      set({ classes: data, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  addClass: async (c) => {
    const res = await classesApi.create(c);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const newClass: ClassGroup = {
      id: res.data.id,
      name: res.data.name,
      subject: res.data.subject || '',
      year: res.data.year,
      educationLevel: res.data.education_level || 'secundaria',
      studentCount: res.data.student_count,
      lectureCount: res.data.lecture_count || 0,
      examWeightPct: res.data.exam_weight_pct ?? 70,
      lastActivity: todayStr,
      archived: res.data.archived,
    };
    set((s) => ({ classes: [...s.classes, newClass] }));
    return res.data.id;
  },

  archiveClass: async (id) => {
    await classesApi.delete(id);
    set((s) => ({ classes: s.classes.filter((c) => c.id !== id) }));
  },

  deleteClassPermanently: async (id) => {
    await classesApi.deletePermanently(id);
    set((s) => ({ classes: s.classes.filter((c) => c.id !== id) }));
  },

  bulkDeleteClasses: async (ids) => {
    const res = await classesApi.bulkDelete(ids);
    // Remove successfully deleted classes from state
    if (res.data.deleted > 0) {
      set((s) => ({ classes: s.classes.filter((c) => !ids.includes(c.id)) }));
    }
    return { deleted: res.data.deleted, errors: res.data.errors || [] };
  },

  getDeletePreview: async (id) => {
    const res = await classesApi.getDeletePreview(id);
    return res.data;
  },

  importStudents: async (classId, file) => {
    const res = await classesApi.importStudents(classId, file);
    await get().fetchClasses();
    return res.data.imported;
  },
}));
