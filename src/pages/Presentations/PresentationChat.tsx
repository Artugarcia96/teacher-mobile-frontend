import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, X, Loader2, Wand2, Layers, FilePlus2, ListMinus, MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';
import { usePresentationsStore } from '../../store/presentationsStore';

interface Props {
  open: boolean;
  presentationId: string;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

interface QuickAction {
  icon: typeof Wand2;
  label: string;
  prompt: string;
  group: 'estructura' | 'tono' | 'contenido';
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: ListMinus,    label: 'Hazla más corta',           prompt: 'Reduce a 8 slides manteniendo lo esencial.',                  group: 'estructura' },
  { icon: Layers,       label: 'Más densa',                 prompt: 'Añade más detalle y ejemplos en cada slide.',                  group: 'estructura' },
  { icon: FilePlus2,    label: 'Slide de ejemplos',         prompt: 'Añade un slide con 3 ejemplos reales del sector.',             group: 'contenido' },
  { icon: Wand2,        label: 'Tono más formal',           prompt: 'Reescribe los textos con un tono más formal y profesional.',    group: 'tono' },
  { icon: Wand2,        label: 'Más conversacional',        prompt: 'Reescribe los textos en un tono más cercano y conversacional.', group: 'tono' },
  { icon: MessageSquareText, label: 'Añade un quote',       prompt: 'Inserta un slide de cita destacada antes de la conclusión.',   group: 'contenido' },
];

const GROUP_LABELS: Record<QuickAction['group'], string> = {
  estructura: 'Estructura',
  tono:       'Tono',
  contenido:  'Contenido',
};

/** Panel lateral. Cada mensaje del usuario dispara una edición de la
 *  presentación completa via /presentations/{id}/chat. El assistant responde
 *  con un resumen breve. El estado de slides se actualiza en el editor en vivo. */
const PresentationChat: React.FC<Props> = ({ open, presentationId, onClose }) => {
  const chatEdit = usePresentationsStore((s) => s.chatEdit);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 999999, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setMessages((m) => [...m, { role: 'user', text: msg, ts: Date.now() }]);
    setInput('');
    setLoading(true);
    try {
      const p = await chatEdit(presentationId, msg);
      setMessages((m) => [...m, {
        role: 'assistant',
        text: `Hecho. La presentación ahora tiene ${p.slides.length} slides. Pídeme otro cambio o cierra el panel para revisar.`,
        ts: Date.now(),
      }]);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'No pude aplicar el cambio. Reformula con más detalle.';
      setMessages((m) => [...m, { role: 'assistant', text: detail, ts: Date.now() }]);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(input); }
    if (!e.shiftKey && e.key === 'Enter') { e.preventDefault(); send(input); }
  };

  if (!open) return null;

  // Agrupamos quick actions por categoría
  const grouped = QUICK_ACTIONS.reduce<Record<string, QuickAction[]>>((acc, q) => {
    (acc[q.group] = acc[q.group] || []).push(q);
    return acc;
  }, {});

  return (
    <aside className="presentation-chat" role="dialog" aria-label="Asistente IA">
      <header className="presentation-chat__header">
        <div className="presentation-chat__header-meta">
          <div className="presentation-chat__header-icon">
            <Sparkles size={14} />
          </div>
          <div>
            <h3 className="presentation-chat__header-title">Asistente</h3>
            <p className="presentation-chat__header-sub">Cambios en lenguaje natural</p>
          </div>
        </div>
        <button onClick={onClose} className="presentation-chat__close" aria-label="Cerrar">
          <X size={16} />
        </button>
      </header>

      <div ref={listRef} className="presentation-chat__list">
        {messages.length === 0 ? (
          <div className="presentation-chat__empty">
            <p className="presentation-chat__empty-lead">
              Pídeme un cambio. Aplico la edición sobre toda la presentación al instante.
            </p>
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="presentation-chat__quick-group">
                <span className="presentation-chat__quick-label">{GROUP_LABELS[group as QuickAction['group']]}</span>
                <div className="presentation-chat__quick-row">
                  {items.map((q) => {
                    const Icon = q.icon;
                    return (
                      <button
                        key={q.label}
                        className="presentation-chat__quick"
                        onClick={() => send(q.prompt)}
                        title={q.prompt}
                      >
                        <Icon size={12} />
                        <span>{q.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="presentation-chat__hint">
              Tip: también puedes pedir cambios concretos como <em>"en el slide 3 cambia el diagrama por una pirámide"</em>.
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`presentation-chat__msg presentation-chat__msg--${m.role}`}>
              {m.text}
            </div>
          ))
        )}
        {loading && (
          <div className="presentation-chat__msg presentation-chat__msg--assistant presentation-chat__msg--loading">
            <Loader2 size={14} className="animate-spin" />
            <span>Aplicando cambios sobre la presentación…</span>
          </div>
        )}
      </div>

      <div className="presentation-chat__input">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder='ej. "añade un slide de cierre con call-to-action"'
          rows={2}
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          aria-label="Enviar"
          className="presentation-chat__send"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </aside>
  );
};

export default PresentationChat;
