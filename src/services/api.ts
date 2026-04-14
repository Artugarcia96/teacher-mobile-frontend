import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getBaseUrl = () => {
  const base = API_URL || '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// 401 → attempt silent refresh via httpOnly cookie, then retry
let isRefreshing = false;
let refreshQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];

const processQueue = (error: unknown) => {
  refreshQueue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(undefined)));
  refreshQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(() => api(original));
      }
      original._retry = true;
      isRefreshing = true;
      try {
        await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        processQueue(null);
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError);
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Authenticated fetch — uses httpOnly cookies automatically.
 * On 401, attempts a silent token refresh and retries once (mirrors the axios interceptor).
 */
export const authenticatedFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  const res = await fetch(url, { ...init, credentials: 'include' });
  if (res.status === 401) {
    try {
      await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
    } catch {
      return res;
    }
    return fetch(url, { ...init, credentials: 'include' });
  }
  return res;
};

// Lightweight in-memory auth flag. httpOnly cookies are not readable from JS,
// so we track "probably authenticated" here and let the server be authoritative.
// On hard refresh the flag resets to false — the first API call that returns 401
// will redirect to /login, which is the correct UX.
let _authenticated = false;

export const auth = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    _authenticated = true;
    return res;
  },
  register: async (email: string, password: string, name: string) => {
    const res = await api.post('/auth/register', { email, password, name });
    _authenticated = true;
    return res;
  },
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort — cookies cleared server-side
    }
    _authenticated = false;
  },
  /** Synchronous check — true after login/register, false after logout or 401.
   *  On cold page load, call `auth.check()` to verify with the server. */
  isLoggedIn: () => _authenticated,
  /** Async server-side verification. Updates the in-memory flag. */
  check: async (): Promise<boolean> => {
    try {
      await api.get('/auth/me');
      _authenticated = true;
      return true;
    } catch {
      _authenticated = false;
      return false;
    }
  },
  me: () => api.get('/auth/me'),
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
  updateExamWeightPct: (classId: string, examWeightPct: number) =>
    api.patch(`/classes/${classId}/exam-weight`, { exam_weight_pct: examWeightPct }),
  getTrimesterSummary: (classId: string, subjectId?: string) =>
    api.get(`/classes/${classId}/trimester-summary`, { params: subjectId ? { subject_id: subjectId } : {} }),
  getRiskSummary: (classId: string) =>
    api.get(`/classes/${classId}/risk-summary`),
};

export const lectures = {
  list: (classId: string) => api.get(`/classes/${classId}/lectures`),
  allSchedules: () => api.get('/classes/all-schedules'),
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
  getComments: (id: string) => api.get(`/students/${id}/comments`),
  addComment: (id: string, text: string, mentionedStudentIds?: string[]) =>
    api.post(`/students/${id}/comments`, { text, mentioned_student_ids: mentionedStudentIds || [] }),
  search: (q: string, classId?: string) =>
    api.get('/students/search', { params: { q, ...(classId ? { class_id: classId } : {}) } }),
  getMentions: (id: string, days?: number) =>
    api.get(`/students/${id}/mentions`, { params: { days: days || 90 } }),
  
  getSummary: (id: string, classId?: string) =>
    api.post(`/students/${id}/summary`, null, { params: classId ? { class_id: classId } : {} }),
  getPool: () => api.get('/students/pool/all'),
  getPoolNotInClass: (classId: string) => api.get(`/students/pool/not-in-class/${classId}`),
  addExistingToClass: (classId: string, studentIds: string[]) =>
    api.post(`/students/class/${classId}/add-existing`, { student_ids: studentIds }),
  bulkCreate: (classId: string, names: string[]) =>
    api.post(`/students/class/${classId}/bulk-create`, { names }),
  removeFromClass: (classId: string, studentId: string) =>
    api.delete(`/students/class/${classId}/remove/${studentId}`),
  getRiskAssessment: (id: string) =>
    api.get(`/students/${id}/risk-assessment`),
};

