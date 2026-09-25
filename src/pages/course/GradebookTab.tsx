import { ArrowRight, Exam, FileCsv, PencilSimple, Plus, Scales, Student, UserMinus, Warning } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ActivityBrief, GradeInput } from '../../api/activities';
import { useGradebook, useSaveCell, useUnsavedCells, type Gradebook, type GradebookActivity, type GradebookRow, type GradeCell } from '../../api/gradebook';
import type { CourseDetail } from '../../api/types';
import { useCourseMenu } from '../../features/course/CourseMenu';
import EditActivitySheet from '../../features/activities/EditActivitySheet';
import ExamAbsencesSheet from '../../features/activities/ExamAbsencesSheet';
import NewActivitySheet from '../../features/activities/NewActivitySheet';
import { KindIcon } from '../../features/activities/kinds';
import { download } from '../../lib/api';
import { useAuth, useToday } from '../../lib/auth';
import { exportCsvLabel, formatAverage, formatNumber, formatProposal, formatScore, parseGradeInput, plural, shortDate, TERM_LABEL, TERM_SHORT } from '../../lib/format';
import {
  AIBadge, Button, Callout, EmptyState, Grade, GradePill, IconButton, List, Row, RowIcon, Segmented, Sheet, SkeletonList, useFeedback,
} from '../../ui';
import WeightsSheet from './WeightsSheet';
import './GradebookTab.css';

const TERMS = [1, 2, 3, 4].map((t) => ({ value: t, label: TERM_SHORT[t] }));
type Pos = { r: number; c: number };

