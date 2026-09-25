/** One student of «A vigilar»: why, since when, and what to do about it. Opened from Hoy and from the student file
 *  (`fromFile` hides «Ver ficha»). Once acknowledged (`acked_on`, only in the file), «Ya lo sé» is not offered again. */
import { ChatCircleText, CheckCircle, Student, Warning } from '@phosphor-icons/react';
import { useAckWatch, type WatchItem } from '../../api/today';
import { shortDate } from '../../lib/format';
import { Button, List, Row, RowIcon, Sheet, useFeedback } from '../../ui';
import './students.css';

export default function WatchItemSheet({ item, onClose, onFamily, fromFile }: {
  item: WatchItem | null; onClose: () => void; onFamily: (w: WatchItem) => void; fromFile?: boolean;
}) {
  const { toast } = useFeedback();
  const ack = useAckWatch();
  if (!item) return null;
  const w = item;
  const known = async () => {
    try {
      await ack.mutateAsync({ studentId: w.student.id, courseId: w.course.id });
      toast(`${w.student.first_name} no volverá a salir en Hoy hasta que haya algo nuevo`);
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };
  return (
    <Sheet open onClose={onClose} title={w.student.name} subtitle={`${w.course.label} · último hecho: ${shortDate(w.since)}`}
      footer={<>
        {!w.acked_on && <Button variant="neutral" icon={<CheckCircle size={18} />} onClick={known} loading={ack.isPending}>Ya lo sé</Button>}
        <Button full={!!w.acked_on} icon={<ChatCircleText size={18} />} onClick={() => { onClose(); onFamily(w); }}>Avisar a la familia</Button>
      </>}>
      <div className="form">
        <List inset={64}>
          {w.reasons.map((r) => (
            <Row key={r} lead={<RowIcon tone="warn"><Warning size={20} /></RowIcon>} title={<span className="watch-reason">{r}</span>} />
          ))}
        </List>
        {w.acked_on && <p className="field__hint">Ya lo sabes desde el {shortDate(w.acked_on)}. Vuelve a Hoy si hay algo nuevo.</p>}
        {!fromFile && (
          <List>
            <Row lead={<RowIcon><Student size={20} /></RowIcon>} title="Ver ficha" sub="Notas, asistencia y observaciones" to={`/alumnos/${w.student.id}`} />
          </List>
        )}
      </div>
    </Sheet>
  );
}
