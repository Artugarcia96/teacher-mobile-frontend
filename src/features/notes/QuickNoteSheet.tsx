// TODO(slice B): quick observation sheet ("Anotar"). Used from Hoy, Clase and Alumno.
export interface QuickNoteSheetProps {
  open: boolean;
  onClose: () => void;
  /** Preselect a class (limits student chips to its roster). */
  courseId?: string;
  /** Preselect students. */
  studentIds?: string[];
}

export default function QuickNoteSheet(_: QuickNoteSheetProps) {
  return null;
}
