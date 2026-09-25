import { ClipboardText, DotsThree, GearSix, UserPlus, Warning } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCourse } from '../../api/core';
import TakeAttendanceSheet from '../../features/attendance/TakeAttendanceSheet';
import { CourseMenuProvider, useCourseMenuState } from '../../features/course/CourseMenu';
import CourseSettingsSheet from '../../features/course/CourseSettingsSheet';
import { ApiError } from '../../lib/api';
import { useAuth, useToday } from '../../lib/auth';
import { courseShortLabel, isLive, ordinals, plural, roomLabel, sessionText } from '../../lib/format';
import { Button, Dot, EmptyState, IconButton, Menu, Page, Segmented, SkeletonList, type MenuItem } from '../../ui';
import AttendanceTab from './AttendanceTab';
import GradebookTab from './GradebookTab';
import PlanTab from './PlanTab';
import StudentsTab from './StudentsTab';
import './course-page.css';

/** Short labels so the four tabs fit 390 px; the URL slugs stay stable. */
const TABS = [
  { value: 'cuaderno', label: 'Cuaderno' },
  { value: 'alumnos', label: 'Alumnos' },
  { value: 'programacion', label: 'Temario' },
  { value: 'asistencia', label: 'Faltas' },
] as const;
type Tab = (typeof TABS)[number]['value'];

/** Clase = materia impartida a un grupo. Header: one line of facts + "Pasar lista" while the class is on.
 *  One "···" menu for the whole class: the open tab adds its actions to it (features/course/CourseMenu). */
export default function CoursePage() {
  const { courseId, tab } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const today = useToday();
  const { data: course, isLoading, error, refetch } = useCourse(courseId);
  const menu = useCourseMenuState();
  const [settings, setSettings] = useState(false);
  const [taking, setTaking] = useState(false);
  const current: Tab = (TABS.find((t) => t.value === tab)?.value ?? 'cuaderno') as Tab;

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Page title="Clase" back="/clases" backLabel="Clases" backToOrigin>
        <EmptyState icon={<Warning size={24} />} title={notFound ? 'No se ha encontrado la clase' : 'No se ha podido cargar la clase'}
          text={notFound ? 'Puede que se haya eliminado.' : error.message}
          action={notFound ? <Button variant="tinted" to="/clases">Ir a Clases</Button>
            : <Button variant="tinted" onClick={() => refetch()}>Reintentar</Button>} />
      </Page>
    );
  }
  if (isLoading || !course) {
    return <Page title="" back="/clases" backLabel="Clases" backToOrigin><SkeletonList rows={6} /></Page>;
  }

  const next = course.next_session;
  const now = me?.now;
  // Faltas lists today's session with its own «Pasar lista»: the top bar does not repeat it there.
  const canTake = isLive(next, today, now) && !next?.taken && course.student_count > 0 && current !== 'asistencia';
  const when = next ? sessionText(next, today, now) : course.schedule.length ? null : 'Sin horario';
  // The session may be in another room than the class's usual one ("Lab. 1").
  const room = next?.room ?? course.room;
  const where = room && roomLabel(room);
  const facts = [plural(course.student_count, 'alumno', 'alumnos'), where, when].filter(Boolean).join(' · ');

  const items: MenuItem[] = [
    ...menu.items,
    { label: 'Añadir alumnos', icon: <UserPlus size={18} />, separatorBefore: menu.items.length > 0,
      onSelect: () => navigate(`/clases/${course.id}/alumnos?anadir=1`, { replace: true }) },
    { label: 'Ajustes de la clase', icon: <GearSix size={18} />, onSelect: () => setSettings(true) },
  ];

  return (
    <CourseMenuProvider register={menu.register}>
      <Page
        title={ordinals(course.group.name)}
        back="/clases"
        backLabel="Clases"
        backToOrigin
        eyebrow={<><Dot color={course.color} large /><span className="eyebrow course-eyebrow">{course.subject}</span></>}
        subtitle={<span className="course-facts">{facts}</span>}
        actions={<>
          {canTake && (
            <Button size="sm" icon={<ClipboardText size={16} />} onClick={() => setTaking(true)}>Pasar lista</Button>
          )}
          <Menu
            trigger={(open) => <IconButton label="Más opciones de la clase" glass onClick={open}><DotsThree size={22} weight="bold" /></IconButton>}
            items={items}
          />
        </>}
        toolbar={
          <div className="course-tabs">
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
        {taking && next && (
          <TakeAttendanceSheet open onClose={() => setTaking(false)} courseId={course.id} date={next.date} start={next.start}
            label={courseShortLabel(course)} />
        )}
      </Page>
    </CourseMenuProvider>
  );
}
