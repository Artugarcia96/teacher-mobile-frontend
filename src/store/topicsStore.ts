import { create } from 'zustand';
import { topics as topicsApi, subjects as subjectsApi } from '../services/api';
import { Topic, TopicListItem, TopicMaterial, SubjectWithTopics, SubjectListItem, SubTopic } from '../types';

interface TopicsState {
  topics: TopicListItem[];
  topicsBySubject: SubjectWithTopics[];
  classSubjects: SubjectListItem[];
  allSubjects: SubjectListItem[];
  currentTopic: Topic | null;
  loading: boolean;
  error: string | null;

  fetchTopicsForClass: (classId: string) => Promise<void>;
  fetchTopicsBySubject: (subjectId: string) => Promise<void>;
  fetchClassSubjects: (classId: string) => Promise<void>;
  fetchAllSubjects: () => Promise<void>;
  linkSubjectToClass: (subjectId: string, classId: string) => Promise<void>;
  unlinkSubjectFromClass: (subjectId: string, classId: string) => Promise<void>;
  fetchTopic: (topicId: string) => Promise<Topic | null>;
  createTopic: (subjectId: string, data: { name: string; description?: string; trimester?: number; parent_id?: string; class_id?: string }) => Promise<Topic>;
  updateTopic: (topicId: string, data: { name?: string; description?: string; trimester?: number; order?: number; include_in_generation?: boolean }) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  uploadMaterial: (topicId: string, file: File) => Promise<TopicMaterial>;
  deleteMaterial: (topicId: string, materialId: string) => Promise<void>;
  updateMaterial: (topicId: string, materialId: string, data: { include_in_exercises?: boolean }) => Promise<void>;
  generateMaterial: (topicId: string, data: { prompt: string; enfoque?: string; target_pages?: number; exercises_per_chapter?: number; examples_per_section?: number }) => Promise<{ textbook_id: string; batch_job_id: string }>;
  moveMaterial: (fromTopicId: string, materialId: string, toTopicId: string) => Promise<void>;
  clearCurrentTopic: () => void;
}

const mapTopicResponse = (data: any): Topic => ({
  id: data.id,
  subjectId: data.subject_id,
  parentId: data.parent_id ?? null,
  subjectName: data.subject_name,
  name: data.name,
  description: data.description,
  trimester: data.trimester ?? null,
  order: data.order,
  createdAt: data.created_at,
  materials: (data.materials || []).map((m: any) => ({
    id: m.id,
    topicId: m.topic_id,
    name: m.name,
    documentUrl: m.document_url,
    documentType: m.document_type,
    uploadedAt: m.uploaded_at,
    includeInExercises: m.include_in_exercises ?? true,
    isGenerated: m.is_generated ?? false,
  })),
  children: (data.children || []).map((c: any): SubTopic => ({
    id: c.id,
    name: c.name,
    description: c.description,
    order: c.order,
    materials: (c.materials || []).map((m: any) => ({
      id: m.id,
      topicId: m.topic_id,
      name: m.name,
      documentUrl: m.document_url,
      documentType: m.document_type,
      uploadedAt: m.uploaded_at,
      includeInExercises: m.include_in_exercises ?? true,
      isGenerated: m.is_generated ?? false,
    })),
    hasContent: c.has_content || false,
    status: c.status || 'draft',
    includeInGeneration: c.include_in_generation ?? true,
  })),
  textbookId: data.textbook_id,
  pdfUrl: data.pdf_url,
  status: data.status || 'draft',
  pageCount: data.page_count,
  hasContent: data.has_content || false,
  includeInGeneration: data.include_in_generation ?? true,
});

const mapTopicListResponse = (data: any): TopicListItem => ({
  id: data.id,
  subjectId: data.subject_id,
  subjectName: data.subject_name,
  name: data.name,
  description: data.description,
  trimester: data.trimester ?? null,
  order: data.order,
  materialCount: data.material_count || 0,
  hasContent: data.has_content || false,
  status: data.status || 'draft',
  pageCount: data.page_count,
  pdfUrl: data.pdf_url,
  presentations: data.presentations,
  textbooks: data.textbooks,
  children: Array.isArray(data.children) ? data.children.map(mapTopicListResponse) : undefined,
});

