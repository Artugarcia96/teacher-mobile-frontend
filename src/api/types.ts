/** Shared API types (mirror backend app/schemas/common.py, me.py, courses.py, notes.py).
 * Feature-specific types live next to their hooks in src/api/<area>.ts. */

export interface Teacher { id: string; email: string; name: string; school?: string | null; region?: string | null }
export interface Term { n: number; start: string; end: string }
export interface Holiday { start: string; end: string; label: string }
export interface SchoolYear { id: string; label: string; start_date: string; end_date: string; terms: Term[]; holidays: Holiday[]; current_term: number }
export interface Me { teacher: Teacher; school_year: SchoolYear; ai_provider: 'mock' | 'openai'; today: string; now: string }

export interface Support { neae?: boolean; acnee?: boolean; kind?: string | null; adaptation?: string | null }
export interface StudentRef {
  id: string; first_name: string; last_name: string; name: string; sort_name: string; initials: string; support?: Support | null;
}
export interface GroupRef { id: string; name: string; stage: 'primaria' | 'eso' | 'bachillerato' | 'fp' | 'otro'; level?: number | null }
export interface CourseRef { id: string; subject: string; short?: string | null; color: string; room?: string | null; group: GroupRef; label: string }

export interface Slot { weekday: number; start: string; end: string; room?: string | null }
export interface Category { key: string; label: string; weight: number }
export interface NextSession { date: string; start: string; end: string; room?: string | null }
export interface CourseSummary extends CourseRef { student_count: number; schedule: Slot[]; next_session?: NextSession | null; archived: boolean }
export interface CourseDetail extends CourseSummary { categories: Category[]; current_unit?: string | null }
export interface GroupOut extends GroupRef { student_count: number; courses: CourseRef[] }

export interface StudentRow extends StudentRef {
  term_average: number | null; proposed: number | null; absences: number; lates: number; watch: string[];
}

export type NoteKind = 'observation' | 'incident' | 'positive' | 'family';
export interface Note {
  id: string; date: string; kind: NoteKind; text: string; course?: CourseRef | null; students: StudentRef[]; created_at: string; updated_at: string;
}

/** `final` is the teacher's final grade (only if set); `proposed` the rounded average. */
export interface TermCell { term: number; average: number | null; proposed?: number | null; final: number | null }
export interface GradeLine { activity_id: string; title: string; date: string; category_label: string; score: number | null; max_score: number; normalized: number | null; status: string }
/** Homework checks this school year where the student was present. */
export interface HomeworkSummary { checks: number; not_done: number; partial: number }
export interface StudentCourse { course: CourseRef; terms: TermCell[]; grades: GradeLine[]; absences: number; lates: number; justified: number; homework?: HomeworkSummary | null }
export interface StudentFile {
  student: StudentRef; notes_text?: string | null; groups: GroupRef[]; courses: StudentCourse[]; notes: Note[]; watch: string[];
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export interface Job {
  id: string; kind: string; status: JobStatus; progress: number; total: number; message?: string | null;
  result?: Record<string, unknown> | null; error?: string | null; ref_type?: string | null; ref_id?: string | null;
}
export interface JobRef { job: Job }
export interface Ok { ok: boolean }
