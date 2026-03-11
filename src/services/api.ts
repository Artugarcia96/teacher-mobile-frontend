import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getBaseUrl = () => {
  const base = API_URL || '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_URL}/auth/refresh`, null, {
            params: { refresh_token: refreshToken }
          });
          localStorage.setItem('access_token', res.data.access_token);
          localStorage.setItem('refresh_token', res.data.refresh_token);
          error.config.headers.Authorization = `Bearer ${res.data.access_token}`;
          return api(error.config);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const auth = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }),
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
  isLoggedIn: () => !!localStorage.getItem('access_token')
};

export const classes = {
  list: () => api.get('/classes/'),
  get: (id: string) => api.get(`/classes/${id}`),
  create: (data: { name: string; subject?: string; year: string }) =>
    api.post('/classes/', data),
  update: (id: string, data: any) => api.put(`/classes/${id}`, data),
  delete: (id: string) => api.delete(`/classes/${id}`),
  getStudents: (id: string) => api.get(`/classes/${id}/students`),
  importStudents: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/classes/${id}/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  addStudent: (id: string, data: { name: string; student_code?: string; email?: string }) =>
    api.post(`/classes/${id}/students`, data),
};

export const lectures = {
  list: (classId: string) => api.get(`/classes/${classId}/lectures`),
  create: (classId: string, data: { name: string; schedule?: Array<{ day: string; start_time: string; end_time: string }> }) =>
    api.post(`/classes/${classId}/lectures`, data),
  update: (classId: string, lectureId: string, data: { name?: string; schedule?: Array<{ day: string; start_time: string; end_time: string }> }) =>
    api.put(`/classes/${classId}/lectures/${lectureId}`, data),
  delete: (classId: string, lectureId: string) =>
    api.delete(`/classes/${classId}/lectures/${lectureId}`),
};

export const students = {
  listAll: () => api.get('/students/'),
  create: (data: { class_id: string; name: string; student_code?: string; email?: string }) =>
    api.post('/students/', data),
  get: (id: string) => api.get(`/students/${id}`),
  update: (id: string, data: any) => api.put(`/students/${id}`, data),
  delete: (id: string) => api.delete(`/students/${id}`),
  getNotes: (id: string) => api.get(`/students/${id}/notes`),
  addNote: (id: string, text: string) => api.post(`/students/${id}/notes`, { text })
};

export const exams = {
  list: (classId?: string) => api.get('/exams/', { params: classId ? { class_id: classId } : {} }),
  get: (id: string) => api.get(`/exams/${id}`),
  create: (data: { name: string; class_id?: string; lecture_id?: string; exam_date: string; max_score: number; is_personalized?: boolean }, file?: File) => {
    const formData = new FormData();
    formData.append('name', data.name);
    if (data.class_id && data.class_id.trim()) formData.append('class_id', data.class_id);
    if (data.lecture_id && data.lecture_id.trim()) formData.append('lecture_id', data.lecture_id);
    formData.append('exam_date', data.exam_date);
    formData.append('max_score', String(data.max_score));
    if (data.is_personalized) formData.append('is_personalized', 'true');
    if (file) formData.append('document', file);
    return api.post('/exams/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  update: (id: string, data: any) => api.put(`/exams/${id}`, data),
  delete: (id: string) => api.delete(`/exams/${id}`),
  assign: (id: string) => api.post(`/exams/${id}/assign`),
  generate: (data: {
    class_id?: string; lecture_id?: string; topic_ids: string[]; name: string; exam_date: string;
    num_questions?: number; max_score?: number; difficulty?: string;
    question_types?: string[]; refinement_prompt?: string; is_personalized?: boolean;
  }) => api.post('/exams/generate', data, { timeout: 300000 }),
  downloadExamUrl: (id: string) => `${getBaseUrl()}/exams/${id}/download`,
  downloadSolutionsUrl: (id: string) => `${getBaseUrl()}/exams/${id}/solutions`,
};

export const corrections = {
  upload: (examId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('papers', f));
    return api.post(`/corrections/${examId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  bulkUpload: (examId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('papers', f));
    return api.post(`/corrections/${examId}/bulk-upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000
    });
  },
  listAll: () => api.get('/corrections/'),
  list: (examId: string) => api.get(`/corrections/${examId}`),
  get: (examId: string, studentId: string) => api.get(`/corrections/${examId}/${studentId}`),
  update: (correctionId: string, data: { student_id?: string; grade?: number; teacher_notes?: string; weak_areas?: string[] }) =>
    api.put(`/corrections/${correctionId}`, data),
  finish: (examId: string) => api.post(`/corrections/${examId}/finish`),
  processAI: (correctionId: string) => api.post(`/corrections/${correctionId}/process-ai`, null, {
    timeout: 300000
  })
};

