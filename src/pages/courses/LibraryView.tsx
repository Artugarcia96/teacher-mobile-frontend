import { ArrowSquareOut, Books, CopySimple, DotsThree, MagnifyingGlass, ShareNetwork, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useArchivedCourses, useCourses } from '../../api/core';
import { useLibrary, type LibraryItem } from '../../api/library';
import type { MaterialKind } from '../../api/units';
import { readingStatus, typeLabel } from '../../features/materials/MaterialRow';
import PlaceMaterialSheet from '../../features/materials/PlaceMaterialSheet';
import { useOpenMaterial } from '../../features/materials/open';
import { isDraft, isGenerated, kindLabel, MaterialIcon, shortTitle } from '../../features/units/kinds';
import { useToday } from '../../lib/auth';
import { courseShortLabel, plural, shortDate } from '../../lib/format';
import { AIBadge, Button, Chip, Dot, EmptyState, IconButton, List, Menu, Row, RowIcon, SearchField, SkeletonList } from '../../ui';
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

/** /clases?vista=materiales — everything the teacher has, across classes: search, filter, open. The search and the
 *  filters live in the address (&q=, &clase=, &tipo=), so they are still there after opening a material and going back. */
export default function LibraryView() {
  const courses = useCourses();
  const archived = useArchivedCourses(true);
  const today = useToday();
  const open = useOpenMaterial();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const courseId = params.get('clase') ?? undefined;
  const kind = KINDS.some((k) => k.key === params.get('tipo')) ? params.get('tipo')! : 'all';
  const set = (key: string, value: string | undefined) => setParams((p) => {
    if (value) p.set(key, value);
    else p.delete(key);
    return p;
  }, { replace: true });
  const query = useDebounced(q);
  const kinds = KINDS.find((k) => k.key === kind)?.kinds;
  const lib = useLibrary({ q: query, courseId, kinds });
  const filtered = Boolean(query.trim() || courseId || kinds);
  const clear = () => setParams({ vista: 'materiales' }, { replace: true });
  const classes = [...(courses.data ?? []), ...(archived.data ?? [])];
  const [reusing, setReusing] = useState<LibraryItem | null>(null);
  const archivedIds = new Set((archived.data ?? []).map((c) => c.id));

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
        <List inset={64}>
          {lib.data.map((m) => <LibraryRow key={m.id} m={m} archived={archivedIds.has(m.course.id)} today={today} onOpen={() => open(m, m.course.id)} onReuse={() => setReusing(m)} />)}
        </List>
        <p className="library__count">{plural(lib.data.length, 'material', 'materiales')}</p>
      </>
    );
  }

  return (
    <div className="library">
      <SearchField label="Buscar materiales" placeholder="Buscar por nombre, unidad o contenido" value={q} onChange={(v) => set('q', v)} />
      <div className="chip-scroll" role="group" aria-label="Clase">
        <Chip selected={!courseId} onClick={() => set('clase', undefined)}>Todas las clases</Chip>
        {classes.map((c) => (
          <Chip key={c.id} selected={courseId === c.id} icon={<Dot color={c.color} />} onClick={() => set('clase', courseId === c.id ? undefined : c.id)}>
            {courseShortLabel(c)}{c.archived ? ' (archivada)' : ''}
          </Chip>
        ))}
      </div>
      <div className="chip-scroll" role="group" aria-label="Tipo">
        {KINDS.map((k) => <Chip key={k.key} selected={kind === k.key} onClick={() => set('tipo', k.key === 'all' ? undefined : k.key)}>{k.label}</Chip>)}
      </div>
      {body}
      {reusing && (
        <PlaceMaterialSheet material={reusing} mode="copy" courseId={reusing.course.id} unitTitle={reusing.unit?.title ?? ''}
          onClose={() => setReusing(null)} />
      )}
    </div>
  );
}

/** One material of any class: opens on tap; «Usar en otra clase…» also from archived classes. */
function LibraryRow({ m, archived, today, onOpen, onReuse }: {
  m: LibraryItem; archived: boolean; today: string; onOpen: () => void; onReuse: () => void;
}) {
  const date = m.created_at.slice(0, 10);
  const type = typeLabel(m);
  const reading = readingStatus(m);
  // «Apuntes · El átomo» across 30 units: the unit is what tells them apart, so it goes first (the kind in the sub)
  const short = shortTitle(m.title, m.unit?.title);
  const label = kindLabel(m);
  const byUnit = isGenerated(m.kind) && !!m.unit && short.startsWith(label);
  const title = byUnit ? `${m.unit!.title}${short.slice(label.length)}` : short;
  const meta = [byUnit ? label : '', courseShortLabel(m.course) + (archived ? ' (archivada)' : ''), byUnit ? '' : m.unit?.title, type,
    date === today ? 'Hoy' : shortDate(date)].filter(Boolean).join(' · ');
  return (
    <div className="mrow">
      <Row onClick={onOpen} chevron={false} wrapSub
        lead={<RowIcon tone={isGenerated(m.kind) ? 'accent' : undefined}>
          <MaterialIcon kind={m.kind} filename={String(m.options?.filename ?? '')} linkKind={m.link_kind} />
        </RowIcon>}
        title={title}
        sub={<span className="library__sub">
          <span className="library__meta"><Dot color={m.course.color} /><span>{meta}</span></span>
          {(reading || isDraft(m) || m.status === 'generating') && (
            <span className="mrow__sub">
              {m.status === 'generating' && <span className="mrow__reading">Creando…</span>}
              {reading && <span className={reading.className}>{reading.text}</span>}
              {isDraft(m) && <AIBadge />}
            </span>
          )}
          {m.snippet && <span className="library__snippet">{m.snippet}</span>}
        </span>}
        trail={<span className="library__trail">
          {m.shared && <ShareNetwork size={16} aria-label="Compartido con alumnos" className="library__shared" />}
          <span className="mrow__gap" />
        </span>}
      />
      <div className="mrow__menu">
        <Menu trigger={(o) => <IconButton label={`Opciones de ${title}`} onClick={o}><DotsThree size={20} weight="bold" /></IconButton>} items={[
          { label: 'Abrir', icon: <ArrowSquareOut size={18} />, onSelect: onOpen },
          { label: 'Usar en otra clase…', icon: <CopySimple size={18} />, onSelect: onReuse, disabledReason: m.status !== 'ready' ? 'Aún no está listo' : undefined },
        ]} />
      </div>
    </div>
  );
}