export const useTopicsStore = create<TopicsState>((set, get) => ({
  topics: [],
  topicsBySubject: [],
  classSubjects: [],
  allSubjects: [],
  currentTopic: null,
  loading: false,
  error: null,

  fetchTopicsForClass: async (classId: string) => {
    if (!get().topics.length) set({ loading: true, error: null });
    try {
      const [topicsRes, subjectsRes] = await Promise.all([
        subjectsApi.topicsForClass(classId),
        subjectsApi.forClass(classId),
      ]);

      const grouped: SubjectWithTopics[] = topicsRes.data.map((s: any) => ({
        subjectId: s.subject_id,
        subjectName: s.subject_name,
        topics: (s.topics || []).map((t: any): TopicListItem => ({
          id: t.id,
          subjectId: s.subject_id,
          subjectName: s.subject_name,
          name: t.name,
          description: t.description,
          trimester: t.trimester ?? null,
          order: t.order,
          materialCount: t.material_count || 0,
          hasContent: t.has_content || false,
          status: t.status || 'draft',
          pageCount: t.page_count,
          pdfUrl: t.pdf_url,
          presentations: t.presentations,
          textbooks: t.textbooks,
          children: Array.isArray(t.children)
            ? t.children.map((c: any): TopicListItem => ({
                id: c.id,
                subjectId: s.subject_id,
                subjectName: s.subject_name,
                name: c.name,
                description: c.description,
                trimester: c.trimester ?? null,
                order: c.order,
                materialCount: c.material_count || 0,
                hasContent: c.has_content || false,
                status: c.status || 'draft',
                pageCount: c.page_count,
                pdfUrl: c.pdf_url,
                presentations: c.presentations,
                textbooks: c.textbooks,
              }))
            : undefined,
        })),
      }));

      const flat = grouped.flatMap((s) => s.topics);

      const subjects: SubjectListItem[] = subjectsRes.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        topicCount: s.topic_count || 0,
        classCount: s.class_count || 0,
      }));

      set({ topics: flat, topicsBySubject: grouped, classSubjects: subjects, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  fetchTopicsBySubject: async (subjectId: string) => {
    if (!get().topics.length) set({ loading: true, error: null });
    try {
      const res = await topicsApi.listBySubject(subjectId);
      set({ topics: res.data.map(mapTopicListResponse), loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  fetchClassSubjects: async (classId: string) => {
    try {
      const res = await subjectsApi.forClass(classId);
      const subjects: SubjectListItem[] = res.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        topicCount: s.topic_count || 0,
        classCount: s.class_count || 0,
      }));
      set({ classSubjects: subjects });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchAllSubjects: async () => {
    try {
      const res = await subjectsApi.list();
      const subjects: SubjectListItem[] = res.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        topicCount: s.topic_count || 0,
        classCount: s.class_count || 0,
      }));
      set({ allSubjects: subjects });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  linkSubjectToClass: async (subjectId: string, classId: string) => {
    await subjectsApi.linkToClass(subjectId, classId);
    await get().fetchTopicsForClass(classId);
  },

  unlinkSubjectFromClass: async (subjectId: string, classId: string) => {
    await subjectsApi.unlinkFromClass(subjectId, classId);
    await get().fetchTopicsForClass(classId);
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

  createTopic: async (subjectId: string, data: { name: string; description?: string; trimester?: number; parent_id?: string; class_id?: string }) => {
    const res = await topicsApi.create(subjectId, data);
    const topic = mapTopicResponse(res.data);
    // Only add to global lists if it's a top-level topic (not a sub-topic)
    if (!data.parent_id) {
      const newItem = mapTopicListResponse(res.data);
      set((state) => ({
        topics: [...state.topics, newItem],
        topicsBySubject: state.topicsBySubject.map((s) =>
          s.subjectId === subjectId
            ? { ...s, topics: [...s.topics, newItem] }
            : s
        ),
      }));
    } else {
      // Sub-topic created: update the parent's children in currentTopic
      const { currentTopic } = get();
      if (currentTopic && currentTopic.id === data.parent_id) {
        const newChild: SubTopic = {
          id: topic.id, name: topic.name, description: topic.description,
          order: topic.order, materials: [], hasContent: false, status: 'draft', includeInGeneration: true,
        };
        set({ currentTopic: { ...currentTopic, children: [...currentTopic.children, newChild] } });
      }
    }
    return topic;
  },

  updateTopic: async (topicId: string, data: { name?: string; description?: string; trimester?: number; order?: number }) => {
    await topicsApi.update(topicId, data);
    const { currentTopic, topics, topicsBySubject } = get();

    if (currentTopic && currentTopic.id === topicId) {
      set({ currentTopic: { ...currentTopic, ...data } });
    }

    const updateItem = (t: TopicListItem) => t.id === topicId ? { ...t, ...data } : t;
    set({
      topics: topics.map(updateItem),
      topicsBySubject: topicsBySubject.map((s) => ({
        ...s,
        topics: s.topics.map(updateItem),
      })),
    });
  },

  deleteTopic: async (topicId: string) => {
    await topicsApi.delete(topicId);
    set((state) => ({
      topics: state.topics.filter((t) => t.id !== topicId),
      topicsBySubject: state.topicsBySubject.map((s) => ({
        ...s,
        topics: s.topics.filter((t) => t.id !== topicId),
      })),
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
      uploadedAt: res.data.uploaded_at,
      includeInExercises: res.data.include_in_exercises ?? true,
      isGenerated: res.data.is_generated ?? false,
    };

    const { currentTopic, topics, topicsBySubject } = get();
    if (currentTopic && currentTopic.id === topicId) {
      set({ currentTopic: { ...currentTopic, materials: [...currentTopic.materials, material] } });
    }

    const incCount = (t: TopicListItem) =>
      t.id === topicId ? { ...t, materialCount: t.materialCount + 1 } : t;

    set({
      topics: topics.map(incCount),
      topicsBySubject: topicsBySubject.map((s) => ({
        ...s,
        topics: s.topics.map(incCount),
      })),
    });

    return material;
  },

  deleteMaterial: async (topicId: string, materialId: string) => {
    await topicsApi.deleteMaterial(topicId, materialId);

    const { currentTopic, topics, topicsBySubject } = get();
    if (currentTopic && currentTopic.id === topicId) {
      set({
        currentTopic: {
          ...currentTopic,
          materials: currentTopic.materials.filter((m) => m.id !== materialId)
        }
      });
    }

    const decCount = (t: TopicListItem) =>
      t.id === topicId ? { ...t, materialCount: Math.max(0, t.materialCount - 1) } : t;

    set({
      topics: topics.map(decCount),
      topicsBySubject: topicsBySubject.map((s) => ({
        ...s,
        topics: s.topics.map(decCount),
      })),
    });
  },

  updateMaterial: async (topicId: string, materialId: string, data: { include_in_exercises?: boolean }) => {
    await topicsApi.updateMaterial(topicId, materialId, data);
    const { currentTopic } = get();
    if (currentTopic && currentTopic.id === topicId) {
      set({
        currentTopic: {
          ...currentTopic,
          materials: currentTopic.materials.map((m) =>
            m.id === materialId ? { ...m, includeInExercises: data.include_in_exercises ?? m.includeInExercises } : m
          ),
        },
      });
    }
  },

  generateMaterial: async (topicId: string, data: { prompt: string; enfoque?: string; target_pages?: number; exercises_per_chapter?: number; examples_per_section?: number }) => {
    const res = await topicsApi.generateMaterial(topicId, data);
    return { textbook_id: res.data.textbook_id, batch_job_id: res.data.batch_job_id };
  },

  moveMaterial: async (fromTopicId: string, materialId: string, toTopicId: string) => {
    await topicsApi.moveMaterial(fromTopicId, materialId, toTopicId);
    // Re-fetch the full topic to get updated children & materials
    const { currentTopic } = get();
    if (currentTopic) {
      const res = await topicsApi.get(currentTopic.id);
      set({ currentTopic: mapTopicResponse(res.data) });
    }
  },

  clearCurrentTopic: () => set({ currentTopic: null })
}));
