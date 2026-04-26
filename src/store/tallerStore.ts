import { create } from 'zustand';

/** Contexto opcional al abrir el Taller. Sirve para que entradas contextuales
 *  (calendario, tema, clase) prerrelenen campos y orienten el prompt. Todo es
 *  opcional: el Taller sigue funcionando sin contexto. */
export interface TallerContext {
  /** Tipo inicial sugerido ('presentation' | 'textbook' | 'exam' | 'exercise'). */
  defaultType?: 'presentation' | 'textbook' | 'exam' | 'exercise';
  classId?: string;
  subjectId?: string;
  subjectName?: string;
  educationLevel?: string;
  topicName?: string;
  /** Fecha ISO (yyyy-mm-dd) cuando el origen es un día del calendario. */
  date?: string;
  /** Sugerencia de prompt que se pre-rellena en el textarea. */
  promptHint?: string;
  /** Restringe qué tipos se ven en el Taller. 'content' = sólo material
   *  didáctico (Presentación, Libro). 'assessment' = sólo Examen/Ejercicio.
   *  Sin valor = todos los tipos agrupados. */
  limitTo?: 'content' | 'assessment';
  /** Si la generación se origina desde una sesión concreta del calendario,
   *  el material resultante se vincula a ese CalendarEvent. Aparece luego en
   *  el SessionDetail de esa sesión. */
  calendarEventId?: string;
  /** Si la generación se origina desde un tema (Syllabus o sesión con topic),
   *  el material se ata al tema y aparece como material del syllabus. */
  topicId?: string;
}

interface TallerState {
  open: boolean;
  context: TallerContext | null;
  openTaller: (context?: TallerContext) => void;
  closeTaller: () => void;
}

export const useTallerStore = create<TallerState>((set) => ({
  open: false,
  context: null,
  openTaller: (context) => set({ open: true, context: context || null }),
  closeTaller: () => set({ open: false, context: null }),
}));
