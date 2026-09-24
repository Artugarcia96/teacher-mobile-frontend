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

/** Full-screen page with the actions that fix a pile: move, split, remove (papers) or place, discard, restore (trays).
 * While the pile is being read (or a change is saving) the actions are off and say why. */
export function PageViewer({ target, ops, onIndex, onClose, onPick }: Props) {
  const page = target.pages[target.index];
  if (!page) return null;
  const off = !!ops.lock;
  const run = (fn: () => void) => () => { onClose(); fn(); };
  const caption = target.kind === 'paper' ? `${target.title} · ${pageCaption(page)}`
    : 'reason' in page ? looseTitle(page as LoosePage) : pageCaption(page);
  let actions;
  if (target.kind === 'paper') {
    actions = <>
      <Button variant="neutral" size="sm" disabled={off} onClick={run(() => onPick(target))}>Mover a otro alumno</Button>
      {target.index > 0 && (
        <Button variant="neutral" size="sm" disabled={off} onClick={run(() => ops.split(target.paperId, page.id))}>Separar aquí</Button>
      )}
      <Button variant="danger" size="sm" disabled={off} onClick={run(() => ops.discard(target.paperId, page.id, target.studentId))}>Quitar</Button>
    </>;
  } else if (target.kind === 'unplaced') {
    actions = <>
      <Button variant="neutral" size="sm" disabled={off} onClick={run(() => onPick(target))}>Asignar a un alumno</Button>
      <Button variant="danger" size="sm" disabled={off} onClick={run(() => ops.discardLoose(page.id))}>Descartar</Button>
    </>;
  } else {
    actions = <>
      <Button variant="neutral" size="sm" disabled={off} onClick={run(() => ops.restore(page.id))}>Recuperar</Button>
      <Button variant="neutral" size="sm" disabled={off} onClick={run(() => onPick(target))}>Asignar a un alumno</Button>
      <Button variant="danger" size="sm" disabled={off} onClick={run(() => ops.deleteForever('discarded', page.id))}>Borrar</Button>
    </>;
  }
  return (
    <Lightbox images={target.pages.map((p) => fileUrl(p.url)!)} index={target.index} onIndex={onIndex} onClose={onClose}
      label={caption} caption={caption}
      actions={<>{off && <p className="viewer-lock" role="status">{ops.lock}</p>}{actions}</>} />
  );
}
