import { useEffect, useRef, useState } from 'react';
import type { ArchetypeGroup, ContentDoc, LessonKind, Slide, SlideNotes, SlotField } from '../../api/content';
import {
  presentationLessons, useAddSlide, useArchetypes, useDeleteBlock, useDuplicateSlide, useLessonJob, useMoveSlide, usePatchLesson,
  usePatchSlide, usePatchSlideFields, useRewriteBlock, useUnit, type MaterialDetail,
} from '../../api/units';
import { LESSON_KINDS, lessonKindLabel } from '../../features/materials/lessons';
import { checkSlot, slotToText, slotValue } from '../../features/materials/slotText';
import { watchJob } from '../../features/materials/watch';
import { Button, List, RichText, Row, Section, Select, Sheet, SkeletonList, Stepper, TextArea, TextField, useFeedback } from '../../ui';
import RewriteSheet from './RewriteSheet';

/** What a slide or lesson menu asked for: a sheet to open, or an action done at once (duplicate, reorder, hide). */
export type LessonSheet =
  | { kind: 'text'; slideId: string }
  | { kind: 'rewrite'; slideId: string }
  | { kind: 'duplicate'; slideId: string }
  | { kind: 'move'; slideId: string }
  | { kind: 'hidden'; slideId: string; hidden: boolean }
  | { kind: 'minutes'; slideId: string }
  | { kind: 'reorder'; slideId: string; lesson: number; after: string | null; up: boolean }
  | { kind: 'remove'; slideId: string; n: number | null }
  | { kind: 'lesson'; n: number }
  | { kind: 'add'; n: number; after: string | null }
  | { kind: 'regenerate'; n: number };

interface Props {
  m: MaterialDetail;
  doc: ContentDoc;
  sheet: LessonSheet;
  path: string;
  onSheet: (s: LessonSheet | null) => void;
  onClose: () => void;
}

/** Where a slide added or moved to a lesson goes: after its last slide before the closing ones (the answer to the
 *  question and the credits); null when that is the cover. */
function beforeClosing(doc: ContentDoc, ids: string[]): string | null {
  const closing = new Set(doc.slides.filter((s) => s.archetype === 'cierre' || s.archetype === 'creditos').map((s) => s.id));
  const cut = ids.findIndex((id) => closing.has(id));
  const body = cut < 0 ? ids : ids.slice(0, cut);
  return body.length > 1 ? body[body.length - 1] : null;
}

const fail = (toast: ReturnType<typeof useFeedback>['toast']) => (e: unknown) => toast((e as Error).message, { tone: 'error' });

/** The sheets and immediate actions of the slide and lesson menus (§1.7). Every change goes to the server, which
 *  re-stamps the lesson and renders again only what changed. */
export default function LessonSheets({ m, doc, sheet, path, onSheet, onClose }: Props) {
  const slide = 'slideId' in sheet ? doc.slides.find((s) => s.id === sheet.slideId) : undefined;
  switch (sheet.kind) {
    case 'text': return slide ? <EditSlideSheet m={m} slide={slide} onClose={onClose} /> : null;
    case 'rewrite': return slide ? <RewriteSlide m={m} slide={slide} path={path} onClose={onClose} /> : null;
    case 'move': return slide ? <MoveSheet m={m} doc={doc} slide={slide} onClose={onClose} /> : null;
    case 'minutes': return slide ? <MinutesSheet m={m} slide={slide} onClose={onClose} /> : null;
    case 'lesson': return <EditLessonSheet m={m} doc={doc} n={sheet.n} onClose={onClose} />;
    case 'add': return <AddSlideSheet m={m} doc={doc} n={sheet.n} after={sheet.after} onAdded={(id) => onSheet({ kind: 'text', slideId: id })} onClose={onClose} />;
    case 'regenerate': return <RegenerateSheet m={m} n={sheet.n} path={path} onClose={onClose} />;
    default: return <SlideAction m={m} sheet={sheet} onClose={onClose} />;
  }
}

