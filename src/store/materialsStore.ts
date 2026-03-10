import { create } from 'zustand';
import { materials as materialsApi } from '../services/api';
import { ClassStructure, TopicInStructure, MaterialInStructure } from '../types';

interface MaterialsState {
  structure: ClassStructure[];
  loading: boolean;
  uploading: boolean;
  error: string | null;

  fetchStructure: () => Promise<void>;
  uploadMaterial: (topicId: string, file: File) => Promise<void>;
  deleteMaterial: (materialId: string) => Promise<void>;
  createClass: (name: string, subject: string) => Promise<ClassStructure>;
  createTopic: (classId: string, name: string) => Promise<TopicInStructure>;
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

const mapClass = (data: any): ClassStructure => ({
  classId: data.class_id,
  className: data.class_name,
  classSubject: data.class_subject,
  topics: (data.topics || []).map(mapTopic),
});

export const useMaterialsStore = create<MaterialsState>((set, get) => ({
  structure: [],
  loading: false,
  uploading: false,
  error: null,

  fetchStructure: async () => {
    set({ loading: true, error: null });
    try {
      const res = await materialsApi.getStructure();
      set({ structure: res.data.map(mapClass), loading: false });
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
        structure: state.structure.map((c) => ({
          ...c,
          topics: c.topics.map((t) =>
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
        structure: state.structure.map((c) => ({
          ...c,
          topics: c.topics.map((t) => ({
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

  createClass: async (name: string, subject: string) => {
    try {
      const res = await materialsApi.quickCreateClass(name, subject);
      const newClass: ClassStructure = {
        classId: res.data.class_id,
        className: res.data.class_name,
        classSubject: res.data.class_subject,
        topics: [],
      };
      
      set((state) => ({
        structure: [...state.structure, newClass],
      }));
      
      return newClass;
    } catch (err: any) {
      set({ error: err.message || 'Error creating class' });
      throw err;
    }
  },

  createTopic: async (classId: string, name: string) => {
    try {
      const res = await materialsApi.quickCreateTopic(classId, name);
      const newTopic: TopicInStructure = {
        id: res.data.id,
        name: res.data.name,
        order: res.data.order,
        materials: [],
      };
      
      set((state) => ({
        structure: state.structure.map((c) =>
          c.classId === classId
            ? { ...c, topics: [...c.topics, newTopic] }
            : c
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
