import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Link2, X } from 'lucide-react';
import Modal from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { subjects as subjectsApi } from '../services/api';

export interface ClassPair {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
}

interface Props {
  /** IDs de clase ya asociadas al material. */
  value: string[];
  onChange: (nextClassIds: string[]) => void;
  /** Etiqueta sobre el picker. */
  label?: string;
  /** Si true, muestra una versión compacta en línea (sin label). */
  compact?: boolean;
}

/** Selector multi-clase para asociar un material a varias clases.
 *  Fetcha los pares (clase, asignatura) del profesor y permite marcar varias. */
const MultiClassSelector: React.FC<Props> = ({ value, onChange, label = 'Clases asociadas', compact }) => {
  const [open, setOpen] = useState(false);
  const [pairs, setPairs] = useState<ClassPair[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    subjectsApi.classPairs()
      .then((res) => {
        setPairs(res.data.map((p: any) => ({
          classId: p.class_id,
          className: p.class_name,
          subjectId: p.subject_id,
          subjectName: p.subject_name,
        })));
      })
      .catch(() => setPairs([]))
      .finally(() => setLoading(false));
  }, []);

  // Agrupamos pares por classId.
  const classes = useMemo(() => {
    const map = new Map<string, { classId: string; className: string; subjects: string[] }>();
    pairs.forEach((p) => {
      if (!map.has(p.classId)) {
        map.set(p.classId, { classId: p.classId, className: p.className, subjects: [] });
      }
      const entry = map.get(p.classId)!;
      if (!entry.subjects.includes(p.subjectName)) entry.subjects.push(p.subjectName);
    });
    return Array.from(map.values()).sort((a, b) => a.className.localeCompare(b.className));
  }, [pairs]);

  const selectedClasses = useMemo(
    () => classes.filter((c) => value.includes(c.classId)),
    [classes, value],
  );

  const toggleClass = (classId: string) => {
    if (value.includes(classId)) onChange(value.filter((c) => c !== classId));
    else onChange([...value, classId]);
  };

  const removeChip = (classId: string) => onChange(value.filter((c) => c !== classId));

  // UI compacta (header del editor): una sola línea.
  const compactUi = (
    <div className="flex items-center gap-1.5 flex-nowrap min-w-0 overflow-hidden text-[11px]">
      {selectedClasses.length === 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <Link2 size={11} />
          Añadir clase
        </button>
      ) : (
        <>
          {selectedClasses.slice(0, 2).map((c) => (
            <span
              key={c.classId}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold max-w-[130px]"
            >
              <span className="truncate">{c.className}</span>
              <button
                onClick={() => removeChip(c.classId)}
                className="opacity-70 hover:opacity-100 shrink-0"
                aria-label="Quitar"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {selectedClasses.length > 2 && (
            <span className="text-muted-foreground">+{selectedClasses.length - 2}</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            Editar
          </button>
        </>
      )}
    </div>
  );

  // UI expandida (editor detallado).
  const expandedUi = (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Link2 size={12} />
        {label}
      </label>

      <div className="flex items-center gap-1.5 flex-wrap">
        {selectedClasses.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">Sin clase asociada</span>
        ) : (
          selectedClasses.map((c) => (
            <span key={c.classId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {c.className}
              <button onClick={() => removeChip(c.classId)} className="opacity-70 hover:opacity-100">
                <X size={12} />
              </button>
            </span>
          ))
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {selectedClasses.length === 0 ? 'Añadir clase' : 'Editar'}
          <ChevronDown size={12} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {compact ? compactUi : expandedUi}

      <Modal open={open} onClose={() => setOpen(false)} title="Clases asociadas" sheetHeight="md">
        <div className="flex flex-col gap-2 p-1">
          <p className="text-xs text-muted-foreground">
            Selecciona una o varias clases. El material estará disponible en todas las clases seleccionadas.
          </p>
          {loading ? (
            <div className="flex justify-center py-6 text-sm text-muted-foreground">Cargando…</div>
          ) : classes.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              Aún no tienes clases. Crea una desde el tab Clases.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {classes.map((c) => {
                const active = value.includes(c.classId);
                return (
                  <li key={c.classId}>
                    <button
                      type="button"
                      onClick={() => toggleClass(c.classId)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent text-left ${active ? 'bg-primary/5' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${active ? 'border-primary bg-primary text-white' : 'border-border'}`}>
                        {active && <Check size={13} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{c.className}</div>
                        {c.subjects.length > 0 && (
                          <div className="text-[11px] text-muted-foreground truncate">{c.subjects.join(' · ')}</div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => setOpen(false)}>Listo</Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default MultiClassSelector;
