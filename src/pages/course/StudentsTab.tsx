import { UserPlus, UsersThree } from '@phosphor-icons/react';
import { useSearchParams } from 'react-router-dom';
import { useCourseStudents, useMe } from '../../api/core';
import type { CourseDetail, StudentRow } from '../../api/types';
import AddStudentsSheet from '../../features/students/AddStudentsSheet';
import { measureChips, supportFlag } from '../../features/students/support';
import { plural, TERM_LABEL } from '../../lib/format';
import { Button, Chip, EmptyState, GradePill, List, Row, Section, SkeletonList } from '../../ui';
import './students-tab.css';

const MAX_MEASURE_CHIPS = 2;

/** "Apellidos, Nombre", the first "a vigilar" reason in one line, then support measures and absences (from 3); the term
 *  average at the right once the class has grades. A low average is never a reason (backend rule): the red pill says it. */
function StudentLine({ s, average }: { s: StudentRow; average: boolean }) {
  const reason = s.watch[0];
  const measures = measureChips(s.support);
  const shown = measures.slice(0, MAX_MEASURE_CHIPS);
  const flag = measures.length ? null : supportFlag(s.support);
  const absences = s.absences >= 3 && !(reason && /falta/i.test(reason));
  const chips = measures.length > 0 || !!flag || absences;
  const sub = (reason || chips) ? (
    <span className="students-roster__sub">
      {reason && <span className="students-roster__reason">{reason[0].toUpperCase() + reason.slice(1)}</span>}
      {chips && (
        <span className="students-roster__chips">
          {shown.map((m) => <Chip key={m} tone="outline">{m}</Chip>)}
          {measures.length > shown.length && <Chip tone="outline">+{measures.length - shown.length}</Chip>}
          {flag && <Chip tone="info">{flag}</Chip>}
          {absences && <span className="students-roster__abs">{plural(s.absences, 'falta', 'faltas')}</span>}
        </span>
      )}
    </span>
  ) : undefined;
  return <Row to={`/alumnos/${s.id}`} title={s.sort_name} sub={sub} wrapSub trail={average ? <GradePill value={s.term_average} /> : undefined} />;
}

/** Clase › Alumnos: roster sorted by surname. ?anadir=1 opens "Añadir alumnos" (also in the class "···" menu). */
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
    const graded = data.some((s) => s.term_average != null);
    body = (
      <Section title={plural(data.length, 'alumno', 'alumnos')} footer={graded ? `Nota: media de la ${TERM_LABEL[term]}.` : undefined}
        className="students-roster">
        <List>
          {data.map((s) => <StudentLine key={s.id} s={s} average={graded} />)}
          <Row lead={<UserPlus size={18} className="students-roster__add" />} title={<span className="students-roster__add">Añadir alumnos</span>}
            onClick={open} chevron={false} />
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