export const exercises = {
  list: (studentId?: string) => api.get('/exercises/', { params: studentId ? { student_id: studentId } : {} }),
  generate: (params: {
    studentIds: string[];
    name: string;
    sourceExamIds?: string[];
    sourceTopicIds?: string[];
    refinementPrompt?: string;
    difficulty?: 'easier' | 'same' | 'harder';
    numQuestions?: number;
    focusTopics?: string[];
  }) =>
    api.post('/exercises/generate', {
      student_ids: params.studentIds,
      name: params.name,
      source_exam_ids: params.sourceExamIds,
      source_topic_ids: params.sourceTopicIds,
      refinement_prompt: params.refinementPrompt,
      difficulty: params.difficulty,
      num_questions: params.numQuestions,
      focus_topics: params.focusTopics,
    }, {
      timeout: 300000,
    }),
  get: (id: string) => api.get(`/exercises/${id}`),
  update: (id: string, data: any) => api.put(`/exercises/${id}`, data),
  rename: (id: string, name: string) => api.patch(`/exercises/${id}/rename`, { name }),
  delete: (id: string) => api.delete(`/exercises/${id}`),
  downloadExercisesPdf: (id: string) => `${getBaseUrl()}/exercises/${id}/pdf/exercises`,
  downloadSolutionsPdf: (id: string) => `${getBaseUrl()}/exercises/${id}/pdf/solutions`,
  batchDownload: (exerciseIds: string[], includeSolutions: boolean) =>
    api.post('/exercises/batch-download', { exercise_ids: exerciseIds, include_solutions: includeSolutions }, {
      responseType: 'blob',
      timeout: 120000,
    }),
};

export const exerciseCorrections = {
  list: (exerciseId: string) => api.get(`/exercise-corrections/${exerciseId}`),
  bulkUpload: (exerciseId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('papers', f));
    return api.post(`/exercise-corrections/${exerciseId}/bulk-upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000
    });
  },
  // Class-level bulk upload: upload papers for a specific exercise group
  classBulkUpload: (classId: string, files: File[], exerciseIds?: string[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('papers', f));
    // Pass exercise IDs as query param to filter which exercises to accept
    const params = exerciseIds?.length ? `?exercise_ids=${exerciseIds.join(',')}` : '';
    return api.post(`/exercise-corrections/class/${classId}/bulk-upload${params}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000
    });
  },
  update: (correctionId: string, data: { student_id?: string; grade?: number; teacher_notes?: string; weak_areas?: string[] }) =>
    api.put(`/exercise-corrections/${correctionId}`, data),
  finish: (exerciseId: string) => api.post(`/exercise-corrections/${exerciseId}/finish`),
  processAI: (correctionId: string) => api.post(`/exercise-corrections/${correctionId}/process-ai`, null, {
    timeout: 300000
  })
};

export const topics = {
  list: (classId: string) => api.get(`/topics/class/${classId}`),
  get: (id: string) => api.get(`/topics/${id}`),
  create: (classId: string, data: { name: string; description?: string; order?: number }) =>
    api.post(`/topics/class/${classId}`, data),
  update: (id: string, data: { name?: string; description?: string; order?: number }) =>
    api.put(`/topics/${id}`, data),
  delete: (id: string) => api.delete(`/topics/${id}`),
  uploadMaterial: (topicId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/topics/${topicId}/materials`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  deleteMaterial: (topicId: string, materialId: string) =>
    api.delete(`/topics/${topicId}/materials/${materialId}`),
  reorder: (classId: string, topicIds: string[]) =>
    api.post(`/topics/class/${classId}/reorder`, topicIds)
};

export const materials = {
  list: (classId?: string, search?: string) =>
    api.get('/materials/', { params: { ...(classId ? { class_id: classId } : {}), ...(search ? { search } : {}) } }),
  getStructure: () => api.get('/materials/structure'),
  quickUpload: (topicId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/materials/quick-upload?topic_id=${topicId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  delete: (materialId: string) => api.delete(`/materials/${materialId}`),
  getTopicsForUpload: () => api.get('/materials/topics-for-upload'),
  quickCreateClass: (name: string, subject: string) =>
    api.post(`/materials/quick-class?name=${encodeURIComponent(name)}&subject=${encodeURIComponent(subject)}`),
  quickCreateTopic: (classId: string, name: string) =>
    api.post(`/materials/quick-topic?class_id=${classId}&name=${encodeURIComponent(name)}`),
};

export const calendar = {
  list: (startDate: string, endDate: string, classId?: string) =>
    api.get('/calendar/', { params: { start_date: startDate, end_date: endDate, ...(classId ? { class_id: classId } : {}) } }),
  create: (data: {
    class_id?: string; title: string; event_date: string;
    start_time?: string; end_time?: string; event_type?: string; notes?: string;
  }) => api.post('/calendar/', data),
  update: (id: string, data: {
    title?: string; event_date?: string; start_time?: string;
    end_time?: string; notes?: string; is_cancelled?: boolean;
  }) => api.put(`/calendar/${id}`, data),
  delete: (id: string) => api.delete(`/calendar/${id}`),
  generate: (data: {
    class_id: string; days: string[]; start_time: string;
    end_time: string; start_date: string; end_date: string;
  }) => api.post('/calendar/generate', data),
  bulkDelete: (eventIds: string[]) =>
    api.post('/calendar/bulk-delete', { event_ids: eventIds }),
  bulkUpdate: (data: {
    event_ids: string[]; shift_days?: number;
    start_time?: string; end_time?: string;
  }) => api.post('/calendar/bulk-update', {
    event_ids: data.event_ids,
    shift_days: data.shift_days,
    start_time: data.start_time,
    end_time: data.end_time,
  }),
};

export default api;
