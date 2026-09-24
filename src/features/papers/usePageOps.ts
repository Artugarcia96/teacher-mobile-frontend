/** Page operations of the "Recoger" step with feedback and undo: every change is reversible from the toast. */
import {
  useDeleteLoosePage, useMergePapers, useMoveLoosePage, useMovePage, useSplitPaper, type Correction, type PageOpResult, type Tray,
} from '../../api/papers';
import { useFeedback } from '../../ui';

export function usePageOps(correction: Correction) {
  const id = correction.activity.id;
  const move = useMovePage(id);
  const split = useSplitPaper(id);
  const merge = useMergePapers(id);
  const moveLoose = useMoveLoosePage(id);
  const remove = useDeleteLoosePage(id);
  const { toast, confirm } = useFeedback();
  const byId = new Map(correction.students.map((s) => [s.student.id, s.student]));
  const name = (sid: string | null | undefined) => (sid && byId.get(sid)?.first_name) || 'el alumno';
  const onError = (e: Error) => toast(e.message, { tone: 'error' });
  const dropped = (r: PageOpResult) => r.resuggest.length
    ? ` Se ha quitado la sugerencia de la IA de ${r.resuggest.map(name).join(' y ')}.` : '';
  const discardedAt = correction.discarded.length; // a page sent to the discarded tray lands here

  return {
    busy: move.isPending || split.isPending || merge.isPending || moveLoose.isPending || remove.isPending,

    /** A page of a paper → another student's paper (created if needed). */
    toStudent(paperId: string, pageIndex: number, studentId: string) {
      move.mutate({ paperId, pageIndex, to_student_id: studentId }, {
        onSuccess: (r) => toast(`Página movida a la hoja de ${name(studentId)}.${dropped(r)}`), onError,
      });
    },

    /** "Quitar": to the discarded tray (recoverable). */
    discard(paperId: string, pageIndex: number, studentId: string | null) {
      move.mutate({ paperId, pageIndex, to: 'discarded' }, {
        onSuccess: (r) => toast(`Página quitada.${dropped(r)}`, {
          action: {
            label: 'Deshacer',
            run: () => moveLoose.mutate({ tray: 'discarded', pageIndex: discardedAt, ...(studentId ? { to_student_id: studentId } : { to: 'unplaced' }) }, { onError }),
          },
        }),
        onError,
      });
    },

    /** "Separar aquí": this page and the following ones become another paper. */
    split(paperId: string, pageIndex: number) {
      split.mutate({ paperId, pageIndex }, {
        onSuccess: (r) => toast(r.paper?.student ? `Separada: es de ${r.paper.student.first_name}.` : 'Separada. Elige de quién es en «Sin identificar».', {
          action: r.paper ? { label: 'Deshacer', run: () => merge.mutate({ paperId, otherId: r.paper!.id }, { onError }) } : undefined,
        }),
        onError,
      });
    },

    /** Unmatched paper → a student who already has pages: one paper. */
    mergeInto(paperId: string, intoPaperId: string, studentId: string) {
      merge.mutate({ paperId: intoPaperId, otherId: paperId }, {
        onSuccess: (r) => toast(`Páginas añadidas a la hoja de ${name(studentId)}.${dropped(r)}`), onError,
      });
    },

    /** A loose or discarded page → a student's paper. */
    placeLoose(tray: Tray, pageIndex: number, studentId: string) {
      moveLoose.mutate({ tray, pageIndex, to_student_id: studentId }, {
        onSuccess: (r) => toast(`Página añadida a la hoja de ${name(studentId)}.${dropped(r)}`), onError,
      });
    },

    discardLoose(pageIndex: number) {
      moveLoose.mutate({ tray: 'unplaced', pageIndex, to: 'discarded' }, {
        onSuccess: () => toast('Página descartada.', {
          action: { label: 'Deshacer', run: () => moveLoose.mutate({ tray: 'discarded', pageIndex: discardedAt, to: 'unplaced' }, { onError }) },
        }),
        onError,
      });
    },

    restore(pageIndex: number) {
      moveLoose.mutate({ tray: 'discarded', pageIndex, to: 'unplaced' }, {
        onSuccess: () => toast('Página recuperada: está en «Páginas por colocar».'), onError,
      });
    },

    async deleteForever(tray: Tray, pageIndex: number) {
      if (!(await confirm({ title: 'Borrar esta página', text: 'Se borra la imagen escaneada. No se puede deshacer.', confirm: 'Borrar', danger: true }))) return;
      remove.mutate({ tray, pageIndex }, { onSuccess: () => toast('Página borrada'), onError });
    },
  };
}

export type PageOps = ReturnType<typeof usePageOps>;
