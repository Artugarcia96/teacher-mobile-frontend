import { CaretDown, CaretUp, Check, DotsThree, Trash, Warning } from '@phosphor-icons/react';
import { useState } from 'react';
import {
  useAssignPaper, useDeletePaper, useFlagsChecked, useReclassify, useSuggest, type Correction, type CorrectionStudent, type PaperFlag,
} from '../../api/papers';
import type { Job } from '../../api/types';
import { fileUrl } from '../../lib/api';
import { plural } from '../../lib/format';
import { Callout, Chip, IconButton, List, Row, Section, Menu, useFeedback } from '../../ui';
import { flagLabel, heldFromAI, isAttention, looseTitle, needsLook, pageCaption, shortName } from './pageLabels';
import { PageStrip } from './PageStrip';
import { PageViewer, type ViewerTarget } from './PageViewer';
import StudentPickerSheet from './StudentPickerSheet';
import { usePageOps } from './usePageOps';

type Pick =
  | { mode: 'paper'; paperId: string; thumb: string | null; detected: string | null }
  | { mode: 'page'; target: ViewerTarget };

const FINAL = ['confirmed', 'absent', 'exempt'];

interface Props {
  correction: Correction;
  /** Why pages cannot be edited right now (the pile is being read), or null. */
  blocked: string | null;
  /** A job is working on this exam (grading included): no new "Sugerir notas". */
  busy: boolean;
  onJob: (job: Job) => void;
}

/** Flag chips of a paper: warnings first (warn tone), then the informative ones (extra sheets show in its strip). */
function FlagChips({ s }: { s: CorrectionStudent }) {
  const attention = s.flags.filter(isAttention);
  const info = s.flags.filter((f) => !isAttention(f));
  if (!attention.length && !info.length) return null;
  return (
    <div className="chip-row">
      {attention.map((f: PaperFlag) => <Chip key={f.code} tone="warn">{flagLabel(f)}</Chip>)}
      {info.map((f: PaperFlag) => <Chip key={f.code}>{flagLabel(f)}</Chip>)}
    </div>
  );
}

