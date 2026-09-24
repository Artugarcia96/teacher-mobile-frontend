import { ArrowRight, Exam, FileCsv, PencilSimple, Plus, Scales, Student } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ActivityBrief, GradeInput } from '../../api/activities';
import { useGradebook, useSaveCell, type Gradebook, type GradebookActivity, type GradebookRow, type GradeCell } from '../../api/gradebook';
import type { CourseDetail } from '../../api/types';
import { useCourseMenu } from '../../features/course/CourseMenu';
import CourseSettingsSheet from '../../features/course/CourseSettingsSheet';
import EditActivitySheet from '../../features/activities/EditActivitySheet';
import NewActivitySheet from '../../features/activities/NewActivitySheet';
import { KindIcon } from '../../features/activities/kinds';
import { download } from '../../lib/api';
import { useAuth, useToday } from '../../lib/auth';
import { formatAverage, formatNumber, formatScore, parseGradeInput, shortDate, TERM_LABEL, TERM_SHORT } from '../../lib/format';
import {
  Button, Callout, EmptyState, Grade, GradePill, IconButton, List, Row, Segmented, Sheet, SkeletonList, useFeedback,
} from '../../ui';
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
  const [weights, setWeights] = useState(false);
  const [settings, setSettings] = useState(false);
  const [focus, setFocus] = useState<{ id: string; edit: boolean } | null>(() => (params.get('a') ? { id: params.get('a')!, edit: false } : null));
  const { toast } = useFeedback();

  const setTerm = (t: number) => setParams((p) => { p.set('term', String(t)); p.delete('a'); return p; }, { replace: true });

  const exportCsv = () =>
    download(`/courses/${course.id}/gradebook.csv?term=${term}`, `Cuaderno ${course.subject} ${course.group.name} ${TERM_SHORT[term]}.csv`)
      .catch((e: Error) => toast(e.message, { tone: 'error' }));

  // The region's grades platform names the file's destination ("Exportar CSV para Raíces (Madrid)").
  const exportLabel = me?.region?.export_label ? `Exportar CSV para ${me.region.export_label}` : 'Exportar CSV';
  useCourseMenu([
    { label: exportLabel, icon: <FileCsv size={18} />, onSelect: exportCsv },
    { label: 'Ponderaciones', icon: <Scales size={18} />, onSelect: () => setWeights(true) },
  ]);

  const onCreated = (a: ActivityBrief) => {
    if (a.term !== term) setTerm(a.term);
    setFocus({ id: a.id, edit: true });
  };

  const data = gb.data?.term === term ? gb.data : undefined;
  return (
    <>
      <div className="gb-toolbar">
        <Segmented label="Evaluación" value={term} options={TERMS} onChange={setTerm} />
        <div className="gb-toolbar__actions">
          <Button size="sm" variant="tinted" icon={<Plus size={16} weight="bold" />} onClick={() => setNewOpen(true)}>Actividad</Button>
          <Button size="sm" variant="neutral" to={`/clases/${course.id}/evaluacion/${term}`} icon={<ArrowRight size={16} />}>Evaluación</Button>
        </div>
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
        <Grid course={course} data={data} focus={focus} onFocusDone={() => setFocus(null)} onEdit={setEditId} />
      )}

      <NewActivitySheet open={newOpen} onClose={() => setNewOpen(false)} course={course} onCreated={onCreated} />
      <EditActivitySheet activityId={editId} onClose={() => setEditId(null)} course={course} />
      <WeightsSheet open={weights} onClose={() => setWeights(false)} course={course} onEdit={() => { setWeights(false); setSettings(true); }} />
      <CourseSettingsSheet open={settings} onClose={() => setSettings(false)} course={course} />
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

