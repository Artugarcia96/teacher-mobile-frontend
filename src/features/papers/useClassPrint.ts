import type { Correction } from '../../api/papers';
import type { Job, StudentRef } from '../../api/types';
import { useClassPrintUrl, usePrepareAdapted, type Versions } from '../../api/versions';
import { useFeedback } from '../../ui';
import { openSigned } from './openDoc';

/** "Nerea", "Nerea y Mario", "Nerea, Mario y 2 más" */
export function firstNames(students: StudentRef[]): string {
  const names = students.map((s) => s.first_name);
  if (names.length > 3) return `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0] ?? '';
}

/** Who the named print is for when the exam is only for some students (a repeat, a recovery): "Paula", "2 alumnos";
 * null for the whole class. */
export function printedFor(c: Correction): { who: string; names: string } | null {
  if (!c.activity.student_ids && !c.activity.repeat_of) return null;
  const students = c.students.map((s) => s.student);
  return { who: students.length === 1 ? students[0].first_name : `${students.length} alumnos`, names: firstNames(students) };
}

/** «Imprimir para la clase» from any entry point. Asked first: students whose measures ask for an adapted version they
 * do not take yet (prepare them, or print anyway), then versions the AI wrote that nobody has opened yet («Borrador
 * IA») and that some student takes (review the first one with `onReview`, or print anyway). */
export function useClassPrint(activityId: string, versions: Versions | undefined, onReview: (key: string) => void,
  onJob: (job: Job) => void) {
  const classPrint = useClassPrintUrl(activityId);
  const adapt = usePrepareAdapted(activityId);
  const { toast, confirm } = useFeedback();

  const prepareAdapted = () => adapt.mutate(undefined, {
    onSuccess: ({ job }) => (job ? onJob(job) : toast('Versiones adaptadas al día')),
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const print = async () => {
    const missing = versions?.pending_adapted ?? [];
    if (missing.length) {
      const ok = await confirm({
        title: missing.length === 1 ? 'Falta una versión adaptada' : 'Faltan versiones adaptadas',
        text: `${firstNames(missing)} aún no ${missing.length === 1 ? 'tiene' : 'tienen'} la versión que piden sus medidas.`,
        confirm: 'Imprimir igualmente',
        other: { label: 'Preparar versiones adaptadas', run: prepareAdapted },
      });
      if (!ok) return;
    }
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