/** Duplicate, hide or show, move up or down, remove: done at once (remove after confirming). */
function SlideAction({ m, sheet, onClose }: { m: MaterialDetail; sheet: LessonSheet; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const duplicate = useDuplicateSlide(m.id);
  const patch = usePatchSlide(m.id);
  const move = useMoveSlide(m.id);
  const remove = useDeleteBlock(m.id);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const err = fail(toast);
    const run = async () => {
      if (sheet.kind === 'duplicate') duplicate.mutate(sheet.slideId, { onSuccess: () => toast('Diapositiva duplicada'), onError: err });
      else if (sheet.kind === 'hidden') {
        patch.mutate({ id: sheet.slideId, hidden: sheet.hidden }, {
          onSuccess: () => toast(sheet.hidden ? 'Diapositiva pasada a reserva' : 'La diapositiva sale al proyectar'), onError: err,
        });
      } else if (sheet.kind === 'reorder') {
        move.mutate({ id: sheet.slideId, lesson: sheet.lesson, after: sheet.after }, {
          onSuccess: () => toast(sheet.up ? 'Diapositiva subida' : 'Diapositiva bajada'), onError: err,
        });
      } else if (sheet.kind === 'remove') {
        const ok = await confirm({
          title: sheet.n ? `¿Quitar la diapositiva ${sheet.n}?` : '¿Quitar esta diapositiva de reserva?',
          text: 'Desaparece de la sesión, de los PDF y del PowerPoint.', confirm: 'Quitar', danger: true,
        });
        if (ok) remove.mutate(sheet.slideId, { onSuccess: () => toast('Diapositiva quitada'), onError: err });
      }
      onClose();
    };
    void run();
  });
  return null;
}

const NOTES_ORDER: (keyof SlideNotes)[] = ['say', 'ask', 'expected', 'misconception', 'clicks', 'if_not', 'manage', 'source_note'];
const NOTES_LABEL: Record<keyof SlideNotes, string> = {
  say: 'Di', ask: 'Pregunta', expected: 'Respuesta esperada', misconception: 'Error frecuente', clicks: 'Clics (uno por línea)',
  if_not: 'Si no lo entienden', manage: 'Gestión', source_note: 'Dato para ti',
};

const notesText = (n: SlideNotes, k: keyof SlideNotes) => (k === 'clicks' ? n.clicks.join('\n') : n[k]);

/** «Editar texto»: one field per slot of the archetype, in slot order (§2.3.3), then the notes. What the slide cannot
 *  draw is refused before saving; text over a cap is saved with a warning under its field. */