/** Recoger: what the scan produced and the few things that need the teacher (flagged papers first). */
export function ScanPages({ correction, blocked, busy, onJob }: Props) {
  const { students, unmatched, unplaced, discarded } = correction;
  const id = correction.activity.id;
  const ops = usePageOps(correction, blocked);
  const assign = useAssignPaper(id);
  const removePaper = useDeletePaper(id);
  const flagsOk = useFlagsChecked(id);
  const suggest = useSuggest(id);
  const reclassify = useReclassify(id);
  const { toast } = useFeedback();
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDiscarded, setShowDiscarded] = useState<boolean | null>(null);
  const lock = ops.lock ?? undefined;
  const off = !!ops.lock || assign.isPending || removePaper.isPending || reclassify.isPending;

  const withPaper = students.filter((s) => s.paper_id);
  const toConfirm = withPaper.filter((s) => s.match_status === 'suggested');
  const settled = withPaper.filter((s) => s.match_status !== 'suggested');
  const flagged = settled.filter((s) => needsLook(s.flags));
  const calm = settled.filter((s) => !needsLook(s.flags));
  const noSuggestion = correction.rubric ? withPaper.filter((s) => !s.grade) : [];
  const ready = noSuggestion.filter((s) => !heldFromAI(s.flags));
  const held = noSuggestion.filter((s) => heldFromAI(s.flags));
  const unreadPages = unplaced.filter((p) => p.reason === 'sin_leer');
  const unread = unreadPages.length;
  const unreadWhy = unreadPages.find((p) => p.error)?.error;
  const suspicious = discarded.filter((p) => p.maybe_written);
  const discardedOpen = showDiscarded ?? suspicious.length > 0;
  const onError = (e: Error) => toast(e.message, { tone: 'error' });

  const doAssign = (paperId: string, studentId: string) => {
    const target = students.find((s) => s.student.id === studentId);
    if (target?.paper_id && target.paper_id !== paperId) return ops.mergeInto(paperId, target.paper_id, studentId);
    const final = FINAL.includes(target?.grade?.status ?? '');
    assign.mutate({ paperId, studentId }, {
      onSuccess: () => {
        toast(final ? `Hoja asignada a ${target?.student.name}. Ya tenía nota confirmada: revísala.` : `Hoja asignada a ${target?.student.name ?? 'el alumno'}`);
        if (correction.rubric && !final && !target?.grade) suggest.mutate([studentId], { onSuccess: ({ job }) => onJob(job), onError });
      },
      onError,
    });
  };

  const onPick = (sid: string) => {
    if (!pick) return;
    if (pick.mode === 'paper') return doAssign(pick.paperId, sid);
    const t = pick.target;
    const page = t.pages[t.index];
    if (!page) return;
    if (t.kind === 'paper') ops.toStudent(t.paperId, page.id, sid);
    else ops.placeLoose(t.kind, page.id, sid);
  };

  const discardPaper = (paperId: string) => {
    if (ops.lock) return toast(ops.lock);
    removePaper.mutate(paperId, {
      onSuccess: (r) => toast(`Hoja descartada: ${plural(r.count, 'su página está', 'sus páginas están')} en «Páginas descartadas».`),
      onError,
    });
  };

  const readAgain = () => reclassify.mutate(undefined, { onSuccess: ({ job }) => onJob(job), onError });

  const headThumb = (url: string | null, wide = false) => url ? (
    <img className={`paper-thumb${wide ? ' paper-thumb--wide' : ''}`} src={fileUrl(url)} alt="Cabecera de la hoja" loading="lazy" />
  ) : null;

  const openPaper = (s: CorrectionStudent, index: number) =>
    setViewer({ kind: 'paper', paperId: s.paper_id!, studentId: s.student.id, title: shortName(s.student), pages: s.pages, index });

  const paperRow = (s: CorrectionStudent) => (
    <Row key={s.student.id} className="paper-row" title={s.student.sort_name} wrapSub
      sub={
        <div className="paper-line">
          <PageStrip pages={s.pages} onOpen={(i) => openPaper(s, i)} label={`Páginas de ${s.student.name}`} />
          <FlagChips s={s} />
        </div>
      }
      trail={s.flags.some((f) => isAttention(f) || f.code === 'pagina_nueva_tras_nota') ? (
        <Menu trigger={(o) => <IconButton label="Más" size="sm" onClick={o}><DotsThree size={20} weight="bold" /></IconButton>}
          items={[{ label: 'Está bien así', icon: <Check size={18} />,
            onSelect: () => flagsOk.mutate(s.paper_id!, { onSuccess: () => toast('Hoja revisada'), onError }) }]} />
      ) : undefined}
    />
  );

  return (
    <>
      {correction.printed_from && (
        <Callout>
          Impreso desde «{correction.printed_from.title}» de {correction.printed_from.course}. Sus páginas se reconocen igual.
        </Callout>
      )}

      {ready.length > 0 && !busy && (
        <Callout tone="accent">
          <span>{ready.length === 1 ? '1 hoja no tiene' : `${ready.length} hojas no tienen`} sugerencia de la IA. </span>
          <button type="button" className="link-btn" disabled={suggest.isPending}
            onClick={() => suggest.mutate(ready.map((s) => s.student.id), { onSuccess: ({ job }) => onJob(job), onError })}>
            Sugerir notas
          </button>
        </Callout>
      )}

      {unmatched.length > 0 && (
        <Section title={`Sin identificar · ${unmatched.length}`}>
          <List inset={16}>
            {unmatched.map((u) => (
              <Row key={u.paper_id} className="tray-row" lead={headThumb(u.thumb_url)} wrapSub
                title={u.detected_name ? <span>Parece: <i>{u.detected_name}</i></span> : 'Nombre ilegible'}
                sub={
                  <div className="tray-sub">
                    {headThumb(u.thumb_url, true)}
                    <PageStrip pages={u.page_list} label="Páginas de la hoja"
                      onOpen={(index) => setViewer({ kind: 'paper', paperId: u.paper_id, studentId: null, title: 'Sin identificar', pages: u.page_list, index })} />
                    <div className="chip-row tray-chips">
                      {u.candidates.map((c) => (
                        <Chip key={c.id} tone="outline" disabled={off} title={lock} onClick={() => doAssign(u.paper_id, c.id)}>{shortName(c)}</Chip>
                      ))}
                      <Chip disabled={off} title={lock} onClick={() => setPick({ mode: 'paper', paperId: u.paper_id, thumb: u.thumb_url, detected: u.detected_name })}>Otro…</Chip>
                    </div>
                  </div>
                }
                trail={
                  <Menu trigger={(o) => <IconButton label="Más" size="sm" onClick={o}><DotsThree size={20} weight="bold" /></IconButton>}
                    items={[{ label: 'Descartar hoja', icon: <Trash size={18} />, danger: true, onSelect: () => discardPaper(u.paper_id) }]} />
                }
              />
            ))}
          </List>
        </Section>
      )}

      {unread > 0 && (
        <Callout tone="warn" icon={<Warning size={18} />}>
          <span>{unread === 1 ? 'No se ha podido leer 1 página.' : `No se han podido leer ${unread} páginas.`}{unreadWhy ? ` ${unreadWhy}` : ''} </span>
          <button type="button" className="link-btn" disabled={off} title={lock} onClick={readAgain}>
            {unread > 1 ? `Volver a leer (${unread})` : 'Volver a leer'}
          </button>
        </Callout>
      )}

      {unplaced.length > 0 && (
        <Section title={`Páginas por colocar · ${unplaced.length}`}>
          <List inset={16}>
            {unplaced.map((p, i) => (
              <Row key={p.id} className="tray-row loose-row" wrapSub
                title={p.reason === 'sin_leer' ? ( // why it was not read is said once, above
                  <Chip disabled={off} title={lock} onClick={() => setPick({ mode: 'page', target: { kind: 'unplaced', pages: unplaced, index: i } })}>
                    Asignar a un alumno
                  </Chip>
                ) : looseTitle(p)}
                lead={<PageStrip pages={[p]} label={looseTitle(p)} onOpen={() => setViewer({ kind: 'unplaced', pages: unplaced, index: i })} />}
                sub={p.reason === 'sin_leer' ? undefined : (
                  <div className="tray-sub">
                    {p.written_name && p.reason !== 'extra_sin_examen' && <span className="muted">Se lee «{p.written_name}»</span>}
                    <div className="chip-row tray-chips">
                      {p.candidates.map((c) => (
                        <Chip key={c.id} tone="outline" disabled={off} title={lock} onClick={() => ops.placeLoose('unplaced', p.id, c.id)}>{shortName(c)}</Chip>
                      ))}
                      <Chip disabled={off} title={lock} onClick={() => setPick({ mode: 'page', target: { kind: 'unplaced', pages: unplaced, index: i } })}>
                        {p.candidates.length ? 'Otro…' : 'Asignar a un alumno'}
                      </Chip>
                    </div>
                  </div>
                )}
                trail={
                  <Menu trigger={(o) => <IconButton label="Más" size="sm" onClick={o}><DotsThree size={20} weight="bold" /></IconButton>}
                    items={[{ label: 'Descartar página', icon: <Trash size={18} />, danger: true,
                      onSelect: () => (ops.lock ? toast(ops.lock) : ops.discardLoose(p.id)) }]} />
                }
              />
            ))}
          </List>
        </Section>
      )}

      {toConfirm.length > 0 && (
        <Section title={`Por confirmar · ${toConfirm.length}`}>
          <List inset={16}>
            {toConfirm.map((s) => (
              <Row key={s.paper_id} className="tray-row" lead={headThumb(s.thumb_url)} title={s.student.name} wrapSub
                sub={
                  <div className="tray-sub">
                    {headThumb(s.thumb_url, true)}
                    {s.detected_name && <span className="muted">Se lee «{s.detected_name}»</span>}
                    <div className="paper-line">
                      <PageStrip pages={s.pages} onOpen={(i) => openPaper(s, i)} label={`Páginas de ${s.student.name}`} />
                      <FlagChips s={s} />
                    </div>
                    <div className="chip-row tray-chips">
                      <Chip tone="accent" disabled={off} title={lock} onClick={() => doAssign(s.paper_id!, s.student.id)}>Es correcto</Chip>
                      <Chip disabled={off} title={lock} onClick={() => setPick({ mode: 'paper', paperId: s.paper_id!, thumb: s.thumb_url, detected: s.detected_name })}>Cambiar</Chip>
                    </div>
                  </div>
                }
              />
            ))}
          </List>
        </Section>
      )}

      {settled.length > 0 && (
        <Section title={flagged.length ? `Hojas por revisar · ${flagged.length}` : 'Hojas'}
          footer={held.length > 0 && !busy
            ? 'La IA sugiere la nota de estas hojas cuando las ordenas o marcas «Está bien así».' : undefined}>
          <List inset={16}>
            {flagged.map(paperRow)}
            {calm.length > 0 && (
              <Row title={showAll ? 'Ocultar las hojas completas' : `Ver las ${plural(calm.length, 'hoja completa', 'hojas completas')}`}
                sub={!showAll && !flagged.length ? 'Ninguna hoja necesita revisión.' : undefined}
                onClick={() => setShowAll((v) => !v)} chevron={false} trail={showAll ? <CaretUp size={16} /> : <CaretDown size={16} />} />
            )}
            {showAll && calm.map(paperRow)}
          </List>
        </Section>
      )}

      {discarded.length > 0 && (
        <List>
          <Row title={discarded.every((p) => p.kind === 'blank')
            ? `Reversos en blanco descartados (${discarded.length})` : `Páginas descartadas (${discarded.length})`}
            sub={suspicious.length > 0
              ? <Chip tone="warn">{suspicious.length === 1 ? 'Una puede tener algo escrito' : `${suspicious.length} pueden tener algo escrito`}</Chip>
              : undefined}
            onClick={() => setShowDiscarded(!discardedOpen)} chevron={false} trail={discardedOpen ? <CaretUp size={16} /> : <CaretDown size={16} />} />
          {discardedOpen && (
            <div className="discard-grid">
              <PageStrip pages={discarded} label="Páginas descartadas" onOpen={(index) => setViewer({ kind: 'discarded', pages: discarded, index })} />
            </div>
          )}
        </List>
      )}

      {viewer && (
        <PageViewer target={viewer} ops={ops} onClose={() => setViewer(null)}
          onIndex={(index) => setViewer((v) => (v ? { ...v, index } : v))}
          onPick={(target) => setPick({ mode: 'page', target })} />
      )}
      <StudentPickerSheet open={!!pick} onClose={() => setPick(null)} students={students}
        thumbUrl={pick?.mode === 'paper' ? pick.thumb : pick ? pick.target.pages[pick.target.index]?.url : null}
        detected={pick?.mode === 'paper' ? pick.detected : pick ? pick.target.pages[pick.target.index]?.written_name || null : null}
        page={pick?.mode === 'page' ? pageCaption(pick.target.pages[pick.target.index]) : null}
        onPick={onPick} />
    </>
  );
}
