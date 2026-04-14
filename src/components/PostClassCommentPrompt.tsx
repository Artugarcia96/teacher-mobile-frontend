import { useState, useEffect } from 'react';
import { X, Check, MessageCircle } from 'lucide-react';
import Spinner from '@/components/shared/Spinner';
import { MentionedStudent } from '../types';
import { useCommentsStore, RecentSession } from '../store/commentsStore';
import MentionTextarea from './MentionTextarea';
import './PostClassCommentPrompt.css';

const PostClassCommentPrompt: React.FC = () => {
  const [commentText, setCommentText] = useState('');
  const [mentions, setMentions] = useState<MentionedStudent[]>([]);
  const [saving, setSaving] = useState(false);
  const [currentSession, setCurrentSession] = useState<RecentSession | null>(null);

  const recentSessions = useCommentsStore((s) => s.recentSessions);
  const promptDismissed = useCommentsStore((s) => s.promptDismissed);
  const fetchRecentSessions = useCommentsStore((s) => s.fetchRecentSessions);
  const createClassComment = useCommentsStore((s) => s.createClassComment);
  const dismissPrompt = useCommentsStore((s) => s.dismissPrompt);

  useEffect(() => {
    fetchRecentSessions();
    const interval = setInterval(() => {
      fetchRecentSessions();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchRecentSessions]);

  useEffect(() => {
    if (recentSessions.length > 0 && !promptDismissed) {
      setCurrentSession(recentSessions[0]);
    } else {
      setCurrentSession(null);
    }
  }, [recentSessions, promptDismissed]);

  const handleSave = async () => {
    if (!currentSession || !commentText.trim()) return;

    setSaving(true);
    try {
      await createClassComment({
        class_id: currentSession.class_id,
        subject_id: currentSession.subject_id,
        event_id: currentSession.event_id,
        text: commentText.trim(),
        mentioned_student_ids: mentions.map((s) => s.id),
      });
      setCommentText('');
      setMentions([]);
      if (recentSessions.length > 1) {
        setCurrentSession(recentSessions[1]);
      } else {
        setCurrentSession(null);
      }
    } catch (err) {
      console.error('Failed to save comment:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    if (recentSessions.length > 1) {
      setCurrentSession(recentSessions[1]);
    } else {
      dismissPrompt();
    }
  };

  const handleDismiss = () => {
    dismissPrompt();
  };

  if (!currentSession) return null;

  return (
    <div className="post-class-prompt">
      <div className="post-class-prompt__header">
        <div className="post-class-prompt__icon">
          <MessageCircle size={20} />
        </div>
        <div className="post-class-prompt__title-area">
          <h3 className="post-class-prompt__title">¿Cómo ha ido la clase?</h3>
          <p className="post-class-prompt__class">{currentSession.title || currentSession.class_name}</p>
        </div>
        <button className="post-class-prompt__close" onClick={handleDismiss}>
          <X size={22} />
        </button>
      </div>

      <div className="post-class-prompt__body">
        <MentionTextarea
          value={commentText}
          onChange={setCommentText}
          mentionedStudents={mentions}
          onMentionsChange={setMentions}
          placeholder="Escribe un comentario rápido sobre la sesión..."
          rows={2}
          disabled={saving}
          helperText="Usa @ para mencionar alumnos"
          classId={currentSession.class_id}
        />
      </div>

      <div className="post-class-prompt__footer">
        <button
          className="post-class-prompt__skip"
          onClick={handleSkip}
          disabled={saving}
        >
          Saltar
        </button>
        <button
          className="post-class-prompt__save"
          onClick={handleSave}
          disabled={saving || !commentText.trim()}
        >
          {saving ? (
            <Spinner size={18} />
          ) : (
            <>
              <Check size={18} />
              Guardar
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default PostClassCommentPrompt;
