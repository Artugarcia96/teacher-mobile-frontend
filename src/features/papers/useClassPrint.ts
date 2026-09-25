import { useClassPrintUrl, type Versions } from '../../api/versions';
import { useFeedback } from '../../ui';
import { openSigned } from './openDoc';

/** «Imprimir para la clase» from any entry point. Versions the AI wrote that nobody has opened yet («Borrador IA») and
 * that some student takes are asked about first: print anyway, or review the first one (`onReview`). */
export function useClassPrint(activityId: string, versions: Versions | undefined, onReview: (key: string) => void) {
  const classPrint = useClassPrintUrl(activityId);
  const { toast, confirm } = useFeedback();

  const print = async () => {
    const drafts = (versions?.versions ?? []).filter((v) => v.draft && v.status === 'ready' && v.student_ids.length);
    if (drafts.length) {
      const one = drafts.length === 1;
      const who = one ? `«${drafts[0].label}»` : drafts.length === 2 ? `«${drafts[0].label}» y «${drafts[1].label}»`
        : `«${drafts[0].label}» y ${drafts.length - 1} más`;
      const it = one ? 'la' : 'las';
      const ok = await confirm({
        title: one ? 'Hay una versión sin revisar' : 'Hay versiones sin revisar',
        text: `${who} ${it} ha escrito la IA y aún no ${it} has abierto.`,
        confirm: 'Imprimir igualmente',
        other: { label: 'Revisar', run: () => onReview(drafts[0].key) },
      });
      if (!ok) return;
    }
    await openSigned(() => classPrint.mutateAsync(), (m) => toast(m, { tone: 'error' }), (m) => toast(m));
  };

  return { print, isPending: classPrint.isPending };
}
