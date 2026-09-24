import { DotsThree, GearSix } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCourse } from '../../api/core';
import CourseSettingsSheet from '../../features/course/CourseSettingsSheet';
import { longDate } from '../../lib/format';
import { Dot, EmptyState, IconButton, Menu, Page, Segmented, SkeletonList } from '../../ui';
import AttendanceTab from './AttendanceTab';
import GradebookTab from './GradebookTab';
import PlanTab from './PlanTab';
import StudentsTab from './StudentsTab';

const TABS = [
  { value: 'cuaderno', label: 'Cuaderno' },
  { value: 'alumnos', label: 'Alumnos' },
  { value: 'programacion', label: 'Programación' },
  { value: 'asistencia', label: 'Asistencia' },
] as const;
type Tab = (typeof TABS)[number]['value'];

/** Clase = materia impartida a un grupo. Four tabs; settings behind the ⋯ menu. */
export default function CoursePage() {
  const { courseId, tab } = useParams();
  const navigate = useNavigate();
  const { data: course, isLoading, error } = useCourse(courseId);
  const [settings, setSettings] = useState(false);
  const current: Tab = (TABS.find((t) => t.value === tab)?.value ?? 'cuaderno') as Tab;

  if (error) {
    return <Page title="Clase" back="/clases" backLabel="Clases"><EmptyState icon={<GearSix size={24} />} title="No se ha encontrado la clase" /></Page>;
  }
  if (isLoading || !course) {
    return <Page title="" back="/clases" backLabel="Clases"><SkeletonList rows={6} /></Page>;
  }

  const next = course.next_session;
  return (
    <Page
      title={course.group.name}
      back="/clases"
      backLabel="Clases"
      eyebrow={<><Dot color={course.color} large /><span className="eyebrow" style={{ color: 'var(--ink)' }}>{course.subject}</span></>}
      subtitle={<>
        <span>{course.student_count} alumnos</span>
        {course.room && <span>Aula {course.room}</span>}
        {next && <span>Próxima: {longDate(next.date)}, {next.start}</span>}
      </>}
      actions={
        <Menu
          trigger={(open) => <IconButton label="Más opciones" glass onClick={open}><DotsThree size={22} weight="bold" /></IconButton>}
          items={[{ label: 'Ajustes de la clase', icon: <GearSix size={18} />, onSelect: () => setSettings(true) }]}
        />
      }
      toolbar={
        <div style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
          <Segmented label="Secciones de la clase" value={current} options={TABS.map((t) => ({ ...t }))}
            onChange={(v) => navigate(`/clases/${course.id}/${v}`, { replace: true })} />
        </div>
      }
      wide={current === 'cuaderno'}
    >
      {current === 'cuaderno' && <GradebookTab course={course} />}
      {current === 'alumnos' && <StudentsTab course={course} />}
      {current === 'programacion' && <PlanTab course={course} />}
      {current === 'asistencia' && <AttendanceTab course={course} />}
      <CourseSettingsSheet open={settings} onClose={() => setSettings(false)} course={course} />
    </Page>
  );
}
