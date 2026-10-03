import { WarningCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { ContentDoc, Slide } from '../../api/content';
import { useJob } from '../../api/core';
import type { LessonInfo, MaterialDetail, NotesLine } from '../../api/units';
import { fileUrl } from '../../lib/api';
import { Button, EmptyState, RichText, Section, SlideImage, Spinner } from '../../ui';
import { Rewriting } from './ElementMenu';

interface Props {
  m: MaterialDetail;
  doc: ContentDoc;
  lesson: LessonInfo;
  /** Speaker notes under each card. */
  showNotes: boolean;
  editing: boolean;
  /** Slides the AI is rewriting now. */
  busy: Set<string>;
  /** The menu of a slide in edit mode. */
  menu: (slide: Slide, n: number | null) => ReactNode;
  /** A failed lesson: «Volver a intentar» (null while it cannot: `retryReason` says why). */
  onRetry: () => void;
  retrying: boolean;
  retryReason: string | null;
}

/** The slides of one lesson as the server rendered them (the same images as the PDF and the projector), numbered like
 *  the PDF, its backup slides apart at the end. A lesson still being written or that failed says so in its place. */
export default function SlidesView({ m, doc, lesson, showNotes, editing, busy, menu, onRetry, retrying, retryReason }: Props) {
  if (lesson.status === 'generating') return <Preparing m={m} n={lesson.n} />;
  if (lesson.status === 'failed') {
    return (
      <EmptyState icon={<WarningCircle size={24} />} title="No se ha podido preparar esta sesión."
        text={lesson.error || undefined}
        action={<Button variant="tinted" onClick={onRetry} loading={retrying} disabled={!!retryReason}>{retryReason ?? 'Volver a intentar'}</Button>} />
    );
  }
  const byId = new Map(doc.slides.map((s) => [s.id, s]));
  const number = new Map(lesson.slide_ids.map((id, i) => [id, i + 1]));
  const card = (id: string, caption?: string) => {
    const slide = byId.get(id);
    if (!slide) return null;
    const n = number.get(id) ?? null;
    const isBusy = busy.has(id);
    return (
      <figure key={id} data-element={id} className={`slide-card element${editing ? ' element--editing' : ''}${isBusy ? ' element--busy' : ''}`}>
        {caption && <div className="slide-card__caption">{caption}</div>}
        <SlideCardImage m={m} id={id} n={n} />
        {editing && !isBusy && <div className="element__menu">{menu(slide, n)}</div>}
        {isBusy && <Rewriting />}
        {showNotes && <Notes lines={m.slide_notes[id] ?? []} />}
      </figure>
    );
  };
  const backupOf = (s: Slide | undefined) => {
    const target = s?.backup_for ? number.get(s.backup_for) : undefined;
    return target ? `Reserva de la diapositiva ${target}` : undefined;
  };
  return (
    <>
      <div className="slides">{lesson.slide_ids.map((id) => card(id))}</div>
      {lesson.hidden_ids.length > 0 && (
        <Section title="Diapositivas de reserva">
          <p className="slides__hint">No salen al proyectar. Tecla H para mostrarlas.</p>
          <div className="slides">{lesson.hidden_ids.map((id) => card(id, backupOf(byId.get(id))))}</div>
        </Section>
      )}
    </>
  );
}

/** The card image of a slide: the server's 960 px image; the folio placeholder while it is being rendered; the
 *  neutral line when its render failed. */
export function SlideCardImage({ m, id, n }: { m: MaterialDetail; id: string; n: number | null }) {
  const img = m.slide_images[id];
  const failed = m.frames_failed.includes(id);
  return (
    <SlideImage className="slide-card__img" src={fileUrl(img?.card)} alt={img?.alt ?? ''}
      placeholder={failed ? 'Esta diapositiva no se ha podido maquetar.' : <span className="slide-card__folio num">{n ?? ''}</span>} />
  );
}

/** «Notas del orador» as the server composed them («Tiempo», «Respuesta», «Di»…), label first. */
export function Notes({ lines, className = 'slide-card__notes' }: { lines: NotesLine[]; className?: string }) {
  if (!lines.length) return null;
  return (
    <dl className={className}>
      {lines.map((l, i) => (
        <div key={i}><dt>{l.label}</dt><dd><RichText text={l.text} /></dd></div>
      ))}
    </dl>
  );
}

/** A lesson still being written: its place in the page with the job's progress line. */
function Preparing({ m, n }: { m: MaterialDetail; n: number }) {
  const job = useJob(m.job_id);
  return (
    <div className="slides-preparing" role="status">
      <Spinner />
      <div>
        <div className="slides-preparing__title">Sesión {n} · Preparando…</div>
        {job?.message && <div className="muted">{job.message}</div>}
      </div>
    </div>
  );
}
