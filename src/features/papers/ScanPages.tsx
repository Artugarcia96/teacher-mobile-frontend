import { CaretDown, CaretUp, Check, DotsThree, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { useAssignPaper, useDeletePaper, useFlagsChecked, useSuggest, type Correction, type CorrectionStudent } from '../../api/papers';
import type { Job } from '../../api/types';
import { fileUrl } from '../../lib/api';
import { plural } from '../../lib/format';
import { Callout, Chip, IconButton, List, Menu, Row, Section, useFeedback } from '../../ui';
import { extrasLabel, flagLabel, isAttention, looseTitle, needsLook, pageCaption, shortName } from './pageLabels';
import { PageStrip } from './PageStrip';
import { PageViewer, type ViewerTarget } from './PageViewer';
import StudentPickerSheet from './StudentPickerSheet';
import { usePageOps } from './usePageOps';

type Pick =
  | { mode: 'paper'; paperId: string; thumb: string | null; detected: string | null }
  | { mode: 'page'; target: ViewerTarget };

/** Recoger: what the scan produced and the few things that need the teacher (flagged papers first). */
export function ScanPages({ correction, busy, onJob }: { correction: Correction; busy: boolean; onJob: (job: Job) => void }) {
  const { students, unmatched, unplaced, discarded } = correction;
  const id = correction.activity.id;
  const ops = usePageOps(correction);
  const assign = useAssignPaper(id);
  const removePaper = useDeletePaper(id);
  const flagsOk = useFlagsChecked(id);
  const suggest = useSuggest(id);
  const { toast, confirm } = useFeedback();
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDiscarded, setShowDiscarded] = useState(false);

  const withPaper = students.filter((s) => s.paper_id);
  const flagged = withPaper.filter((s) => needsLook(s.flags));
  const calm = withPaper.filter((s) => !needsLook(s.flags));
  const toConfirm = withPaper.filter((s) => s.match_status === 'suggested');
  const noSuggestion = correction.rubric ? withPaper.filter((s) => !s.grade) : [];
  const onError = (e: Error) => toast(e.message, { tone: 'error' });

  const doAssign = (paperId: string, studentId: string) => {
    const target = students.find((s) => s.student.id === studentId);
    if (target?.paper_id && target.paper_id !== paperId) return ops.mergeInto(paperId, target.paper_id, studentId);
    const final = ['confirmed', 'absent', 'exempt'].includes(target?.grade?.status ?? '');
    assign.mutate({ paperId, studentId }, {
      onSuccess: () => {
        toast(`Hoja asignada a ${target?.student.name ?? 'el alumno'}`);
        if (correction.rubric && !final && !target?.grade) suggest.mutate([studentId], { onSuccess: ({ job }) => onJob(job) });
      },
      onError,
    });
  };

  const onPick = (sid: string) => {
    if (!pick) return;
    if (pick.mode === 'paper') return doAssign(pick.paperId, sid);
    const t = pick.target;
    if (t.kind === 'paper') ops.toStudent(t.paperId, t.index, sid);
    else ops.placeLoose(t.kind, t.index, sid);
  };

  const discardPaper = async (paperId: string) => {
    if (!(await confirm({ title: 'Descartar esta hoja', text: 'Se borran sus páginas escaneadas.', confirm: 'Descartar', danger: true }))) return;
    removePaper.mutate(paperId, { onSuccess: () => toast('Hoja descartada'), onError });
  };

  const headThumb = (url: string | null, wide = false) => url ? (
    <img className={`paper-thumb${wide ? ' paper-thumb--wide' : ''}`} src={fileUrl(url)} alt="Cabecera de la hoja" loading="lazy" />
  ) : null;

  const paperRow = (s: CorrectionStudent) => {
    const attention = s.flags.filter(isAttention);
    const info = s.flags.filter((f) => !isAttention(f));
    const extraChip = s.extra_count > 0 && !(s.extra_count === 1 && s.flags.some((f) => f.code === 'extra_sin_nombre'));
    const open = (index: number) => setViewer({ kind: 'paper', paperId: s.paper_id!, studentId: s.student.id, title: shortName(s.student), pages: s.pages, index });
    return (
      <Row key={s.student.id} className="paper-row" title={s.student.sort_name} wrapSub
        sub={
          <div className="paper-line">
            <PageStrip pages={s.pages} onOpen={open} label={`Páginas de ${s.student.name}`} />
            {(attention.length > 0 || extraChip || info.length > 0) && (
              <div className="chip-row">
                {attention.map((f) => <Chip key={f.code} tone="warn">{flagLabel(f)}</Chip>)}
                {extraChip && <Chip>{extrasLabel(s.extra_count)}</Chip>}
                {info.map((f) => <Chip key={f.code}>{flagLabel(f)}</Chip>)}
              </div>
            )}
          </div>
        }
        trail={attention.length > 0 ? (
          <Menu trigger={(o) => <IconButton label="Más" size="sm" onClick={o}><DotsThree size={20} weight="bold" /></IconButton>}
            items={[{ label: 'Está bien así', icon: <Check size={18} />,
              onSelect: () => flagsOk.mutate(s.paper_id!, { onSuccess: () => toast('Hoja revisada'), onError }) }]} />
        ) : undefined}
      />
    );
  };

  return (
    <>
      {noSuggestion.length > 0 && !busy && (
        <Callout tone="accent">
          <span>{noSuggestion.length === 1 ? '1 hoja no tiene' : `${noSuggestion.length} hojas no tienen`} sugerencia de la IA. </span>
          <button type="button" className="link-btn" disabled={suggest.isPending}
            onClick={() => suggest.mutate(noSuggestion.map((s) => s.student.id), { onSuccess: ({ job }) => onJob(job), onError })}>
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
                      {u.candidates.map((c) => <Chip key={c.id} tone="outline" onClick={() => doAssign(u.paper_id, c.id)}>{shortName(c)}</Chip>)}
                      <Chip onClick={() => setPick({ mode: 'paper', paperId: u.paper_id, thumb: u.thumb_url, detected: u.detected_name })}>Otro…</Chip>
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

      {unplaced.length > 0 && (
        <Section title={`Páginas por colocar · ${unplaced.length}`}>
          <List inset={16}>
            {unplaced.map((p, i) => (
              <Row key={p.thumb_url.split('?')[0]} className="tray-row loose-row" title={looseTitle(p)} wrapSub
                lead={<PageStrip pages={[p]} label={looseTitle(p)} onOpen={() => setViewer({ kind: 'unplaced', pages: unplaced, index: i })} />}
                sub={
                  <div className="tray-sub">
                    {p.written_name && p.reason !== 'extra_sin_examen' && <span className="muted">Se lee «{p.written_name}»</span>}
                    <div className="chip-row tray-chips">
                      {p.candidates.map((c) => (
                        <Chip key={c.id} tone="outline" onClick={() => ops.placeLoose('unplaced', i, c.id)}>{shortName(c)}</Chip>
                      ))}
                      <Chip onClick={() => setPick({ mode: 'page', target: { kind: 'unplaced', pages: unplaced, index: i } })}>
                        {p.candidates.length ? 'Otro…' : 'Asignar a un alumno'}
                      </Chip>
                    </div>
                  </div>
                }
                trail={
                  <Menu trigger={(o) => <IconButton label="Más" size="sm" onClick={o}><DotsThree size={20} weight="bold" /></IconButton>}
                    items={[{ label: 'Descartar página', icon: <Trash size={18} />, danger: true, onSelect: () => ops.discardLoose(i) }]} />
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
                    <div className="chip-row tray-chips">
                      <Chip tone="accent" onClick={() => doAssign(s.paper_id!, s.student.id)}>Es correcto</Chip>
                      <Chip onClick={() => setPick({ mode: 'paper', paperId: s.paper_id!, thumb: s.thumb_url, detected: s.detected_name })}>Cambiar</Chip>
                    </div>
                  </div>
                }
              />
            ))}
          </List>
        </Section>
      )}

      {withPaper.length > 0 && (
        <Section title={flagged.length ? `Hojas por revisar · ${flagged.length}` : 'Hojas'}>
          <List inset={16}>
            {flagged.map(paperRow)}
            <Row title={showAll ? 'Ocultar las hojas completas' : `Ver las ${plural(calm.length, 'hoja completa', 'hojas completas')}`}
              sub={!showAll && !flagged.length ? 'Ninguna hoja necesita revisión.' : undefined}
              onClick={() => setShowAll((v) => !v)} chevron={false} trail={showAll ? <CaretUp size={16} /> : <CaretDown size={16} />} />
            {showAll && calm.map(paperRow)}
          </List>
        </Section>
      )}

      {discarded.length > 0 && (
        <List>
          <Row title={discarded.every((p) => p.kind === 'blank')
            ? `Reversos en blanco descartados (${discarded.length})` : `Páginas descartadas (${discarded.length})`}
            onClick={() => setShowDiscarded((v) => !v)} chevron={false} trail={showDiscarded ? <CaretUp size={16} /> : <CaretDown size={16} />} />
          {showDiscarded && (
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
