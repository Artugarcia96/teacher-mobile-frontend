import { useState } from 'react';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/shared/Spinner';
import Modal from '@/components/shared/Modal';
import { MentionedStudent } from '../types';
import { useStudentsStore } from '../store/studentsStore';
import { useIsDesktop } from '../hooks/useIsDesktop';
import MentionTextarea from './MentionTextarea';
import './QuickCommentModal.css';

interface Props {
  isOpen: boolean;
  studentId: string;
  studentName: string;
  onDismiss: () => void;
}

const QuickCommentModal: React.FC<Props> = ({ isOpen, studentId, studentName, onDismiss }) => {
  const isDesktop = useIsDesktop();
  const addComment = useStudentsStore((s) => s.addComment);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<MentionedStudent[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await addComment(studentId, text.trim(), mentions.map((s) => s.id));
      setText('');
      setMentions([]);
      onDismiss();
    } catch (err) {
      console.error('Failed to save comment:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    setText('');
    setMentions([]);
    onDismiss();
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleDismiss}
      sheetHeight="sm"
    >
      <div className="qc-sheet">
        <h3 className="qc-sheet__title">Comentario sobre {studentName}</h3>
        <MentionTextarea
          value={text}
          onChange={setText}
          mentionedStudents={mentions}
          onMentionsChange={setMentions}
          placeholder="Escribe un comentario..."
          rows={3}
          helperText="Usa @ para mencionar otros alumnos"
        />
        <div className="qc-sheet__actions">
          <Button size="sm" variant="outline" onClick={handleDismiss}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !text.trim()}>
            {saving ? <Spinner size={16} /> : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default QuickCommentModal;