/** Cuaderno: alumnos × actividades of one evaluación. Tap a cell to type; Enter/↓ next student, Tab next column. */
export default function GradebookTab({ course }: { course: CourseDetail }) {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const term = Number(params.get('term')) || me?.school_year.current_term || 1;
  const gb = useGradebook(course.id, term);
  const [newOpen, setNewOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [absencesId, setAbsencesId] = useState<string | null>(null);
  const [weights, setWeights] = useState(false);
  const [focus, setFocus] = useState<{ id: string; edit: boolean } | null>(() => (params.get('a') ? { id: params.get('a')!, edit: false } : null));
  const { toast } = useFeedback();
  const navigate = useNavigate();

  const setTerm = (t: number) => setParams((p) => { p.set('term', String(t)); p.delete('a'); return p; }, { replace: true });

  const exportCsv = () =>
    download(`/courses/${course.id}/gradebook.csv?term=${term}`, `Cuaderno ${course.subject} ${course.group.name} ${TERM_LABEL[term]}.csv`)
      .then(() => toast('CSV descargado'))
      .catch((e: Error) => toast(e.message, { tone: 'error' }));

  const evaluate = term === 4 ? 'Evaluación final' : `Evaluar la ${TERM_SHORT[term]}`;
  useCourseMenu([
    { label: evaluate, icon: <ArrowRight size={18} />, onSelect: () => navigate(`/clases/${course.id}/evaluacion/${term}`) },
    { label: exportCsvLabel(me?.region), icon: <FileCsv size={18} />, onSelect: exportCsv },
    { label: 'Ponderaciones', icon: <Scales size={18} />, onSelect: () => setWeights(true) },
  ]);

  const onCreated = (a: ActivityBrief) => {
    const shownIn = a.counts_for === 'recovery' && a.recovers_term ? a.recovers_term : a.term;
    if (shownIn !== term) setTerm(shownIn);
    setFocus({ id: a.id, edit: true });
  };

  const data = gb.data?.term === term ? gb.data : undefined;
  return (
    <>
      <div className="gb-toolbar">
        <Segmented label="Evaluación" value={term} options={TERMS} onChange={setTerm} />
        <Button size="sm" variant="tinted" icon={<Plus size={16} weight="bold" />} onClick={() => setNewOpen(true)}>Actividad</Button>
      </div>

      {gb.error && !data ? (
        <Callout tone="warn">
          <b>No se ha podido cargar el cuaderno.</b> {gb.error.message}{' '}
          <Button size="sm" variant="plain" onClick={() => gb.refetch()}>Reintentar</Button>
        </Callout>
      ) : !data ? (
        <SkeletonList rows={8} />
      ) : !data.students.length ? (
        <EmptyState icon={<Student size={24} />} title="Esta clase aún no tiene alumnos"
          action={<Button to={`/clases/${course.id}/alumnos`}>Añadir alumnos</Button>} />
      ) : term !== 4 && !data.activities.length ? (
        <EmptyState icon={<Exam size={24} />} title={`Aún no hay actividades en la ${TERM_LABEL[term]}`}
          text="Crea un examen, una ficha o cualquier cosa que quieras calificar."
          action={<Button icon={<Plus size={18} weight="bold" />} onClick={() => setNewOpen(true)}>Añadir actividad</Button>} />
      ) : (
        <>
          <PendingWork course={course} data={data} onAbsences={setAbsencesId} />
          <Grid course={course} data={data} focus={focus} onFocusDone={() => setFocus(null)} onEdit={setEditId} />
        </>
      )}

      <NewActivitySheet open={newOpen} onClose={() => setNewOpen(false)} course={course} onCreated={onCreated} />
      <EditActivitySheet activityId={editId} onClose={() => setEditId(null)} course={course} />
      <ExamAbsencesSheet activityId={absencesId} onClose={() => setAbsencesId(null)} course={course} />
      <WeightsSheet open={weights} onClose={() => setWeights(false)} course={course} />
    </>
  );
}

// ── What is waiting in this term: AI drafts to review, students who missed an exam, attendance conflicts ──
interface Pending { key: string; lead: ReactNode; title: string; sub: string; to?: string; onClick?: () => void }

/** One row per column that needs something while they are few (one on phones, two on desktop); beyond that one summary
 * row ("18 por revisar" · "2 faltas en exámenes") that opens them in a sheet, so the grid keeps the screen.
 * A scheduled repesca needs nothing until its date: not listed. */
function PendingWork({ course, data, onAbsences }: { course: CourseDetail; data: Gradebook; onAbsences: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const missedNames = (a: GradebookActivity) => data.students
    .filter((r) => r.grades[a.id]?.status === 'pending_absent' && !r.grades[a.id]?.activity_id)
    .map((r) => r.student.sort_name);
  const items: Pending[] = [];
  let drafts = 0; let missed = 0; let conflicts = 0;
  for (const a of data.activities) {
    if (a.suggested > 0) {
      drafts += a.suggested;
      items.push({ key: `d-${a.id}`, lead: <AIBadge />, to: `/clases/${course.id}/actividades/${a.id}`,
        title: `${a.suggested} por revisar`, sub: `${a.title} · no cuentan en la media hasta que los revises` });
    }
    const names = missedNames(a);
    if (names.length) {
      missed += names.length;
      const who = `${names.slice(0, 3).join(' · ')}${names.length > 3 ? ` y ${names.length - 3} más` : ''}`;
      items.push({ key: `m-${a.id}`, lead: <RowIcon tone="warn"><UserMinus size={18} /></RowIcon>, onClick: () => onAbsences(a.id),
        title: `${names.length === 1 ? 'Faltó 1 alumno' : `Faltaron ${names.length} alumnos`} a ${a.short_title}`,
        sub: `${who} · programar repesca o poner NP` });
    }
    if (a.attendance_conflicts > 0) {
      conflicts += a.attendance_conflicts;
      items.push({ key: `c-${a.id}`, lead: <RowIcon tone="warn"><Warning size={18} /></RowIcon>, onClick: () => onAbsences(a.id),
        title: `${a.short_title}: ${a.attendance_conflicts === 1 ? 'ausente con nota' : `${a.attendance_conflicts} ausentes con nota`}`,
        sub: `¿Hoja mal asignada o lista mal pasada? ${a.attendance_conflicts === 1 ? 'Figura como ausente y tiene' : 'Figuran como ausentes y tienen'} hoja o nota` });
    }
  }
  if (!items.length) return null;
  const rows = (close?: () => void) => items.map((it) => (
    <Row key={it.key} lead={it.lead} title={it.title} sub={it.sub} wrapSub to={it.to}
      onClick={it.onClick && (() => { close?.(); it.onClick!(); })} />
  ));
  const parts = [
    drafts > 0 && `${drafts} por revisar`,
    missed > 0 && `${plural(missed, 'falta', 'faltas')} en exámenes`,
    conflicts > 0 && plural(conflicts, 'aviso de lista', 'avisos de lista'),
  ].filter((p): p is string => !!p);
  const summary = parts.join(' · ');
  const title = parts[0][0].toUpperCase() + parts[0].slice(1);
  const compact = items.length > 2 ? 'gb-pending--compact gb-pending--compact-all' : 'gb-pending--compact';
  return (
    <>
      {items.length <= 2 && <List className={`gb-pending${items.length > 1 ? ' gb-pending--full' : ''}`}>{rows()}</List>}
      {items.length > 1 && (
        <>
          <List className={`gb-pending ${compact}`}>
            <Row lead={drafts > 0 ? <AIBadge /> : <RowIcon tone="warn"><UserMinus size={18} /></RowIcon>} title={title}
              sub={parts.slice(1).join(' · ') || undefined} onClick={() => setOpen(true)} aria-label={`Pendiente en esta evaluación: ${summary}`} />
          </List>
          <Sheet open={open} onClose={() => setOpen(false)} title="Pendiente en esta evaluación" subtitle={summary}>
            <List>{rows(() => setOpen(false))}</List>
          </Sheet>
        </>
      )}
    </>
  );
}

// ── Grid ─────────────────────────────────────────────────────────────────────
function cellText(cell: GradeCell | undefined): string {
  if (!cell) return '';
  if (cell.status === 'absent') return 'NP';
  if (cell.score == null) return '';
  return formatScore(cell.score);
}

function cellLabel(cell: GradeCell | undefined, calculated: boolean): string {
  if (!cell || cell.status === 'empty') return 'sin nota';
  if (cell.status === 'pending_absent') {
    return `faltó al examen${cell.absence === 'justified' ? ' (falta justificada)' : ''}, ${cell.activity_id ? 'repesca programada' : 'pendiente'}`;
  }
  if (cell.status === 'absent') return 'no presentado';
  if (cell.status === 'exempt') return 'exento';
  const n = formatScore(cell.score);
  if (cell.status === 'suggested') return calculated ? `${n}, calculada con los deberes, sin confirmar` : `${n}, borrador de la IA sin revisar`;
  return cell.repeat ? `${n}, nota de la repesca` : n;
}

function Grid({ course, data, focus, onFocusDone, onEdit }: {
  course: CourseDetail; data: Gradebook; focus: { id: string; edit: boolean } | null; onFocusDone: () => void; onEdit: (id: string) => void;
}) {
  const today = useToday();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const save = useSaveCell(course.id);
  const unsaved = useUnsavedCells(course.id);
  const [editing, setEditingState] = useState<Pos | null>(null);
  const editingRef = useRef<Pos | null>(null);
  const [draft, setDraft] = useState('');
  const [avgRow, setAvgRow] = useState<GradebookRow | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const final = data.term === 4;
  const acts = data.activities;
  const rows = data.students;
  const inScope = (r: number, c: number) => { const ids = acts[c]?.student_ids; return !ids || ids.includes(rows[r]?.student.id); };

  const setEditing = useCallback((p: Pos | null) => {
    editingRef.current = p;
    setEditingState(p);
    if (p) setDraft(cellText(rows[p.r]?.grades[acts[p.c]?.id]));
  }, [rows, acts]);

  // "There is more to the right": fade the edge next to the sticky average column.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [acts.length]);

  // Scroll to a column (created now or linked from Evaluar) and optionally start typing in it.
  useEffect(() => {
    if (!focus) return;
    const c = acts.findIndex((a) => a.id === focus.id);
    if (c < 0) return;
    const th = scroller.current?.querySelector<HTMLElement>(`[data-col="${focus.id}"]`);
    th?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    setFlash(focus.id);
    if (focus.edit) {
      const r = rows.findIndex((_, i) => inScope(i, c));
      if (r >= 0) setEditing({ r, c });
    }
    onFocusDone();
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, acts, onFocusDone, setEditing]);

  const commit = (pos: Pos, next: Pos | null, raw = draft) => {
    const row = rows[pos.r];
    const act = acts[pos.c];
    const cell = row.grades[act.id];
    const parsed = parseGradeInput(raw);
    const max = formatNumber(act.max_score, 2);
    if (parsed === undefined || (typeof parsed === 'number' && (parsed < 0 || parsed > act.max_score))) {
      toast(`Escribe una nota de 0 a ${max} o NP`, { tone: 'error' });
      return;
    }
    const target = cell?.activity_id ?? act.id;
    const via = cell?.activity_id ? { activity_id: cell.activity_id, repeat: true } : {};
    let grade: GradeInput | null = null;
    let optimistic: GradeCell | null = null;
    if (parsed === 'NP') {
      if (cell?.status !== 'absent') { grade = { student_id: row.student.id, status: 'absent' }; optimistic = { score: null, status: 'absent', ...via }; }
    } else if (parsed === null) {
      if (cell && cell.status !== 'empty' && cell.status !== 'pending_absent') {
        grade = { student_id: row.student.id, score: null };
        optimistic = { score: null, status: 'empty', ...via };
      }
    } else if (!(cell?.status === 'confirmed' && cell.score === parsed)) {
      grade = { student_id: row.student.id, score: parsed };
      optimistic = { score: parsed, status: 'confirmed', ...via };
    }
    if (grade && optimistic) {
      save.mutate({ term: data.term, activityId: target, columnId: act.id, grade, optimistic }, {
        onError: (e) => toast(`No se ha guardado la nota de ${row.student.first_name}. ${e.message}`, { tone: 'error' }),
      });
    }
    setEditing(next);
  };

  /** Next row (down or up) that has a cell in column c. */
  const step = (r: number, c: number, dir: 1 | -1): Pos | null => {
    for (let i = r + dir; i >= 0 && i < rows.length; i += dir) if (inScope(i, c)) return { r: i, c };
    return null;
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, pos: Pos) => {
    if (e.key === 'Escape') { e.preventDefault(); setEditing(null); return; }
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); commit(pos, step(pos.r, pos.c, e.shiftKey ? -1 : 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); commit(pos, step(pos.r, pos.c, -1)); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      let { r, c } = pos;
      do {
        c += dir;
        if (c >= acts.length) { c = 0; r += 1; }
        if (c < 0) { c = acts.length - 1; r -= 1; }
      } while (r >= 0 && r < rows.length && !inScope(r, c));
      commit(pos, r < 0 || r >= rows.length ? null : { r, c });
    }
  };

  const draftsNote = data.drafts > 0;
  const retryAll = () => unsaved.forEach((u) => save.mutate(u));
  return (
    <>
      {unsaved.length > 0 && (
        <Callout tone="warn">
          <b>{unsaved.length === 1 ? '1 nota sin guardar' : `${unsaved.length} notas sin guardar`}</b>{' '}
          <Button size="sm" variant="plain" onClick={retryAll}>Reintentar</Button>
        </Callout>
      )}
      <div className="gb-card">
        <div className={`gb-scroll${more ? ' gb-scroll--more' : ''}`} ref={scroller}>
          <table className="gb">
            <thead>
              <tr>
                <th className="gb-name gb-corner" scope="col">
                  <span className="gb-corner__label">Alumnos</span>
                  <span className="gb-corner__count num">{rows.length}</span>
                </th>
                {final && data.categories.map((c, i) => (
                  <th key={c.key} className="gb-col" scope="col">
                    <Link className="gb-head" to={`/clases/${course.id}/evaluacion/${i + 1}`}>
                      <span className="gb-head__title">{TERM_SHORT[i + 1]} ev.</span>
                    </Link>
                  </th>
                ))}
                {acts.map((a) => (
                  <ActivityHeader key={a.id} a={a} today={a.date === today} flash={flash === a.id}
                    onOpen={() => navigate(`/clases/${course.id}/actividades/${a.id}`)} onEdit={() => onEdit(a.id)} />
                ))}
                <th className="gb-avg" scope="col">
                  <Link className="gb-avg__head" to={`/clases/${course.id}/evaluacion/${data.term}`}
                    aria-label={`Media. ${final ? 'Evaluación final' : `Evaluar la ${TERM_SHORT[data.term]}`}`}>
                    Media<small className="gb-avg__link">{final ? 'Final ›' : `Evaluar ›`}</small>
                  </Link>
                </th>
                <th className="gb-prop" scope="col">Nota</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={row.student.id}>
                  <th className="gb-name" scope="row">
                    <Link to={`/alumnos/${row.student.id}`} className="gb-student" title={row.student.sort_name}>
                      <span className="gb-student__last">{row.student.last_name || row.student.first_name}</span>
                      <span className="gb-student__first">{row.student.last_name ? row.student.first_name : ''}</span>
                    </Link>
                  </th>
                  {final && data.categories.map((c) => (
                    <td key={c.key} className="gb-cell gb-cell--ro"><Grade value={row.categories[c.key]} /></td>
                  ))}
                  {acts.map((a, c) => {
                    const cell = row.grades[a.id];
                    const label = `${row.student.name} · ${a.title}`;
                    if (!inScope(r, c)) {
                      return <td key={a.id} className="gb-cell gb-cell--na" aria-label={`${label}: no hace esta actividad`} />;
                    }
                    const isEditing = editing?.r === r && editing.c === c;
                    const failed = unsaved.find((u) => u.term === data.term && u.columnId === a.id && u.grade.student_id === row.student.id);
                    const cls = ['gb-cell', a.date === today && 'gb-today', flash === a.id && 'gb-flash', isEditing && 'gb-cell--editing'].filter(Boolean).join(' ');
                    return (
                      <td key={a.id} className={cls}>
                        {isEditing ? (
                          <CellInput value={draft} onChange={setDraft}
                            onKeyDown={(e) => onKey(e, { r, c })}
                            onBlur={() => { const p = editingRef.current; if (p && p.r === r && p.c === c) commit(p, null); }}
                            onQuick={(v) => commit({ r, c }, step(r, c, 1), v)}
                            label={label} />
                        ) : failed ? (
                          <button type="button" className="gb-cell__btn gb-unsaved" onClick={() => save.mutate(failed)}
                            aria-label={`${label}: ${cellText(failed.optimistic) || 'borrar nota'}, sin guardar. Toca para reintentar`}>
                            <span>{cellText(failed.optimistic) || '—'}</span>
                            <small>Sin guardar</small>
                          </button>
                        ) : (
                          <button type="button" className="gb-cell__btn" onClick={() => setEditing({ r, c })}
                            aria-label={`${label}: ${cellLabel(cell, a.kind === 'homework')}`}
                            title={cell?.repeat ? 'Nota de la repesca' : cell?.status === 'pending_absent' && cell.activity_id ? 'Faltó: repesca programada' : undefined}>
                            <CellValue cell={cell} max={a.max_score} calculated={a.kind === 'homework'} />
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="gb-avg">
                    <button type="button" className="gb-avg__btn" onClick={() => setAvgRow(row)}
                      aria-label={`Media de ${row.student.name}: ${formatAverage(row.average)}${row.recovery ? ', con recuperación' : ''}`}>
                      {row.average != null ? <GradePill value={row.average} /> : <span className="gb-empty">—</span>}
                      {row.recovery && <span className="gb-avg__rec">rec.</span>}
                    </button>
                  </td>
                  <td className="gb-prop">
                    {row.final != null ? (
                      <span className="gb-prop__val" title={row.adjusted ? `Ajustada en Evaluación (propuesta ${formatProposal(row.proposed)})` : 'Propuesta'}>
                        <GradePill value={row.final} label={row.qualitative} proposal />
                        {row.adjusted && <span className="gb-avg__rec">aj.</span>}
                      </span>
                    ) : <span className="gb-empty">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="gb-name" scope="row"><span className="gb-foot__label">Media de la clase</span></th>
                {final && data.categories.map((c) => (
                  <td key={c.key} className="gb-cell gb-foot__cell"><Grade value={data.category_averages[c.key]} /></td>
                ))}
                {acts.map((a) => (
                  <td key={a.id} className={`gb-cell gb-foot__cell${a.date === today ? ' gb-today' : ''}`}>
                    <Grade value={a.class_average} max={a.max_score} average />
                  </td>
                ))}
                <td className="gb-avg"><Grade value={data.class_average} /></td>
                <td className="gb-prop" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="gb-hint">
        {final
          ? 'La media final es la media de las evaluaciones con nota (con sus recuperaciones).'
          : <>Toca una celda para poner nota. <span className="gb-hint__keys">Enter baja al siguiente alumno, Tab pasa a la siguiente actividad. </span>Escribe NP si no se presentó.</>}
        {draftsNote && <> Las medias no cuentan {plural(data.drafts, 'borrador', 'borradores')} de la IA hasta que los revises.</>}
      </p>
      <AverageSheet row={avgRow} onClose={() => setAvgRow(null)} data={data} categories={data.categories} />
    </>
  );
}

/** `calculated`: the «Deberes» column, suggested by a formula (not by the AI). */
function CellValue({ cell, max, calculated }: { cell: GradeCell | undefined; max: number; calculated?: boolean }) {
  if (!cell || cell.status === 'empty') return <span className="gb-empty" aria-hidden>—</span>;
  if (cell.status === 'pending_absent') {
    return cell.activity_id ? <span className="gb-np" aria-hidden>Pendiente</span> : <span className="gb-missed" aria-hidden>Faltó</span>;
  }
  if (cell.status === 'absent') return <span className="gb-np">NP</span>;
  if (cell.status === 'exempt') return <span className="gb-np">Ex.</span>;
  if (cell.status === 'suggested') {
    return (
      <span className="gb-sug" title={calculated ? 'Calculada: 10 × (hechos + 0,5 · incompletos) / revisiones · toca para confirmar' : undefined}>
        {formatScore(cell.score)}
      </span>
    );
  }
  return <Grade value={cell.score} max={max} className={cell.repeat ? 'gb-repeat' : undefined} />;
}

/** The phone's decimal keypad has no letters: NP sits beside the cell, over the same row, so the column being typed stays
 *  visible. Emptying the cell deletes the grade. */
function CellInput({ value, onChange, onKeyDown, onBlur, onQuick, label }: {
  value: string; onChange: (v: string) => void; onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void; onBlur: () => void;
  onQuick: (v: string) => void; label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
    el.closest('td')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);
  const keep = (e: PointerEvent) => e.preventDefault();
  return (
    <>
      <input ref={ref} className="gb-input num" inputMode="decimal" autoComplete="off" enterKeyHint="next" aria-label={label}
        value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} onBlur={onBlur} />
      <div className="gb-quick glass">
        <button type="button" onPointerDown={keep} onClick={() => onQuick('NP')} aria-label="No presentado">NP</button>
      </div>
    </>
  );
}

function headerTag(a: GradebookActivity) {
  if (a.suggested > 0) return <AIBadge />;
  if (a.counts_for === 'none') return <span className="gb-head__tag">No cuenta</span>;
  // A recovery column says so, unless its title already does ("Recuperación de la 1.ª…")
  if (a.counts_for === 'recovery') return /^recuperaci[oó]n/i.test(a.title.trim()) ? null : <span className="gb-head__tag">Recuperación</span>;
  if (a.student_ids) return <span className="gb-head__tag">{plural(a.student_ids.length, 'alumno', 'alumnos')}</span>;
  return null;
}

function ActivityHeader({ a, today, flash, onOpen, onEdit }: {
  a: GradebookActivity; today: boolean; flash: boolean; onOpen: () => void; onEdit: () => void;
}) {
  const timer = useRef<number>(0);
  const longPressed = useRef(false);
  const start = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    longPressed.current = false;
    timer.current = window.setTimeout(() => { longPressed.current = true; onEdit(); }, 500);
  };
  const cancel = () => window.clearTimeout(timer.current);
  const tag = headerTag(a);
  return (
    <th data-col={a.id} scope="col" className={['gb-col', today && 'gb-today', flash && 'gb-flash'].filter(Boolean).join(' ')}>
      <button type="button" className="gb-head" title={`${a.title} · mantén pulsado para editar`}
        onClick={() => { if (!longPressed.current) onOpen(); longPressed.current = false; }}
        onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
        onContextMenu={(e) => { e.preventDefault(); cancel(); onEdit(); }}>
        <span className="gb-head__meta">
          <KindIcon kind={a.kind} size={13} />
          <span>{today ? 'hoy' : shortDate(a.date)}</span>
          {a.max_score !== 10 && <span className="gb-head__max">/{formatNumber(a.max_score, 2)}</span>}
        </span>
        <span className="gb-head__title">{a.short_title}</span>
        {tag && <span className="gb-head__tagline">{tag}</span>}
      </button>
      <IconButton label={`Editar ${a.title}`} size="sm" className="gb-head__edit" onClick={onEdit}><PencilSimple size={14} /></IconButton>
    </th>
  );
}

// ── Sheets ───────────────────────────────────────────────────────────────────
function AverageSheet({ row, onClose, data, categories }: {
  row: GradebookRow | null; onClose: () => void; data: Gradebook; categories: Gradebook['categories'];
}) {
  const final = data.term === 4;
  const used = row ? categories.filter((c) => row.categories[c.key] != null && (final || c.weight > 0)) : [];
  const totalW = used.reduce((a, c) => a + c.weight, 0);
  const base = row?.recovery ? row.recovery.before : row?.average;
  const formula = final
    ? `(${used.map((c) => formatAverage(row?.categories[c.key])).join(' + ')}) / ${used.length}`
    : `(${used.map((c) => `${formatAverage(row?.categories[c.key])} × ${formatNumber(c.weight, 0)}`).join(' + ')}) / ${formatNumber(totalW, 0)}`;
  return (
    <Sheet open={!!row} onClose={onClose} title={row?.student.name ?? ''} subtitle={`Media de la ${final ? 'evaluación final' : data.term_label}`}>
      {row && (
        <div className="gb-avg-sheet">
          <div className="gb-avg-sheet__head">
            <span className="gb-avg-sheet__num display"><Grade value={row.average} /></span>
            {row.final != null && (
              <span className="muted">
                {row.adjusted ? `Propuesta ${formatProposal(row.proposed)} · ajustada a` : 'Propuesta'} <GradePill value={row.final} label={row.qualitative} proposal />
              </span>
            )}
          </div>
          <List>
            {categories.map((c) => (
              <Row key={c.key} title={c.label} sub={final ? undefined : `Pesa un ${formatNumber(c.weight, 0)} %`}
                muted={row.categories[c.key] == null}
                trail={row.categories[c.key] == null ? <span className="faint">Sin notas</span> : <Grade value={row.categories[c.key]} />} />
            ))}
          </List>
          {used.length > 0 ? (
            <p className="gb-formula">
              <span className="num">{formula} = {formatAverage(base)}</span>
              {!final && used.length < categories.length && <> · Las categorías sin notas no cuentan: su peso se reparte entre las demás.</>}
              {final && <> · Media de las evaluaciones con nota.</>}
            </p>
          ) : <p className="muted">Todavía no hay notas confirmadas.</p>}
          {row.recovery && (
            <p className="gb-formula">
              Recuperación: {formatAverage(row.recovery.score)} → la media pasa de {formatAverage(row.recovery.before)} a {formatAverage(row.average)} ({RULE_TEXT[data.recovery_rule]}).
            </p>
          )}
          {row.drafts > 0 && <p className="gb-formula">No cuenta {plural(row.drafts, 'borrador', 'borradores')} de la IA sin revisar.</p>}
          <Button variant="plain" to={`/alumnos/${row.student.id}`}>Ver ficha del alumno</Button>
        </div>
      )}
    </Sheet>
  );
}

const RULE_TEXT: Record<Gradebook['recovery_rule'], string> = {
  replace_if_higher: 'la recuperación sustituye si es mayor',
  cap_5: 'la recuperación deja como máximo un 5',
  average: 'media de la evaluación y la recuperación',
};
