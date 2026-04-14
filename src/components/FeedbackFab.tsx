import { useState, useEffect, useRef } from 'react';
import { MessageSquareText, Plus, ArrowLeft, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Spinner from '@/components/shared/Spinner';
import Modal from '@/components/shared/Modal';
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
  const listRef = useRef<HTMLDivElement>(null);

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
          <MessageSquareText size={24} />
        </button>
      </div>

      <Modal
        open={isOpen}
        onClose={handleDismiss}
        title={mode === 'list' ? 'Tu feedback' : (editingItem ? 'Editar' : 'Nuevo feedback')}
        sheetHeight={isDesktop ? 'lg' : 'md'}
      >
        <div className="feedback-modal__content">
          {mode === 'list' ? (
            <>
              <div className="feedback-modal__header">
                <button className="feedback-modal__add-btn" onClick={handleNewFeedback}>
                  <Plus size={20} />
                  Nuevo
                </button>
              </div>

              {loading && items.length === 0 ? (
                <div className="feedback-empty">
                  <Spinner size={24} />
                </div>
              ) : items.length === 0 ? (
                <div className="feedback-empty">
                  <MessageSquare size={36} className="opacity-50 mb-2" />
                  <p>No has enviado feedback todavia.</p>
                  <p>Tus sugerencias nos ayudan a mejorar.</p>
                </div>
              ) : (
                <div ref={listRef}>
                  {items.map((item) => (
                    <div key={item.id} className="feedback-item-row">
                      <div
                        className="feedback-item"
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
                      </div>
                      <button
                        className="feedback-item__delete"
                        onClick={() => handleDelete(item.id)}
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="feedback-modal__header">
                <button className="feedback-modal__back" onClick={resetForm}>
                  <ArrowLeft size={20} />
                  Volver
                </button>
                <div style={{ width: 60 }} />
              </div>

              <div className="feedback-form">
                <Tabs value={category} onValueChange={setCategory} className="feedback-form__segment">
                  <TabsList className="w-full">
                    <TabsTrigger value="suggestion" className="flex-1">Sugerencia</TabsTrigger>
                    <TabsTrigger value="bug" className="flex-1">Error</TabsTrigger>
                    <TabsTrigger value="other" className="flex-1">Otro</TabsTrigger>
                  </TabsList>
                </Tabs>

                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Describe tu sugerencia o el error que has encontrado..."
                  rows={4}
                  className="feedback-form__textarea"
                  disabled={saving}
                />

                <Button
                  className="w-full feedback-form__submit"
                  onClick={handleSubmit}
                  disabled={saving || !text.trim()}
                >
                  {saving ? (
                    <Spinner size={18} />
                  ) : editingItem ? (
                    'Guardar'
                  ) : (
                    'Enviar'
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
};

export default FeedbackFab;
