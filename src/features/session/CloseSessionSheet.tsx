/** «Cerrar clase» (diario de clase): qué se ha hecho, qué toca la próxima vez y deberes. La siguiente sesión de la clase lo
 *  muestra arriba («Toca: …»). Si la unidad en curso tiene presentación, qué sesión se ha dado y si se terminó: «Hoy»
 *  abre la siguiente (o la misma, en la diapositiva donde se quedó). Opcional: dar la unidad por terminada y empezar la
 *  siguiente. */
import { useEffect, useState } from 'react';
import { useSaveSessionLog, useSessionLog, type SessionLog, type SessionPresentation } from '../../api/sessions';
import { useToday } from '../../lib/auth';
import { longDate } from '../../lib/format';
import { Button, List, Row, Segmented, Select, Sheet, SkeletonList, Switch, TextArea, TextField, useFeedback } from '../../ui';
import './session.css';

export interface CloseSessionSheetProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  date: string;
  start: string;
  label?: string;
}

export default function CloseSessionSheet(props: CloseSessionSheetProps) {
  if (!props.open) return null;
  return <CloseBody key={`${props.courseId}|${props.date}|${props.start}`} {...props} />;
}

/** How the lesson of the presentation went: finished, half done, or not used today. */
export type LessonState = 'done' | 'half' | 'none';
type Form = { done: string; next: string; homework: string; finish: boolean; lesson: number; state: LessonState };
type Auto = Pick<Form, 'done' | 'next' | 'homework'>;

const lessonName = (p: SessionPresentation, n: number) => {
  const l = p.lessons.find((x) => x.n === n);
  return l ? `Sesión ${n} · ${l.title}` : `Sesión ${n}`;
};

/** What the sheet writes for a lesson («Hecho hoy», «Para la próxima», «Deberes»); the teacher edits it freely. */
export function lessonTexts(p: SessionPresentation, n: number, state: LessonState, slide: number | null): Auto {
  if (state === 'none') return { done: '', next: '', homework: '' };
  const lesson = p.lessons.find((x) => x.n === n);
  const half = state === 'half';
  const nextLesson = p.lessons.find((x) => x.n === n + 1);
  return {
    done: `${lessonName(p, n)}${half && slide ? `, hasta la diapositiva ${slide}` : ''}`,
    next: half ? `Terminar la sesión ${n}` : nextLesson ? lessonName(p, nextLesson.n) : '',
    homework: lesson?.homework ?? '',
  };
}

/** The lesson row's first state: what was saved, else what the presenter recorded during this session. */
export function initialLesson(d: SessionLog): { lesson: number; state: LessonState } {
  const p = d.presentation!;
  if (d.saved) {
    if (!d.material_id || d.lesson == null) return { lesson: p.lesson, state: 'none' };
    return { lesson: d.lesson, state: d.lesson_done ? 'done' : 'half' };
  }
  const slides = p.lessons.find((x) => x.n === p.lesson)?.slides ?? 0;
  return { lesson: p.lesson, state: p.slide != null && p.slide < slides ? 'half' : 'done' };
}

