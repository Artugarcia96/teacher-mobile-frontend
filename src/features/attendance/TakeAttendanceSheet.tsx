// TODO(slice B): "Pasar lista" sheet. Used from Hoy and the class Asistencia tab.
export interface TakeAttendanceSheetProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  date: string;
  start: string;
  /** Header label, e.g. "Matemáticas · 2º ESO B · 10:20". */
  label?: string;
}

export default function TakeAttendanceSheet(_: TakeAttendanceSheetProps) {
  return null;
}