export const exams = {
  list: (classId?: string, subjectId?: string) => api.get('/exams/', { params: { ...(classId ? { class_id: classId } : {}), ...(subjectId ? { subject_id: subjectId } : {}) } }),
  get: (id: string) => api.get(`/exams/${id}`),
  create: (data: Record<string, any>, files?: File | File[]) => {
    const formData = new FormData();
    formData.append('name', data.name);
    if (data.class_id && String(data.class_id).trim()) formData.append('class_id', data.class_id);
    if (data.lecture_id && String(data.lecture_id).trim()) formData.append('lecture_id', data.lecture_id);
    if (data.subject_id && String(data.subject_id).trim()) formData.append('subject_id', data.subject_id);
    if (data.exam_date) formData.append('exam_date', data.exam_date);
    if (data.max_score != null) formData.append('max_score', String(data.max_score));
    if (data.exam_format) formData.append('exam_format', data.exam_format);
    if (data.correction_deadline) formData.append('correction_deadline', data.correction_deadline);
    if (data.refinement_prompt) formData.append('refinement_prompt', data.refinement_prompt);
    const fileList = files ? (Array.isArray(files) ? files : [files]) : [];
    if (fileList.length === 1) {
      formData.append('document', fileList[0]);
    } else {
      fileList.forEach((f) => formData.append('documents', f));
    }
    const hasFiles = fileList.length > 0;
    return api.post('/exams/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: hasFiles ? 120000 : 30000,
    });
  },
  update: (id: string, data: any) => api.put(`/exams/${id}`, data),
  delete: (id: string, force?: boolean) =>
    api.delete(`/exams/${id}`, { params: force ? { force: true } : undefined }),
  assign: (id: string, data?: { student_ids?: string[]; blank_pages_count?: number; exam_date?: string; correction_deadline?: string; per_class_dates?: Record<string, string> }) =>
    api.post(`/exams/${id}/assign`, data || {}, { timeout: 120000 }),
  validate: (id: string) => api.post(`/exams/${id}/validate`, {}, { timeout: 120000 }),
  uploadReferenceMaterials: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return api.post('/exams/upload-reference-materials', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },
  generate: (data: {
    class_id?: string; lecture_id?: string; subject_id?: string; subject_name?: string;
    topic_ids?: string[]; reference_material_paths?: string[];
    name: string; exam_date?: string;
    num_questions?: number; max_score?: number; difficulty?: string;
    question_types?: string[]; refinement_prompt?: string;
    is_test_format?: boolean; exam_format?: string; education_level?: string; trimester?: number;
    num_options?: number; num_multi_answer?: number;
  }) => api.post('/exams/generate', data),
  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/exams/upload-logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
  },
  getLogo: () => api.get('/exams/logo'),
  iterate: (id: string, data: { instruction: string; preserve_questions?: number[] }) => 
    api.post(`/exams/${id}/iterate`, data, { timeout: 120000 }),
  updateWeight: (id: string, weight: number) => api.patch(`/exams/${id}/weight`, { weight }),
  getQuestions: (id: string) => api.get(`/exams/${id}/questions`),
  downloadExamUrl: (id: string) => `${getBaseUrl()}/exams/${id}/download`,
  downloadSolutionsUrl: (id: string) => `${getBaseUrl()}/exams/${id}/solutions`,
  downloadDigitalizedUrl: (id: string) => `${getBaseUrl()}/exams/${id}/digitalized`,
  downloadOriginalUrl: (id: string) => `${getBaseUrl()}/exams/${id}/original`,
  downloadExamByClassUrl: (id: string, classId: string) => `${getBaseUrl()}/exams/${id}/download/class/${classId}`,
};

export const corrections = {
  upload: (examId: string, files: File[], studentId?: string, group?: boolean, classId?: string) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('papers', f));
    if (studentId) formData.append('student_id', studentId);
    if (classId) formData.append('class_id', classId);
    if (group) formData.append('group', 'true');
    return api.post(`/corrections/${examId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  bulkUpload: (examId: string, files: File[], classId?: string, overwrite?: boolean) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('papers', f));
    if (classId) formData.append('class_id', classId);
    if (overwrite) formData.append('overwrite', 'true');
    return api.post(`/corrections/${examId}/bulk-upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000
    });
  },
  markNotTaken: (correctionId: string, notTaken: boolean) =>
    api.patch(`/corrections/${correctionId}/not-taken`, { not_taken: notTaken }),
  replacePaper: (correctionId: string, file: File) => {
    const formData = new FormData();
    formData.append('paper', file);
    return api.post(`/corrections/${correctionId}/replace-paper`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
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
  }),
  delete: (correctionId: string) => api.delete(`/corrections/item/${correctionId}`),
  downloadReportUrl: (correctionId: string) => `${api.defaults.baseURL}/corrections/item/${correctionId}/report`,
  batchDownloadReports: (examId: string) =>
    api.post(`/corrections/${examId}/batch-reports`, null, {
      responseType: 'blob' as const,
      timeout: 120000,
    }),
};

