import { useState } from 'react';
import {
  IonModal, IonButton, IonTextarea, IonSpinner,
} from '@ionic/react';
import { useStudentsStore } from '../store/studentsStore';
import { useIsDesktop } from '../hooks/useIsDesktop';
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
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await addComment(studentId, text.trim());
      setText('');
      onDismiss();
    } catch (err) {
      console.error('Failed to save comment:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    setText('');
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
        <IonTextarea
          value={text}
          onIonInput={(e) => setText(e.detail.value ?? '')}
          placeholder="Escribe un comentario..."
          rows={3}
          autoGrow
          className="qc-sheet__textarea"
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
