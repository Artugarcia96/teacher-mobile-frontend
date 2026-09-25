import { CheckCircle, DotsThree, Key, ListChecks, Warning } from '@phosphor-icons/react';
import { useDocumentUrl, useAcceptAll, type Correction, type CorrectionStudent } from '../../api/papers';
import type { Job } from '../../api/types';
import { formatGrade, formatPercent } from '../../lib/format';
import { Avatar, Button, Callout, Chip, Grade, IconButton, List, Menu, RichText, Row, RowIcon, Section, Stats, useFeedback, type MenuItem } from '../../ui';
import { JobLine } from './JobLine';
import { openSigned } from './openDoc';

interface Props {
  correction: Correction;
  job: Job | undefined;
  running: boolean;
  onOpenCollect: () => void;
  /** Marked absent on the exam day and nothing fills the slot yet (ActivityDetail `sheet[].pending_absent`). */
  absent: ReadonlySet<string>;
}

function StatusChip({ s, absent }: { s: CorrectionStudent; absent: boolean }) {
  const g = s.grade;
  if (g?.status === 'confirmed') return <Chip tone="ok">Revisado</Chip>;
  if (g?.status === 'absent') return <Chip tone="warn">NP</Chip>;
  if (g?.status === 'exempt') return <Chip>Exento</Chip>;
  if (g?.status === 'suggested') return <Chip tone="accent">IA lista</Chip>;
  if (absent) return <Chip tone="warn">Faltó</Chip>;
  if (s.paper_id) return <Chip tone="outline">Pendiente</Chip>;
  return <Chip>Sin examen</Chip>;
}

function Score({ s, max }: { s: CorrectionStudent; max: number }) {
  const g = s.grade;
  if (!g) return <span className="faint">—</span>;
  if (g.status === 'absent') return <span className="muted">NP</span>;
  if (g.status === 'confirmed') return <Grade value={g.score} max={max} className="score" />;
  if (g.status === 'suggested') return <span className="faint num score" title="Nota sugerida por la IA">{formatGrade(g.ai_score ?? g.score)}</span>;
  return <span className="faint">—</span>;
}

/** Step 3 — class list with AI suggestions and reviewed grades; entry to the focus review. */
/** Secondary actions of the review step (section header ⋯). */
export function ReviewMenu({ correction }: { correction: Correction }) {
  const { activity, stats } = correction;
  const acceptAll = useAcceptAll(activity.id, activity.course.id);
  const docUrl = useDocumentUrl(activity.id);
  const { toast, confirm } = useFeedback();

  const onAcceptAll = async () => {
    if (!(await confirm({
      title: `Aceptar ${stats.suggested} sugerencias`,
      text: 'Las notas de la IA pasan al cuaderno tal cual. Podrás cambiarlas después alumno a alumno.',
      confirm: 'Aceptar todas',
    }))) return;
    acceptAll.mutate(undefined, {
      onSuccess: ({ count }) => toast(`${count} notas pasadas al cuaderno`),
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  const menu: MenuItem[] = [];
  if (stats.suggested > 0) menu.push({ label: 'Aceptar todas las sugerencias', icon: <ListChecks size={18} />, onSelect: onAcceptAll });
  if (correction.rubric) {
    menu.push({ label: 'Descargar soluciones', icon: <Key size={18} />,
      onSelect: () => openSigned(() => docUrl.mutateAsync('key'), (m) => toast(m, { tone: 'error' })) });
  }
  if (!menu.length) return null;
  return <Menu trigger={(o) => <IconButton label="Más acciones" size="sm" onClick={o}><DotsThree size={20} weight="bold" /></IconButton>} items={menu} />;
}

/** Step 3 — class list with AI suggestions and reviewed grades; entry to the focus review. */
export function ReviewStep({ correction, job, running, onOpenCollect, absent }: Props) {
  const { activity, stats, students, unmatched } = correction;
  const base = `/clases/${activity.course.id}/actividades/${activity.id}`;

  const pending = stats.pending;

  return (
    <>
      {running && <JobLine job={job} fallback="Corrigiendo…" />}
      {pending > 0 && correction.next_pending_id ? (
        <Button to={`${base}/revisar?alumno=${correction.next_pending_id}`} className="review-main">
          Revisar alumno a alumno ({pending} {pending === 1 ? 'pendiente' : 'pendientes'})
        </Button>
      ) : stats.papers > 0 ? (
        <div className="review-done"><CheckCircle size={20} weight="fill" /><span>Todas las hojas emparejadas están revisadas.</span></div>
      ) : null}
      {unmatched.length > 0 && (
        <Callout tone="warn" icon={<Warning size={18} />}>
          <span>{unmatched.length === 1 ? 'Hay 1 hoja sin identificar.' : `Hay ${unmatched.length} hojas sin identificar.`} </span>
          <button type="button" className="link-btn" onClick={onOpenCollect}>Emparejar</button>
        </Callout>
      )}

      {stats.confirmed > 0 && (
        <Stats items={[
          { label: 'Media', value: <Grade value={stats.average} max={activity.max_score} average /> },
          { label: 'Aprobados', value: formatPercent(stats.pass_rate) },
          { label: 'Revisados', value: <span className="num">{stats.confirmed}<small className="stat-of"> / {stats.matched || students.length}</small></span> },
        ]} />
      )}

      {stats.frequent_errors.length > 0 && (
        <Section title="Errores frecuentes"
          footer={<Button variant="plain" size="sm" to={`/clases/${activity.course.id}/programacion`}>Crear ficha de refuerzo</Button>}>
          <List inset={64}>
            {stats.frequent_errors.map((e) => (
              <Row key={e.item_id} lead={<RowIcon tone="warn"><span className="num">{e.label}</span></RowIcon>}
                title={<RichText className="clamp-2 error-text" text={e.text} />}
                sub={`${formatPercent(e.avg_ratio * 100)} de los puntos, de media`} />
            ))}
          </List>
        </Section>
      )}

      <Section title={`Clase · ${students.length}`}>
        <List inset={64}>
          {students.map((s) => (
            <Row key={s.student.id} lead={<Avatar initials={s.student.initials} />} title={s.student.sort_name}
              sub={<StatusChip s={s} absent={absent.has(s.student.id)} />} to={`${base}/revisar?alumno=${s.student.id}`}
              trail={<Score s={s} max={activity.max_score} />} />
          ))}
        </List>
      </Section>
    </>
  );
}
