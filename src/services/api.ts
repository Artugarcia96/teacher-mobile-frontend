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
  create: (data: { name: string; subject?: string; year: string; description?: string; education_level?: string }) =>
    api.post('/classes/', data),
  update: (id: string, data: any) => api.put(`/classes/${id}`, data),
  delete: (id: string) => api.delete(`/classes/${id}`),
  deletePermanently: (id: string) => api.delete(`/classes/${id}/permanent`),
  bulkDelete: (ids: string[]) => api.post('/classes/bulk-delete', { class_ids: ids }),
  getDeletePreview: (id: string) => api.get(`/classes/${id}/delete-preview`),
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
  
  getInsights: (id: string) => api.get(`/classes/${id}/insights`),
  refreshInsights: (id: string, generateAi: boolean = true) =>
    api.post(`/classes/${id}/insights/refresh`, { generate_ai_summary: generateAi }),
  getSubjectInsights: (classId: string, subjectId: string) =>
    api.get(`/classes/${classId}/subjects/${subjectId}/insights`),
  getSubjectsSummary: (id: string) => api.get(`/classes/${id}/subjects-summary`),
};

export const lectures = {
  list: (classId: string) => api.get(`/classes/${classId}/lectures`),
  create: (classId: string, data: { name: string; subject_id?: string; schedule?: Array<{ day: string; start_time: string; end_time: string }> }) =>
    api.post(`/classes/${classId}/lectures`, data),
  update: (classId: string, lectureId: string, data: { name?: string; subject_id?: string; schedule?: Array<{ day: string; start_time: string; end_time: string }> }) =>
    api.put(`/classes/${classId}/lectures/${lectureId}`, data),
  delete: (classId: string, lectureId: string) =>
    api.delete(`/classes/${classId}/lectures/${lectureId}`),
};

export const students = {
  listAll: () => api.get('/students/'),
  create: (data: { class_id?: string; name: string; student_code?: string; email?: string }) =>
    api.post('/students/', data),
  get: (id: string) => api.get(`/students/${id}`),
  update: (id: string, data: any) => api.put(`/students/${id}`, data),
  delete: (id: string) => api.delete(`/students/${id}`),
  getNotes: (id: string) => api.get(`/students/${id}/notes`),
  addNote: (id: string, text: string) => api.post(`/students/${id}/notes`, { text }),
  
  getPool: () => api.get('/students/pool/all'),
  getPoolNotInClass: (classId: string) => api.get(`/students/pool/not-in-class/${classId}`),
  addExistingToClass: (classId: string, studentIds: string[]) =>
    api.post(`/students/class/${classId}/add-existing`, { student_ids: studentIds }),
  bulkCreate: (classId: string, names: string[]) =>
    api.post(`/students/class/${classId}/bulk-create`, { names }),
  removeFromClass: (classId: string, studentId: string) =>
    api.delete(`/students/class/${classId}/remove/${studentId}`),
};

