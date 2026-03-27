import { create } from 'zustand';
import { materials as materialsApi } from '../services/api';
import { SubjectStructure, TopicInStructure, MaterialInStructure } from '../types';

interface MaterialsState {
  structure: SubjectStructure[];
  loading: boolean;
  uploading: boolean;
  error: string | null;

  fetchStructure: () => Promise<void>;
  uploadMaterial: (topicId: string, file: File) => Promise<void>;
  deleteMaterial: (materialId: string) => Promise<void>;
  createSubject: (name: string, description?: string) => Promise<SubjectStructure>;
  createTopic: (subjectId: string, name: string) => Promise<TopicInStructure>;
  clearError: () => void;
}

const mapMaterial = (data: any): MaterialInStructure => ({
  id: data.id,
  name: data.name,
  documentUrl: data.document_url,
  documentType: data.document_type,
  uploadedAt: data.uploaded_at,
});

const mapTopic = (data: any): TopicInStructure => ({
  id: data.id,
  name: data.name,
  order: data.order,
  materials: (data.materials || []).map(mapMaterial),
});

const mapSubject = (data: any): SubjectStructure => ({
  subjectId: data.subject_id,
  subjectName: data.subject_name,
  classCount: data.class_count || 0,
  topics: (data.topics || []).map(mapTopic),
});

export const useMaterialsStore = create<MaterialsState>((set, get) => ({
  structure: [],
  loading: false,
  uploading: false,
  error: null,

  fetchStructure: async () => {
    if (!get().structure.length) set({ loading: true, error: null });
    try {
      const res = await materialsApi.getStructure();
      set({ structure: res.data.map(mapSubject), loading: false });
    } catch (err: any) {
      set({ error: err.message || 'Error loading structure', loading: false });
    }
  },

  uploadMaterial: async (topicId: string, file: File) => {
    set({ uploading: true, error: null });
    try {
      const res = await materialsApi.quickUpload(topicId, file);
      const newMaterial: MaterialInStructure = {
        id: res.data.id,
        name: res.data.name,
        documentUrl: res.data.document_url,
        documentType: res.data.document_type,
        uploadedAt: res.data.uploaded_at,
      };

      set((state) => ({
        structure: state.structure.map((s) => ({
          ...s,
          topics: s.topics.map((t) =>
            t.id === topicId
              ? { ...t, materials: [newMaterial, ...t.materials] }
              : t
          ),
        })),
        uploading: false,
      }));
    } catch (err: any) {
      set({ error: err.message || 'Error uploading material', uploading: false });
      throw err;
    }
  },

  deleteMaterial: async (materialId: string) => {
    try {
      await materialsApi.delete(materialId);
      set((state) => ({
        structure: state.structure.map((s) => ({
          ...s,
          topics: s.topics.map((t) => ({
            ...t,
            materials: t.materials.filter((m) => m.id !== materialId),
          })),
        })),
      }));
    } catch (err: any) {
      set({ error: err.message || 'Error deleting material' });
      throw err;
    }
  },

  createSubject: async (name: string, description?: string) => {
    try {
      const res = await materialsApi.quickCreateSubject(name, description);
      const newSubject: SubjectStructure = {
        subjectId: res.data.subject_id,
        subjectName: res.data.subject_name,
        classCount: 0,
        topics: [],
      };

      set((state) => ({
        structure: [...state.structure, newSubject],
      }));

      return newSubject;
    } catch (err: any) {
      set({ error: err.message || 'Error creating subject' });
      throw err;
    }
  },

  createTopic: async (subjectId: string, name: string) => {
    try {
      const res = await materialsApi.quickCreateTopic(subjectId, name);
      const newTopic: TopicInStructure = {
        id: res.data.id,
        name: res.data.name,
        order: res.data.order,
        materials: [],
      };

      set((state) => ({
        structure: state.structure.map((s) =>
          s.subjectId === subjectId
            ? { ...s, topics: [...s.topics, newTopic] }
            : s
        ),
      }));

      return newTopic;
    } catch (err: any) {
      set({ error: err.message || 'Error creating topic' });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
