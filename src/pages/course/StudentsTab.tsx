import { UserPlus, UsersThree } from '@phosphor-icons/react';
import { useSearchParams } from 'react-router-dom';
import { useCourseStudents, useMe } from '../../api/core';
import type { CourseDetail, StudentRow } from '../../api/types';
import AddStudentsSheet from '../../features/students/AddStudentsSheet';
import { supportLabel } from '../../features/students/support';
import { plural, TERM_LABEL } from '../../lib/format';
import { Avatar, Button, Chip, EmptyState, GradePill, List, Row, Section, SkeletonList } from '../../ui';
import './students-tab.css';

function StudentLine({ s }: { s: StudentRow }) {
  const support = supportLabel(s.support);
  const sub = (support || s.watch.length > 0) ? (
    <span className="roster__tags">
      {support && <Chip tone="info">{support}</Chip>}
      {s.watch.map((w) => <Chip key={w} tone="warn">{w}</Chip>)}
    </span>
  ) : undefined;
  const missed = s.absences + s.lates;
  return (
    <Row to={`/alumnos/${s.id}`} lead={<Avatar initials={s.initials} />} title={s.sort_name} sub={sub}
      trail={<>
        {missed > 0 && <span className="roster__abs num" title={`${plural(s.absences, 'falta', 'faltas')}, ${plural(s.lates, 'retraso', 'retrasos')}`}>
          {s.absences > 0 && `${s.absences} F`}{s.absences > 0 && s.lates > 0 && ' · '}{s.lates > 0 && `${s.lates} R`}
        </span>}
        <GradePill value={s.term_average} />
      </>} />
  );
}

/** Clase › Alumnos: roster sorted by surname. ?anadir=1 opens "Añadir alumnos". */
export default function StudentsTab({ course }: { course: CourseDetail }) {
  const { data, isLoading, error, refetch } = useCourseStudents(course.id);
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const adding = params.get('anadir') === '1';
  const open = () => setParams({ anadir: '1' }, { replace: true });
  const close = () => setParams({}, { replace: true });
  const term = me.data?.school_year.current_term ?? 1;

  let body;
  if (isLoading) body = <SkeletonList rows={8} />;
  else if (error) {
    body = <EmptyState icon={<UsersThree size={26} />} title="No se ha podido cargar la lista" text={(error as Error).message}
      action={<Button variant="tinted" onClick={() => refetch()}>Reintentar</Button>} />;
  } else if (!data?.length) {
    body = (
      <div className="list">
        <EmptyState icon={<UsersThree size={26} />} title="Esta clase aún no tiene alumnos"
          text="Pega la lista desde Séneca, Raíces o una hoja de cálculo. Un alumno por línea."
          action={<Button icon={<UserPlus size={18} />} onClick={open}>Añadir alumnos</Button>} />
      </div>
    );
  } else {
    body = (
      <Section title={plural(data.length, 'alumno', 'alumnos')}
        action={<Button size="sm" variant="tinted" icon={<UserPlus size={16} />} onClick={open}>Añadir alumnos</Button>}
        footer={`Media de la ${TERM_LABEL[term]} y faltas (F) y retrasos (R) del trimestre.`} className="roster">
        <List inset={64}>
          {data.map((s) => <StudentLine key={s.id} s={s} />)}
        </List>
      </Section>
    );
  }

  return (
    <>
      {body}
      <AddStudentsSheet open={adding} onClose={close} course={course} />
    </>
  );
}
