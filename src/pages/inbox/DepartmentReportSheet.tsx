import { FileCsv, FilePdf } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { distributionParts, useDepartmentReport, useSaveDepartmentNote, type DepartmentRow } from '../../api/evaluation';
import { download } from '../../lib/api';
import { formatAverage, formatPercent, ordinals, plural, TERM_LABEL, TERM_SHORT } from '../../lib/format';
import { Button, Callout, Dot, Section, Segmented, Sheet, SkeletonList, TextArea, useFeedback } from '../../ui';
import './InboxPage.css';

const TERMS = [1, 2, 3, 4].map((t) => ({ value: t, label: TERM_SHORT[t] }));

/** Informe para el departamento: one row per class for a term (results, distribution, units planned vs taught)
 * plus one editable line "Causas y propuestas" per class. Downloads as PDF and CSV.
 * What the teacher types lives here until it is saved (on blur, Enter, before a download, changing term or closing),
 * so a download never misses the last edit. */
export default function DepartmentReportSheet({ open, onClose, initialTerm }: { open: boolean; onClose: () => void; initialTerm: number }) {
  if (!open) return null;
  return <Report onClose={onClose} initialTerm={initialTerm} />;
}

function Report({ onClose, initialTerm }: { onClose: () => void; initialTerm: number }) {
  const { toast } = useFeedback();
  const [term, setTerm] = useState(initialTerm);
  const q = useDepartmentReport(term);
  const save = useSaveDepartmentNote(term);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const label = term === 4 ? 'final' : TERM_LABEL[term];

  const unsaved = (): DepartmentRow[] => (q.data?.term === term ? q.data.subjects.flatMap((x) => x.rows) : [])
    .filter((r) => texts[r.course.id] !== undefined && texts[r.course.id].trim() !== r.notes);

  /** Save every changed line; resolves when all are stored. */
  const flush = async (silent = false) => {
    for (const r of unsaved()) {
      await save.mutateAsync({ courseId: r.course.id, text: texts[r.course.id] });
      if (!silent) toast(`Guardado: ${r.course.label}`);
    }
  };

  // Closing the sheet with a line still being edited: save it anyway.
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => () => { latest.current(true).catch(() => undefined); }, []);

  const commit = (r: DepartmentRow) => {
    const text = texts[r.course.id];
    if (text === undefined || text.trim() === r.notes) return;
    save.mutate({ courseId: r.course.id, text }, {
      onSuccess: () => toast(`Guardado: ${r.course.label}`),
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  const pickTerm = async (t: number) => {
    try { await flush(); } catch (e) { toast((e as Error).message, { tone: 'error' }); return; }
    setTexts({});
    setTerm(t);
  };

  const get = async (kind: 'pdf' | 'csv') => {
    setBusy(kind);
    try {
      await flush(true);
      await download(`/evaluation/department.${kind}?term=${term}`, `Informe del departamento ${label}.${kind}`);
      toast('Informe descargado');
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Informe del departamento" size="large" wide
      subtitle="Una tabla por materia y una fila por clase: resultados, unidades previstas e impartidas, causas y propuestas."
      footer={<>
        <Button variant="neutral" icon={<FileCsv size={18} />} loading={busy === 'csv'} disabled={!!busy} onClick={() => get('csv')}>Descargar CSV</Button>
        <Button icon={<FilePdf size={18} />} loading={busy === 'pdf'} disabled={!!busy} onClick={() => get('pdf')}>Descargar PDF</Button>
      </>}>
      <div className="form">
        <Segmented label="Evaluación" value={term} options={TERMS} onChange={pickTerm} />
        {q.error && !q.data ? (
          <Callout tone="warn"><b>No se ha podido cargar el informe.</b> {q.error.message}</Callout>
        ) : !q.data || q.data.term !== term ? (
          <SkeletonList rows={3} />
        ) : !q.data.subjects.length ? (
          <p className="muted">No tienes clases activas.</p>
        ) : q.data.subjects.map((x) => (
          <Section key={x.subject} title={x.subject}>
            <div className="dept-rows">
              {x.rows.map((r) => (
                <ReportRow key={`${term}-${r.course.id}`} row={r} text={texts[r.course.id] ?? r.notes}
                  onText={(text) => setTexts((t) => ({ ...t, [r.course.id]: text }))} onCommit={() => commit(r)} />
              ))}
            </div>
          </Section>
        ))}
      </div>
    </Sheet>
  );
}

function ReportRow({ row, text, onText, onCommit }: { row: DepartmentRow; text: string; onText: (t: string) => void; onCommit: () => void }) {
  const units = row.units_planned
    ? `${row.units_done} de ${plural(row.units_planned, 'unidad impartida', 'unidades impartidas')}`
    : 'Sin unidades en esta evaluación';
  const students = plural(row.students, 'alumno', 'alumnos') + (row.graded < row.students ? ` (${row.graded} con nota)` : '');
  return (
    <section className="dept-row">
      <div className="dept-row__head"><Dot color={row.course.color} large /><b>{ordinals(row.course.group.name)}</b></div>
      <div className="dept-row__stats num">
        {[students, `${formatPercent(row.pass_rate)} aprobados`, `media ${formatAverage(row.average)}`,
          ...distributionParts(row.distribution, row.stage)].map((p, i) => <span key={i}>{i > 0 && ' · '}<span>{p}</span></span>)}
      </div>
      <div className="dept-row__units">
        {units}
        {row.units_in_progress.length > 0 && <> · en curso: {row.units_in_progress.join(', ')}</>}
        {row.units_pending.length > 0 && <> · sin empezar: {row.units_pending.join(', ')}</>}
      </div>
      <TextArea label="Causas y propuestas" value={text} maxLength={600} rows={2} placeholder="Qué explica los resultados y qué se propone"
        onChange={(e) => onText(e.target.value)} onBlur={onCommit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCommit(); } }} />
    </section>
  );
}
