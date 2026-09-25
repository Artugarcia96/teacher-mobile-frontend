/** «Voy a faltar»: elegir días y sesiones, el motivo y la tarea de cada sesión (por defecto «Continuar con <unidad>» y,
 *  si hay, un material de la unidad). Resultado: las sesiones quedan como «Guardia» y un PDF para jefatura de estudios. */
import { CalendarX, FilePdf } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useAbsenceSessions, useCreateAbsence, type AbsenceSession } from '../../api/sessions';
import { fileUrl } from '../../lib/api';
import { useToday } from '../../lib/auth';
import { plural, shortDate, weekdayShort } from '../../lib/format';
import { Button, Chip, DateField, Dot, EmptyState, List, Row, Section, Sheet, SkeletonList, Switch, TextArea, TextField, useFeedback } from '../../ui';
import './session.css';

export interface AbsenceSheetProps {
  open: boolean;
  onClose: () => void;
  /** First day to propose (today or a future day of Hoy). */
  date: string;
}

type Choice = { on: boolean; task: string; materials: string[] };
const key = (s: AbsenceSession) => `${s.course.id}|${s.date}|${s.start}`;

export default function AbsenceSheet(props: AbsenceSheetProps) {
  if (!props.open) return null;
  return <AbsenceBody {...props} />;
}

function AbsenceBody({ onClose, date }: AbsenceSheetProps) {
  const today = useToday();
  const { toast } = useFeedback();
  const first = date < today ? today : date;
  const [range, setRange] = useState({ from: first, to: first });
  const [reason, setReason] = useState('');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [pdf, setPdf] = useState<{ url: string; count: number } | null>(null);
  const q = useAbsenceSessions(range.from, range.to, !pdf);
  const create = useCreateAbsence();
  const sessions = useMemo(() => q.data?.sessions ?? [], [q.data]);

  useEffect(() => {
    setChoices((cur) => {
      const next = { ...cur };
      for (const s of sessions) {
        next[key(s)] ??= { on: true, task: s.task ?? (s.unit ? `Continuar con ${s.unit.title}.` : ''), materials: [] };
      }
      return next;
    });
  }, [sessions]);

  const set = (k: string, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [k]: { ...c[k], ...patch } }));
  const chosen = sessions.filter((s) => choices[key(s)]?.on);
  const rangeError = range.from < today ? 'Elige un día a partir de hoy' : range.to < range.from ? 'La fecha final debe ser posterior' : null;
  const disabledReason = rangeError ?? (!chosen.length ? 'Elige al menos una sesión'
    : chosen.some((s) => !choices[key(s)].task.trim()) ? 'Escribe la tarea de cada sesión' : null);

  const submit = async () => {
    try {
      const r = await create.mutateAsync({
        reason: reason.trim() || null,
        sessions: chosen.map((s) => ({ course_id: s.course.id, date: s.date, start: s.start, task: choices[key(s)].task.trim(),
          material_ids: choices[key(s)].materials })),
      });
      setPdf({ url: r.pdf_url, count: r.count });
      toast(`${plural(r.count, 'sesión marcada', 'sesiones marcadas')} como guardia`);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  if (pdf) {
    return (
      <Sheet open side onClose={onClose} title="Voy a faltar">
        <EmptyState icon={<FilePdf size={24} />} title={`${plural(pdf.count, 'sesión', 'sesiones')} como guardia`}
          text="Imprime el PDF y déjalo en jefatura de estudios. En tu agenda esas sesiones aparecen como «Guardia»."
          action={<a className="btn btn--primary" href={fileUrl(pdf.url)} target="_blank" rel="noreferrer"><span>Descargar PDF</span></a>} />
      </Sheet>
    );
  }

  return (
    <Sheet open side size="large" onClose={onClose} title="Voy a faltar" subtitle="Deja la tarea de cada clase para el profesorado de guardia."
      footer={<Button full onClick={submit} loading={create.isPending} disabled={!!disabledReason} title={disabledReason ?? undefined}>
        {chosen.length ? `Crear hoja de guardia (${chosen.length})` : 'Crear hoja de guardia'}
      </Button>}>
      <div className="form">
        <div className="form-row">
          <DateField label="Desde" short min={today} value={range.from}
            onChange={(v) => setRange((r) => ({ from: v, to: r.to < v ? v : r.to }))} />
          <DateField label="Hasta" short min={range.from} value={range.to} error={rangeError}
            onChange={(v) => setRange((r) => ({ ...r, to: v }))} />
        </div>
        <TextField label="Motivo" placeholder="Formación, médico, asuntos propios…" value={reason} maxLength={200}
          hint="Opcional. Aparece en la hoja de guardia." onChange={(e) => setReason(e.target.value)} />
        <Section title={sessions.length ? `Sesiones · ${chosen.length} de ${sessions.length}` : 'Sesiones'}>
          {rangeError ? null : q.isLoading ? <SkeletonList rows={3} /> : q.error ? (
            <p className="muted">{(q.error as Error).message}</p>
          ) : !sessions.length ? (
            <div className="list"><EmptyState icon={<CalendarX size={24} />} title="Sin clases esos días" text="Elige otras fechas." /></div>
          ) : (
            <div className="absence-list">
              {sessions.map((s) => {
                const c = choices[key(s)];
                if (!c) return null;
                return (
                  <List key={key(s)}>
                    <Row lead={<Dot color={s.course.color} large />} title={s.course.label} wrapSub
                      sub={[`${weekdayShort(s.date)} ${shortDate(s.date)}, ${s.start}–${s.end}`, s.room && `Aula ${s.room}`, s.guardia && 'ya en guardia']
                        .filter(Boolean).join(' · ')}
                      trail={<Switch label={`Incluir ${s.course.label} ${s.start}`} checked={c.on} onChange={(on) => set(key(s), { on })} />} />
                    {c.on && (
                      <div className="row absence-task">
                        <TextArea aria-label="Tarea" rows={2} value={c.task} maxLength={2000} placeholder="Qué deben hacer en esta sesión"
                          onChange={(e) => set(key(s), { task: e.target.value })} />
                        {s.materials.length > 0 && (
                          <div className="absence-task__mats">
                            <span className="field__label">Material de «{s.unit?.title}»</span>
                            <div className="chip-row">
                              {s.materials.map((m) => {
                                const on = c.materials.includes(m.id);
                                return (
                                  <Chip key={m.id} selected={on}
                                    onClick={() => set(key(s), { materials: on ? c.materials.filter((x) => x !== m.id) : [...c.materials, m.id] })}>
                                    {m.title}
                                  </Chip>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </List>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </Sheet>
  );
}
