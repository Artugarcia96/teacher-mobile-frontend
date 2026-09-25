/** Page operations of the "Recoger" step with feedback and undo: every change is reversible from the toast.
 * Pages are addressed by their stable id, and nothing can be tapped while a change is being saved (`lock`). */
import {
  useDeleteLoosePage, useMergePapers, useMoveLoosePage, useMovePage, useSplitPaper, type Correction, type PageOpResult, type Tray,
} from '../../api/papers';
import { useFeedback } from '../../ui';

/** `blocked`: why pages cannot be edited right now (a job is reading the pile), or null. */
export function usePageOps(correction: Correction, blocked: string | null = null) {
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
  const graded = (r: PageOpResult) => r.graded.length
    ? ` ${r.graded.map(name).join(' y ')} ya ${r.graded.length > 1 ? 'tenían' : 'tenía'} nota confirmada: revísala.` : '';
  const busy = move.isPending || split.isPending || merge.isPending || moveLoose.isPending || remove.isPending;

  return {
    busy,
    /** Why page actions are disabled right now (null = they can be used). */
    lock: blocked ?? (busy ? 'Guardando el cambio anterior…' : null),

    /** A page of a paper → another student's paper (created if needed). */
    toStudent(paperId: string, pageId: string, studentId: string) {
      move.mutate({ paperId, pageId, to_student_id: studentId }, {
        onSuccess: (r) => toast(`Página movida a la hoja de ${name(studentId)}.${graded(r)}${dropped(r)}`), onError,
      });
    },

    /** "Quitar": to the discarded tray (recoverable). Undo puts it back in the same paper (or student's paper). */
    discard(paperId: string, pageId: string, studentId: string | null) {
      move.mutate({ paperId, pageId, to: 'discarded' }, {
        onSuccess: (r) => {
          const back = studentId ? { to_student_id: studentId } : r.from_paper_id ? { to_paper_id: r.from_paper_id } : { to: 'unplaced' as const };
          toast(`Página quitada.${dropped(r)}`, {
            action: { label: 'Deshacer', run: () => moveLoose.mutate({ tray: 'discarded', pageId, ...back }, { onError }) },
          });
        },
        onError,
      });
    },

    /** "Separar aquí": this page and the following ones become another paper. */
    split(paperId: string, pageId: string) {
      split.mutate({ paperId, pageId }, {
        onSuccess: (r) => toast(r.paper?.student ? `Separada: es de ${r.paper.student.first_name}.` : 'Separada. Elige de quién es en «Sin identificar».', {
          action: r.paper ? { label: 'Deshacer', run: () => merge.mutate({ paperId, otherId: r.paper!.id }, { onError }) } : undefined,
        }),
        onError,
      });
    },

    /** Unmatched paper → a student who already has pages: one paper. */
    mergeInto(paperId: string, intoPaperId: string, studentId: string) {
      merge.mutate({ paperId: intoPaperId, otherId: paperId }, {
        onSuccess: (r) => toast(`Páginas añadidas a la hoja de ${name(studentId)}.${graded(r)}${dropped(r)}`), onError,
      });
    },

    /** A loose or discarded page → a student's paper. */
    placeLoose(tray: Tray, pageId: string, studentId: string) {
      moveLoose.mutate({ tray, pageId, to_student_id: studentId }, {
        onSuccess: (r) => toast(`Página añadida a la hoja de ${name(studentId)}.${graded(r)}${dropped(r)}`), onError,
      });
    },

    discardLoose(pageId: string) {
      moveLoose.mutate({ tray: 'unplaced', pageId, to: 'discarded' }, {
        onSuccess: () => toast('Página descartada.', {
          action: { label: 'Deshacer', run: () => moveLoose.mutate({ tray: 'discarded', pageId, to: 'unplaced' }, { onError }) },
        }),
        onError,
      });
    },

    restore(pageId: string) {
      moveLoose.mutate({ tray: 'discarded', pageId, to: 'unplaced' }, {
        onSuccess: () => toast('Página recuperada: está en «Páginas por colocar».'), onError,
      });
    },

    async deleteForever(tray: Tray, pageId: string) {
      if (!(await confirm({ title: 'Borrar esta página', text: 'Se borra la imagen escaneada. No se puede deshacer.', confirm: 'Borrar', danger: true }))) return;
      remove.mutate({ tray, pageId }, { onSuccess: () => toast('Página borrada'), onError });
    },
  };
}

export type PageOps = ReturnType<typeof usePageOps>;