export const exercises = {
  list: (studentId?: string, subjectId?: string, exerciseType?: string) => api.get('/exercises/', { params: { ...(studentId ? { student_id: studentId } : {}), ...(subjectId ? { subject_id: subjectId } : {}), ...(exerciseType ? { exercise_type: exerciseType } : {}) } }),
  generate: (params: {
    studentIds: string[];
    name: string;
    sourceExamIds?: string[];
    sourceTopicIds?: string[];
    subjectId?: string;
    refinementPrompt?: string;
    difficulty?: 'easier' | 'same' | 'harder';
    numQuestions?: number;
    maxScore?: number;
    numBlankPages?: number;
    focusTopics?: string[];
    deliveryDate?: string;
    correctionDate?: string;
    exerciseType?: 'practice' | 'recovery';
  }) =>
    api.post('/exercises/generate', {
      student_ids: params.studentIds,
      name: params.name,
      source_exam_ids: params.sourceExamIds,
      source_topic_ids: params.sourceTopicIds,
      subject_id: params.subjectId,
      refinement_prompt: params.refinementPrompt,
      difficulty: params.difficulty,
      num_questions: params.numQuestions,
      max_score: params.maxScore,
      num_blank_pages: params.numBlankPages,
      focus_topics: params.focusTopics,
      delivery_date: params.deliveryDate,
      correction_date: params.correctionDate,
      exercise_type: params.exerciseType || 'practice',
    }, {
      timeout: 300000,
    }),
  get: (id: string) => api.get(`/exercises/${id}`),
  update: (id: string, data: any) => api.put(`/exercises/${id}`, data),
  rename: (id: string, name: string) => api.patch(`/exercises/${id}/rename`, { name }),
  updateWeight: (id: string, weight: number) => api.patch(`/exercises/${id}/weight`, { weight }),
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
  listAll: () => api.get('/exercise-corrections/'),
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
  }),
  delete: (correctionId: string) => api.delete(`/exercise-corrections/correction/${correctionId}`),
};

export const subjects = {
  list: () => api.get('/subjects/'),
  get: (id: string) => api.get(`/subjects/${id}`),
  create: (data: { name: string; description?: string; color?: string }) => api.post('/subjects/', data),
  update: (id: string, data: { name?: string; description?: string; color?: string }) => api.put(`/subjects/${id}`, data),
  delete: (id: string) => api.delete(`/subjects/${id}`),
  forClass: (classId: string) => api.get(`/subjects/for-class/${classId}`),
  topicsForClass: (classId: string) => api.get(`/subjects/topics-for-class/${classId}`),
  classPairs: () => api.get('/subjects/class-pairs'),
  linkToClass: (subjectId: string, classId: string) => api.post(`/subjects/${subjectId}/classes/${classId}`),
  unlinkFromClass: (subjectId: string, classId: string) => api.delete(`/subjects/${subjectId}/classes/${classId}`),
  updateClassLink: (subjectId: string, classId: string, data: { aula?: string; exam_weight_pct?: number }) => api.patch(`/subjects/${subjectId}/classes/${classId}`, data),
};

