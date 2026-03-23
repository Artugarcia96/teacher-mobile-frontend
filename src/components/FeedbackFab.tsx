import { useState, useEffect, useRef } from 'react';
import {
  IonModal,
  IonIcon,
  IonList,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonTextarea,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
} from '@ionic/react';
import {
  chatboxEllipsesOutline,
  addOutline,
  arrowBackOutline,
  chatbubblesOutline,
  trashOutline,
} from 'ionicons/icons';
import { useFeedbackStore, FeedbackItem } from '../store/feedbackStore';
import { useIsDesktop } from '../hooks/useIsDesktop';
import './FeedbackFab.css';

const CATEGORY_LABELS: Record<string, string> = {
  suggestion: 'Sugerencia',
  bug: 'Error',
  other: 'Otro',
};

const FeedbackFab: React.FC = () => {
  const isDesktop = useIsDesktop();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editingItem, setEditingItem] = useState<FeedbackItem | null>(null);
  const [category, setCategory] = useState<string>('suggestion');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const listRef = useRef<HTMLIonListElement>(null);

  const items = useFeedbackStore((s) => s.items);
  const loading = useFeedbackStore((s) => s.loading);
  const fetchFeedback = useFeedbackStore((s) => s.fetchFeedback);
  const createFeedback = useFeedbackStore((s) => s.createFeedback);
  const updateFeedback = useFeedbackStore((s) => s.updateFeedback);
  const deleteFeedback = useFeedbackStore((s) => s.deleteFeedback);

  useEffect(() => {
    if (isOpen) {
      fetchFeedback();
    }
  }, [isOpen, fetchFeedback]);

  const resetForm = () => {
    setMode('list');
    setEditingItem(null);
    setCategory('suggestion');
    setText('');
  };

  const handleDismiss = () => {
    setIsOpen(false);
    resetForm();
  };

  const handleNewFeedback = () => {
    setEditingItem(null);
    setCategory('suggestion');
    setText('');
    setMode('form');
  };

  const handleEditFeedback = (item: FeedbackItem) => {
    setEditingItem(item);
    setCategory(item.category);
    setText(item.text);
    setMode('form');
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFeedback(id);
    } catch (err) {
      console.error('Failed to delete feedback:', err);
    }
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      if (editingItem) {
        await updateFeedback(editingItem.id, { category, text: text.trim() });
      } else {
        await createFeedback({ category, text: text.trim() });
      }
      resetForm();
    } catch (err) {
      console.error('Failed to save feedback:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  return (
    <>
      <div className="feedback-fab">
        <button className="feedback-fab__button" onClick={() => setIsOpen(true)}>
          <IonIcon icon={chatboxEllipsesOutline} />
        </button>
      </div>

      <IonModal
        isOpen={isOpen}
        onDidDismiss={handleDismiss}
        initialBreakpoint={isDesktop ? 1 : 0.5}
        breakpoints={isDesktop ? [0, 1] : [0, 0.5, 0.75]}
        handleBehavior="cycle"
      >
        <div className="feedback-modal__content">
          {mode === 'list' ? (
            <>
              <div className="feedback-modal__header">
                <h2>Tu feedback</h2>
                <button className="feedback-modal__add-btn" onClick={handleNewFeedback}>
                  <IonIcon icon={addOutline} />
                  Nuevo
                </button>
              </div>

              {loading && items.length === 0 ? (
                <div className="feedback-empty">
                  <IonSpinner name="dots" />
                </div>
              ) : items.length === 0 ? (
                <div className="feedback-empty">
                  <IonIcon icon={chatbubblesOutline} />
                  <p>No has enviado feedback todavia.</p>
                  <p>Tus sugerencias nos ayudan a mejorar.</p>
                </div>
              ) : (
                <IonList ref={listRef}>
                  {items.map((item) => (
                    <IonItemSliding key={item.id}>
                      <IonItem
                        className="feedback-item"
                        button
                        detail={false}
                        onClick={() => handleEditFeedback(item)}
                      >
                        <div className="feedback-item__content">
                          <div className="feedback-item__top">
                            <span className={`feedback-item__badge feedback-item__badge--${item.category}`}>
                              {CATEGORY_LABELS[item.category] || item.category}
                            </span>
                            <span className="feedback-item__date">{formatDate(item.created_at)}</span>
                          </div>
                          <p className="feedback-item__text">{item.text}</p>
                        </div>
                      </IonItem>
                      <IonItemOptions side="end">
                        <IonItemOption
                          className="feedback-delete-option"
                          onClick={() => handleDelete(item.id)}
                        >
                          <IonIcon slot="icon-only" icon={trashOutline} />
                        </IonItemOption>
                      </IonItemOptions>
                    </IonItemSliding>
                  ))}
                </IonList>
              )}
            </>
          ) : (
            <>
              <div className="feedback-modal__header">
                <button className="feedback-modal__back" onClick={resetForm}>
                  <IonIcon icon={arrowBackOutline} />
                  Volver
                </button>
                <h2>{editingItem ? 'Editar' : 'Nuevo feedback'}</h2>
                <div style={{ width: 60 }} />
              </div>

              <div className="feedback-form">
                <IonSegment
                  value={category}
                  onIonChange={(e) => setCategory(e.detail.value as string)}
                  className="feedback-form__segment"
                >
                  <IonSegmentButton value="suggestion">
                    <IonLabel>Sugerencia</IonLabel>
                  </IonSegmentButton>
                  <IonSegmentButton value="bug">
                    <IonLabel>Error</IonLabel>
                  </IonSegmentButton>
                  <IonSegmentButton value="other">
                    <IonLabel>Otro</IonLabel>
                  </IonSegmentButton>
                </IonSegment>

                <IonTextarea
                  value={text}
                  onIonInput={(e) => setText(e.detail.value || '')}
                  placeholder="Describe tu sugerencia o el error que has encontrado..."
                  rows={4}
                  className="feedback-form__textarea"
                  disabled={saving}
                  autoGrow
                />

                <IonButton
                  expand="block"
                  className="feedback-form__submit"
                  onClick={handleSubmit}
                  disabled={saving || !text.trim()}
                >
                  {saving ? (
                    <IonSpinner name="dots" />
                  ) : editingItem ? (
                    'Guardar'
                  ) : (
                    'Enviar'
                  )}
                </IonButton>
              </div>
            </>
          )}
        </div>
      </IonModal>
    </>
  );
};

export default FeedbackFab;