export const exams = {
  list: (classId?: string, subjectId?: string) => api.get('/exams/', { params: { ...(classId ? { class_id: classId } : {}), ...(subjectId ? { subject_id: subjectId } : {}) } }),
  get: (id: string) => api.get(`/exams/${id}`),
  create: (data: { name: string; class_id?: string; lecture_id?: string; subject_id?: string; exam_date: string; max_score: number; is_personalized?: boolean; correction_deadline?: string; blank_pages_count?: number }, file?: File) => {
    const formData = new FormData();
    formData.append('name', data.name);
    if (data.class_id && data.class_id.trim()) formData.append('class_id', data.class_id);
    if (data.lecture_id && data.lecture_id.trim()) formData.append('lecture_id', data.lecture_id);
    if (data.subject_id && data.subject_id.trim()) formData.append('subject_id', data.subject_id);
    formData.append('exam_date', data.exam_date);
    formData.append('max_score', String(data.max_score));
    if (data.is_personalized) formData.append('is_personalized', 'true');
    if (data.correction_deadline) formData.append('correction_deadline', data.correction_deadline);
    if (data.blank_pages_count) formData.append('blank_pages_count', String(data.blank_pages_count));
    if (file) formData.append('document', file);
    return api.post('/exams/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  update: (id: string, data: any) => api.put(`/exams/${id}`, data),
  delete: (id: string) => api.delete(`/exams/${id}`),
  assign: (id: string) => api.post(`/exams/${id}/assign`),
  generate: (data: {
    class_id?: string; lecture_id?: string; subject_id?: string; topic_ids: string[]; name: string; exam_date: string;
    num_questions?: number; max_score?: number; difficulty?: string;
    question_types?: string[]; refinement_prompt?: string; is_personalized?: boolean;
    correction_deadline?: string; blank_pages_count?: number;
  }) => api.post('/exams/generate', data, { timeout: 300000 }),
  iterate: (id: string, data: { instruction: string; preserve_questions?: number[] }) => 
    api.post(`/exams/${id}/iterate`, data, { timeout: 120000 }),
  getQuestions: (id: string) => api.get(`/exams/${id}/questions`),
  downloadExamUrl: (id: string) => `${getBaseUrl()}/exams/${id}/download`,
  downloadSolutionsUrl: (id: string) => `${getBaseUrl()}/exams/${id}/solutions`,
};

export const corrections = {
  upload: (examId: string, files: File[], studentId?: string) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('papers', f));
    if (studentId) formData.append('student_id', studentId);
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
  list: (studentId?: string, subjectId?: string) => api.get('/exercises/', { params: { ...(studentId ? { student_id: studentId } : {}), ...(subjectId ? { subject_id: subjectId } : {}) } }),
  generate: (params: {
    studentIds: string[];
    name: string;
    sourceExamIds?: string[];
    sourceTopicIds?: string[];
    refinementPrompt?: string;
    difficulty?: 'easier' | 'same' | 'harder';
    numQuestions?: number;
    numBlankPages?: number;
    focusTopics?: string[];
    deliveryDate?: string;
    correctionDate?: string;
  }) =>
    api.post('/exercises/generate', {
      student_ids: params.studentIds,
      name: params.name,
      source_exam_ids: params.sourceExamIds,
      source_topic_ids: params.sourceTopicIds,
      refinement_prompt: params.refinementPrompt,
      difficulty: params.difficulty,
      num_questions: params.numQuestions,
      num_blank_pages: params.numBlankPages,
      focus_topics: params.focusTopics,
      delivery_date: params.deliveryDate,
      correction_date: params.correctionDate,
    }, {
      timeout: 300000,
    }),
  get: (id: string) => api.get(`/exercises/${id}`),
  update: (id: string, data: any) => api.put(`/exercises/${id}`, data),
  rename: (id: string, name: string) => api.patch(`/exercises/${id}/rename`, { name }),
  delete: (id: string) => api.delete(`/exercises/${id}`),
  iterate: (id: string, data: { instruction: string }) =>
    api.post(`/exercises/${id}/iterate`, data, { timeout: 120000 }),
  getQuestions: (id: string) => api.get(`/exercises/${id}/questions`),
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
  upload: (exerciseId: string, file: File) => {
    const formData = new FormData();
    formData.append('paper', file);
    return api.post(`/exercise-corrections/${exerciseId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
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

export const subjects = {
  list: () => api.get('/subjects/'),
  get: (id: string) => api.get(`/subjects/${id}`),
  create: (data: { name: string; description?: string }) => api.post('/subjects/', data),
  update: (id: string, data: { name?: string; description?: string }) => api.put(`/subjects/${id}`, data),
  delete: (id: string) => api.delete(`/subjects/${id}`),
  forClass: (classId: string) => api.get(`/subjects/for-class/${classId}`),
  topicsForClass: (classId: string) => api.get(`/subjects/topics-for-class/${classId}`),
  classPairs: () => api.get('/subjects/class-pairs'),
  linkToClass: (subjectId: string, classId: string) => api.post(`/subjects/${subjectId}/classes/${classId}`),
  unlinkFromClass: (subjectId: string, classId: string) => api.delete(`/subjects/${subjectId}/classes/${classId}`),
};

export const topics = {
  listBySubject: (subjectId: string) => api.get(`/topics/subject/${subjectId}`),
  listByClass: (classId: string) => api.get(`/topics/class/${classId}`),
  get: (id: string) => api.get(`/topics/${id}`),
  create: (subjectId: string, data: { name: string; description?: string; order?: number }) =>
    api.post(`/topics/subject/${subjectId}`, data),
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
  reorder: (subjectId: string, topicIds: string[]) =>
    api.post(`/topics/subject/${subjectId}/reorder`, topicIds)
};

export const materials = {
  list: (subjectId?: string, search?: string) =>
    api.get('/materials/', { params: { ...(subjectId ? { subject_id: subjectId } : {}), ...(search ? { search } : {}) } }),
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
  quickCreateSubject: (name: string, description?: string) =>
    api.post(`/materials/quick-subject?name=${encodeURIComponent(name)}${description ? `&description=${encodeURIComponent(description)}` : ''}`),
  quickCreateTopic: (subjectId: string, name: string) =>
    api.post(`/materials/quick-topic?subject_id=${subjectId}&name=${encodeURIComponent(name)}`),
};

export const calendar = {
  list: (startDate: string, endDate: string, classId?: string, studentId?: string) =>
    api.get('/calendar/', { params: { start_date: startDate, end_date: endDate, ...(classId ? { class_id: classId } : {}), ...(studentId ? { student_id: studentId } : {}) } }),
  create: (data: {
    class_id?: string; student_id?: string; title: string; event_date: string;
    start_time?: string; end_time?: string; event_type?: string; notes?: string;
  }) => api.post('/calendar/', data),
  update: (id: string, data: {
    title?: string; event_date?: string; start_time?: string;
    end_time?: string; notes?: string; is_cancelled?: boolean;
  }) => api.put(`/calendar/${id}`, data),
  delete: (id: string) => api.delete(`/calendar/${id}`),
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

export const notes = {
  list: (params?: { note_type?: string; class_id?: string; days?: number }) =>
    api.get('/notes/', { params }),
  createClassNote: (data: { class_id: string; event_id?: string; event_date?: string; text: string }) =>
    api.post('/notes/class', data),
  createGeneralNote: (data: { text: string }) =>
    api.post('/notes/general', data),
  getRecentSessions: () =>
    api.get('/notes/recent-sessions'),
};

export const preparation = {
  get: (prepDate: string) =>
    api.get(`/preparation/${prepDate}`),
  generate: (data: { prep_date: string; focus_topics?: string }) =>
    api.post('/preparation/generate', data, { timeout: 120000 }),
  check: (prepDate: string) =>
    api.get(`/preparation/check/${prepDate}`),
  getPreparedDates: (startDate: string, endDate: string) =>
    api.get('/preparation/prepared-dates', { params: { start_date: startDate, end_date: endDate } }),
};

export interface BatchJobProgress {
  id: string;
  job_type: string;
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled';
  total_items: number;
  processed_items: number;
  successful_items: number;
  failed_items: number;
  progress_percentage: number;
  current_item_id?: string;
  current_item_name?: string;
  estimated_remaining_seconds?: number;
  started_at?: string;
  completed_at?: string;
}

export interface BatchJobResponse extends BatchJobProgress {
  reference_id?: string;
  reference_type?: string;
  results?: Record<string, unknown>;
  errors?: Array<{ item_id: string; item_name: string; error: string }>;
  config?: Record<string, unknown>;
  paused_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WeaknessGroup {
  weakness: string;
  student_ids: string[];
  student_names: string[];
  exercise_id?: string;
}

export interface GroupedExercisePreview {
  groups: WeaknessGroup[];
  total_students: number;
  total_groups: number;
  estimated_generation_time_seconds: number;
}

export const batch = {
  // Job management
  listJobs: (activeOnly: boolean = false, limit: number = 20) =>
    api.get<BatchJobResponse[]>('/batch/jobs', { params: { active_only: activeOnly, limit } }),
  
  getJob: (jobId: string) =>
    api.get<BatchJobResponse>(`/batch/jobs/${jobId}`),
  
  getJobProgress: (jobId: string) =>
    api.get<BatchJobProgress>(`/batch/jobs/${jobId}/progress`),
  
  pauseJob: (jobId: string) =>
    api.post<BatchJobResponse>(`/batch/jobs/${jobId}/pause`),
  
  resumeJob: (jobId: string) =>
    api.post<BatchJobResponse>(`/batch/jobs/${jobId}/resume`),
  
  cancelJob: (jobId: string) =>
    api.post<BatchJobResponse>(`/batch/jobs/${jobId}/cancel`),
  
  retryJob: (jobId: string) =>
    api.post<BatchJobResponse>(`/batch/jobs/${jobId}/retry`),
  
  // Batch corrections
  startBatchCorrection: (examId: string, correctionIds: string[]) =>
    api.post<BatchJobResponse>('/batch/corrections/start', {
      exam_id: examId,
      correction_ids: correctionIds
    }),
  
  estimateCorrectionTime: (examId: string) =>
    api.get<{ paper_count: number; estimated_seconds: number; time_string: string }>(
      `/batch/corrections/${examId}/estimate`
    ),
  
  // Batch exercise generation
  previewExerciseGroups: (data: {
    class_id: string;
    student_ids: string[];
    source_exam_ids?: string[];
    group_by_weakness?: boolean;
  }) =>
    api.post<GroupedExercisePreview>('/batch/exercises/preview-groups', {
      class_id: data.class_id,
      student_ids: data.student_ids,
      source_exam_ids: data.source_exam_ids,
      group_by_weakness: data.group_by_weakness ?? true
    }),
  
  startBatchExerciseGeneration: (data: {
    class_id: string;
    student_ids: string[];
    name?: string;
    source_exam_ids?: string[];
    source_topic_ids?: string[];
    focus_topics?: string[];
    num_questions?: number;
    num_blank_pages?: number;
    difficulty?: 'easier' | 'same' | 'harder';
    delivery_date?: string;
    correction_date?: string;
    group_by_weakness?: boolean;
    unique_per_student?: boolean;
  }) =>
    api.post<BatchJobResponse>('/batch/exercises/generate', {
      class_id: data.class_id,
      student_ids: data.student_ids,
      name: data.name,
      source_exam_ids: data.source_exam_ids,
      source_topic_ids: data.source_topic_ids,
      focus_topics: data.focus_topics,
      num_questions: data.num_questions ?? 5,
      difficulty: data.difficulty ?? 'same',
      delivery_date: data.delivery_date,
      correction_date: data.correction_date,
      group_by_weakness: data.group_by_weakness ?? true,
      unique_per_student: data.unique_per_student ?? false
    }),

  // Batch exercise corrections
  startBatchExerciseCorrection: (exerciseIds: string[], correctionIds: string[]) =>
    api.post<BatchJobResponse>('/batch/exercise-corrections/start', {
      exercise_ids: exerciseIds,
      correction_ids: correctionIds,
    }),
};

export default api;
