import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import AlertConfirm from '@/components/shared/AlertConfirm';
import { useExamsStore } from '../store/examsStore';

/**
 * useExamDeleteFlow — single source of truth for the two-step exam deletion.
 *
 * Backend rule: `DELETE /exams/{id}` returns 409 when at least one correction
 * already has a saved grade, unless `?force=true` is passed. Without a UI for
 * the second step, the teacher just sees a silent failure (the original bug
 * the user kept hitting from different screens).
 *
 * This hook handles:
 *   1. Capturing the delete intent (`requestDelete(exam, onSuccess)`).
 *   2. Showing the primary confirmation.
 *   3. Catching the 409, parsing the graded count from the detail string,
 *      and showing a stronger second confirmation.
 *   4. Retrying with `?force=true`.
 *   5. Calling the caller's `onSuccess` (used to refresh lists, navigate, …)
 *      in both the no-grades and the force paths.
 *
 * Render `<DeleteDialogs />` once anywhere in your component to materialise
 * the modals.
 */
export interface ExamDeleteRequest {
  id: string;
  name: string;
  /** When > 0 the hook skips the optimistic DELETE entirely and goes straight
   *  to the strong confirmation. Avoids a guaranteed 409 console noise. */
  gradedCount?: number;
  onSuccess?: () => void;
}

export function useExamDeleteFlow() {
  const deleteExam = useExamsStore((s) => s.deleteExam);

  const [target, setTarget] = useState<ExamDeleteRequest | null>(null);
  const [forcePrompt, setForcePrompt] = useState<{ gradedCount: number } | null>(null);

  const requestDelete = useCallback((req: ExamDeleteRequest) => {
    // Fast path: if we already know there are graded corrections, skip the
    // primary "Eliminar examen" alert and open the strong confirm directly.
    // The optimistic DELETE never goes out and the browser console stays
    // clean of expected 409s.
    if ((req.gradedCount ?? 0) > 0) {
      setTarget(req);
      setForcePrompt({ gradedCount: req.gradedCount! });
    } else {
      setTarget(req);
    }
  }, []);

  const performDelete = useCallback(
    async (force: boolean) => {
      if (!target) return;
      try {
        await deleteExam(target.id, force);
        target.onSuccess?.();
        setTarget(null);
        setForcePrompt(null);
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = err as any;
        if (e?.response?.status === 409 && !force) {
          const detail = String(e?.response?.data?.detail || '');
          const match = detail.match(/(\d+)/);
          const count = match ? parseInt(match[1], 10) : 1;
          // Hide the primary alert before opening the secondary, so we
          // never have two destructive modals stacked.
          setTarget(null);
          setForcePrompt({ gradedCount: count });
          // Re-prime target so the force path knows what to delete.
          setTimeout(() => setTarget(target), 0);
          return;
        }
        console.error('Failed to delete exam:', err);
        toast.error('No se pudo eliminar el examen.');
        setTarget(null);
        setForcePrompt(null);
      }
    },
    [target, deleteExam]
  );

  const DeleteDialogs = () => (
    <>
      <AlertConfirm
        open={!!target && !forcePrompt}
        onClose={() => setTarget(null)}
        header="Eliminar examen"
        message={
          target
            ? `¿Eliminar "${target.name}"? También se eliminarán todas las correcciones asociadas. Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
        onConfirm={() => performDelete(false)}
      />

      <AlertConfirm
        open={!!forcePrompt}
        onClose={() => {
          setForcePrompt(null);
          setTarget(null);
        }}
        header="Confirmar eliminación con notas"
        message={
          forcePrompt
            ? `Este examen tiene ${forcePrompt.gradedCount} ${forcePrompt.gradedCount === 1 ? 'corrección calificada' : 'correcciones calificadas'}. Si lo eliminas perderás esas notas de forma permanente.`
            : ''
        }
        confirmText="Sí, eliminar todo"
        cancelText="Cancelar"
        variant="destructive"
        onConfirm={() => performDelete(true)}
      />
    </>
  );

  return { requestDelete, DeleteDialogs };
}