export const topics = {
  listBySubject: (subjectId: string) => api.get(`/topics/subject/${subjectId}`),
  listByClass: (classId: string) => api.get(`/topics/class/${classId}`),
  get: (id: string) => api.get(`/topics/${id}`),
  create: (subjectId: string, data: { name: string; description?: string; trimester?: number; order?: number; parent_id?: string }) =>
    api.post(`/topics/subject/${subjectId}`, data),
  update: (id: string, data: { name?: string; description?: string; trimester?: number; order?: number; include_in_generation?: boolean }) =>
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
  updateMaterial: (topicId: string, materialId: string, data: { include_in_exercises?: boolean }) =>
    api.patch(`/topics/${topicId}/materials/${materialId}`, data),
  moveMaterial: (topicId: string, materialId: string, targetTopicId: string) =>
    api.patch(`/topics/${topicId}/materials/${materialId}`, { target_topic_id: targetTopicId }),
  generateMaterial: (topicId: string, data: {
    prompt: string; include_in_exercises?: boolean;
    enfoque?: string; target_pages?: number;
    exercises_per_chapter?: number; examples_per_section?: number;
  }) =>
    api.post(`/topics/${topicId}/generate-material`, data, { timeout: 30000 }),
  getMaterialDownloadUrl: (documentUrl: string) => `${getBaseUrl()}${documentUrl}`,
  reorder: (subjectId: string, topicIds: string[]) =>
    api.post(`/topics/subject/${subjectId}/reorder`, topicIds),
  // Temas Vivos
  getContent: (topicId: string) => api.get(`/topics/${topicId}/content`),
  getPdfUrl: (topicId: string) => `${getBaseUrl()}/topics/${topicId}/pdf`,
  editContent: (topicId: string, data: { instruction: string; preset?: string }) =>
    api.post(`/topics/${topicId}/edit`, data),
  updateStatus: (topicId: string, status: string) =>
    api.patch(`/topics/${topicId}/status`, { status }),
  generateContent: (topicId: string, data: { prompt: string; enfoque: string; target_pages: number }) =>
    api.post(`/topics/${topicId}/generate-content`, data),
  recompile: (topicId: string) => api.post(`/topics/${topicId}/recompile`),
  generateSummary: (topicId: string) => api.post(`/topics/${topicId}/generate-summary`),
  generateQuiz: (topicId: string) => api.post(`/topics/${topicId}/generate-quiz`),
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
  list: (startDate: string, endDate: string, classId?: string, studentId?: string, examId?: string) =>
    api.get('/calendar/', { params: { start_date: startDate, end_date: endDate, ...(classId ? { class_id: classId } : {}), ...(studentId ? { student_id: studentId } : {}), ...(examId ? { exam_id: examId } : {}) } }),
  listByExam: (examId: string) =>
    api.get('/calendar/', { params: { start_date: '2020-01-01', end_date: '2030-12-31', exam_id: examId } }),
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

export const comments = {
  list: (params?: { note_type?: string; class_id?: string; subject_id?: string; event_id?: string; days?: number }) =>
    api.get('/comments/', { params }),
  createClassComment: (data: { class_id: string; subject_id?: string; event_id?: string; event_date?: string; text: string; mentioned_student_ids?: string[] }) =>
    api.post('/comments/class', data),
  createEventObservation: (data: { event_id: string; text: string; mentioned_student_ids?: string[] }) =>
    api.post('/comments/event', data),
  createGeneralComment: (data: { text: string; mentioned_student_ids?: string[] }) =>
    api.post('/comments/general', data),
  getRecentSessions: () =>
    api.get('/comments/recent-sessions'),
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
  getForSubject: (prepDate: string, classId: string, subjectId: string) =>
    api.get(`/preparation/${prepDate}/class/${classId}/subject/${subjectId}`),
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
    subject_id?: string;
    num_questions?: number;
    max_score?: number;
    num_blank_pages?: number;
    difficulty?: 'easier' | 'same' | 'harder';
    delivery_date?: string;
    correction_date?: string;
    group_by_weakness?: boolean;
    unique_per_student?: boolean;
    exercise_type?: 'practice' | 'recovery';
  }) =>
    api.post<BatchJobResponse>('/batch/exercises/generate', {
      class_id: data.class_id,
      student_ids: data.student_ids,
      name: data.name,
      source_exam_ids: data.source_exam_ids,
      source_topic_ids: data.source_topic_ids,
      focus_topics: data.focus_topics,
      subject_id: data.subject_id,
      num_questions: data.num_questions ?? 5,
      max_score: data.max_score ?? 10,
      num_blank_pages: data.num_blank_pages ?? 0,
      difficulty: data.difficulty ?? 'same',
      delivery_date: data.delivery_date,
      correction_date: data.correction_date,
      group_by_weakness: data.group_by_weakness ?? true,
      unique_per_student: data.unique_per_student ?? false,
      exercise_type: data.exercise_type ?? 'practice',
    }),

  // Batch exercise corrections
  startBatchExerciseCorrection: (exerciseIds: string[], correctionIds: string[]) =>
    api.post<BatchJobResponse>('/batch/exercise-corrections/start', {
      exercise_ids: exerciseIds,
      correction_ids: correctionIds,
    }),
};

