import { useEffect, useMemo, useState } from 'react';
import { Link2, X } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import ClassSubjectPicker, { ClassSubjectPair } from './ClassSubjectPicker';
import { subjects as subjectsApi } from '../services/api';
import { useExamsStore } from '../store/examsStore';

interface Props {
  examId: string;
  examClassId?: string | null;
}

const AssignMaterialBanner: React.FC<Props> = ({ examId, examClassId }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pairs, setPairs] = useState<ClassSubjectPair[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [pending, setPending] = useState<{ classId: string; subjectId: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const updateExam = useExamsStore((s) => s.updateExam);

  const hasClass = !!examClassId;

  useEffect(() => {
    if (!dialogOpen || pairs.length > 0) return;
    setLoadingPairs(true);
    subjectsApi
      .classPairs()
      .then((res) => {
        setPairs(
          res.data.map((p: any) => ({
            classId: p.class_id,
            className: p.class_name,
            subjectId: p.subject_id,
            subjectName: p.subject_name,
          })),
        );
      })
      .catch(() => setPairs([]))
      .finally(() => setLoadingPairs(false));
  }, [dialogOpen, pairs.length]);

  const selectedLabel = useMemo(() => {
    if (!pending) return null;
    const p = pairs.find((x) => x.classId === pending.classId && x.subjectId === pending.subjectId);
    return p ? `${p.className} — ${p.subjectName}` : null;
  }, [pending, pairs]);

  if (hasClass) return null;

  const handleConfirm = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await updateExam(examId, { classId: pending.classId, subjectId: pending.subjectId });
      toast.success('Material asociado a la clase');
      setDialogOpen(false);
      setPending(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo asociar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/80 dark:border-amber-900/40">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Sin asignar a una clase
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
            Este material se creó desde el Taller. Asóciale una clase para poder asignarlo y corregirlo.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Link2 size={14} />
          Asociar
        </Button>
      </div>

      <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} sheetHeight="md">
        <div className="flex flex-col gap-4 p-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Asociar a una clase</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Selecciona la clase y la asignatura donde usar este material.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          <ClassSubjectPicker
            pairs={pairs}
            loading={loadingPairs}
            value={pending}
            onChange={(classId, subjectId) => setPending({ classId, subjectId })}
          />

          {selectedLabel && (
            <p className="text-xs text-muted-foreground">
              Seleccionado: <span className="font-medium text-foreground">{selectedLabel}</span>
            </p>
          )}

          <Button onClick={handleConfirm} disabled={!pending || saving} className="w-full">
            {saving ? 'Asociando…' : 'Asociar material'}
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default AssignMaterialBanner;
