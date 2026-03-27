import { create } from 'zustand';
import { Student, Comment } from '../types';
import { students as studentsApi, classes as classesApi } from '../services/api';

export interface StudentPoolEntry {
  id: string;
  name: string;
  email?: string;
  classes: Array<{ class_id: string; class_name: string; class_code: string }>;
}

interface StudentsState {
  students: Student[];
  pool: StudentPoolEntry[];
  loading: boolean;
  poolLoading: boolean;
  fetchAllStudents: () => Promise<void>;
  fetchStudents: (classId: string) => Promise<void>;
  fetchPool: () => Promise<void>;
  fetchPoolNotInClass: (classId: string) => Promise<StudentPoolEntry[]>;
  addStudent: (data: { class_id?: string; name: string; student_code?: string; email?: string }) => Promise<void>;
  bulkAddStudents: (classId: string, names: string[]) => Promise<void>;
  addExistingToClass: (classId: string, studentIds: string[]) => Promise<number>;
  removeStudent: (id: string) => Promise<void>;
  removeFromClass: (classId: string, studentId: string) => Promise<void>;
  addComment: (studentId: string, text: string, mentionedStudentIds?: string[]) => Promise<void>;
  getByClass: (classId: string) => Student[];
}

export const useStudentsStore = create<StudentsState>((set, get) => ({
  students: [],
  pool: [],
  loading: false,
  poolLoading: false,

  fetchAllStudents: async () => {
    if (!get().students.length) set({ loading: true });
    try {
      const res = await studentsApi.listAll();
      const data = res.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        classId: s.class_id,
        studentId: s.student_code,
        email: s.email,
        comments: [],
      }));
      set({ students: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchStudents: async (classId) => {
    // Only show spinner if we have no students for this class yet
    const hasStudentsForClass = get().students.some((s) => s.classId === classId);
    if (!hasStudentsForClass) set({ loading: true });
    try {
      const res = await classesApi.getStudents(classId);
      const newStudentIds = new Set(res.data.map((s: any) => s.id));
      const data = res.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        classId: s.class_id,
        studentId: s.student_code,
        email: s.email,
        comments: [],
      }));
      set((state) => {
        // Keep students from other classes, and remove any stale entries for students now in this class
        const otherStudents = state.students.filter(
          (s) => s.classId !== classId && !newStudentIds.has(s.id)
        );
        return { students: [...otherStudents, ...data], loading: false };
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchPool: async () => {
    set({ poolLoading: true });
    try {
      const res = await studentsApi.getPool();
      set({ pool: res.data, poolLoading: false });
    } catch {
      set({ poolLoading: false });
    }
  },

  fetchPoolNotInClass: async (classId: string) => {
    set({ poolLoading: true });
    try {
      const res = await studentsApi.getPoolNotInClass(classId);
      set({ poolLoading: false });
      return res.data;
    } catch {
      set({ poolLoading: false });
      return [];
    }
  },

  addStudent: async (data) => {
    const res = await studentsApi.create(data);
    const newStudent: Student = {
      id: res.data.id,
      name: res.data.name,
      classId: res.data.class_id,
      studentId: res.data.student_code,
      email: res.data.email,
      comments: [],
    };
    set((s) => ({ students: [...s.students, newStudent] }));
  },

  bulkAddStudents: async (classId: string, names: string[]) => {
    const res = await studentsApi.bulkCreate(classId, names);
    const newStudents: Student[] = res.data.map((s: any) => ({
      id: s.id,
      name: s.name,
      classId: s.class_id,
      studentId: s.student_code,
      email: s.email,
      comments: [],
    }));
    set((s) => ({ students: [...s.students, ...newStudents] }));
  },

  addExistingToClass: async (classId: string, studentIds: string[]) => {
    const res = await studentsApi.addExistingToClass(classId, studentIds);
    await get().fetchStudents(classId);
    return res.data.added;
  },

  removeStudent: async (id) => {
    await studentsApi.delete(id);
    set((s) => ({ students: s.students.filter((st) => st.id !== id) }));
  },

  removeFromClass: async (classId: string, studentId: string) => {
    await studentsApi.removeFromClass(classId, studentId);
    set((s) => ({ students: s.students.filter((st) => !(st.id === studentId && st.classId === classId)) }));
  },

  addComment: async (studentId, text, mentionedStudentIds) => {
    const res = await studentsApi.addComment(studentId, text, mentionedStudentIds);
    const comment: Comment = { id: res.data.id, text: res.data.text, createdAt: res.data.created_at };
    set((s) => ({
      students: s.students.map((st) =>
        st.id === studentId ? { ...st, comments: [comment, ...st.comments] } : st
      ),
    }));
  },

  getByClass: (classId) => get().students.filter((s) => s.classId === classId),
}));