function Grid({ course, data, focus, onFocusDone, onEdit }: {
  course: CourseDetail; data: Gradebook; focus: { id: string; edit: boolean } | null; onFocusDone: () => void; onEdit: (id: string) => void;
}) {
  const today = useToday();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const save = useSaveCell(course.id, data.term);
  const [editing, setEditingState] = useState<Pos | null>(null);
  const editingRef = useRef<Pos | null>(null);
  const [draft, setDraft] = useState('');
  const [avgRow, setAvgRow] = useState<GradebookRow | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const final = data.term === 4;
  const acts = data.activities;
  const rows = data.students;

  const setEditing = useCallback((p: Pos | null) => {
    editingRef.current = p;
    setEditingState(p);
    if (p) setDraft(cellText(rows[p.r]?.grades[acts[p.c]?.id]));
  }, [rows, acts]);

  // Scroll to a column (created now or linked from Evaluar) and optionally start typing in it.
  useEffect(() => {
    if (!focus) return;
    const c = acts.findIndex((a) => a.id === focus.id);
    if (c < 0) return;
    const th = scroller.current?.querySelector<HTMLElement>(`[data-col="${focus.id}"]`);
    th?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    setFlash(focus.id);
    if (focus.edit) setEditing({ r: 0, c });
    onFocusDone();
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
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
    let grade: GradeInput | null = null;
    let optimistic: GradeCell | null = null;
    if (parsed === 'NP') {
      if (cell?.status !== 'absent') { grade = { student_id: row.student.id, status: 'absent' }; optimistic = { score: null, status: 'absent' }; }
    } else if (parsed === null) {
      if (cell && cell.status !== 'empty') { grade = { student_id: row.student.id, score: null }; optimistic = { score: null, status: 'empty' }; }
    } else if (!(cell?.status === 'confirmed' && cell.score === parsed)) {
      grade = { student_id: row.student.id, score: parsed };
      optimistic = { score: parsed, status: 'confirmed' };
    }
    if (grade && optimistic) {
      save.mutate({ activityId: act.id, grade, optimistic }, {
        onError: (e) => toast(`No se ha guardado la nota de ${row.student.first_name}. ${e.message}`, { tone: 'error' }),
      });
    }
    setEditing(next);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>, pos: Pos) => {
    const last = rows.length - 1;
    const move = (r: number, c: number): Pos | null => (r < 0 || r > last ? null : { r, c });
    if (e.key === 'Escape') { e.preventDefault(); setEditing(null); return; }
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); commit(pos, move(pos.r + (e.shiftKey ? -1 : 1), pos.c)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); commit(pos, move(pos.r - 1, pos.c)); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      let { r, c } = pos;
      c += dir;
      if (c >= acts.length) { c = 0; r += 1; }
      if (c < 0) { c = acts.length - 1; r -= 1; }
      commit(pos, move(r, c));
    }
  };

  return (
    <>
      <div className="gb-card">
        <div className="gb-scroll" ref={scroller}>
          <table className="gb">
            <thead>
              <tr>
                <th className="gb-name gb-corner" scope="col">
                  <span className="gb-corner__label">Alumnos</span>
                  <span className="gb-corner__count num">{rows.length}</span>
                </th>
                {final
                  ? data.categories.map((c, i) => (
                    <th key={c.key} className="gb-col" scope="col">
                      <Link className="gb-head" to={`/clases/${course.id}/evaluacion/${i + 1}`}>
                        <span className="gb-head__title">{TERM_SHORT[i + 1]} ev.</span>
                      </Link>
                    </th>
                  ))
                  : acts.map((a) => (
                    <ActivityHeader key={a.id} a={a} today={a.date === today} flash={flash === a.id}
                      onOpen={() => navigate(`/clases/${course.id}/actividades/${a.id}`)} onEdit={() => onEdit(a.id)} />
                  ))}
                <th className="gb-avg" scope="col">Media</th>
                <th className="gb-prop" scope="col">Prop.</th>
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
                  {final
                    ? data.categories.map((c) => (
                      <td key={c.key} className="gb-cell gb-cell--ro"><Grade value={row.categories[c.key]} /></td>
                    ))
                    : acts.map((a, c) => {
                      const isEditing = editing?.r === r && editing.c === c;
                      const cls = ['gb-cell', a.date === today && 'gb-today', flash === a.id && 'gb-flash', isEditing && 'gb-cell--editing'].filter(Boolean).join(' ');
                      return (
                        <td key={a.id} className={cls}>
                          {isEditing ? (
                            <CellInput value={draft} onChange={setDraft} above={r > 1}
                              onKeyDown={(e) => onKey(e, { r, c })}
                              onBlur={() => { const p = editingRef.current; if (p && p.r === r && p.c === c) commit(p, null); }}
                              onQuick={(v) => commit({ r, c }, r < rows.length - 1 ? { r: r + 1, c } : null, v)}
                              label={`${row.student.name} · ${a.title}`} />
                          ) : (
                            <button type="button" className="gb-cell__btn" onClick={() => setEditing({ r, c })}
                              aria-label={`${row.student.name} · ${a.title}`}>
                              <CellValue cell={row.grades[a.id]} max={a.max_score} calculated={a.kind === 'homework'} />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  <td className="gb-avg">
                    <button type="button" className="gb-avg__btn" onClick={() => setAvgRow(row)} aria-label={`Media de ${row.student.name}`}>
                      <Grade value={row.average} />
                    </button>
                  </td>
                  <td className="gb-prop">
                    {row.proposed != null ? <GradePill value={row.proposed} label={row.qualitative} proposal /> : <span className="faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="gb-name" scope="row"><span className="gb-foot__label">Media de la clase</span></th>
                {(final ? data.categories : acts).map((x) => <td key={'key' in x ? x.key : x.id} className={`gb-cell${!final && (x as GradebookActivity).date === today ? ' gb-today' : ''}`} />)}
                <td className="gb-avg"><Grade value={data.class_average} /></td>
                <td className="gb-prop" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="gb-hint">
        {final
          ? 'La media final es la media de las evaluaciones con nota.'
          : <>Toca una celda para poner nota. <span className="gb-hint__keys">Enter baja al siguiente alumno, Tab pasa a la siguiente actividad. </span>Escribe NP si no se presentó.</>}
      </p>
      <AverageSheet row={avgRow} onClose={() => setAvgRow(null)} data={data} categories={data.categories} />
    </>
  );
}

/** `calculated`: the «Deberes» column, suggested by a formula (not by the AI). */
function CellValue({ cell, max, calculated }: { cell: GradeCell | undefined; max: number; calculated?: boolean }) {
  if (!cell || cell.status === 'empty') return null;
  if (cell.status === 'absent') return <span className="gb-np">NP</span>;
  if (cell.status === 'exempt') return <span className="gb-np">Ex.</span>;
  if (cell.status === 'suggested' && calculated) {
    return (
      <span className="gb-sug" title="Calculada: 10 × (hechos + 0,5 · incompletos) / revisiones · toca para confirmar">
        {formatScore(cell.score)}
      </span>
    );
  }
  if (cell.status === 'suggested') {
    return (
      <span className="gb-sug" title="Sugerida por IA · revisar">
        {formatScore(cell.score)}<span className="gb-sug__mark">IA</span>
      </span>
    );
  }
  return <Grade value={cell.score} max={max} />;
}

function CellInput({ value, onChange, onKeyDown, onBlur, onQuick, label, above }: {
  value: string; onChange: (v: string) => void; onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void; onBlur: () => void;
  onQuick: (v: string) => void; label: string; above: boolean;
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
      <div className={`gb-quick glass${above ? ' gb-quick--above' : ''}`}>
        <button type="button" onPointerDown={keep} onClick={() => onQuick('NP')}>NP</button>
        <button type="button" onPointerDown={keep} onClick={() => onQuick('')}>Borrar</button>
      </div>
    </>
  );
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
  const formula = final
    ? `(${used.map((c) => formatAverage(row?.categories[c.key])).join(' + ')}) / ${used.length}`
    : `(${used.map((c) => `${formatAverage(row?.categories[c.key])} × ${formatNumber(c.weight, 0)}`).join(' + ')}) / ${formatNumber(totalW, 0)}`;
  return (
    <Sheet open={!!row} onClose={onClose} title={row?.student.name ?? ''} subtitle={`Media de la ${final ? 'evaluación final' : data.term_label}`}>
      {row && (
        <div className="gb-avg-sheet">
          <div className="gb-avg-sheet__head">
            <span className="gb-avg-sheet__num display"><Grade value={row.average} /></span>
            {row.proposed != null && <span className="muted">Propuesta <GradePill value={row.proposed} label={row.qualitative} proposal /></span>}
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
              <span className="num">{formula} = {formatAverage(row.average)}</span>
              {!final && used.length < categories.length && <> · Las categorías sin notas no cuentan: su peso se reparte entre las demás.</>}
              {final && <> · Media de las evaluaciones con nota.</>}
            </p>
          ) : <p className="muted">Todavía no hay notas confirmadas.</p>}
          <Button variant="plain" to={`/alumnos/${row.student.id}`}>Ver ficha del alumno</Button>
        </div>
      )}
    </Sheet>
  );
}

function WeightsSheet({ open, onClose, course, onEdit }: { open: boolean; onClose: () => void; course: CourseDetail; onEdit: () => void }) {
  const total = course.categories.reduce((a, c) => a + c.weight, 0);
  return (
    <Sheet open={open} onClose={onClose} title="Ponderaciones" subtitle={course.label}
      footer={<Button variant="tinted" full onClick={onEdit}>Cambiar ponderaciones</Button>}>
      <div className="gb-avg-sheet">
        <List>
          {course.categories.map((c) => (
            <Row key={c.key} title={c.label} trail={<span className="num">{formatNumber(total ? (c.weight / total) * 100 : 0, 0)} %</span>} />
          ))}
        </List>
        <p className="muted">
          La media de cada categoría es la media de sus actividades (según su peso). La media de la evaluación combina las
          categorías con estos porcentajes; si una categoría aún no tiene notas, no cuenta. Las notas sugeridas (por la IA o
          calculadas con los deberes) no cuentan hasta que las confirmas.
        </p>
      </div>
    </Sheet>
  );
}
