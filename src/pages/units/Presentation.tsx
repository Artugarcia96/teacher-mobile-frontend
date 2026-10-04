import { Check, ChalkboardTeacher, DotsThree, DownloadSimple, PencilSimple, Play } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ContentDoc, Slide } from '../../api/content';
import { useAIUnavailable } from '../../api/core';
import {
  lessonRendering, presentationLessons, useArchetypes, useLessonJob, useSlidesSaving, useUpdateMaterial, type LessonInfo, type MaterialDetail,
} from '../../api/units';
import DownloadsSheet from '../../features/materials/DownloadsSheet';
import { lessonLine } from '../../features/materials/lessons';
import { useWatched, watchJob } from '../../features/materials/watch';
import { isDraft } from '../../features/units/kinds';
import {
  AIBadge, Button, Callout, DESKTOP, IconButton, Menu, Page, RichText, Segmented, Switch, TextSubsProvider, useFeedback, useMediaQuery,
  type MenuItem,
} from '../../ui';
import LessonSheets, { type LessonSheet } from './LessonSheets';
import { Problems, ReviewNotes, scrollToElement } from './materialParts';
import Presenter from './Presenter';
import SlidesView from './SlidesView';
import TeacherView from './TeacherView';

type Projecting = { mode: 'present' | 'teacher'; lesson: number; slide?: number } | null;

interface Props {
  m: MaterialDetail;
  doc: ContentDoc;
  title: string;
  eyebrow: ReactNode;
  page: { back: string; backLabel: string; backToOrigin: boolean };
  /** The material's menu (rename, share, delete). */
  menu: MenuItem[];
  path: string;
}

/** A presentation's page (§1.2): one lesson at a time («?sesion=3»), its slides as the server rendered them, «Proyectar
 *  sesión 3», the teacher view on desktop, the downloads of each lesson and edit mode. Lessons still being written show
 *  in their place and arrive with «Sesión 3 lista». From Hoy, `?presentar=1` projects at once (`&diapositiva=12`: where
 *  the class left it). */