function EditSlideSheet({ m, slide, onClose }: { m: MaterialDetail; slide: Slide; onClose: () => void }) {
  const table = useArchetypes();
  const save = usePatchSlideFields(m.id);
  const { toast } = useFeedback();
  const info = table.data?.archetypes[slide.archetype];
  const fields = info?.fields ?? [];
  const labels = table.data?.notes_fields;
  const [values, setValues] = useState<Record<string, string | string[]> | null>(null);
  const [tried, setTried] = useState(false);  // refusals show under a field once it changed or a save was tried
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(NOTES_ORDER.map((k) => [k, notesText(slide.notes, k)])));
  const initial = useRef<Record<string, string | string[]>>({});
  useEffect(() => {
    if (values || !info) return;
    const v = Object.fromEntries(info.fields.map((f) => [f.slot, slotToText(f, slide)]));
    initial.current = v;
    setValues(v);
  }, [info, slide, values]);

  const changed = (f: SlotField) => JSON.stringify(values?.[f.slot]) !== JSON.stringify(initial.current[f.slot]);
  const notesChanged = NOTES_ORDER.filter((k) => notes[k] !== notesText(slide.notes, k));
  const dirty = !!values && (fields.some(changed) || notesChanged.length > 0);
  const linesOf = (slot: string) => String(values?.[slot] ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const checks = Object.fromEntries(fields.map((f) => [f.slot, values ? checkSlot(f, values[f.slot] ?? '', f.kind === 'choice' && f.from ? linesOf(f.from) : []) : {}]));
  const blocked = fields.find((f) => checks[f.slot]?.error);

  const submit = () => {
    setTried(true);
    if (!values || !dirty || blocked || save.isPending) return;
    const body = {
      id: slide.id,
      fields: Object.fromEntries(fields.filter(changed).map((f) => [f.slot, slotValue(f, values[f.slot])])),
      ...(notesChanged.length ? { notes: Object.fromEntries(notesChanged.map((k) => [k, notes[k].trim()])) } : {}),
    };
    save.mutate(body, {
      onSuccess: (r) => {
        toast(r.warnings?.length ? `Cambios guardados. ${r.warnings[0]}` : 'Cambios guardados');
        onClose();
      },
      onError: fail(toast),
    });
  };

  const math = JSON.stringify(slide).includes('$');
  return (
    <Sheet open onClose={onClose} title={`Editar · ${info?.label ?? 'Diapositiva'}`} size="large" dirty={dirty}
      subtitle={math ? 'Las fórmulas van entre $…$, por ejemplo $\\frac{3}{4}$.' : undefined}
      footer={<Button full onClick={submit} loading={save.isPending} disabled={!dirty || !!blocked}>
        {blocked ? `Revisa «${blocked.label}»` : dirty ? 'Guardar cambios' : 'Sin cambios'}
      </Button>}>
      {!values ? <SkeletonList rows={4} /> : (
        <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {fields.map((f, i) => {
            const value = values[f.slot] ?? '';
            const c = checks[f.slot] ?? {};
            const shown = tried || changed(f) ? c.error : undefined;
            const note = shown ?? c.warning;
            const set = (v: string | string[]) => setValues({ ...values, [f.slot]: v });
            const auto = i === 0 ? { 'data-autofocus': true } : {};
            if (f.kind === 'columns') {
              return (
                <div key={f.slot} className="edit-columns">
                  {(value as string[]).map((col, j) => (
                    <TextArea key={j} label={`Columna ${j + 1}`} hint="El encabezado en la primera línea; después, una celda por línea"
                      value={col} rows={Math.max(3, col.split('\n').length + 1)}
                      onChange={(e) => set((value as string[]).map((x, k) => (k === j ? e.target.value : x)))} />
                  ))}
                  {note && <span className={shown ? 'field__error' : 'field__hint'}>{note}</span>}
                </div>
              );
            }
            if (f.kind === 'choice') {
              const opts = f.options ?? linesOf(f.from ?? '');
              return (
                <Select key={f.slot} label={f.label} value={value as string} error={shown} onChange={(e) => set(e.target.value)} {...auto}>
                  <option value="">Elige…</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              );
            }
            const hint = c.warning ?? (f.syntax ? `Uno por línea: «${f.syntax}»` : f.kind === 'lines' ? 'Uno por línea' : undefined);
            const common = { label: f.label, value: value as string, error: shown, hint, onChange: (e: { target: { value: string } }) => set(e.target.value), ...auto };
            return (
              <div key={f.slot} className="edit-field">
                {f.kind === 'text' && (f.words ?? 0) <= 8 || f.kind === 'number'
                  ? <TextField {...common} inputMode={f.kind === 'number' ? 'numeric' : undefined} />
                  : <TextArea {...common} rows={Math.min(10, Math.max(2, String(value).split('\n').length + 1))} />}
                {String(value).includes('$') && <RichText as="div" className="edit-field__preview" text={String(value)} />}
              </div>
            );
          })}
          <Section title="Notas del orador">
            <div className="form">
              {NOTES_ORDER.map((k) => (
                <TextArea key={k} label={labels?.[k] ? (k === 'clicks' ? `${labels[k]} (uno por línea)` : labels[k]) : NOTES_LABEL[k]}
                  value={notes[k]} rows={k === 'say' ? 3 : 2} onChange={(e) => setNotes({ ...notes, [k]: e.target.value })} />
              ))}
            </div>
          </Section>
        </form>
      )}
    </Sheet>
  );
}

