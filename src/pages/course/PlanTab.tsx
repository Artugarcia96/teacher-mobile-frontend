// TODO(slice E): implement. Rendered inside CoursePage for tab "programacion".
import type { CourseDetail } from '../../api/types';

export default function PlanTab({ course }: { course: CourseDetail }) {
  return <p className="muted">{course.label}: programacion en construcción.</p>;
}
