import { WarningCircle } from '@phosphor-icons/react';
import type { ContentDoc } from '../../api/content';
import type { MaterialDetail, ReviewNote } from '../../api/units';
import { Callout, List, Row, Section } from '../../ui';
import { elementLabel } from './DocView';

/** What prints broken: figures that cannot be drawn and formulas the PDF shows as code (backend figure_errors,
 *  render_issues). The broken figures are marked where they are. */
export function Problems({ m }: { m: MaterialDetail }) {
  const figures = m.figure_errors?.length ?? 0;
  const issues = m.render_issues ?? [];
  if (!figures && !issues.length) return null;
  return (
    <Callout tone="warn" icon={<WarningCircle size={20} />}>
      <b>Revisa este material antes de imprimirlo.</b>{' '}
      {figures > 0 && <>{figures === 1 ? 'Una figura no se ha podido dibujar' : `${figures} figuras no se han podido dibujar`} y
        no sale{figures === 1 ? '' : 'n'} en el PDF: está{figures === 1 ? '' : 'n'} marcada{figures === 1 ? '' : 's'} abajo. </>}
      {issues.length > 0 && <>En el PDF hay partes que no salen bien: {issues.slice(0, 3).join(' · ')}. </>}
      Edítalas o reescríbelas con IA.
    </Callout>
  );
}

/** «Revisa esto», while the material is a draft: what the verification withdrew or could not fix (never dropped
 *  silently). A row with an element leads to it (`onGo`). */
export function ReviewNotes({ notes, doc, onGo }: {
  notes: ReviewNote[]; doc: ContentDoc; onGo: (id: string) => void;
}) {
  if (!notes.length) return null;
  return (
    <Section title="Revisa esto">
      <List>
        {notes.map((r, i) => (r.kind === 'unfixed' && r.id
          ? <Row key={i} title={`${elementLabel(doc, r.id, r.element)}: ${r.text}`} sub={`Sin arreglar. ${r.reason}`} wrapSub
            onClick={() => onGo(r.id!)} />
          : <Row key={i} title={`${r.element}: ${r.text}`} sub={`Se ha retirado. ${r.reason}`} wrapSub />))}
      </List>
    </Section>
  );
}

/** Scroll to an element of the page (a slide card or a block) and centre it. */
export function scrollToElement(id: string) {
  document.querySelector(`[data-element="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