export const gradeCategories = {
  list: (subjectId: string) => api.get(`/subjects/${subjectId}/categories`),
  create: (subjectId: string, data: { name: string; weight: number; order?: number }) =>
    api.post(`/subjects/${subjectId}/categories`, data),
  update: (subjectId: string, categoryId: string, data: { name?: string; weight?: number; order?: number }) =>
    api.put(`/subjects/${subjectId}/categories/${categoryId}`, data),
  delete: (subjectId: string, categoryId: string) =>
    api.delete(`/subjects/${subjectId}/categories/${categoryId}`),
};

export const academicConfig = {
  get: (classId: string) => api.get(`/academic-config/${classId}`),
  save: (data: {
    class_id?: string; year: string;
    period_mode: 'trimester' | 'cuatrimester';
    trimester_1_start: string; trimester_1_end: string;
    trimester_2_start: string; trimester_2_end: string;
    trimester_3_start?: string | null; trimester_3_end?: string | null;
    recovery_start?: string | null; recovery_end?: string | null;
  }) => api.post('/academic-config/', data),
  detectTrimester: (classId: string, date: string) =>
    api.get('/academic-config/detect-trimester', { params: { class_id: classId, date } }),
};

export const attendance = {
  list: (params?: { class_id?: string; date?: string; event_id?: string; subject_id?: string }) =>
    api.get('/attendance/', { params }),
  bulkCreate: (data: {
    class_id: string; date: string; event_id?: string; subject_id?: string;
    records: Array<{ student_id: string; status: string }>;
  }) => api.post('/attendance/bulk', data),
  update: (id: string, data: { status?: string; note?: string }) =>
    api.put(`/attendance/${id}`, data),
  getSummary: (classId: string, subjectId?: string, startDate?: string, endDate?: string) =>
    api.get('/attendance/summary', { params: { class_id: classId, ...(subjectId ? { subject_id: subjectId } : {}), ...(startDate ? { start_date: startDate } : {}), ...(endDate ? { end_date: endDate } : {}) } }),
  getStudentHistory: (studentId: string, classId?: string, subjectId?: string) =>
    api.get(`/attendance/student/${studentId}`, { params: { ...(classId ? { class_id: classId } : {}), ...(subjectId ? { subject_id: subjectId } : {}) } }),
  getTaken: (startDate: string, endDate: string) =>
    api.get('/attendance/taken', { params: { start_date: startDate, end_date: endDate } }),
  uploadJustification: (attendanceId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/attendance/${attendanceId}/justification`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  deleteJustification: (attendanceId: string) =>
    api.delete(`/attendance/${attendanceId}/justification`),
};

export const dashboard = {
  get: () => api.get('/dashboard'),
};

export const reports = {
  generateComments: (data: { class_id: string; subject_id?: string; trimester?: number; student_ids?: string[] }) =>
    api.post('/reports/generate-comments', data, { timeout: 300000 }),
  regenerateComment: (data: { student_id: string; class_id: string; subject_id?: string; instruction?: string }) =>
    api.post('/reports/regenerate-comment', data, { timeout: 120000 }),
  generateClassReport: (data: { class_id: string; subject_id?: string; trimester?: number }) =>
    api.post('/reports/generate-class-report', data, { timeout: 300000 }),
};

export const feedback = {
  list: () => api.get('/feedback/'),
  create: (data: { category: string; text: string }) => api.post('/feedback/', data),
  update: (id: string, data: { category?: string; text?: string }) => api.put(`/feedback/${id}`, data),
  delete: (id: string) => api.delete(`/feedback/${id}`),
};

export const textbooks = {
  list: (subjectId?: string) =>
    api.get('/textbooks/', { params: subjectId ? { subject_id: subjectId } : {} }),
  get: (id: string) => api.get(`/textbooks/${id}`),
  generate: (data: {
    subject_id: string;
    class_id: string;
    title?: string;
    enfoque: string;
    notas?: string;
    topic_ids?: string[];
    target_pages?: number;
    exercises_per_chapter?: number;
    examples_per_section?: number;
    depth?: number;
    visual_density?: string;
    guide_pdfs?: File[];
  }) => {
    const form = new FormData();
    form.append('subject_id', data.subject_id);
    form.append('class_id', data.class_id);
    form.append('enfoque', data.enfoque);
    if (data.title) form.append('title', data.title);
    if (data.notas) form.append('notas', data.notas);
    if (data.topic_ids) form.append('topic_ids', JSON.stringify(data.topic_ids));
    if (data.target_pages !== undefined) form.append('target_pages', String(data.target_pages));
    if (data.exercises_per_chapter !== undefined) form.append('exercises_per_chapter', String(data.exercises_per_chapter));
    if (data.examples_per_section !== undefined) form.append('examples_per_section', String(data.examples_per_section));
    if (data.depth !== undefined) form.append('depth', String(data.depth));
    if (data.visual_density) form.append('visual_density', data.visual_density);
    if (data.guide_pdfs) {
      data.guide_pdfs.forEach((pdf) => form.append('guide_pdfs', pdf));
    }
    return api.post('/textbooks/generate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getPdfUrl: (id: string) => `${getBaseUrl()}/textbooks/${id}/pdf`,
  iterate: (id: string, data: { chapter_number: number; instruction: string }) =>
    api.post(`/textbooks/${id}/iterate`, data, { timeout: 300000 }),
  suggestTemas: (id: string) =>
    api.post(`/textbooks/${id}/suggest-temas`),
  createTemas: (id: string, data: { temas: { name: string; sections: number[]; trimester?: number }[] }) =>
    api.post(`/textbooks/${id}/create-temas`, data),
  assignToPlanTopics: (id: string) =>
    api.post<{ assigned: number; total_topics: number }>(`/textbooks/${id}/assign-to-plan-topics`),
  delete: (id: string) => api.delete(`/textbooks/${id}`),
};

export const coursePlans = {
  detectTrimesters: (subjectId: string, classId: string) =>
    api.get('/course-plans/detect-trimesters', { params: { subject_id: subjectId, class_id: classId } }),
  list: (subjectId?: string, classId?: string) =>
    api.get('/course-plans/', { params: { ...(subjectId ? { subject_id: subjectId } : {}), ...(classId ? { class_id: classId } : {}) } }),
  get: (id: string) => api.get(`/course-plans/${id}`),
  create: (data: {
    subject_id: string;
    class_id: string;
    enfoque: string;
    active_trimesters?: number[];
    priority_notes?: string;
    exams_per_trimester?: number;
    review_sessions?: boolean;
    exercises_frequency?: string;
    buffer_sessions?: number;
    guide_pdfs?: File[];
  }) => {
    const form = new FormData();
    form.append('subject_id', data.subject_id);
    form.append('class_id', data.class_id);
    form.append('enfoque', data.enfoque);
    if (data.active_trimesters) form.append('active_trimesters', JSON.stringify(data.active_trimesters));
    if (data.priority_notes) form.append('priority_notes', data.priority_notes);
    if (data.exams_per_trimester !== undefined) form.append('exams_per_trimester', String(data.exams_per_trimester));
    if (data.review_sessions !== undefined) form.append('review_sessions', String(data.review_sessions));
    if (data.exercises_frequency) form.append('exercises_frequency', data.exercises_frequency);
    if (data.buffer_sessions !== undefined) form.append('buffer_sessions', String(data.buffer_sessions));
    if (data.guide_pdfs) {
      data.guide_pdfs.forEach((pdf) => form.append('guide_pdfs', pdf));
    }
    return api.post('/course-plans/create', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  generate: (id: string, data: {
    topic_annotations?: { unit_index: number; topic_index: number; time_weight: number; skip: boolean; notes?: string; lock_trimester?: number }[];
    priority_notes?: string;
    exam_strategy?: { exams_per_trimester: number; review_sessions_before_exam: boolean; exercises_frequency: string };
    buffer_sessions_per_trimester?: number;
  }) => api.post(`/course-plans/${id}/generate`, data),
  accept: (id: string, data?: { skip_exam_units?: string[]; extra_exams?: { name: string; date: string }[] }) =>
    api.post(`/course-plans/${id}/accept`, data || {}),
  regenerate: (id: string, data: any) => api.post(`/course-plans/${id}/regenerate`, data),
  adapt: (id: string, data: { notes?: string }) => api.post(`/course-plans/${id}/adapt`, data),
  progress: (id: string) => api.get(`/course-plans/${id}/progress`),
  generateContent: (id: string) =>
    api.post(`/course-plans/${id}/generate-content`),
  generateMaterial: (id: string, topicIds: string[]) =>
    api.post(`/course-plans/${id}/generate-material`, topicIds),
  delete: (id: string) => api.delete(`/course-plans/${id}`),
};

export default api;
