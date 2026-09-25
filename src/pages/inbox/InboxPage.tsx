import { CheckCircle, Exam, PencilSimpleLine, Table } from '@phosphor-icons/react';
import { useState } from 'react';
import { useInbox, type Inbox, type InboxEvaluation } from '../../api/inbox';
import { useToday } from '../../lib/auth';
import { longDate, plural, relativeDay, shortDate, TERM_LABEL } from '../../lib/format';
import { Button, Callout, Chip, Dot, EmptyState, List, Page, Row, RowIcon, Section, SkeletonList } from '../../ui';
import DepartmentReportSheet from './DepartmentReportSheet';
import './InboxPage.css';

/** Evaluar: what is waiting for the teacher — exams to review, activities without grades, and the term's evaluation. */
export default function InboxPage() {
  const q = useInbox();
  const today = useToday();
  const ev = q.data?.next_evaluation_event;
  const days = ev ? Math.round((Date.parse(ev.date) - Date.parse(today)) / 86_400_000) : null;
  const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`;
  const subtitle = ev && `${sessionName(ev)}: ${longDate(ev.date)}, ${when}`;
  return (
    <Page title="Evaluar" subtitle={subtitle}>
      {q.error && !q.data ? (
        <Callout tone="warn">
          <b>No se ha podido cargar la bandeja.</b> {q.error.message}{' '}
          <Button size="sm" variant="plain" onClick={() => q.refetch()}>Reintentar</Button>
        </Callout>
      ) : !q.data ? (
        <SkeletonList rows={5} />
      ) : (
        <InboxBody data={q.data} />
      )}
    </Page>
  );
}

/** "Sesión de la 2.ª evaluación" (the term of the session's date) for the generic "Sesión de evaluación…" events;
 * the event's own title otherwise ("Evaluación inicial"). */
function sessionName(ev: NonNullable<Inbox['next_evaluation_event']>): string {
  return /^sesi[oó]n de evaluaci[oó]n/i.test(ev.title.trim()) ? `Sesión de la ${TERM_LABEL[ev.term]}` : ev.title;
}

/** What only the evaluation page can settle, in words: "Faltan 3 comentarios · 22 comentarios de la IA sin revisar ·
 *  2 alumnos con examen pendiente". Activities to review or grade are already listed above. */
function evaluationLine(e: InboxEvaluation): string | null {
  const parts = [];
  if (e.comments_missing) parts.push(e.comments_missing === 1 ? 'falta 1 comentario' : `faltan ${e.comments_missing} comentarios`);
  if (e.comments_unreviewed) parts.push(plural(e.comments_unreviewed, 'comentario de la IA sin revisar', 'comentarios de la IA sin revisar'));
  if (e.pending_absent) parts.push(`${plural(e.pending_absent, 'alumno con examen pendiente', 'alumnos con examen pendiente')} por falta`);
  if (!parts.length) return null;
  const line = parts.join(' · ');
  return line[0].toUpperCase() + line.slice(1);
}

/** The class is ready for the session only when its grades are too (they are listed in «Por revisar» / «Por calificar»). */
function gradesPending(e: InboxEvaluation): string | null {
  const acts = [...e.to_review, ...e.to_grade];
  if (!acts.length) return null;
  return acts.length === 1 ? `faltan notas de ${acts[0].title}` : `faltan notas en ${acts.length} actividades`;
}

function InboxBody({ data }: { data: Inbox }) {
  const today = useToday();
  const [report, setReport] = useState(false);
  const nothingToGrade = !data.to_review.length && !data.to_grade.length;
  const term = data.evaluations[0]?.term ?? 1;
  return (
    <>
      {nothingToGrade && (
        <EmptyState icon={<CheckCircle size={24} />} title="Todo al día"
          text="No hay exámenes por revisar ni notas pendientes."
          action={<Button variant="tinted" to="/clases">Ver clases</Button>} />
      )}

      {data.to_review.length > 0 && (
        <Section title="Por revisar">
          <List inset={64}>
            {data.to_review.map((x) => (
              <Row key={x.activity.id} to={`/clases/${x.course.id}/actividades/${x.activity.id}`} wrapSub
                lead={<RowIcon tone="accent"><Exam size={20} /></RowIcon>}
                title={x.activity.title}
                sub={<>
                  <span className="inbox-meta"><Dot color={x.course.color} /> {x.course.label} · {relativeDay(x.activity.date, today)}</span>
                  <span className="inbox-chips">
                    {x.suggested > 0 && <Chip tone="accent">{x.suggested} por revisar</Chip>}
                    {x.unmatched > 0 && <Chip tone="warn">{plural(x.unmatched, 'hoja sin alumno', 'hojas sin alumno')}</Chip>}
                  </span>
                </>} />
            ))}
          </List>
        </Section>
      )}

      {data.to_grade.length > 0 && (
        <Section title="Por calificar">
          <List inset={64}>
            {data.to_grade.map((x) => (
              <Row key={x.activity.id} to={`/clases/${x.course.id}/cuaderno?term=${x.activity.term}&a=${x.activity.id}`} wrapSub
                lead={<RowIcon tone="accent"><PencilSimpleLine size={20} /></RowIcon>}
                title={x.activity.title}
                sub={<>
                  <span className="inbox-meta"><Dot color={x.course.color} /> {x.course.label} · {shortDate(x.activity.date)}</span>
                  <span className="inbox-chips">
                    <Chip>{x.missing} sin nota</Chip>
                    {x.pending_absent > 0 && <Chip tone="warn">{x.pending_absent === 1 ? '1 faltó' : `${x.pending_absent} faltaron`}</Chip>}
                  </span>
                </>} />
            ))}
          </List>
        </Section>
      )}

      {data.evaluations.length > 0 && (
        <Section title={TERM_LABEL[term]}
          action={<Button size="sm" variant="plain" icon={<Table size={16} />} onClick={() => setReport(true)}>Informe del departamento</Button>}>
          <List>
            {data.evaluations.map((e) => {
              const line = evaluationLine(e);
              const grades = gradesPending(e);
              const text = [line, grades && (line ? grades : grades[0].toUpperCase() + grades.slice(1))].filter(Boolean).join(' · ');
              return (
                <Row key={e.course.id} to={`/clases/${e.course.id}/evaluacion/${e.term}`}
                  lead={<Dot color={e.course.color} large />}
                  title={e.course.label}
                  trail={text ? undefined : <Chip tone="ok">Lista</Chip>}
                  sub={text || 'Notas y comentarios revisados'} wrapSub />
              );
            })}
          </List>
        </Section>
      )}
      <DepartmentReportSheet open={report} onClose={() => setReport(false)} initialTerm={term} />
    </>
  );
}
