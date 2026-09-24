// TODO(slice A): implement. Rendered inside CoursePage for tab "alumnos".
import type { CourseDetail } from '../../api/types';

export default function StudentsTab({ course }: { course: CourseDetail }) {
  return <p className="muted">{course.label}: alumnos en construcción.</p>;
}
