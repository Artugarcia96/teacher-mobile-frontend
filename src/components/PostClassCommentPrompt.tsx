import { useState, useEffect } from 'react';
import { IonIcon, IonTextarea, IonSpinner } from '@ionic/react';
import {
  closeOutline,
  checkmarkOutline,
  chatbubbleOutline,
} from 'ionicons/icons';
import { useCommentsStore, RecentSession } from '../store/commentsStore';
import './PostClassCommentPrompt.css';

const PostClassCommentPrompt: React.FC = () => {
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentSession, setCurrentSession] = useState<RecentSession | null>(null);

  const recentSessions = useCommentsStore((s) => s.recentSessions);
  const promptDismissed = useCommentsStore((s) => s.promptDismissed);
  const fetchRecentSessions = useCommentsStore((s) => s.fetchRecentSessions);
  const createClassComment = useCommentsStore((s) => s.createClassComment);
  const dismissPrompt = useCommentsStore((s) => s.dismissPrompt);

  useEffect(() => {
    // Check for recent sessions when component mounts
    fetchRecentSessions();

    // Poll every 5 minutes for new sessions
    const interval = setInterval(() => {
      fetchRecentSessions();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchRecentSessions]);

  useEffect(() => {
    // Show prompt for the first recent session
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
        event_id: currentSession.event_id,
        text: commentText.trim(),
      });
      setCommentText('');
      // If there are more sessions, show the next one
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
    // Skip this session, show next or dismiss
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
          <IonIcon icon={chatbubbleOutline} />
        </div>
        <div className="post-class-prompt__title-area">
          <h3 className="post-class-prompt__title">¿Cómo ha ido la clase?</h3>
          <p className="post-class-prompt__class">{currentSession.title || currentSession.class_name}</p>
        </div>
        <button className="post-class-prompt__close" onClick={handleDismiss}>
          <IonIcon icon={closeOutline} />
        </button>
      </div>

      <div className="post-class-prompt__body">
        <IonTextarea
          value={commentText}
          onIonInput={(e) => setCommentText(e.detail.value || '')}
          placeholder="Escribe un comentario rápido sobre la sesión..."
          rows={2}
          className="post-class-prompt__input"
          disabled={saving}
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
            <IonSpinner name="dots" />
          ) : (
            <>
              <IonIcon icon={checkmarkOutline} />
              Guardar
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default PostClassCommentPrompt;