export default function Presentation({ m, doc, title, eyebrow, page, menu, path }: Props) {
  const [params, setParams] = useSearchParams();
  const { toast } = useFeedback();
  const archetypes = useArchetypes();
  const desktop = useMediaQuery(DESKTOP);
  const noAI = useAIUnavailable();
  const update = useUpdateMaterial();
  const lessonJob = useLessonJob(m.id);
  const watched = useWatched();
  const saving = useSlidesSaving(m.id);
  const busy = new Map([
    ...[...saving].map((id) => [id, 'Guardando…'] as const),
    ...watched.flatMap((w) => (w.kind === 'rewrite' && w.materialId === m.id ? [[w.blockId, 'Reescribiendo con IA…'] as const] : [])),
  ]);
  const [editMode, setEditMode] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [downloads, setDownloads] = useState(false);
  const [projecting, setProjecting] = useState<Projecting>(null);
  const [sheet, setSheet] = useState<LessonSheet | null>(null);

  const lessons = presentationLessons(m);
  const asked = Number(params.get('sesion'));
  const lesson: LessonInfo | undefined = lessons.find((l) => l.n === asked)
    ?? lessons.find((l) => l.status === 'ready') ?? lessons[0];
  const n = lesson?.n ?? 1;
  const resume = Number(params.get('diapositiva')) || null;
  const choose = (k: number) => setParams((p) => { p.set('sesion', String(k)); p.delete('diapositiva'); return p; }, { replace: true });

  // From Hoy: project at once; leaving it shows this lesson (and «‹ Hoy» goes back).
  useEffect(() => {
    if (params.get('presentar') !== '1') return;
    if (lesson?.status === 'ready') setProjecting({ mode: 'present', lesson: lesson.n, slide: resume ?? undefined });
    setParams((p) => { p.delete('presentar'); p.set('sesion', String(n)); return p; }, { replace: true });
  }, [params, setParams, lesson, n, resume]);

  // «Sesión 3 lista» when a lesson lands while the page is open.
  const ready = useRef(new Set(lessons.filter((l) => l.status === 'ready').map((l) => l.n)));
  useEffect(() => {
    for (const l of lessons) {
      if (l.status === 'ready' && !ready.current.has(l.n)) {
        ready.current.add(l.n);
        toast(`Sesión ${l.n} lista`);
      }
    }
  }, [lessons, toast]);

  const markReviewed = () => update.mutate({ id: m.id, reviewed: true }, {
    onSuccess: () => toast('Marcado como revisado'), onError: (e) => toast((e as Error).message, { tone: 'error' }),
  });

  const retry = () => lessonJob.mutate({ n }, {
    onSuccess: ({ job }) => {
      ready.current.add(n);  // the job's own «Sesión n lista» announces it, not the page as well
      watchJob({ job: job.id, kind: 'material', done: `Sesión ${n} lista`, failed: 'No se ha podido preparar esta sesión.', path });
      toast(`Preparando de nuevo la sesión ${n}`);
    },
    onError: (e) => toast((e as Error).message, { tone: 'error' }),
  });

  const go = (id: string) => {
    const target = doc.slides.find((s) => s.id === id);
    if (target && target.lesson !== n) choose(target.lesson);
    window.setTimeout(() => scrollToElement(id), 50);
  };

  const rendering = !!lesson && lessonRendering(m, lesson);
  const canProject = lesson?.status === 'ready' && !rendering;
  const editReason = lesson?.status === 'generating' ? 'Esta sesión se está preparando.' : lesson?.status === 'failed' ? 'Esta sesión no se ha podido preparar.' : null;
  const projectReason = editReason ?? (rendering ? 'Las imágenes de esta sesión se están preparando.' : null);
  const lessonMenu: MenuItem[] = [
    { label: 'Editar sesión', onSelect: () => setSheet({ kind: 'lesson', n }), disabledReason: editReason ?? undefined },
    { label: 'Añadir diapositiva', onSelect: () => setSheet({ kind: 'add', n, after: null }), disabledReason: editReason ?? undefined },
    {
      label: 'Regenerar sesión…', onSelect: () => setSheet({ kind: 'regenerate', n }),
      disabledReason: lesson?.status === 'generating' ? 'Esta sesión se está preparando.' : noAI ?? undefined,
    },
    { label: 'Descargar', onSelect: () => setDownloads(true), separatorBefore: true },
  ];

  const toolbar = (
    <div className="material-bar">
      <div className="material-actions">
        <Button size="sm" icon={<Play size={16} weight="fill" />} disabled={!canProject}
          onClick={() => setProjecting({ mode: 'present', lesson: n })}>{canProject ? `Proyectar sesión ${n}` : projectReason}</Button>
        {resume && canProject && (
          <Button size="sm" variant="tinted" onClick={() => setProjecting({ mode: 'present', lesson: n, slide: resume })}>
            Seguir en la diapositiva {resume}
          </Button>
        )}
        {desktop && canProject && (
          <Button size="sm" variant="neutral" icon={<ChalkboardTeacher size={16} />} onClick={() => setProjecting({ mode: 'teacher', lesson: n })}>
            Abrir vista del profesor
          </Button>
        )}
        <Button size="sm" variant="neutral" icon={<DownloadSimple size={16} />} onClick={() => setDownloads(true)}>Descargar</Button>
        <Button size="sm" variant={editMode ? 'tinted' : 'neutral'} icon={editMode ? <Check size={16} weight="bold" /> : <PencilSimple size={16} />}
          onClick={() => setEditMode(!editMode)}>{editMode ? 'Hecho' : 'Editar'}</Button>
      </div>
      <label className="material-switch">
        <span>Notas del orador</span>
        <Switch checked={showNotes} onChange={setShowNotes} label="Mostrar notas del orador" />
      </label>
    </div>
  );

  const count = lessons.length > 1 ? `${lessons.length} sesiones` : null;

  return (
    <TextSubsProvider value={{ names: m.names }}>
      <Page title={title} eyebrow={eyebrow} {...page} wide
        subtitle={<>{m.unit_title && <span>{m.unit_title}</span>}{count && <span>{count}</span>}{isDraft(m) && <AIBadge />}</>}
        actions={<Menu trigger={(open) => <IconButton label="Más opciones" glass onClick={open}><DotsThree size={22} weight="bold" /></IconButton>} items={menu} />}
        toolbar={toolbar}>
        <div className="material-body">
          {lessons.length > 1 && (
            <Segmented label="Sesión" value={n} onChange={choose}
              options={lessons.map((l) => ({
                value: l.n, label: String(l.n), disabled: l.status === 'generating', reason: 'Esta sesión se está preparando.',
              }))} />
          )}
          {lesson && (
            <div className="lesson-head">
              <div className="lesson-head__text">
                <h2 className="lesson-head__title">Sesión {lesson.n} · <RichText text={lesson.title} /></h2>
                <div className="lesson-head__line">{lessonLine(lesson, doc.family, archetypes.data)}</div>
                {lesson.question && <RichText as="p" className="lesson-head__question" text={lesson.question} />}
              </div>
              <Menu trigger={(open) => <IconButton label={`Opciones de la sesión ${lesson.n}`} onClick={open}><DotsThree size={20} weight="bold" /></IconButton>}
                items={lessonMenu} />
            </div>
          )}
          {editMode ? (
            <Callout tone="accent" icon={<DotsThree size={20} weight="bold" />}>
              Abre el menú de cada diapositiva para cambiar su texto, moverla, pasarla a reserva o reescribirla con IA. Cada cambio se guarda al momento y rehace sus imágenes y los PDF.
            </Callout>
          ) : isDraft(m) && (
            <Callout tone="accent">
              <div className="review-note">
                <span>Borrador de la IA: revísalo antes de usarlo en clase.</span>
                <Button size="sm" variant="tinted" icon={<Check size={16} weight="bold" />} loading={update.isPending} onClick={markReviewed}>Marcar como revisado</Button>
              </div>
            </Callout>
          )}
          <Problems m={m} />
          {isDraft(m) && <ReviewNotes notes={m.review ?? []} doc={doc} onGo={go} />}

          {lesson && (
            <SlidesView m={m} doc={doc} lesson={lesson} showNotes={showNotes} editing={editMode} busy={busy}
              menu={(slide: Slide, k: number | null) => (
                <SlideMenuButton slide={slide} n={k} lesson={lesson} doc={doc} onSheet={setSheet} noAI={noAI} />
              )}
              onRetry={retry} retrying={lessonJob.isPending} retryReason={noAI} />
          )}
        </div>

        {projecting?.mode === 'present' && (
          <Presenter m={m} doc={doc} lesson={projecting.lesson} slide={projecting.slide} onClose={() => setProjecting(null)}
            onTeacherView={(l, s) => setProjecting({ mode: 'teacher', lesson: l, slide: s })} />
        )}
        {projecting?.mode === 'teacher' && (
          <TeacherView m={m} doc={doc} lesson={projecting.lesson} slide={projecting.slide} onClose={() => setProjecting(null)} />
        )}
        {downloads && <DownloadsSheet materialId={m.id} lessons={lessons} onClose={() => setDownloads(false)} />}
        {sheet && <LessonSheets m={m} doc={doc} sheet={sheet} path={path} onSheet={setSheet} onClose={() => setSheet(null)} />}
      </Page>
    </TextSubsProvider>
  );
}

