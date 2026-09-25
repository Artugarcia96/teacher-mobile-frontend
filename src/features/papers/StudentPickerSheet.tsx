import { useMemo, useState } from 'react';
import type { CorrectionStudent } from '../../api/papers';
import { fileUrl } from '../../lib/api';
import { fold } from '../../lib/format';
import { Avatar, List, Row, Section, Sheet, TextField } from '../../ui';

interface Props {
  open: boolean;
  onClose: () => void;
  students: CorrectionStudent[];
  thumbUrl?: string | null;
  detected?: string | null;
  onPick: (studentId: string) => void;
  /** Moving a single page instead of a whole paper. */
  page?: string | null;
}

/** "¿De quién es esta hoja?" — students without a paper first; picking one who has a paper merges the pages. */
export default function StudentPickerSheet({ open, onClose, students, thumbUrl, detected, onPick, page }: Props) {
  const [q, setQ] = useState('');
  const [free, taken] = useMemo(() => {
    const list = students.filter((s) => !q || fold(s.student.name).includes(fold(q)));
    return [list.filter((s) => !s.paper_id), list.filter((s) => s.paper_id)];
  }, [students, q]);

  const row = (s: CorrectionStudent) => (
    <Row key={s.student.id} lead={<Avatar initials={s.student.initials} size="sm" />} title={s.student.sort_name}
      onClick={() => { onPick(s.student.id); onClose(); setQ(''); }} chevron={false} />
  );

  return (
    <Sheet open={open} onClose={onClose} title={page ? '¿De quién es esta página?' : '¿De quién es esta hoja?'} size="large"
      subtitle={[page, detected ? `Se lee «${detected}».` : page ? '' : 'No se ha podido leer el nombre.'].filter(Boolean).join(' · ')}>
      <div className="form">
        {thumbUrl && <img className="picker-head" src={fileUrl(thumbUrl)} alt="Cabecera de la hoja" />}
        <TextField placeholder="Buscar alumno" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar alumno" />
        {free.length > 0 && <Section title="Sin hoja"><List inset={56}>{free.map(row)}</List></Section>}
        {taken.length > 0 && (
          <Section title="Ya tienen hoja" footer={page ? 'La página se añade a su examen.' : 'Si eliges uno de estos, las páginas se añaden a su examen.'}>
            <List inset={56}>{taken.map(row)}</List>
          </Section>
        )}
        {!free.length && !taken.length && <p className="muted">Ningún alumno coincide con «{q}».</p>}
      </div>
    </Sheet>
  );
}