const SLIDE_QUICK = ['Más visual', 'Menos texto', 'Otra pregunta de comprobación', 'Cambia el ejemplo'];

function RewriteSlide({ m, slide, path, onClose }: { m: MaterialDetail; slide: Slide; path: string; onClose: () => void }) {
  const rewrite = useRewriteBlock(m.id);
  const { toast } = useFeedback();
  return (
    <RewriteSheet el={slide} quick={SLIDE_QUICK} sending={rewrite.isPending} onClose={onClose}
      onSend={(instruction) => rewrite.mutate({ blockId: slide.id, instruction }, {
        onSuccess: ({ job }) => {
          watchJob({ job: job.id, kind: 'rewrite', materialId: m.id, blockId: slide.id, done: 'Diapositiva reescrita con IA', path });
          toast('Reescribiendo con IA. Puedes seguir trabajando.');
          onClose();
        },
        onError: fail(toast),
      })} />
  );
}

/** «Mover a otra sesión…»: the slide goes to the end of the chosen lesson, before its closing slides. */
function MoveSheet({ m, doc, slide, onClose }: { m: MaterialDetail; doc: ContentDoc; slide: Slide; onClose: () => void }) {
  const move = useMoveSlide(m.id);
  const { toast } = useFeedback();
  const targets = presentationLessons(m).filter((l) => l.n !== slide.lesson && l.status === 'ready');
  const [n, setN] = useState(targets[0]?.n ?? 0);
  const target = targets.find((l) => l.n === n);
  const submit = () => target && move.mutate({ id: slide.id, lesson: n, after: beforeClosing(doc, target.slide_ids) }, {
    onSuccess: () => { toast(`Diapositiva movida a la sesión ${n}`); onClose(); },
    onError: fail(toast),
  });
  return (
    <Sheet open onClose={onClose} title="Mover a otra sesión"
      footer={<Button full onClick={submit} loading={move.isPending} disabled={!target}>{target ? `Mover a la sesión ${n}` : 'No hay otra sesión lista'}</Button>}>
      {targets.length === 0 ? <p className="muted">Esta presentación no tiene otra sesión lista.</p> : (
        <List>
          {targets.map((l) => (
            <Row key={l.n} title={`Sesión ${l.n} · ${l.title}`} sub="Al final, antes de la respuesta a la pregunta" chevron={false}
              trail={n === l.n ? <span className="muted">Elegida</span> : undefined} onClick={() => setN(l.n)} aria-label={`Sesión ${l.n}`} />
          ))}
        </List>
      )}
    </Sheet>
  );
}

/** «Minutos…»: the slide's planned minutes; the lesson's minute stamps are recomputed. */
function MinutesSheet({ m, slide, onClose }: { m: MaterialDetail; slide: Slide; onClose: () => void }) {
  const patch = usePatchSlide(m.id);
  const { toast } = useFeedback();
  const [minutes, setMinutes] = useState(slide.minutes);
  return (
    <Sheet open onClose={onClose} title="Minutos de la diapositiva" dirty={minutes !== slide.minutes}
      footer={<Button full disabled={minutes === slide.minutes} loading={patch.isPending}
        onClick={() => patch.mutate({ id: slide.id, minutes }, { onSuccess: () => { toast('Minutos guardados'); onClose(); }, onError: fail(toast) })}>
        {minutes === slide.minutes ? 'Sin cambios' : 'Guardar'}
      </Button>}>
      <div className="option-line">
        <span>Minutos planificados</span>
        <Stepper label="Minutos" value={minutes} onChange={setMinutes} min={0} max={60} format={(v) => `${v} min`} />
      </div>
    </Sheet>
  );
}

