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
  examWeightPct: number;
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
  comments: Comment[];
}

export interface Comment {
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

export interface ExamAssignment {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  correctionDeadline?: string;
  deadlineStatus?: 'ok' | 'soon' | 'urgent' | 'overdue' | 'completed';
  studentCount?: number;
  hasClassPdf?: boolean;
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
  trimester?: number;
  categoryId?: string;
  categoryName?: string;
  weight?: number;
  examOrigin?: ExamOrigin;
  isTestFormat?: boolean;
  examFormat?: 'boxes' | 'compact' | 'test';
  originalDocumentUrl?: string;
  assignments?: ExamAssignment[];
  /** Natural-language instructions the teacher wrote when creating the exam.
   *  Used both on backend (to guide AI generation / digitisation) and on
   *  the Validar UI (to show the teacher what they asked for). */
  refinementPrompt?: string;
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
  studentName?: string;
  classId?: string;
  className?: string;
  paperUrl?: string;
  aiAnalysis?: AIAnalysis;
  aiProcessed?: boolean;
  grade: number | null;
  teacherComments?: string;
  weakAreas?: string[];
  /** Teacher explicitly marked the student as "did not take the exam".
   *  When true, paperUrl/grade/aiAnalysis are all cleared and the row is
   *  excluded from class averages. */
  notTaken?: boolean;
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
  trimester?: number;
  categoryId?: string;
  exerciseType?: 'practice' | 'recovery';
  maxScore: number;
  weight?: number;
}

export interface ExerciseCorrectionResult {
  id: string;
  exerciseId: string;
  studentId: string | null;
  paperUrl?: string;
  aiAnalysis?: AIAnalysis;
  grade: number | null;
  teacherComments?: string;
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

export type ExamStatus = 'pending_validation' | 'pending_schedule' | 'scheduled' | 'pending_correction' | 'corrected';
export type ExamOrigin = 'digitalized' | 'ai_generated';

export interface TopicMaterial {
  id: string;
  topicId: string;
  name: string;
  documentUrl: string;
  documentType?: string;
  uploadedAt: string;
  includeInExercises: boolean;
  isGenerated: boolean;
}

export interface SubTopic {
  id: string;
  name: string;
  description?: string;
  order: number;
  materials: TopicMaterial[];
  hasContent: boolean;
  status: string;
  includeInGeneration: boolean;
}

export interface Topic {
  id: string;
  subjectId: string;
  parentId?: string | null;
  subjectName?: string;
  name: string;
  description?: string;
  trimester?: number | null;
  order: number;
  createdAt: string;
  materials: TopicMaterial[];
  children: SubTopic[];
  // Temas Vivos
  textbookId?: string;
  pdfUrl?: string;
  status: string; // draft | ready | taught
  pageCount?: number;
  hasContent: boolean;
  includeInGeneration: boolean;
  // Course plan linkage
  coursePlanId?: string;
  scheduledDates?: string[];
  sessionsNeeded?: number;
}

export interface TopicListItem {
  id: string;
  subjectId: string;
  subjectName?: string;
  name: string;
  description?: string;
  trimester?: number | null;
  order: number;
  materialCount: number;
  // Temas Vivos
  hasContent: boolean;
  status: string;
  pageCount?: number;
  pdfUrl?: string;
  children?: TopicListItem[];
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

export interface BulkUploadSkipped {
  correctionId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  hadGrade: boolean;
}

export interface BulkUploadResult {
  autoMatched: BulkUploadMatch[];
  /** Papers that overwrote an existing entry (overwrite=true). Exam corrections only. */
  replaced?: BulkUploadMatch[];
  /** Students whose paper was found but whose existing entry was kept
   *  because overwrite was false. Exam corrections only. */
  skippedAlreadyAssigned?: BulkUploadSkipped[];
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

export interface MentionedStudent {
  id: string;
  name: string;
}

export interface StudentMentionEntry {
  id: string;
  student_id: string;
  context_text: string;
  created_at: string;
  source_type: 'comment' | 'event';
  comment_id?: string;
  event_id?: string;
  event_title?: string;
  event_date?: string;
  class_name?: string;
  comment_note_type?: string;
}

export interface CalendarEvent {
  id: string;
  classId?: string;
  studentId?: string;
  examId?: string;
  topicId?: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  eventType: 'class_session' | 'custom' | 'tutoring' | 'exam';
  notes?: string;
  isCancelled: boolean;
  className?: string;
  classSubject?: string;
  subjectId?: string;
  aula?: string;
  studentName?: string;
  examName?: string;
  examStatus?: string;
  topicName?: string;
  topicPdfUrl?: string;
  mentionedStudents?: MentionedStudent[];
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
  subjectColor?: string;
  lectureId?: string;
  examCount: number;
  pendingCorrections: number;
  exerciseCount: number;
  pendingExerciseCount: number;
  topicCount: number;
  averageGrade: number | null;
  correctedCount: number;
  passRate: number | null;
  aula?: string;
  schedule?: ScheduleSlot[];
  examWeightPct: number;
}

export interface GradeCategory {
  id: string;
  subjectId: string;
  name: string;
  weight: number;
  order: number;
}

export interface AcademicConfig {
  id: string;
  teacherId: string;
  classId?: string;
  year: string;
  t1Start: string;
  t1End: string;
  t2Start: string;
  t2End: string;
  t3Start: string;
  t3End: string;
  recoveryStart?: string;
  recoveryEnd?: string;
}

export interface TrimesterSummaryRow {
  studentId: string;
  studentName: string;
  t1Avg: number | null;
  t2Avg: number | null;
  t3Avg: number | null;
  finalAvg: number | null;
  riskStatus: 'ok' | 'borderline' | 'at_risk';
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  classId: string;
  subjectId?: string;
  eventId?: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'justified';
  note?: string;
  justificationUrl?: string;
  studentName?: string;
  subjectName?: string;
}

export interface AttendanceTaken {
  classId: string;
  subjectId?: string;
  date: string;
  eventId?: string;
}

export interface AttendanceSummary {
  studentId: string;
  studentName: string;
  totalSessions: number;
  present: number;
  absent: number;
  late: number;
  justified: number;
  attendanceRate: number;
}

export interface DashboardData {
  pendingCorrections: PendingCorrection[];
  pendingExerciseCorrections: PendingExerciseCorrection[];
  upcomingExams: UpcomingExam[];
  studentsAtRisk: StudentAtRisk[];
  recentActivity: RecentActivity[];
  todayBriefingSummary: string | null;
  stats: DashboardStats;
}

export interface PendingCorrection {
  examId: string;
  examName: string;
  classId: string;
  className: string;
  subjectName?: string;
  pendingCount: number;
  totalCount: number;
  deadline?: string;
  deadlineStatus?: string;
}

export interface PendingExerciseCorrection {
  exerciseId: string;
  exerciseName: string;
  studentName: string;
  className: string;
}

export interface UpcomingExam {
  examId: string;
  examName: string;
  classId: string;
  className: string;
  date: string;
  daysUntil: number;
}

export interface StudentAtRisk {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  avgGrade: number | null;
  riskLevel: 'high' | 'medium' | 'low';
  factors: string[];
}

export interface RecentActivity {
  type: 'correction' | 'exam_created' | 'exercise_generated' | 'grade_entered';
  description: string;
  timestamp: string;
  link?: string;
}

export interface DashboardStats {
  totalClasses: number;
  totalStudents: number;
  examsThisTrimester: number;
  pendingCorrectionsCount: number;
}

export interface TextbookChapter {
  number: number;
  title: string;
  sections?: { number: number; title: string }[];
  estimated_pages?: number;
}

// ── Course Plan ─────────────────────────────────────────────────

export interface ExamStrategy {
  exams_per_trimester: number;
  review_sessions_before_exam: boolean;
  exercises_frequency: 'weekly' | 'biweekly' | 'per_unit';
}

export interface TopicAnnotation {
  unit_index: number;
  topic_index: number;
  time_weight: number;
  skip: boolean;
  notes?: string;
  lock_trimester?: number;
}

export interface CurriculumTopic {
  title: string;
  subtopics?: string[];
  learning_objectives?: string[];
  prerequisites?: string[];
  estimated_complexity?: string;
}

export interface CurriculumUnit {
  number: number;
  title: string;
  description?: string;
  topics: CurriculumTopic[];
}

export interface Curriculum {
  subject: string;
  level: string;
  units: CurriculumUnit[];
  total_topics: number;
}

export interface PlanSession {
  index: number;
  title: string;
  focus: string;
  subtopics: string[];
  objectives: string[];
  key_points: string[];
  session_type: 'introduction' | 'theory' | 'theory_practice' | 'practice' | 'deepening' | 'review';
  date: string;
}

export interface PlanTopic {
  name: string;
  unit_index: number;
  topic_index: number;
  sessions_needed: number;
  scheduled_dates: string[];
  sessions?: PlanSession[];
  learning_objectives?: string[];
  key_concepts?: string[];
  complexity?: string;
  teacher_notes?: string;
}

export interface PlanUnit {
  name: string;
  unit_index: number;
  topics: PlanTopic[];
  review_session?: { date: string; type: string };
  exam?: { date: string; type: string; name: string };
  exercise_dates?: string[];
}

export interface PlanTrimester {
  number: number;
  start_date: string;
  end_date: string;
  units: PlanUnit[];
  buffer_sessions?: string[];
}

export interface CoursePlanData {
  title: string;
  total_sessions: number;
  sessions_per_week?: number;
  trimesters: PlanTrimester[];
}

export interface CoursePlan {
  id: string;
  teacherId: string;
  subjectId: string;
  classId: string;
  batchJobId?: string;
  enfoque: string;
  depth: number;
  visualDensity: string;
  activeTrimesters?: number[];
  guidePdfUrls?: string[];
  priorityNotes?: string;
  examStrategy?: ExamStrategy;
  bufferSessionsPerTrimester: number;
  curriculum?: Curriculum;
  topicAnnotations?: TopicAnnotation[];
  coursePlan?: CoursePlanData;
  stats?: {
    generation_time_seconds?: number;
    total_sessions?: number;
    review_score?: number;
    review_issues?: number;
    review_critical_issues?: string[];
    review_warnings?: string[];
    review_suggestions?: string[];
    review_summary?: string;
  };
  status: string; // pending | analyzing | generating | completed | failed
  errorMessage?: string;
  isActive: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface CoursePlanListItem {
  id: string;
  subjectId: string;
  classId: string;
  status: string;
  isActive: boolean;
  enfoque: string;
  title?: string;
  totalSessions?: number;
  topicsCreated: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface CoursePlanProgress {
  totalTopics: number;
  taughtTopics: number;
  currentTopic?: string;
  sessionsElapsed: number;
  sessionsTotal: number;
  sessionsAheadBehind: number;
  trimesterProgress: { trimester: number; planned: number; completed: number; pct: number }[];
  upcoming: { name: string; dates: string[]; sessions: number; trimester: number }[];
}

export interface Textbook {
  id: string;
  subjectId: string;
  batchJobId?: string;
  enfoque: string;
  notas?: string;
  educationLevel: string;
  topicIds?: string[];
  title?: string;
  bookPlan?: {
    title: string;
    subtitle?: string;
    chapters: TextbookChapter[];
  };
  stats?: {
    total_words?: number;
    estimated_pages?: number;
    estimated_cost_usd?: number;
    generation_time_seconds?: number;
    style_variety_score?: number;
  };
  pdfUrl?: string;
  iterationHistory?: { chapter_number: number; instruction: string; timestamp: string }[];
  status: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
  temasCreated?: boolean;
  coursePlanId?: string;
  depth?: number;
  visualDensity?: string;
}
