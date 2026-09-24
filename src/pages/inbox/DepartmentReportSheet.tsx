import { FileCsv, FilePdf } from '@phosphor-icons/react';
import { useState } from 'react';
import { useDepartmentReport, useSaveDepartmentNote, type DepartmentRow } from '../../api/evaluation';
import { download } from '../../lib/api';
import { formatGrade, formatPercent, plural, TERM_LABEL, TERM_SHORT } from '../../lib/format';
import { Button, Callout, Dot, Segmented, Sheet, SkeletonList, TextField, useFeedback } from '../../ui';
import './InboxPage.css';

const TERMS = [1, 2, 3, 4].map((t) => ({ value: t, label: TERM_SHORT[t] }));
const BANDS = ['IN', 'SU', 'BI', 'NT', 'SB'] as const;

/** Informe para el departamento: one row per class for a term (results, distribution, units planned vs taught)
 * plus one editable line "Causas y propuestas" per class. Downloads as PDF and CSV. */
export default function DepartmentReportSheet({ open, onClose, initialTerm }: { open: boolean; onClose: () => void; initialTerm: number }) {
  if (!open) return null;
  return <Report onClose={onClose} initialTerm={initialTerm} />;
}

function Report({ onClose, initialTerm }: { onClose: () => void; initialTerm: number }) {
  const { toast } = useFeedback();
  const [term, setTerm] = useState(initialTerm);
  const q = useDepartmentReport(term);
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const label = term === 4 ? 'final' : TERM_LABEL[term];

  const get = (kind: 'pdf' | 'csv') => {
    setBusy(kind);
    download(`/evaluation/department.${kind}?term=${term}`, `Informe del departamento ${label}.${kind}`)
      .then((name) => toast(`Descargado: ${name}`))
      .catch((e: Error) => toast(e.message, { tone: 'error' }))
      .finally(() => setBusy(null));
  };

  return (
    <Sheet open onClose={onClose} title="Informe del departamento" size="large" wide
      subtitle="Una fila por clase: resultados, unidades previstas e impartidas, causas y propuestas."
      footer={<>
        <Button variant="neutral" icon={<FileCsv size={18} />} loading={busy === 'csv'} onClick={() => get('csv')}>Descargar CSV</Button>
        <Button icon={<FilePdf size={18} />} loading={busy === 'pdf'} onClick={() => get('pdf')}>Descargar PDF</Button>
      </>}>
      <div className="form">
        <Segmented label="Evaluación" value={term} options={TERMS} onChange={setTerm} />
        {q.error && !q.data ? (
          <Callout tone="warn"><b>No se ha podido cargar el informe.</b> {q.error.message}</Callout>
        ) : !q.data || q.data.term !== term ? (
          <SkeletonList rows={3} />
        ) : !q.data.rows.length ? (
          <p className="muted">No tienes clases activas.</p>
        ) : (
          <div className="dept-rows">
            {q.data.rows.map((r) => <ReportRow key={`${term}-${r.course.id}`} row={r} term={term} />)}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ReportRow({ row, term }: { row: DepartmentRow; term: number }) {
  const { toast } = useFeedback();
  const save = useSaveDepartmentNote(term);
  const [text, setText] = useState(row.notes);
  const commit = () => {
    if (text.trim() === row.notes) return;
    save.mutate({ courseId: row.course.id, text }, {
      onSuccess: () => toast(`Guardado: ${row.course.label}`),
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };
  const units = row.units_planned
    ? `${row.units_done} de ${plural(row.units_planned, 'unidad impartida', 'unidades impartidas')}`
    : 'Sin unidades en esta evaluación';
  return (
    <section className="dept-row">
      <div className="dept-row__head"><Dot color={row.course.color} large /><b>{row.course.label}</b></div>
      <div className="dept-row__stats num">
        {plural(row.students, 'alumno', 'alumnos')} · {formatPercent(row.pass_rate)} aprobados · media {formatGrade(row.average)}
        {' · '}{BANDS.map((b) => `${b} ${row.distribution[b] ?? 0}`).join(' · ')}
      </div>
      <div className="dept-row__units">
        {units}
        {row.units_in_progress.length > 0 && <> · en curso: {row.units_in_progress.join(', ')}</>}
        {row.units_pending.length > 0 && <> · sin empezar: {row.units_pending.join(', ')}</>}
      </div>
      <TextField label="Causas y propuestas" value={text} maxLength={600} placeholder="Qué explica los resultados y qué se propone"
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
    </section>
  );
}
