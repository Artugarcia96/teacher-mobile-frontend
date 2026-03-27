import { useState } from 'react';
import {
  IonModal, IonButton, IonSpinner,
} from '@ionic/react';
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
    <IonModal
      isOpen={isOpen}
      onDidDismiss={handleDismiss}
      initialBreakpoint={isDesktop ? 1 : 0.4}
      breakpoints={isDesktop ? [0, 1] : [0, 0.4, 0.6]}
      className="quick-comment-modal"
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
          <IonButton size="small" fill="outline" onClick={handleDismiss}>
            Cancelar
          </IonButton>
          <IonButton size="small" onClick={handleSave} disabled={saving || !text.trim()}>
            {saving ? <IonSpinner name="crescent" /> : 'Guardar'}
          </IonButton>
        </div>
      </div>
    </IonModal>
  );
};

export default QuickCommentModal;
