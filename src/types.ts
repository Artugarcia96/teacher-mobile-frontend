export interface ScheduleSlot {
  day: string;
  start_time: string;
  end_time: string;
}

export interface Lecture {
  id: string;
  classId: string;
  name: string;
  subjectId?: string;
  subjectName?: string;
  schedule: ScheduleSlot[];
}

export interface LectureBasic {
  id: string;
  name: string;
}

export type EducationLevel = 'infantil' | 'primaria_lower' | 'primaria_upper' | 'secundaria' | 'bachillerato' | 'universidad';

export interface ClassGroup {
  id: string;
  name: string;
  subject: string;
  year: string;
  educationLevel: EducationLevel;
  studentCount: number;
  lectureCount: number;
  lastActivity: string;
  archived: boolean;
  lectures?: Lecture[];
  lecturesBasic?: LectureBasic[];
}

export interface Student {
  id: string;
  name: string;
  classId: string;
  studentId?: string;
  email?: string;
  notes: Note[];
}

export interface Note {
  id: string;
  text: string;
  createdAt: string;
}

export interface ExamIterationHistoryItem {
  version: number;
  instruction: string;
  timestamp: string;
  changes_made?: string[];
}

export interface Exam {
  id: string;
  name: string;
  classId?: string;
  lectureId?: string;
  subjectId?: string;
  date: string;
  maxScore: number;
  status: ExamStatus;
  documentUrl?: string;
  documentType?: 'pdf' | 'image';
  isPersonalized?: boolean;
  hasGeneratedQuestions?: boolean;
  className?: string;
  lectureName?: string;
  subjectName?: string;
  correctionDeadline?: string;
  blankPagesCount?: number;
  iterationHistory?: ExamIterationHistoryItem[];
  deadlineStatus?: 'ok' | 'soon' | 'urgent' | 'overdue' | 'completed';
}

export interface AIQuestionFeedback {
  id: string;
  status: 'correct' | 'partial' | 'incorrect' | 'blank';
  feedback: string;
}

export interface AIAnalysis {
  suggestedStudentName?: string;
  confidence: number;
  questions: AIQuestionFeedback[];
  weakAreas: string[];
  summary: string;
}

export interface CorrectionResult {
  id: string;
  examId: string;
  studentId: string;
  paperUrl?: string;
  aiAnalysis?: AIAnalysis;
  aiProcessed?: boolean;
  grade: number | null;
  teacherNotes?: string;
  weakAreas?: string[];
  savedAt?: string;
}

export interface ExerciseIterationHistoryItem {
  version: number;
  instruction: string;
  timestamp: string;
  changes_made?: string[];
}

export interface Exercise {
  id: string;
  name?: string;
  studentId: string;
  sourceExamId?: string;
  sourceExamIds?: string[];
  weakAreas: string[];
  questions: ExerciseQuestion[];
  assignedAt: string;
  refinementPrompt?: string;
  pdfExercisesUrl?: string;
  pdfSolutionsUrl?: string;
  correctionStatus?: 'in_progress' | 'corrected' | null;
  deliveryDate?: string;
  correctionDate?: string;
  iterationHistory?: ExerciseIterationHistoryItem[];
  deliveryStatus?: 'pending' | 'today' | 'tomorrow' | 'delivered';
  correctionDeadlineStatus?: 'ok' | 'soon' | 'urgent' | 'overdue' | 'completed';
  subjectId?: string;
  subjectName?: string;
}

export interface ExerciseCorrectionResult {
  id: string;
  exerciseId: string;
  studentId: string | null;
  paperUrl?: string;
  aiAnalysis?: AIAnalysis;
  grade: number | null;
  teacherNotes?: string;
  weakAreas?: string[];
  savedAt?: string;
  createdAt?: string;
}

export interface ExerciseQuestion {
  id: string;
  text: string;
  hint?: string;
  solution?: string;
  points?: number;
}

export interface WeakArea {
  topic: string;
  examId: string;
  examName: string;
  score: number;
  maxScore: number;
}

export type ExamStatus = 'uploaded' | 'assigned' | 'corrected';

export interface TopicMaterial {
  id: string;
  topicId: string;
  name: string;
  documentUrl: string;
  documentType?: string;
  uploadedAt: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  subjectName?: string;
  name: string;
  description?: string;
  order: number;
  createdAt: string;
  materials: TopicMaterial[];
}

export interface TopicListItem {
  id: string;
  subjectId: string;
  subjectName?: string;
  name: string;
  description?: string;
  order: number;
  materialCount: number;
}

export interface SubjectWithTopics {
  subjectId: string;
  subjectName: string;
  topics: TopicListItem[];
}

export interface BulkUploadMatch {
  correctionId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  confidence: number;
}

export interface BulkUploadNeedsReview {
  correctionId: string;
  detectedCode: string | null;
  reason: string;
  suggestions: { studentId: string; studentName: string; code: string }[];
}

export interface BulkUploadResult {
  autoMatched: BulkUploadMatch[];
  needsReview: BulkUploadNeedsReview[];
  studentsWithoutPapers: { studentId: string; studentName: string; code: string }[];
}

// Class-level bulk upload (for multiple exercises at once)
export interface ClassBulkUploadMatch {
  correctionId: string;
  exerciseId: string;
  exerciseName: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  confidence: number;
}

export interface ClassBulkUploadNeedsReview {
  correctionId: string;
  exerciseId: string | null;
  exerciseName: string | null;
  detectedCode: string | null;
  reason: string;
  suggestions: { studentId: string; studentName: string; code: string }[];
}

export interface ClassBulkUploadResult {
  autoMatched: ClassBulkUploadMatch[];
  needsReview: ClassBulkUploadNeedsReview[];
  exercisesAffected: { exerciseId: string; exerciseName: string; matchedCount: number }[];
  studentsWithoutPapers: { studentId: string; studentName: string; code: string }[];
}

export interface CalendarEvent {
  id: string;
  classId?: string;
  studentId?: string;
  examId?: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  eventType: 'class_session' | 'custom' | 'tutoring' | 'exam';
  notes?: string;
  isCancelled: boolean;
  className?: string;
  classSubject?: string;
  studentName?: string;
  examName?: string;
  examStatus?: string;
}

export interface MaterialWithContext {
  id: string;
  name: string;
  documentUrl: string;
  documentType?: string;
  uploadedAt: string;
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
}

export interface TopicForUpload {
  id: string;
  name: string;
  order: number;
}

export interface SubjectWithTopicsForUpload {
  subjectId: string;
  subjectName: string;
  topics: TopicForUpload[];
}

export interface MaterialInStructure {
  id: string;
  name: string;
  documentUrl: string;
  documentType?: string;
  uploadedAt: string;
}

export interface TopicInStructure {
  id: string;
  name: string;
  order: number;
  materials: MaterialInStructure[];
}

export interface SubjectStructure {
  subjectId: string;
  subjectName: string;
  classCount: number;
  topics: TopicInStructure[];
}

export interface SubjectListItem {
  id: string;
  name: string;
  description?: string;
  topicCount: number;
  classCount: number;
}

export interface ClassSubjectSummary {
  subjectId: string;
  subjectName: string;
  lectureId?: string;
  examCount: number;
  pendingCorrections: number;
  exerciseCount: number;
  topicCount: number;
  averageGrade: number | null;
  correctedCount: number;
  passRate: number | null;
}
