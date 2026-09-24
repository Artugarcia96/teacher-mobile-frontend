import type { LoosePage, ScanPage, Tray } from '../../api/papers';
import { fileUrl } from '../../lib/api';
import { Button, Lightbox } from '../../ui';
import { looseTitle, pageCaption } from './pageLabels';
import type { PageOps } from './usePageOps';

/** What is open in the viewer: the pages of one paper, or a tray of loose pages. */
export type ViewerTarget =
  | { kind: 'paper'; paperId: string; studentId: string | null; title: string; pages: ScanPage[]; index: number }
  | { kind: Tray; pages: ScanPage[]; index: number };

interface Props {
  target: ViewerTarget;
  ops: PageOps;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** "Mover a otro alumno" / "Asignar": the caller opens the student picker for this page. */
  onPick: (target: ViewerTarget) => void;
}

/** Full-screen page with the actions that fix a pile: move, split, remove (papers) or place, discard, restore (trays). */
export function PageViewer({ target, ops, onIndex, onClose, onPick }: Props) {
  const page = target.pages[target.index];
  if (!page) return null;
  const run = (fn: () => void) => () => { onClose(); fn(); };
  const caption = target.kind === 'paper' ? `${target.title} · ${pageCaption(page)}`
    : 'reason' in page ? looseTitle(page as LoosePage) : pageCaption(page);
  let actions;
  if (target.kind === 'paper') {
    actions = <>
      <Button variant="neutral" size="sm" onClick={run(() => onPick(target))}>Mover a otro alumno</Button>
      {target.index > 0 && (
        <Button variant="neutral" size="sm" onClick={run(() => ops.split(target.paperId, target.index))}>Separar aquí</Button>
      )}
      <Button variant="danger" size="sm" onClick={run(() => ops.discard(target.paperId, target.index, target.studentId))}>Quitar</Button>
    </>;
  } else if (target.kind === 'unplaced') {
    actions = <>
      <Button variant="neutral" size="sm" onClick={run(() => onPick(target))}>Asignar a un alumno</Button>
      <Button variant="danger" size="sm" onClick={run(() => ops.discardLoose(target.index))}>Descartar</Button>
    </>;
  } else {
    actions = <>
      <Button variant="neutral" size="sm" onClick={run(() => ops.restore(target.index))}>Recuperar</Button>
      <Button variant="neutral" size="sm" onClick={run(() => onPick(target))}>Asignar a un alumno</Button>
      <Button variant="danger" size="sm" onClick={run(() => ops.deleteForever('discarded', target.index))}>Borrar</Button>
    </>;
  }
  return (
    <Lightbox images={target.pages.map((p) => fileUrl(p.url)!)} index={target.index} onIndex={onIndex} onClose={onClose}
      label={caption} caption={caption} actions={actions} />
  );
}
