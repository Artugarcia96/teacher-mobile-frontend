/** Asistencia de la clase por evaluación: listas de hoy, listas sin pasar (últimos 14 días lectivos) y faltas por alumno. */
import { Check, DotsThree, ListChecks, WarningCircle, XCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useAttendanceSummary, useBulkTaken, type SessionSlot } from '../../api/attendance';
import { useCancelSession } from '../../api/today';
import type { CourseDetail } from '../../api/types';
import TakeAttendanceSheet from '../../features/attendance/TakeAttendanceSheet';
import { useAuth } from '../../lib/auth';
import { longDate, plural, TERM_SHORT } from '../../lib/format';
import { Button, EmptyState, IconButton, List, Menu, Row, RowIcon, Section, Segmented, SkeletonList, useFeedback } from '../../ui';
import './attendance-tab.css';

export default function AttendanceTab({ course }: { course: CourseDetail }) {
  const { me } = useAuth();
  const { toast, confirm } = useFeedback();
  const [term, setTerm] = useState(me?.school_year.current_term && me.school_year.current_term <= 3 ? me.school_year.current_term : 1);
  const [sheet, setSheet] = useState<{ date: string; start: string } | null>(null);
  const q = useAttendanceSummary(course.id, term);
  const bulk = useBulkTaken(course.id);
  const cancel = useCancelSession();
  const s = q.data;

  const allPresent = async (slots: SessionSlot[]) => {
    if (!(await confirm({
      title: 'Dar por pasadas', confirm: 'Dar por pasadas',
      text: `${plural(slots.length, 'lista quedará', 'listas quedarán')} con todos presentes. Podrás corregir cualquiera después.`,
    }))) return;
    try {
      const r = await bulk.mutateAsync(slots);
      toast(`${plural(r.count, 'lista pasada', 'listas pasadas')} con todos presentes`);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const noClass = async (m: SessionSlot) => {
    if (!(await confirm({
      title: 'No hubo clase', confirm: 'No hubo clase', danger: true,
      text: `La sesión del ${longDate(m.date)} a las ${m.start} queda cancelada y deja de contar como lista sin pasar.`,
    }))) return;
    try {
      await cancel.mutateAsync({ courseId: course.id, date: m.date, start: m.start, note: 'No hubo clase' });
      toast('Sesión cancelada');
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  let body;
  if (q.isLoading) body = <SkeletonList rows={6} />;
  else if (q.error || !s) {
    body = <EmptyState icon={<WarningCircle size={24} />} title="No se ha podido cargar la asistencia" text={(q.error as Error | null)?.message}
      action={<Button variant="tinted" onClick={() => q.refetch()}>Reintentar</Button>} />;
  } else {
    body = (
      <>
        {s.today.length > 0 && (
          <Section title="Hoy">
            <List inset={64}>
              {s.today.map((t) => (
                <Row key={t.start} lead={<RowIcon tone={t.taken ? 'accent' : 'warn'}>{t.taken ? <Check size={20} /> : <ListChecks size={20} />}</RowIcon>}
                  title={`${t.start}–${t.end}`} sub={t.taken ? 'Lista pasada' : 'Lista sin pasar'} chevron={false}
                  trail={<Button size="sm" variant={t.taken ? 'tinted' : 'primary'} onClick={() => setSheet(t)}>{t.taken ? 'Editar lista' : 'Pasar lista'}</Button>} />
              ))}
            </List>
          </Section>
        )}
        {s.sessions_missing.length > 0 && (
          <Section title={`Listas sin pasar · ${s.sessions_missing.length}`} footer="Últimos 14 días lectivos.">
            <List>
              {s.sessions_missing.map((m) => (
                <Row key={`${m.date}-${m.start}`} title={longDate(m.date)} sub={m.end ? `${m.start}–${m.end}` : m.start}
                  trail={<>
                    <Button size="sm" variant="tinted" onClick={() => setSheet(m)}>Pasar lista</Button>
                    <Menu trigger={(open) => <IconButton size="sm" label={`Más opciones del ${longDate(m.date)}`} onClick={open}><DotsThree size={20} weight="bold" /></IconButton>}
                      items={[{ label: 'No hubo clase', icon: <XCircle size={18} />, danger: true, onSelect: () => noClass(m) }]} />
                  </>} />
              ))}
            </List>
            <Button variant="neutral" full onClick={() => allPresent(s.sessions_missing)} loading={bulk.isPending}>
              Dar por pasadas (todos presentes)
            </Button>
          </Section>
        )}
        <Section title="Por alumno" footer={s.students.length ? 'Ordenado por faltas sin justificar.' : undefined}>
          {s.students.length === 0 ? (
            <List><Row title="Nadie ha faltado ni llegado tarde" sub={`${TERM_SHORT[term]} evaluación`} muted /></List>
          ) : (
            <List>
              {s.students.map((r) => {
                const parts = [
                  r.absent > 0 && plural(r.absent, 'falta sin justificar', 'faltas sin justificar'),
                  r.justified > 0 && plural(r.justified, 'justificada', 'justificadas'),
                  r.late > 0 && plural(r.late, 'retraso', 'retrasos'),
                ].filter(Boolean);
                return (
                  <Row key={r.student.id} to={`/alumnos/${r.student.id}#asistencia`} title={r.student.sort_name} sub={parts.join(' · ')} />
                );
              })}
            </List>
          )}
        </Section>
      </>
    );
  }

  return (
    <div className="att-tab">
      <div className="att-tab__bar">
        <Segmented full label="Evaluación" value={term} onChange={setTerm} options={[1, 2, 3].map((t) => ({ value: t, label: TERM_SHORT[t] }))} />
      </div>
      {course.student_count === 0 && !q.isLoading ? (
        <EmptyState icon={<ListChecks size={24} />} title="Esta clase aún no tiene alumnos"
          action={<Button to={`/clases/${course.id}/alumnos?anadir=1`}>Añadir alumnos</Button>} />
      ) : body}
      {sheet && (
        <TakeAttendanceSheet open onClose={() => setSheet(null)} courseId={course.id} date={sheet.date} start={sheet.start}
          label={course.label} room={course.room} />
      )}
    </div>
  );
}
