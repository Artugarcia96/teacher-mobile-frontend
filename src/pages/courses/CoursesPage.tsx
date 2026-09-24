import { Books, Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useArchivedCourses, useCourses, usePatchCourse } from '../../api/core';
import type { CourseSummary } from '../../api/types';
import NewCourseSheet from '../../features/course/NewCourseSheet';
import { useAuth, useToday } from '../../lib/auth';
import { plural, relativeDay } from '../../lib/format';
import { Button, Dot, EmptyState, List, Page, Row, Section, SkeletonList, useFeedback } from '../../ui';
import './courses.css';

function nextLabel(c: CourseSummary, today: string, now: string | undefined): string | null {
  const n = c.next_session;
  if (!n) return c.schedule.length ? null : 'Sin horario';
  if (n.date === today && now && n.start <= now && now < n.end) return `En clase ahora, hasta las ${n.end}`;
  return `Próxima: ${relativeDay(n.date, today)}, ${n.start}`;
}

function ArchivedRow({ c }: { c: CourseSummary }) {
  const patch = usePatchCourse(c.id);
  const { toast, confirm } = useFeedback();
  const restore = async () => {
    if (!(await confirm({ title: `Recuperar ${c.label}`, text: 'Vuelve a aparecer en Hoy y en Clases con todas sus notas.', confirm: 'Recuperar' }))) return;
    await patch.mutateAsync({ archived: false });
    toast('Clase recuperada');
  };
  return <Row lead={<Dot color={c.color} large />} title={c.label} sub={plural(c.student_count, 'alumno', 'alumnos')} onClick={restore} chevron={false}
    trail={<span className="courses__restore">Recuperar</span>} muted={patch.isPending} />;
}

/** /clases — the teacher's classes. ?nueva=1 opens the new-class sheet. */
export default function CoursesPage() {
  const { data, isLoading, error, refetch } = useCourses();
  const { me } = useAuth();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const archived = useArchivedCourses(showArchived);
  const creating = params.get('nueva') === '1';

  const openNew = () => setParams({ nueva: '1' });
  const closeNew = () => setParams({}, { replace: true });

  const action = <Button size="sm" variant="tinted" icon={<Plus size={16} weight="bold" />} onClick={openNew}>Nueva clase</Button>;

  let body;
  if (isLoading) body = <SkeletonList rows={4} />;
  else if (error) {
    body = <EmptyState icon={<Books size={26} />} title="No se han podido cargar las clases" text={(error as Error).message}
      action={<Button variant="tinted" onClick={() => refetch()}>Reintentar</Button>} />;
  } else if (!data?.length) {
    body = (
      <div className="list">
        <EmptyState icon={<Books size={26} />} title="Crea tu primera clase"
          text={<ol className="courses__steps">
            <li>Materia y grupo, por ejemplo «Matemáticas · 2º ESO B».</li>
            <li>Pega la lista de alumnos.</li>
            <li>Marca el horario y la verás cada día en Hoy.</li>
          </ol>}
          action={<Button onClick={openNew}>Crear clase</Button>} />
      </div>
    );
  } else {
    body = (
      <List className="courses__list">
        {data.map((c) => {
          const next = nextLabel(c, today, me?.now);
          return (
            <Row key={c.id} to={`/clases/${c.id}`} lead={<Dot color={c.color} large />} title={c.label} wrapSub
              sub={[plural(c.student_count, 'alumno', 'alumnos'), c.room && `Aula ${c.room}`, next].filter(Boolean).join(' · ')} />
          );
        })}
      </List>
    );
  }

  return (
    <Page title="Clases" actions={data?.length ? action : undefined}>
      {body}
      {!isLoading && !error && !!data?.length && (
        <Section>
          {!showArchived ? (
            <div><Button variant="plain" size="sm" onClick={() => setShowArchived(true)}>Ver clases archivadas</Button></div>
          ) : archived.isLoading ? <SkeletonList rows={1} /> : archived.data?.length ? (
            <>
              <div className="section__head"><h2 className="section__title">Archivadas</h2></div>
              <List>{archived.data.map((c) => <ArchivedRow key={c.id} c={c} />)}</List>
            </>
          ) : <p className="muted courses__none">No hay clases archivadas.</p>}
        </Section>
      )}
      <NewCourseSheet open={creating} onClose={closeNew} />
    </Page>
  );
}
