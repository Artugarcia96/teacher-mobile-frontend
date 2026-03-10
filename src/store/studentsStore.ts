import { create } from 'zustand';
import { Student, Note } from '../types';
import { students as studentsApi, classes as classesApi } from '../services/api';

interface StudentsState {
  students: Student[];
  loading: boolean;
  fetchAllStudents: () => Promise<void>;
  fetchStudents: (classId: string) => Promise<void>;
  addStudent: (data: { class_id: string; name: string; student_code?: string; email?: string }) => Promise<void>;
  removeStudent: (id: string) => Promise<void>;
  addNote: (studentId: string, text: string) => Promise<void>;
  getByClass: (classId: string) => Student[];
}

export const useStudentsStore = create<StudentsState>((set, get) => ({
  students: [],
  loading: false,

  fetchAllStudents: async () => {
    set({ loading: true });
    try {
      const res = await studentsApi.listAll();
      const data = res.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        classId: s.class_id,
        studentId: s.student_code,
        email: s.email,
        notes: [],
      }));
      set({ students: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchStudents: async (classId) => {
    set({ loading: true });
    try {
      const res = await classesApi.getStudents(classId);
      const data = res.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        classId: s.class_id,
        studentId: s.student_code,
        email: s.email,
        notes: [],
      }));
      set((state) => {
        const otherStudents = state.students.filter((s) => s.classId !== classId);
        return { students: [...otherStudents, ...data], loading: false };
      });
    } catch {
      set({ loading: false });
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
      notes: [],
    };
    set((s) => ({ students: [...s.students, newStudent] }));
  },

  removeStudent: async (id) => {
    await studentsApi.delete(id);
    set((s) => ({ students: s.students.filter((st) => st.id !== id) }));
  },

  addNote: async (studentId, text) => {
    const res = await studentsApi.addNote(studentId, text);
    const note: Note = { id: res.data.id, text: res.data.text, createdAt: res.data.created_at };
    set((s) => ({
      students: s.students.map((st) =>
        st.id === studentId ? { ...st, notes: [note, ...st.notes] } : st
      ),
    }));
  },

  getByClass: (classId) => get().students.filter((s) => s.classId === classId),
}));
