import { CalendarBlank, CheckCircle, Exam, PencilSimpleLine } from '@phosphor-icons/react';
import { useInbox, type Inbox } from '../../api/inbox';
import { useToday } from '../../lib/auth';
import { longDate, plural, relativeDay, shortDate, TERM_LABEL } from '../../lib/format';
import { Button, Callout, Chip, Dot, EmptyState, List, Page, Row, RowIcon, Section, SkeletonList } from '../../ui';
import './InboxPage.css';

/** Evaluar: what is waiting for the teacher — exams to review, activities without grades, and the term's evaluation. */
export default function InboxPage() {
  const q = useInbox();
  return (
    <Page title="Evaluar">
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

function InboxBody({ data }: { data: Inbox }) {
  const today = useToday();
  const ev = data.next_evaluation_event;
  const days = ev ? Math.round((Date.parse(ev.date) - Date.parse(today)) / 86_400_000) : null;
  const allCommented = data.evaluations.every((e) => e.comments_missing === 0);
  return (
    <>
      {ev && (
        <Callout tone="accent" icon={<CalendarBlank size={20} />}>
          <b>{ev.title}</b>
          <div>{longDate(ev.date)} · {days === 0 ? 'hoy' : days === 1 ? 'mañana' : `dentro de ${days} días`}</div>
        </Callout>
      )}

      {data.count === 0 && (
        <EmptyState icon={<CheckCircle size={24} />} title="Todo al día"
          text={allCommented ? 'No hay exámenes por revisar ni notas pendientes.' : 'No hay exámenes por revisar ni notas pendientes. Quedan comentarios de boletín por escribir.'}
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
                    {x.suggested > 0 && <Chip tone="accent">{plural(x.suggested, 'nota sugerida', 'notas sugeridas')}</Chip>}
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
                lead={<RowIcon><PencilSimpleLine size={20} /></RowIcon>}
                title={x.activity.title}
                sub={<>
                  <span className="inbox-meta"><Dot color={x.course.color} /> {x.course.label} · {shortDate(x.activity.date)}</span>
                  <span className="inbox-chips"><Chip>{x.missing} {x.missing === 1 ? 'alumno sin nota' : 'alumnos sin nota'}</Chip></span>
                </>} />
            ))}
          </List>
        </Section>
      )}

      {data.evaluations.length > 0 && (
        <Section title={`Evaluaciones · ${TERM_LABEL[data.evaluations[0].term]}`}>
          <List>
            {data.evaluations.map((e) => {
              const parts = [`${e.graded_students} de ${e.total_students} con nota`];
              if (e.comments_missing) parts.push(plural(e.comments_missing, 'comentario pendiente', 'comentarios pendientes'));
              else parts.push('comentarios listos');
              return (
                <Row key={e.course.id} to={`/clases/${e.course.id}/evaluacion/${e.term}`}
                  lead={<Dot color={e.course.color} large />}
                  title={e.course.label}
                  sub={parts.join(' · ')} wrapSub />
              );
            })}
          </List>
        </Section>
      )}
    </>
  );
}