function CloseBody({ onClose, courseId, date, start, label }: CloseSessionSheetProps) {
  const today = useToday();
  const { toast, confirm } = useFeedback();
  const q = useSessionLog(courseId, date, start);
  const save = useSaveSessionLog(courseId);
  const [f, setF] = useState<Form | null>(null);
  const [loaded, setLoaded] = useState<Form | null>(null);
  const [auto, setAuto] = useState<Auto | null>(null);

  useEffect(() => {
    if (f || !q.data) return;
    const d = q.data;
    const row = d.presentation ? initialLesson(d) : { lesson: 0, state: 'none' as LessonState };
    const filled = d.presentation && !d.saved ? lessonTexts(d.presentation, row.lesson, row.state, d.presentation.slide) : null;
    const first: Form = {
      done: d.saved ? d.done ?? '' : filled?.done || d.previous?.next || '',
      next: d.saved ? d.next ?? '' : filled?.next || d.next || '',
      homework: d.saved ? d.homework ?? '' : filled?.homework || d.homework || '',
      finish: false, ...row,
    };
    setF(first);
    setLoaded(first);
    setAuto(filled);
  }, [q.data, f]);
  const dirty = !!f && !!loaded && (Object.keys(f) as (keyof Form)[]).some((k) => f[k] !== loaded[k]);

  // Changing the lesson or how it went rewrites what the sheet wrote, never what the teacher typed.
  const setLesson = (patch: Partial<Pick<Form, 'lesson' | 'state'>>) => {
    if (!f || !q.data?.presentation) return;
    const p = q.data.presentation;
    const next = { ...f, ...patch };
    const slide = next.lesson === p.lesson ? p.slide : null;
    const texts = lessonTexts(p, next.lesson, next.state, slide);
    const keep = (k: keyof Auto) => (auto ? f[k] === auto[k] || !f[k].trim() : !f[k].trim());
    setF({ ...next, done: keep('done') ? texts.done : f.done, next: keep('next') ? texts.next : f.next, homework: keep('homework') ? texts.homework : f.homework });
    setAuto(texts);
  };

  const empty = !!f && !f.done.trim() && !f.next.trim() && !f.homework.trim() && !f.finish;
  const submit = async () => {
    if (!f) return;
    if (empty && !(await confirm({ title: 'Borrar el cierre de clase', text: 'La próxima clase ya no mostrará qué toca ni los deberes.',
      confirm: 'Borrar', danger: true }))) return;
    const p = q.data?.presentation;
    const used = !!p && f.state !== 'none' && !empty;
    try {
      const r = await save.mutateAsync({
        date, start, done: f.done, next: f.next, homework: f.homework, finish_unit: f.finish,
        material_id: used ? p.id : null, lesson: used ? f.lesson : null, lesson_done: used ? f.state === 'done' : null,
      });
      toast(empty ? 'Cierre de clase borrado' : f.finish && r.unit ? `Clase cerrada · empieza «${r.unit.title}»`
        : q.data?.saved ? 'Cierre de clase actualizado' : 'Clase cerrada');
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const d = q.data;
  const p = d?.presentation;
  const when = [date !== today && longDate(date), d?.end ? `${start}–${d.end}` : start].filter(Boolean).join(' · ');
  return (
    <Sheet open side onClose={onClose} dirty={dirty} title={label ? `Cerrar clase · ${label}` : 'Cerrar clase'} subtitle={when}
      footer={<Button full variant={empty && d?.saved ? 'danger' : 'primary'} onClick={submit} loading={save.isPending} disabled={!f || (empty && !d?.saved)}>
        {empty && d?.saved ? 'Borrar el cierre' : empty ? 'Escribe qué habéis hecho' : 'Guardar'}
      </Button>}>
      {q.error ? <p className="muted">{(q.error as Error).message}</p> : !f || !d ? <SkeletonList rows={3} /> : (
        <div className="form">
          {p && (
            <div className="close-lesson">
              <div className="close-lesson__title">Presentación: {lessonName(p, f.lesson)}</div>
              <Segmented full label="Cómo ha ido la sesión" value={f.state} onChange={(state) => setLesson({ state })}
                options={[{ value: 'done' as const, label: 'Terminada' }, { value: 'half' as const, label: 'A medias' }, { value: 'none' as const, label: 'No la he usado' }]} />
              {p.lessons.length > 1 && f.state !== 'none' && (
                <Select label="Sesión de la presentación" value={f.lesson} onChange={(e) => setLesson({ lesson: Number(e.target.value) })}>
                  {p.lessons.map((l) => <option key={l.n} value={l.n}>{lessonName(p, l.n)}</option>)}
                </Select>
              )}
            </div>
          )}
          <TextArea label="Hecho hoy" rows={2} className="close-done" value={f.done} maxLength={2000} onChange={(e) => setF({ ...f, done: e.target.value })} />
          <TextField label="Para la próxima" placeholder="Qué toca en la próxima clase" value={f.next} maxLength={2000}
            onChange={(e) => setF({ ...f, next: e.target.value })} />
          <TextField label="Deberes" hint="Opcional. En la próxima clase podrás revisarlos a toques." placeholder="Ej.: p. 40, ej. 1-4"
            value={f.homework} maxLength={1000} onChange={(e) => setF({ ...f, homework: e.target.value })} />
          {d.unit && (
            <List>
              <Row title={`Unidad terminada: ${d.unit.title}`} wrapSub
                sub={d.next_unit ? `Empezar la siguiente: ${d.next_unit.title}` : 'Es la última unidad de la programación'}
                trail={<Switch label="Unidad terminada" checked={f.finish} onChange={(v) => setF({ ...f, finish: v })} />} />
            </List>
          )}
        </div>
      )}
    </Sheet>
  );
}