/** «···» of a slide in edit mode: what opens a sheet goes through `onSheet` (LessonSheets). */
function SlideMenuButton({ slide, n, lesson, doc, onSheet, noAI }: {
  slide: Slide; n: number | null; lesson: LessonInfo; doc: ContentDoc; onSheet: (s: LessonSheet) => void; noAI: string | null;
}) {
  const items = slideMenu(slide, n, lesson, (id) => doc.slides.find((x) => x.id === id)?.archetype, onSheet, noAI);
  return (
    <Menu trigger={(open) => <IconButton size="sm" label={n ? `Opciones de la diapositiva ${n}` : 'Opciones de la diapositiva de reserva'} onClick={open}>
      <DotsThree size={18} weight="bold" />
    </IconButton>} items={items} />
  );
}

/** A slide's menu (§1.7). The slides Sepia composes (cover, credits) only say why they cannot be changed; nothing
 *  moves before the cover or after the credits. */
function slideMenu(slide: Slide, n: number | null, lesson: LessonInfo, archetypeOf: (id: string) => string | undefined,
  onSheet: (s: LessonSheet) => void, noAI: string | null): MenuItem[] {
  const fixed = slide.archetype === 'portada' || slide.archetype === 'creditos';
  const byCode = fixed ? 'Esta diapositiva la pone Sepia.' : undefined;
  const order = lesson.slide_ids;
  const i = slide.hidden ? -1 : order.indexOf(slide.id);
  const up = !fixed && i >= 2 ? (i - 2 === 0 ? null : order[i - 2]) : undefined;
  const below = !fixed && i >= 1 ? order[i + 1] : undefined;
  const down = below && archetypeOf(below) !== 'creditos' ? below : undefined;
  return [
    {
      label: 'Editar texto', onSelect: () => onSheet({ kind: 'text', slideId: slide.id }),
      disabledReason: slide.archetype === 'creditos' ? 'Los créditos los compone Sepia con las imágenes y los textos.'
        : slide.archetype === 'correccion' ? 'La corrección sale de la práctica: edita la práctica.' : undefined,
    },
    { label: 'Reescribir con IA…', onSelect: () => onSheet({ kind: 'rewrite', slideId: slide.id }), disabledReason: byCode ?? noAI ?? undefined },
    { label: 'Duplicar', onSelect: () => onSheet({ kind: 'duplicate', slideId: slide.id }), separatorBefore: true, disabledReason: byCode },
    { label: 'Mover a otra sesión…', onSelect: () => onSheet({ kind: 'move', slideId: slide.id }), disabledReason: byCode },
    slide.hidden
      ? { label: 'Mostrar al proyectar', onSelect: () => onSheet({ kind: 'hidden', slideId: slide.id, hidden: false }) }
      : { label: 'Pasar a reserva', onSelect: () => onSheet({ kind: 'hidden', slideId: slide.id, hidden: true }), disabledReason: byCode },
    { label: 'Minutos…', onSelect: () => onSheet({ kind: 'minutes', slideId: slide.id }), disabledReason: byCode },
    ...(up !== undefined ? [{ label: 'Subir', onSelect: () => onSheet({ kind: 'reorder', slideId: slide.id, lesson: lesson.n, after: up, up: true }) }] : []),
    ...(down ? [{ label: 'Bajar', onSelect: () => onSheet({ kind: 'reorder', slideId: slide.id, lesson: lesson.n, after: down, up: false }) }] : []),
    { label: 'Quitar', danger: true, separatorBefore: true, onSelect: () => onSheet({ kind: 'remove', slideId: slide.id, n }), disabledReason: byCode },
  ];
}
