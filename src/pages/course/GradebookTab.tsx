// TODO(slice C): implement. Rendered inside CoursePage for tab "cuaderno".
import type { CourseDetail } from '../../api/types';

export default function GradebookTab({ course }: { course: CourseDetail }) {
  return <p className="muted">{course.label}: cuaderno en construcción.</p>;
}
