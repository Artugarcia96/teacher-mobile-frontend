import { Books, MagnifyingGlass, ShareNetwork, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useCourses } from '../../api/core';
import { useLibrary, type LibraryItem } from '../../api/library';
import type { MaterialKind } from '../../api/units';
import { typeLabel } from '../../features/materials/MaterialRow';
import { useOpenMaterial } from '../../features/materials/open';
import { isGenerated, MaterialIcon } from '../../features/units/kinds';
import { useToday } from '../../lib/auth';
import { plural, shortDate } from '../../lib/format';
import { Button, Chip, Dot, EmptyState, List, Row, RowIcon, SkeletonList, TextField } from '../../ui';
import './library.css';

const KINDS: { key: string; label: string; kinds?: MaterialKind[] }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'upload', label: 'Archivos', kinds: ['upload'] },
  { key: 'link', label: 'Enlaces', kinds: ['link'] },
  { key: 'notes', label: 'Apuntes', kinds: ['notes', 'summary', 'adapted'] },
  { key: 'slides', label: 'Presentaciones', kinds: ['slides'] },
  { key: 'worksheet', label: 'Fichas', kinds: ['worksheet'] },
];

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** /clases?vista=materiales — everything the teacher has, across classes: search, filter, open. */
export default function LibraryView() {
  const courses = useCourses();
  const today = useToday();
  const open = useOpenMaterial();
  const [q, setQ] = useState('');
  const [courseId, setCourseId] = useState<string | undefined>();
  const [kind, setKind] = useState('all');
  const query = useDebounced(q);
  const kinds = KINDS.find((k) => k.key === kind)?.kinds;
  const lib = useLibrary({ q: query, courseId, kinds });
  const filtered = Boolean(query.trim() || courseId || kinds);
  const clear = () => { setQ(''); setCourseId(undefined); setKind('all'); };

  let body;
  if (lib.isLoading) body = <SkeletonList rows={6} />;
  else if (lib.error) {
    body = <EmptyState icon={<WarningCircle size={24} />} title="No se han podido cargar los materiales" text={(lib.error as Error).message}
      action={<Button variant="tinted" onClick={() => lib.refetch()}>Reintentar</Button>} />;
  } else if (!lib.data?.length) {
    body = filtered ? (
      <div className="paper">
        <EmptyState icon={<MagnifyingGlass size={24} />} title="No hay materiales que coincidan"
          text={query.trim() ? `Nada con «${query.trim()}» en el nombre, la unidad o el texto de tus materiales.` : undefined}
          action={<Button variant="tinted" onClick={clear}>Quitar filtros</Button>} />
      </div>
    ) : (
      <div className="paper">
        <EmptyState icon={<Books size={24} />} title="Aún no tienes materiales"
          text="Sube tus apuntes, presentaciones o fotos del libro en las unidades de cada clase, o créalos con IA. Aquí los verás todos juntos." />
      </div>
    );
  } else {
    body = (
      <>
        <List inset={64}>{lib.data.map((m) => <LibraryRow key={m.id} m={m} today={today} onOpen={() => open(m, m.course.id)} />)}</List>
        <p className="library__count">{plural(lib.data.length, 'material', 'materiales')}</p>
      </>
    );
  }

  return (
    <div className="library">
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <TextField type="search" aria-label="Buscar materiales" placeholder="Buscar por nombre, unidad o contenido" value={q}
          onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
      </form>
      <div className="chip-scroll" role="group" aria-label="Clase">
        <Chip selected={!courseId} onClick={() => setCourseId(undefined)}>Todas las clases</Chip>
        {(courses.data ?? []).map((c) => (
          <Chip key={c.id} selected={courseId === c.id} icon={<Dot color={c.color} />} onClick={() => setCourseId(courseId === c.id ? undefined : c.id)}>
            {c.short || c.subject} · {c.group.name}
          </Chip>
        ))}
      </div>
      <div className="chip-scroll" role="group" aria-label="Tipo">
        {KINDS.map((k) => <Chip key={k.key} selected={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</Chip>)}
      </div>
      {body}
    </div>
  );
}

function LibraryRow({ m, today, onOpen }: { m: LibraryItem; today: string; onOpen: () => void }) {
  const date = m.created_at.slice(0, 10);
  const type = typeLabel(m);
  const meta = [m.course.group.name, m.unit?.title, type, date === today ? 'Hoy' : shortDate(date)].filter(Boolean).join(' · ');
  return (
    <Row onClick={onOpen} chevron={false} wrapSub
      lead={<RowIcon tone={isGenerated(m.kind) ? 'accent' : undefined}>
        <MaterialIcon kind={m.kind} filename={String(m.options?.filename ?? '')} linkKind={m.link_kind} />
      </RowIcon>}
      title={m.title}
      sub={<span className="library__sub">
        <span className="library__meta"><Dot color={m.course.color} /><span>{meta}</span></span>
        {m.snippet && <span className="library__snippet">{m.snippet}</span>}
      </span>}
      trail={m.shared ? <ShareNetwork size={16} aria-label="Compartido con alumnos" className="library__shared" /> : undefined}
    />
  );
}
