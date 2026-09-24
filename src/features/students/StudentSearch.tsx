/** Buscador de alumnos y clases: resultados (Clases, en móvil) y hoja con atajo "/" o Ctrl+K (escritorio). */
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearch } from '../../api/core';
import type { CourseRef, SearchResult } from '../../api/types';
import { courseLabel, ordinals } from '../../lib/format';
import { Callout, Dot, EmptyState, List, Row, SearchField, Section, Sheet, SkeletonList } from '../../ui';
import { supportFlag } from './support';

/** "2.º ESO B · Mates, FyQ" — where the student is. */
function whereText(courses: CourseRef[]): string {
  const groups = new Map<string, string[]>();
  for (const c of courses) groups.set(ordinals(c.group.name), [...(groups.get(ordinals(c.group.name)) ?? []), c.short || c.subject]);
  return [...groups].map(([g, subjects]) => `${g} · ${subjects.join(', ')}`).join(' · ') || 'Sin clase';
}

/** First result's path (Enter in the search box opens it). */
export function firstResultPath(r: SearchResult | undefined): string | null {
  if (r?.students.length) return `/alumnos/${r.students[0].student.id}`;
  if (r?.courses.length) return `/clases/${r.courses[0].id}`;
  return null;
}

/** Results for `q`. `onOpen` navigates (and closes the sheet, if any). */
export function SearchResults({ q, onOpen }: { q: string; onOpen: (path: string) => void }) {
  const { data, isLoading, error } = useSearch(q);
  if (!q.trim()) return null;
  if (isLoading && !data) return <SkeletonList rows={3} />;
  if (error) return <Callout tone="warn"><b>No se ha podido buscar.</b> {(error as Error).message}</Callout>;
  if (!data?.students.length && !data?.courses.length) {
    return (
      <div className="list">
        <EmptyState icon={<MagnifyingGlass size={24} />} title="Sin resultados"
          text={`No hay alumnos ni clases que coincidan con «${q.trim()}». Prueba con el apellido o el grupo («2 ESO B»).`} />
      </div>
    );
  }
  return (
    <>
      {data.students.length > 0 && (
        <Section title="Alumnos">
          <List>
            {data.students.map(({ student, courses }) => {
              const flag = supportFlag(student.support);
              return (
                <Row key={student.id} title={student.sort_name} onClick={() => onOpen(`/alumnos/${student.id}`)}
                  sub={flag ? `${whereText(courses)} · ${flag}` : whereText(courses)} />
              );
            })}
          </List>
        </Section>
      )}
      {data.courses.length > 0 && (
        <Section title="Clases">
          <List>
            {data.courses.map((c) => (
              <Row key={c.id} lead={<Dot color={c.color} large />} title={courseLabel(c)} onClick={() => onOpen(`/clases/${c.id}`)} />
            ))}
          </List>
        </Section>
      )}
    </>
  );
}

/** Search sheet (desktop shortcut "/" or Ctrl+K, sidebar "Buscar"). Enter opens the first result. */
export function SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <SearchSheetBody onClose={onClose} />;
}

function SearchSheetBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { data, isPlaceholderData } = useSearch(q);
  const go = (path: string) => { onClose(); navigate(path); };
  return (
    <Sheet open onClose={onClose} title="Buscar" size="large">
      <div className="search-sheet">
        <SearchField value={q} onChange={setQ} placeholder="Alumno o clase" label="Buscar alumno o clase" autoFocus
          onKeyDown={(e) => {
            const path = e.key === 'Enter' && !isPlaceholderData ? firstResultPath(data) : null;
            if (path) go(path);
          }} />
        {q.trim()
          ? <SearchResults q={q} onOpen={go} />
          : <p className="muted search-sheet__hint">Escribe el nombre o el apellido (sin tildes también vale) o el grupo, como «2 ESO B».</p>}
      </div>
    </Sheet>
  );
}
