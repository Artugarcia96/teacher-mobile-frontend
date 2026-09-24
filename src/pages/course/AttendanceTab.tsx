/** Asistencia de la clase por evaluación: sesiones con lista, listas sin pasar y faltas por alumno. */
import { Check, ListChecks, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAttendanceSummary } from '../../api/attendance';
import type { CourseDetail } from '../../api/types';
import TakeAttendanceSheet from '../../features/attendance/TakeAttendanceSheet';
import { useAuth } from '../../lib/auth';
import { longDate, plural, TERM_SHORT } from '../../lib/format';
import { Avatar, Button, EmptyState, List, Row, RowIcon, Section, Segmented, SkeletonList, Stats } from '../../ui';
import './attendance-tab.css';

const MISSING_VISIBLE = 5;

export default function AttendanceTab({ course }: { course: CourseDetail }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState(me?.school_year.current_term && me.school_year.current_term <= 3 ? me.school_year.current_term : 1);
  const [sheet, setSheet] = useState<{ date: string; start: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const q = useAttendanceSummary(course.id, term);
  const s = q.data;

  const termPicker = (
    <Segmented full label="Evaluación" value={term} onChange={setTerm}
      options={[1, 2, 3].map((t) => ({ value: t, label: `${TERM_SHORT[t]} evaluación` }))} />
  );

  let body;
  if (q.isLoading) body = <SkeletonList rows={6} />;
  else if (q.error || !s) {
    body = <EmptyState icon={<WarningCircle size={24} />} title="No se ha podido cargar la asistencia" text={(q.error as Error | null)?.message}
      action={<Button variant="tinted" onClick={() => q.refetch()}>Reintentar</Button>} />;
  } else if (!s.students.length) {
    body = <EmptyState icon={<UsersThree size={24} />} title="Esta clase aún no tiene alumnos"
      action={<Button onClick={() => navigate(`/clases/${course.id}/alumnos`)}>Añadir alumnos</Button>} />;
  } else {
    const totals = s.students.reduce((a, r) => ({ absent: a.absent + r.absent, justified: a.justified + r.justified, late: a.late + r.late }),
      { absent: 0, justified: 0, late: 0 });
    const missing = showAll ? s.sessions_missing : s.sessions_missing.slice(0, MISSING_VISIBLE);
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
        <Stats items={[
          { label: 'Sesiones con lista', value: s.sessions_taken },
          { label: 'Faltas sin justificar', value: totals.absent },
          { label: 'Retrasos', value: totals.late },
        ]} />
        {s.sessions_missing.length > 0 && (
          <Section title={`Sin pasar · ${s.sessions_missing.length}`}
            action={s.sessions_missing.length > MISSING_VISIBLE && (
              <button type="button" className="section__action" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Ver menos' : 'Ver todas'}</button>
            )}>
            <List inset={64}>
              {missing.map((m) => (
                <Row key={`${m.date}-${m.start}`} lead={<RowIcon tone="warn"><ListChecks size={20} /></RowIcon>}
                  title={longDate(m.date)} sub={m.end ? `${m.start}–${m.end}` : m.start} onClick={() => setSheet(m)} />
              ))}
            </List>
          </Section>
        )}
        <Section title="Por alumno" footer="Ordenado por faltas sin justificar.">
          <List inset={64}>
            {s.students.map((r) => {
              const parts = [
                r.absent > 0 && plural(r.absent, 'falta', 'faltas'),
                r.justified > 0 && plural(r.justified, 'justificada', 'justificadas'),
                r.late > 0 && plural(r.late, 'retraso', 'retrasos'),
              ].filter(Boolean);
              return (
                <Row key={r.student.id} to={`/alumnos/${r.student.id}`} lead={<Avatar initials={r.student.initials} />}
                  title={r.student.sort_name} sub={parts.length ? parts.join(' · ') : 'Sin faltas'}
                  trail={r.absent > 0 ? <span className={`att-count num${r.absent >= 3 ? ' att-count--high' : ''}`}>{r.absent}</span> : undefined} />
              );
            })}
          </List>
        </Section>
      </>
    );
  }

  return (
    <div className="att-tab">
      <div className="att-tab__bar">{termPicker}</div>
      {body}
      {sheet && (
        <TakeAttendanceSheet open onClose={() => setSheet(null)} courseId={course.id} date={sheet.date} start={sheet.start}
          label={course.label} />
      )}
    </div>
  );
}