/** «Editar sesión»: title, question, success criteria, kind and length. */
function EditLessonSheet({ m, doc, n, onClose }: { m: MaterialDetail; doc: ContentDoc; n: number; onClose: () => void }) {
  const lesson = presentationLessons(m).find((l) => l.n === n);
  const patch = usePatchLesson(m.id);
  const table = useArchetypes();
  const { toast } = useFeedback();
  const [f, setF] = useState(() => ({
    title: lesson?.title ?? '', question: lesson?.question ?? '', criteria: (lesson?.criteria ?? []).join('\n'),
    kind: (lesson?.kind ?? 'nueva') as LessonKind, minutes: lesson?.minutes ?? 55,
  }));
  if (!lesson) return null;
  const criteria = f.criteria.split('\n').map((l) => l.trim()).filter(Boolean);
  const body = {
    ...(f.title.trim() !== lesson.title ? { title: f.title.trim() } : {}),
    ...(f.question.trim() !== lesson.question ? { question: f.question.trim() } : {}),
    ...(JSON.stringify(criteria) !== JSON.stringify(lesson.criteria) ? { criteria } : {}),
    ...(f.kind !== lesson.kind ? { kind: f.kind } : {}),
    ...(f.minutes !== lesson.minutes ? { minutes: f.minutes } : {}),
  };
  const dirty = Object.keys(body).length > 0;
  const invalid = !f.title.trim() ? 'Escribe el título' : criteria.length > 3 ? 'Como mucho 3 criterios' : null;
  return (
    <Sheet open onClose={onClose} title={`Editar sesión ${n}`} size="large" dirty={dirty}
      footer={<Button full disabled={!dirty || !!invalid} loading={patch.isPending}
        onClick={() => patch.mutate({ n, ...body }, { onSuccess: () => { toast('Sesión guardada'); onClose(); }, onError: fail(toast) })}>
        {invalid ?? (dirty ? 'Guardar' : 'Sin cambios')}
      </Button>}>
      <div className="form">
        <TextField label="Título" value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} data-autofocus />
        <TextArea label="Pregunta de la sesión" value={f.question} rows={2} maxLength={300} onChange={(e) => setF({ ...f, question: e.target.value })} />
        <TextArea label="Criterios de éxito" hint="Uno por línea, como mucho 3: «Sé…», «Puedo…»" value={f.criteria} rows={3}
          onChange={(e) => setF({ ...f, criteria: e.target.value })} />
        <Select label="Tipo de sesión" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as LessonKind })}
          hint="Cambiar el tipo no reescribe la sesión: usa «Regenerar sesión…» para eso.">
          {LESSON_KINDS.map((k) => <option key={k} value={k}>{lessonKindLabel(k, doc.family, table.data)}</option>)}
        </Select>
        <div className="option-line">
          <span>Duración de la clase</span>
          <Stepper label="Duración de la clase" value={f.minutes} onChange={(v) => setF({ ...f, minutes: v })} min={30} max={120} step={5} format={(v) => `${v} min`} />
        </div>
      </div>
    </Sheet>
  );
}

const GROUPS: { group: ArchetypeGroup; label: string }[] = [
  { group: 'empezar', label: 'Empezar' }, { group: 'explicar', label: 'Explicar' }, { group: 'comprobar', label: 'Comprobar' },
  { group: 'practicar', label: 'Practicar' }, { group: 'cerrar', label: 'Cerrar' },
];

/** «Añadir diapositiva»: the archetypes by group, and the unit's links («Enlace de la unidad»). The new slide opens in
 *  «Editar texto», empty. */
