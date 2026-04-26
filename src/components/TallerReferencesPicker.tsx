import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Presentation as PresentationIcon, Search } from 'lucide-react';
import Modal from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/shared/Spinner';
import { material as materialApi } from '../services/api';
import type { MaterialListItem } from '../types/presentations';

interface Props {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  onConfirm: (ids: string[], items: MaterialListItem[]) => void;
  /** Si viene, filtra el listado por clase (ayuda al profesor a encontrar material relevante). */
  classId?: string;
}

/** Picker que permite al profe elegir presentaciones/libros propios para usar
 *  como contexto al generar. Se alimenta de GET /material/list. */
const TallerReferencesPicker: React.FC<Props> = ({ open, onClose, selectedIds, onConfirm, classId }) => {
  const [items, setItems] = useState<MaterialListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [localSelected, setLocalSelected] = useState<string[]>(selectedIds);
  const [query, setQuery] = useState('');

  useEffect(() => { if (open) setLocalSelected(selectedIds); }, [open, selectedIds]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    materialApi.list({ class_id: classId })
      .then((res) => setItems(res.data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, classId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((it) =>
      (it.title || '').toLowerCase().includes(q) ||
      (it.subject_name || '').toLowerCase().includes(q),
    );
  }, [items, query]);

  const toggle = (id: string) => {
    setLocalSelected((xs) => xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]);
  };

  const confirm = () => {
    const selected = items.filter((it) => localSelected.includes(it.id));
    onConfirm(localSelected, selected);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Añadir referencias" sheetHeight="lg">
      <div className="taller-refs-picker">
        <label className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-muted-foreground pointer-events-none" />
          <input
            className="taller-refs-picker__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar entre tu material…"
            style={{ paddingLeft: 34 }}
          />
        </label>

        <div className="taller-refs-picker__list">
          {loading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {items.length === 0
                ? 'Aún no tienes material para usar como referencia.'
                : 'Sin resultados para tu búsqueda.'}
            </p>
          ) : (
            filtered.map((it) => {
              const selected = localSelected.includes(it.id);
              const Icon = it.type === 'presentation' ? PresentationIcon : BookOpen;
              return (
                <button
                  key={it.id}
                  type="button"
                  className={`taller-refs-picker__row ${selected ? 'taller-refs-picker__row--selected' : ''}`}
                  onClick={() => toggle(it.id)}
                >
                  <span className="taller-refs-picker__check">
                    {selected && <Check size={12} />}
                  </span>
                  <Icon size={16} className="text-muted-foreground shrink-0" />
                  <div className="taller-refs-picker__text">
                    <div className="taller-refs-picker__title">{it.title || 'Sin título'}</div>
                    <div className="taller-refs-picker__meta">
                      {it.type === 'presentation' ? 'Presentación' : 'Libro'}
                      {it.subject_name ? ` · ${it.subject_name}` : ''}
                      {it.class_names && it.class_names.length > 0 ? ` · ${it.class_names.join(', ')}` : ''}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex justify-between items-center pt-2">
          <span className="text-xs text-muted-foreground">
            {localSelected.length} seleccionados
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={confirm}>Añadir</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TallerReferencesPicker;
