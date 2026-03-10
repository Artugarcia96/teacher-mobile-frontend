import { create } from 'zustand';
import { topics as topicsApi } from '../services/api';
import { Topic, TopicListItem, TopicMaterial } from '../types';

interface TopicsState {
  topics: TopicListItem[];
  currentTopic: Topic | null;
  loading: boolean;
  error: string | null;
  
  fetchTopics: (classId: string) => Promise<void>;
  fetchTopic: (topicId: string) => Promise<Topic | null>;
  createTopic: (classId: string, data: { name: string; description?: string }) => Promise<Topic>;
  updateTopic: (topicId: string, data: { name?: string; description?: string; order?: number }) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  uploadMaterial: (topicId: string, file: File) => Promise<TopicMaterial>;
  deleteMaterial: (topicId: string, materialId: string) => Promise<void>;
  clearCurrentTopic: () => void;
}

const mapTopicResponse = (data: any): Topic => ({
  id: data.id,
  classId: data.class_id,
  name: data.name,
  description: data.description,
  order: data.order,
  createdAt: data.created_at,
  materials: (data.materials || []).map((m: any) => ({
    id: m.id,
    topicId: m.topic_id,
    name: m.name,
    documentUrl: m.document_url,
    documentType: m.document_type,
    uploadedAt: m.uploaded_at
  }))
});

const mapTopicListResponse = (data: any): TopicListItem => ({
  id: data.id,
  classId: data.class_id,
  name: data.name,
  description: data.description,
  order: data.order,
  materialCount: data.material_count || 0
});

export const useTopicsStore = create<TopicsState>((set, get) => ({
  topics: [],
  currentTopic: null,
  loading: false,
  error: null,

  fetchTopics: async (classId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await topicsApi.list(classId);
      set({ topics: res.data.map(mapTopicListResponse), loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  fetchTopic: async (topicId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await topicsApi.get(topicId);
      const topic = mapTopicResponse(res.data);
      set({ currentTopic: topic, loading: false });
      return topic;
    } catch (err: any) {
      set({ error: err.message, loading: false });
      return null;
    }
  },

  createTopic: async (classId: string, data: { name: string; description?: string }) => {
    const res = await topicsApi.create(classId, data);
    const topic = mapTopicResponse(res.data);
    set((state) => ({
      topics: [...state.topics, mapTopicListResponse(res.data)]
    }));
    return topic;
  },

  updateTopic: async (topicId: string, data: { name?: string; description?: string; order?: number }) => {
    await topicsApi.update(topicId, data);
    const { currentTopic, topics } = get();
    
    if (currentTopic && currentTopic.id === topicId) {
      set({ currentTopic: { ...currentTopic, ...data } });
    }
    
    set({
      topics: topics.map((t) =>
        t.id === topicId ? { ...t, ...data } : t
      )
    });
  },

  deleteTopic: async (topicId: string) => {
    await topicsApi.delete(topicId);
    set((state) => ({
      topics: state.topics.filter((t) => t.id !== topicId),
      currentTopic: state.currentTopic?.id === topicId ? null : state.currentTopic
    }));
  },

  uploadMaterial: async (topicId: string, file: File) => {
    const res = await topicsApi.uploadMaterial(topicId, file);
    const material: TopicMaterial = {
      id: res.data.id,
      topicId: res.data.topic_id,
      name: res.data.name,
      documentUrl: res.data.document_url,
      documentType: res.data.document_type,
      uploadedAt: res.data.uploaded_at
    };
    
    const { currentTopic, topics } = get();
    if (currentTopic && currentTopic.id === topicId) {
      set({ currentTopic: { ...currentTopic, materials: [...currentTopic.materials, material] } });
    }
    
    set({
      topics: topics.map((t) =>
        t.id === topicId ? { ...t, materialCount: t.materialCount + 1 } : t
      )
    });
    
    return material;
  },

  deleteMaterial: async (topicId: string, materialId: string) => {
    await topicsApi.deleteMaterial(topicId, materialId);
    
    const { currentTopic, topics } = get();
    if (currentTopic && currentTopic.id === topicId) {
      set({
        currentTopic: {
          ...currentTopic,
          materials: currentTopic.materials.filter((m) => m.id !== materialId)
        }
      });
    }
    
    set({
      topics: topics.map((t) =>
        t.id === topicId ? { ...t, materialCount: Math.max(0, t.materialCount - 1) } : t
      )
    });
  },

  clearCurrentTopic: () => set({ currentTopic: null })
}));