function AddSlideSheet({ m, doc, n, after, onAdded, onClose }: {
  m: MaterialDetail; doc: ContentDoc; n: number; after: string | null; onAdded: (id: string) => void; onClose: () => void;
}) {
  const table = useArchetypes();
  const add = useAddSlide(m.id);
  const unit = useUnit(m.unit_id ?? undefined);
  const { toast } = useFeedback();
  const lesson = presentationLessons(m).find((l) => l.n === n);
  // By default at the end of the lesson, before its closing slides.
  const where = after ?? beforeClosing(doc, lesson?.slide_ids ?? []);
  const links = (unit.data?.materials ?? []).filter((x) => x.kind === 'link' && x.status === 'ready');
  const create = (archetype: Slide['archetype'], link_id?: string) => add.mutate({ lesson: n, after: where, archetype, ...(link_id ? { link_id } : {}) }, {
    onSuccess: (r) => { toast('Diapositiva añadida'); if (r.created) onAdded(r.created); else onClose(); },
    onError: fail(toast),
  });
  const entries = Object.entries(table.data?.archetypes ?? {}) as [Slide['archetype'], NonNullable<typeof table.data>['archetypes'][Slide['archetype']]][];
  return (
    <Sheet open onClose={onClose} title="Añadir diapositiva" size="large" subtitle={`Al final de la sesión ${n}, antes de la respuesta a la pregunta. Después puedes moverla.`}>
      {!table.data ? <SkeletonList rows={6} /> : (
        <div className="form">
          {GROUPS.map((g) => {
            // The cover and the credits are Sepia's; a link has its own section.
            const items = entries.filter(([name, a]) => a.group === g.group && a.writer && name !== 'portada');
            if (!items.length) return null;
            return (
              <Section key={g.group} title={g.label}>
                <List>{items.map(([name, a]) => <Row key={name} title={a.label} onClick={() => create(name)} />)}</List>
              </Section>
            );
          })}
          <Section title="Enlace de la unidad">
            {links.length === 0
              ? <p className="muted">La unidad no tiene enlaces. Añade uno en la unidad («Añadir enlace») para proyectarlo con su código QR.</p>
              : <List>{links.map((l) => <Row key={l.id} title={l.title} sub={l.url ?? undefined} onClick={() => create('enlace', l.id)} />)}</List>}
          </Section>
        </div>
      )}
    </Sheet>
  );
}

/** «Regenerar sesión…»: the lesson written anew, with an optional instruction; it replaces its slides. */
function RegenerateSheet({ m, n, path, onClose }: { m: MaterialDetail; n: number; path: string; onClose: () => void }) {
  const job = useLessonJob(m.id);
  const { toast, confirm } = useFeedback();
  const [text, setText] = useState('');
  const lesson = presentationLessons(m).find((l) => l.n === n);
  const count = (lesson?.slide_ids.length ?? 0) + (lesson?.hidden_ids.length ?? 0);
  const submit = async () => {
    const ok = await confirm({
      title: `Regenerar la sesión ${n}`,
      text: count ? `Se sustituirán las ${count} diapositivas de la sesión ${n}.` : `Se escribirá de nuevo la sesión ${n}.`,
      confirm: 'Regenerar', danger: count > 0,
    });
    if (!ok) return;
    job.mutate({ n, regenerate: true, instructions: text.trim() }, {
      onSuccess: ({ job: j }) => {
        watchJob({ job: j.id, kind: 'material', done: `Sesión ${n} lista`, failed: 'No se ha podido preparar esta sesión.', path });
        toast(`Preparando de nuevo la sesión ${n}`);
        onClose();
      },
      onError: fail(toast),
    });
  };
  return (
    <Sheet open onClose={onClose} title={`Regenerar sesión ${n}`} dirty={!!text.trim()}
      subtitle="Se escribe de nuevo con la misma unidad e imágenes. Tarda unos minutos; puedes seguir trabajando."
      footer={<Button full onClick={() => void submit()} loading={job.isPending}>Regenerar sesión</Button>}>
      <TextArea label="Indicaciones (opcional)" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600}
        placeholder="Por ejemplo: más práctica y menos explicación" data-autofocus />
    </Sheet>
  );
}
