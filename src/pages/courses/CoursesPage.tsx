import { Books, CaretDown, Plus } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useArchivedCourses, useCourses, usePatchCourse } from '../../api/core';
import { useDay } from '../../api/today';
import type { CourseSummary } from '../../api/types';
import NewCourseSheet from '../../features/course/NewCourseSheet';
import { SearchResults, useEnterOpensFirst } from '../../features/students/StudentSearch';
import { useAuth, useToday } from '../../lib/auth';
import { courseLabel, plural, sessionText } from '../../lib/format';
import { Button, Chip, Dot, EmptyState, List, Page, Row, SearchField, Segmented, SkeletonList, useFeedback } from '../../ui';
import LibraryView from './LibraryView';
import './courses.css';

interface Pending { lists: number; review: number }

function ArchivedRow({ c }: { c: CourseSummary }) {
  const patch = usePatchCourse(c.id);
  const { toast, confirm } = useFeedback();
  const restore = async () => {
    if (!(await confirm({ title: `Recuperar ${courseLabel(c)}`, text: 'Vuelve a aparecer en Hoy y en Clases con todas sus notas.', confirm: 'Recuperar' }))) return;
    try {
      await patch.mutateAsync({ archived: false });
      toast('Clase recuperada');
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };
  return <Row lead={<Dot color={c.color} large />} title={courseLabel(c)} sub={plural(c.student_count, 'alumno', 'alumnos')} onClick={restore}
    chevron={false} trail={<span className="courses__restore">Recuperar</span>} muted={patch.isPending} />;
}

/** Subtle last row: archived classes load and unfold on demand (same on phone and desktop). */
function Archived() {
  const [open, setOpen] = useState(false);
  const archived = useArchivedCourses(open);
  return (
    <List className="courses__archive">
      <Row title={<span className="courses__archive-title">Clases archivadas</span>} onClick={() => setOpen(!open)} chevron={false}
        aria-label={open ? 'Ocultar clases archivadas' : 'Ver clases archivadas'}
        trail={<CaretDown size={14} className={open ? 'courses__caret courses__caret--up' : 'courses__caret'} />} />
      {open && (archived.isLoading ? <Row title={<span className="faint">Cargando…</span>} />
        : archived.error ? <Row title={<span className="faint">No se han podido cargar.</span>} />
          : archived.data?.length ? archived.data.map((c) => <ArchivedRow key={c.id} c={c} />)
            : <Row title={<span className="faint">No hay clases archivadas.</span>} />)}
    </List>
  );
}

/** Pending work per class, from Hoy's "Pendiente" (same counts as there). */
function usePending(today: string, enabled: boolean): Map<string, Pending> {
  const day = useDay(enabled ? today : '');
  return useMemo(() => {
    const m = new Map<string, Pending>();
    for (const p of day.data?.pending ?? []) {
      if (!p.course_id) continue;
      const cur = m.get(p.course_id) ?? { lists: 0, review: 0 };
      if (p.kind === 'attendance') cur.lists += 1;
      if (p.kind === 'review') cur.review += p.count;
      m.set(p.course_id, cur);
    }
    return m;
  }, [day.data]);
}

/** The search box of Clases, kept in the address (?q=) so that opening a result and coming back finds it again. The box
 *  holds what is typed and writes it to the address at every key, without reading it back (the address lags a render
 *  behind: letters typed fast were lost); a change of the address from elsewhere (a link, «Nueva clase») reaches it. */
function useAddressSearch(): [string, (q: string) => void] {
  const [params, setParams] = useSearchParams();
  const inAddress = params.get('q') ?? '';
  const [q, setQ] = useState(inAddress);
  const written = useRef<string[]>([]); // what the box wrote and the address has not shown yet
  useEffect(() => {
    const i = written.current.lastIndexOf(inAddress);
    if (i >= 0) written.current = written.current.slice(i + 1);
    else {
      written.current = [];
      setQ(inAddress);
    }
  }, [inAddress]);
  const change = (v: string) => {
    setQ(v);
    written.current.push(v);
    setParams((p) => { if (v) p.set('q', v); else p.delete('q'); return p; }, { replace: true });
  };
  return [q, change];
}

/** /clases — search (students and classes, ?q=), the classes, archived ones last; or (?vista=materiales) all the
 * teacher's materials. ?nueva=1 opens the new-class sheet. */
export default function CoursesPage() {
  const { data, isLoading, error, refetch } = useCourses();
  const { me } = useAuth();
  const today = useToday();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useAddressSearch();
  const onSearchKey = useEnterOpensFirst(q, navigate);
  const creating = params.get('nueva') === '1';
  const pending = usePending(today, !!data?.length);
  // With no active class, the archived ones are still there to recover («puedes recuperarla desde Clases»).
  const archivedOnly = useArchivedCourses(data?.length === 0);
  const view = params.get('vista') === 'materiales' ? 'materials' : 'classes';

  const openNew = () => setParams({ nueva: '1' });
  const closeNew = () => setParams({}, { replace: true });
  const toolbar = (
    <div className="courses__views">
      <Segmented full label="Vista" value={view} onChange={(v) => setParams(v === 'materials' ? { vista: 'materiales' } : {}, { replace: true })}
        options={[{ value: 'classes', label: 'Clases' }, { value: 'materials', label: 'Materiales' }]} />
    </div>
  );

  if (view === 'materials') {
    return <Page title="Materiales" toolbar={toolbar}><LibraryView /></Page>;
  }

  let body;
  if (isLoading) body = <SkeletonList rows={4} />;
  else if (error) {
    body = <EmptyState icon={<Books size={26} />} title="No se han podido cargar las clases" text={(error as Error).message}
      action={<Button variant="tinted" onClick={() => refetch()}>Reintentar</Button>} />;
  } else if (!data?.length) {
    body = (
      <>
        <div className="list">
          <EmptyState icon={<Books size={26} />} title="Crea tu primera clase"
            text={<ol className="courses__steps">
              <li>Materia y grupo, por ejemplo «Matemáticas · 2.º ESO B».</li>
              <li>Pega la lista de alumnos.</li>
              <li>Marca el horario y la verás cada día en Hoy.</li>
            </ol>}
            action={<Button onClick={openNew}>Crear clase</Button>} />
        </div>
        {!!archivedOnly.data?.length && <Archived />}
      </>
    );
  } else if (q.trim()) {
    body = <SearchResults q={q} onOpen={navigate} />;
  } else {
    body = (
      <>
        <List className="courses__list">
          {data.map((c) => {
            const p = pending.get(c.id);
            const facts = [plural(c.student_count, 'alumno', 'alumnos'), c.next_session ? sessionText(c.next_session, today, me?.now)
              : c.schedule.length ? null : 'Sin horario'].filter(Boolean).join(' · ');
            return (
              <Row key={c.id} to={`/clases/${c.id}`} lead={<Dot color={c.color} large />} title={courseLabel(c)} wrapSub
                sub={<>
                  <span className="courses__facts">{facts}</span>
                  {p && (p.lists > 0 || p.review > 0) && (
                    <span className="courses__pending">
                      {p.lists > 0 && <Chip tone="warn">{plural(p.lists, 'lista sin pasar', 'listas sin pasar')}</Chip>}
                      {p.review > 0 && <Chip>{p.review} por revisar</Chip>}
                    </span>
                  )}
                </>} />
            );
          })}
        </List>
        <Archived />
      </>
    );
  }

  return (
    <Page title="Clases" toolbar={toolbar}
      actions={data?.length ? <Button size="sm" variant="plain" icon={<Plus size={16} weight="bold" />} onClick={openNew}>Nueva clase</Button> : undefined}>
      {!!data?.length && (
        <div className="courses__search">
          <SearchField value={q} onChange={setQ} placeholder="Buscar alumno o clase" label="Buscar alumno o clase" onKeyDown={onSearchKey} />
        </div>
      )}
      {body}
      <NewCourseSheet open={creating} onClose={closeNew} />
    </Page>
  );
}
