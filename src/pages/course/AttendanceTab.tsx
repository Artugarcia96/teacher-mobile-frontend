// TODO(slice B): implement. Rendered inside CoursePage for tab "asistencia".
import type { CourseDetail } from '../../api/types';

export default function AttendanceTab({ course }: { course: CourseDetail }) {
  return <p className="muted">{course.label}: asistencia en construcción.</p>;
}
