/** Shared API types (mirror backend app/schemas/common.py, me.py, courses.py, notes.py).
 * Feature-specific types live next to their hooks in src/api/<area>.ts. */

import type { WatchItem } from './today';

/** `region` = código de comunidad autónoma ("MD"). */
export interface Teacher { id: string; email: string; name: string; school?: string | null; region?: string | null }
/** Comunidad autónoma y plataforma de notas: `export_label` "Raíces (Madrid)" = destino de los CSV. */
export interface Region { code: string; name: string; short: string; platform?: string | null; export_label?: string | null }
export interface Term { n: number; start: string; end: string }
export interface Holiday { start: string; end: string; label: string }
export interface SchoolYear { id: string; label: string; start_date: string; end_date: string; terms: Term[]; holidays: Holiday[]; current_term: number }
export interface Me { teacher: Teacher; school_year: SchoolYear; region?: Region | null; ai_provider: 'openai' | 'claude_cli' | 'mock' | 'none'; today: string; now: string }

export type Measure = 'mas_tiempo' | 'letra_ampliada' | 'enunciados_por_pasos' | 'lectura_en_voz_alta' | 'examen_adaptado' | 'acs';
/** Apoyos NEAE/ACNEE como medidas concretas (backend app/schemas/support.py). */
export interface Support {
  neae: boolean; acnee: boolean; kind?: string | null; measures: Measure[]; acs_level?: string | null; notes?: string | null;
}
export interface StudentRef {
  id: string; first_name: string; last_name: string; name: string; sort_name: string; initials: string; support?: Support | null;
}
export interface GroupRef { id: string; name: string; stage: 'primaria' | 'eso' | 'bachillerato' | 'fp' | 'otro'; level?: number | null }
export interface CourseRef { id: string; subject: string; short?: string | null; color: string; room?: string | null; group: GroupRef; label: string }

export interface Slot { weekday: number; start: string; end: string; room?: string | null }
/** `activities`: how many activities of the class are in it (class detail only). */
export interface Category { key: string; label: string; weight: number; activities?: number }
/** `taken`: the list of this session is already taken (only possible once it has started). */
export interface NextSession { date: string; start: string; end: string; room?: string | null; taken?: boolean }
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
/** `adapted`: obtained on an adapted version of the exam — its measure («ACS 5.º Primaria», «Examen adaptado», «Letra
 * ampliada») and whether it is an ACS (graded on another level's criteria). */
export interface GradeLine {
  activity_id: string; title: string; date: string; category_label: string; score: number | null; max_score: number; normalized: number | null;
  status: string; comment?: string | null; adapted?: { label: string; acs: boolean } | null;
  /** `none`: does not count for the grade (a «Prueba inicial»). */
  counts_for?: 'average' | 'none' | 'recovery';
  /** Activity kind: a `suggested` grade is an AI draft, except in the derived homework column. */
  kind?: string;
}
/** Past exam of the current evaluación the student still lacks (no grade or NP). */
export interface PendingExam { activity_id: string; title: string; date: string; status: 'empty' | 'absent' }
/** Homework checks this school year where the student was present. */
export interface HomeworkSummary { checks: number; not_done: number; partial: number }
/** One absence, late or justified absence in the current term. */
export interface AttendanceEntry { date: string; start: string; status: 'absent' | 'late' | 'justified'; note?: string | null }
export interface StudentCourse {
  /** absences, lates, justified and attendance (newest first): current term. */
  course: CourseRef; terms: TermCell[]; grades: GradeLine[]; absences: number; lates: number; justified: number; pending_exams?: PendingExam[];
  attendance?: AttendanceEntry[]; homework?: HomeworkSummary | null;
}
export interface StudentFile {
  student: StudentRef; notes_text?: string | null; groups: GroupRef[]; courses: StudentCourse[]; notes: Note[];
  /** Current term. */
  term: number;
  /** «A vigilar», one item per class (also the acknowledged ones). */
  watch: WatchItem[];
}

export interface SearchResult { students: { student: StudentRef; courses: CourseRef[] }[]; courses: CourseRef[] }

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export interface Job {
  id: string; kind: string; status: JobStatus; progress: number; total: number; message?: string | null;
  result?: Record<string, unknown> | null; error?: string | null; ref_type?: string | null; ref_id?: string | null;
  /** What it was started with (a failed exam generation is retried with them). */
  params?: Record<string, unknown> | null;
}
export interface JobRef { job: Job }
export interface Ok { ok: boolean }
