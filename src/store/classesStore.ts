import { create } from 'zustand';
import { ClassGroup } from '../types';
import { classes as classesApi } from '../services/api';

interface ClassesState {
  classes: ClassGroup[];
  loading: boolean;
  error: string | null;
  fetchClasses: () => Promise<void>;
  addClass: (c: { name: string; subject?: string; year: string }) => Promise<string>;
  archiveClass: (id: string) => Promise<void>;
  importStudents: (classId: string, file: File) => Promise<number>;
}

export const useClassesStore = create<ClassesState>((set, get) => ({
  classes: [],
  loading: false,
  error: null,

  fetchClasses: async () => {
    set({ loading: true, error: null });
    try {
      const res = await classesApi.list();
      const data = res.data.map((c: any) => ({
        id: c.id,
        name: c.name,
        subject: c.subject || '',
        year: c.year,
        studentCount: c.student_count,
        lectureCount: c.lecture_count || 0,
        lastActivity: new Date().toISOString().slice(0, 10),
        archived: c.archived,
      }));
      set({ classes: data, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  addClass: async (c) => {
    const res = await classesApi.create(c);
    const newClass: ClassGroup = {
      id: res.data.id,
      name: res.data.name,
      subject: res.data.subject || '',
      year: res.data.year,
      studentCount: res.data.student_count,
      lectureCount: res.data.lecture_count || 0,
      lastActivity: new Date().toISOString().slice(0, 10),
      archived: res.data.archived,
    };
    set((s) => ({ classes: [...s.classes, newClass] }));
    return res.data.id;
  },

  archiveClass: async (id) => {
    await classesApi.delete(id);
    set((s) => ({ classes: s.classes.filter((c) => c.id !== id) }));
  },

  importStudents: async (classId, file) => {
    const res = await classesApi.importStudents(classId, file);
    await get().fetchClasses();
    return res.data.imported;
  },
}));
