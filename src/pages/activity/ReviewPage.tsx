import { CaretLeft, CaretRight, DotsThree, FileX, Images, Rows, UserMinus, Warning } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  prefetchReview, useActivityJob, useAssignPaper, useConfirmReview, useCorrection, useReview, type Crop, type Review, type ReviewResult,
} from '../../api/papers';
import type { Job } from '../../api/types';
import { JobLine } from '../../features/papers/JobLine';
import StudentPickerSheet from '../../features/papers/StudentPickerSheet';
import { flagLabel, isAttention, pageCaption, pageTag } from '../../features/papers/pageLabels';
import { cameFromActivity } from '../../features/papers/reviewLink';
import { fileUrl } from '../../lib/api';
import { formatGrade, formatNumber, formatScore, gradeTone, listed, parseGradeInput, shortDate } from '../../lib/format';
import {
  AIBadge, Button, Callout, CropImage, DESKTOP, EmptyState, IconButton, Lightbox, Menu, RichText, Skeleton, Stepper, TextField,
  useFeedback, useMediaQuery, useSettled, type MenuItem,
} from '../../ui';
import '../../features/papers/papers.css';
import './review.css';

const pts = (v: number) => formatNumber(v, 2);
const LOW = 0.7;
const FINAL = ['confirmed', 'absent', 'exempt'];
/** "la pregunta 2" · "las preguntas 1 y 3" */
const questions = (labels: string[]) => (labels.length === 1 ? `la pregunta ${labels[0]}` : `las preguntas ${listed(labels)}`);

/** "7 de 24 · faltan 18 · Modelo B" (the version last: on a phone the end of the line may be cut). */
function progress(r: Review): string {
  const where = `${r.position} de ${r.total} · ${r.pending ? `faltan ${r.pending}` : 'todos revisados'}`;
  return r.version ? `${where} · ${r.version.label}` : where;
}

/** Missed the exam and nothing else can go here yet: absent that day, or their repeat exam is not corrected. */
const onlyNp = (r: Review) => !!r.missed && (r.missed.absent || (!!r.missed.repeat_id && !r.missed.repeat_grade));

/** Focus mode: one student at a time. Phone: each question with the crop of its answer, the whole sheet behind
 * «Ver hoja». Desktop: the sheet on the left follows the question in focus. */
export default function ReviewPage() {
  const { courseId, activityId } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const desktop = useMediaQuery(DESKTOP);
  const { toast, confirm } = useFeedback();
  const correction = useCorrection(activityId);
  const c = correction.data;
  const requested = params.get('alumno');
  // Entering without a student: the first one not reviewed yet.
  const studentId = requested ?? (c
    ? c.next_pending_id ?? c.students.find((s) => !FINAL.includes(s.grade?.status ?? '') && !s.missed)?.student.id ?? c.students[0]?.student.id ?? null
    : null);
  const review = useReview(activityId, studentId);
  const setNp = useConfirmReview(activityId!, courseId);
  const exit = `/clases/${courseId}/actividades/${activityId}`;
  const r = review.data;
  const title = r?.activity.title ?? c?.activity.title ?? 'Examen';
  const head = r?.activity ?? c?.activity;
  const fromActivity = cameFromActivity(location.state);
  // A grading job the teacher started from here (a paper joined to another student's pages): its end refreshes this.
  const gradingJob = c?.job?.kind === 'suggest_grades' ? c.job : null;
  const live = useActivityJob(activityId!, gradingJob?.id);
  const grading = gradingJob && (!live || live.status === 'queued' || live.status === 'running') ? live ?? gradingJob : null;

  useEffect(() => {
    if (!requested && studentId) setParams({ alumno: studentId }, { replace: true, state: location.state });
  }, [requested, studentId, setParams, location.state]);

  useEffect(() => {
    if (!r) return;
    document.title = `${r.student.name} · Revisar · Sepia`;
    prefetchReview(qc, activityId!, r.next_pending_id);
    prefetchReview(qc, activityId!, r.next_student_id);
  }, [r, qc, activityId]);

  const go = useCallback((id: string | null | undefined) => {
    if (id) setParams({ alumno: id }, { replace: true, state: location.state });
  }, [setParams, location.state]);

  // Back where the teacher came from: the activity (history back, so the phone's back gesture never reopens the
  // review) or, opened from a link, the activity in place of the review.
  const back = () => (fromActivity ? navigate(-1) : navigate(exit, { replace: true, state: { restoreScroll: true } }));
  const leave = () => {
    const done = r ? r.total - r.pending : 0;
    if (r && done > 0) toast(`Revisión guardada · ${done} de ${r.total}`);
    back();
  };
  const finish = (res: ReviewResult) => { toast(`${res.reviewed} de ${res.total} revisados`); back(); };
  const after = (res: ReviewResult) => (res.next_student_id ? go(res.next_student_id) : finish(res));

  const markAbsent = async () => {
    if (!r) return;
    const n = r.pages.length;
    const ok = await confirm({
      title: `Marcar NP a ${r.student.first_name}`,
      text: n ? `Tiene ${n === 1 ? '1 página escaneada' : `${n} páginas escaneadas`} que no se corregirán. El NP no cuenta en la media.`
        : 'El NP no cuenta en la media. Puedes cambiarlo después.',
      confirm: 'Marcar NP',
    });
    if (!ok) return;
    setNp.mutate({ studentId: r.student.id, absent: true }, {
      onSuccess: (res) => { toast(`${r.student.first_name}: NP`); after(res); },
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  const menu: MenuItem[] = [];
  if (r?.paper_id) menu.push({ label: 'Ordenar páginas', icon: <Rows size={18} />, onSelect: () => navigate(`${exit}?paso=recoger`) });
  if (r && r.grade?.status !== 'absent') {
    menu.push({ label: 'Marcar NP', icon: <UserMinus size={18} />, onSelect: markAbsent, separatorBefore: menu.length > 0,
      disabledReason: r.match_status === 'suggested' ? 'Confirma antes el nombre' : undefined });
  }

  return (
    <div className="review">
      <header className="review-bar glass">
        <button className="back-btn review-bar__back" onClick={leave} aria-label={`Volver a ${title}`} title={title}>
          <CaretLeft size={20} weight="bold" /><span>{desktop ? title : head?.repeat_of ? 'Repesca' : 'Examen'}</span>
        </button>
        <div className="review-bar__title">
          {r ? <><strong>{r.student.name}</strong><span className="num">{progress(r)}</span></> : <Skeleton h={16} w={160} />}
        </div>
        <div className="review-bar__nav">
          {desktop && (
            <>
              <IconButton label="Alumno anterior" size="sm" disabled={!r?.prev_student_id} onClick={() => go(r?.prev_student_id)}><CaretLeft size={18} /></IconButton>
              <IconButton label="Alumno siguiente" size="sm" disabled={!r?.next_student_id} onClick={() => go(r?.next_student_id)}><CaretRight size={18} /></IconButton>
            </>
          )}
          {menu.length > 0 && (
            <Menu trigger={(o) => <IconButton label="Más acciones" size="sm" onClick={o}><DotsThree size={20} weight="bold" /></IconButton>} items={menu} />
          )}
        </div>
      </header>
      {review.error ? (
        <EmptyState icon={<FileX size={24} />} title="No se ha podido abrir la revisión" text={review.error.message}
          action={<Button variant="tinted" onClick={back}>Volver al examen</Button>} />
      ) : !r ? (
        <div className="review-body"><div className="review-pages"><Skeleton h={480} r={14} /></div><div className="review-panel"><Skeleton h={300} r={20} /></div></div>
      ) : (
        <ReviewStudent key={r.student.id} review={r} activityId={activityId!} courseId={courseId!} desktop={desktop}
          onGo={go} onDone={after} busy={setNp.isPending} exit={exit} grading={grading} onNp={markAbsent} />
      )}
    </div>
  );
}

function ReviewStudent({ review: r, activityId, courseId, desktop, onGo, onDone, busy, exit, grading, onNp }: {
  review: Review; activityId: string; courseId: string; desktop: boolean; onGo: (id: string) => void;
  onDone: (res: ReviewResult) => void; busy: boolean; exit: string; grading: Job | null; onNp: () => void;
}) {
  const { toast } = useFeedback();
  const confirmReview = useConfirmReview(activityId, courseId);
  // A tap or an Enter meant for the student before never confirms this one unseen.
  const settled = useSettled(r.student.id);
  const assign = useAssignPaper(activityId);
  const correction = useCorrection(activityId);
  const aiById = useMemo(() => new Map((r.ai?.items ?? []).map((i) => [i.id, i])), [r.ai]);
  // «Sin corregir»: questions nobody has scored yet start empty (no 0 nobody gave) and must be scored to accept.
  const unscored = useMemo(() => r.grade?.unscored ?? [], [r.grade]);
  const recheck = r.grade?.status === 'confirmed' && unscored.length > 0; // accepted with those at 0: look again
  const initialScores = () => Object.fromEntries(
    r.items.filter((it) => !unscored.includes(it.id)).map((it) => [it.id,
      r.grade?.status === 'confirmed' && r.grade.item_scores ? r.grade.item_scores[it.id] ?? 0 : aiById.get(it.id)?.points ?? 0]),
  );
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [touched, setTouched] = useState(false);
  const [manual, setManual] = useState(() => (r.grade?.score != null ? formatScore(r.grade.score) : r.ai?.suggested_score != null ? formatScore(r.ai.suggested_score) : ''));
  const [comment, setComment] = useState(r.grade?.comment ?? '');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [solution, setSolution] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Questions without a score and low-confidence AI items first: those are the ones the teacher must look at.
  const items = useMemo(() => {
    const low = r.items.filter((it) => unscored.includes(it.id) || (aiById.get(it.id)?.confidence ?? 1) < LOW);
    return [...low, ...r.items.filter((it) => !low.includes(it))];
  }, [r.items, aiById, unscored]);
  const [focus, setFocus] = useState<string | null>(() => items[0]?.id ?? null);

  const hasItems = r.items.length > 0;
  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  const left = r.items.filter((it) => scores[it.id] === undefined).map((it) => it.label || it.id); // still to score
  const manualValue = parseGradeInput(manual);
  const toConfirm = r.match_status === 'suggested';
  const missed = onlyNp(r) && r.grade?.status !== 'absent'; // only NP can go here (the server says so too)
  const last = !r.next_pending_id;
  // Nothing to accept yet: no AI grading, no grade and no score touched: accepting records a 0, say so.
  const zero = hasItems && !r.ai && r.grade?.status !== 'confirmed' && !touched;

  // The AI's grading arrives while the page is open (a paper just assigned here): its points, unless the teacher
  // already started scoring.
  useEffect(() => {
    if (r.ai && !touched && r.grade?.status !== 'confirmed') setScores(initialScores());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.ai]);

  useEffect(() => { if (!desktop) window.scrollTo(0, 0); }, [desktop]);

  // Phone: the content ends above the bar anchored at the bottom (its height + 16 px).
  useLayoutEffect(() => {
    const el = foot.current;
    if (!el || !body.current) return;
    const set = () => body.current?.style.setProperty('--foot-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Desktop: the sheet follows the question in focus (its crop, else the top of the page where it most likely is).
  const focusCrop: Crop | undefined = focus ? r.crops[focus]?.[0] : undefined;
  const focusPage = focusCrop?.index ?? (focus ? r.page_hints[focus] : undefined);
  useEffect(() => {
    const page = focusPage !== undefined ? pageRefs.current[focusPage] : null;
    if (!desktop || !page || !scroller.current) return;
    scroller.current.scrollTo({ top: Math.max(0, page.offsetTop + (focusCrop?.y0 ?? 0) * page.offsetHeight - 24), behavior: 'smooth' });
  }, [desktop, focusCrop, focusPage]);

  const accept = () => {
    if (!settled || confirmReview.isPending) return;
    if (missed) { onNp(); return; }
    if (hasItems && left.length) { toast(`Puntúa ${questions(left)} antes de aceptar.`, { tone: 'error' }); return; }
    let payload: { item_scores?: Record<string, number>; score?: number } = {};
    if (hasItems) payload = { item_scores: scores };
    else if (typeof manualValue === 'number') payload = { score: manualValue };
    else { toast(`Escribe la nota (0 a ${formatGrade(r.activity.max_score)}).`, { tone: 'error' }); return; }
    confirmReview.mutate({ studentId: r.student.id, ...payload, comment: comment.trim() || null }, {
      onSuccess: onDone,
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  const confirmName = () => assign.mutate({ paperId: r.paper_id!, studentId: r.student.id }, {
    onSuccess: () => toast('Nombre confirmado'),
    onError: (e) => toast(e.message, { tone: 'error' }),
  });
  const reassign = (studentId: string) => assign.mutate({ paperId: r.paper_id!, studentId }, {
    onSuccess: (paper) => {
      const s = correction.data?.students.find((x) => x.student.id === studentId);
      const who = s?.student.name ?? 'otro alumno';
      const joined = paper.id !== r.paper_id; // that student already had pages: one paper now
      toast(!joined ? `Hoja asignada a ${who}`
        : paper.job ? `Hoja unida a la de ${who}. La IA vuelve a corregirla entera.` : `Hoja unida a la de ${who}. Ordena sus páginas.`);
      onGo(studentId);
    },
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  // Keyboard (desktop): Enter accepts from a text field (the grade just typed) or from nowhere in particular, never
  // from a control (Enter there is that control's own action); arrows move to the neighbour outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (viewer !== null || document.querySelector('[role="dialog"]')) return;
      const field = !!t.closest('input, textarea, select, [contenteditable]');
      if (e.key === 'Enter') {
        const control = t.closest('textarea, select, button, a, [role="button"], [role="menuitem"], [contenteditable], .review-foot');
        if (control || e.isComposing || toConfirm || e.repeat) return;
        e.preventDefault();
        acceptRef.current();
        return;
      }
      if (field) return;
      if (e.key === 'ArrowRight' && r.next_student_id) onGo(r.next_student_id);
      if (e.key === 'ArrowLeft' && r.prev_student_id) onGo(r.prev_student_id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer, r.next_student_id, r.prev_student_id, onGo, toConfirm]);

  const pages = r.pages.map((p) => fileUrl(p.url)!);
  const caption = (i: number) => (r.pages[i] ? pageCaption(r.pages[i]) : `Página ${i + 1}`);
  // Before confirming: is the paper complete and only this student's? (after confirming, the grade is never touched)
  const warnings = r.flags.filter((f) => isAttention(f) || f.code === 'pagina_nueva_tras_nota');
  const tone = gradeTone(r.rubric_total && !left.length ? (sum / r.rubric_total) * 10 : null);
  const then = last ? 'terminar' : 'siguiente';
  const toScore = hasItems && !missed && left.length > 0;
  const acceptLabel = toConfirm ? 'Confirma el nombre' : missed ? 'Marcar NP' : toScore ? `Puntúa ${questions(left)}`
    : zero ? `Poner 0 y ${then}` : `Aceptar y ${then}`;
  const unscoredLabels = r.items.filter((it) => unscored.includes(it.id)).map((it) => it.label || it.id);
  const one = unscoredLabels.length === 1;
  const pronoun = one ? 'la' : 'las';

  return (
    <div ref={body} className="review-body">
      {desktop && (
        <section className="review-pages" aria-label="Hoja escaneada">
          {pages.length === 0 ? (missed ? null :
            <div className="review-nopages muted"><FileX size={22} /><span>Sin hojas escaneadas. Corrige con el examen en papel.</span></div>
          ) : (
            <>
              {pages.length > 1 && (
                <div className="review-thumbs">
                  {pages.map((src, i) => (
                    <button key={src} type="button" onClick={() => pageRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      aria-label={`Ir a ${caption(i).toLowerCase()}`}>
                      <img src={src} alt="" loading="lazy" />
                      <span className="num">{pageTag(r.pages[i]) || '?'}</span>
                    </button>
                  ))}
                </div>
              )}
              <div ref={scroller} className="review-scroll">
                {pages.map((src, i) => (
                  <div key={src} ref={(el) => { pageRefs.current[i] = el; }} className="review-page">
                    {r.pages[i]?.kind === 'extra_sheet' && <span className="review-page__tag">{caption(i)}</span>}
                    <img src={src} alt={caption(i)} loading={i < 2 ? 'eager' : 'lazy'} onClick={() => setViewer(i)} />
                    {focusCrop?.index === i && (
                      <span className="review-page__band" aria-hidden style={{
                        top: `${focusCrop.y0 * 100}%`, height: `${(focusCrop.y1 - focusCrop.y0) * 100}%`,
                        left: `${focusCrop.x0 * 100}%`, width: `${(focusCrop.x1 - focusCrop.x0) * 100}%`,
                      }} />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section className="review-panel" aria-label="Puntuación">
        {toConfirm && (
          <Callout tone="warn" icon={<Warning size={18} weight="fill" />}>
            <div className="review-name">
              <span><b>Nombre por confirmar</b>{r.detected_name ? <>: se lee «{r.detected_name}»</> : null}</span>
              <span className="review-name__actions">
                <Button size="sm" onClick={confirmName} loading={assign.isPending}>Es correcto</Button>
                <Button size="sm" variant="neutral" onClick={() => setPicking(true)}>Cambiar</Button>
              </span>
            </div>
          </Callout>
        )}
        {missed && (
          <Callout tone="warn" icon={<Warning size={18} weight="fill" />}>
            <span><b>Faltó a este examen.</b>{' '}
              {r.missed!.repeat_id
                ? <>Su nota llegará con la repesca del {shortDate(r.missed!.repeat_date!)}. <Link className="link-btn" to={`/clases/${courseId}/actividades/${r.missed!.repeat_id}`}>Ver repesca</Link></>
                : 'Ponle NP o prográmale una repesca desde el examen.'}
            </span>
          </Callout>
        )}
        {unscoredLabels.length > 0 && !missed && (
          <Callout tone="warn" icon={<Warning size={18} weight="fill" />}>
            <span><b>{one ? 'Pregunta' : 'Preguntas'} {listed(unscoredLabels)} sin corregir.</b>{' '}
              {recheck ? `Esta nota se aceptó con ${one ? 'esa pregunta' : 'esas preguntas'} a 0 sin que nadie ${pronoun} corrigiera: puntúa${pronoun} y vuelve a aceptar.`
                : `La IA no ${pronoun} ha puntuado. Hasta que ${pronoun} puntúes, esta hoja no tiene nota.`}
            </span>
          </Callout>
        )}
        {warnings.length > 0 && (
          <Callout tone="warn" icon={<Warning size={18} weight="fill" />}>
            <span>{warnings.map(flagLabel).join(' · ')}. </span>
            <Link className="link-btn" to={`${exit}?paso=recoger`}>Ordenar páginas</Link>
          </Callout>
        )}
        {grading && r.paper_id && !r.ai && <JobLine job={grading} fallback="La IA está corrigiendo esta hoja…" />}
        {(r.ai?.summary || (!desktop && pages.length > 0)) && (
          <div className="review-summary">
            {r.ai?.summary && (
              <p className="review-summary__text">
                <AIBadge label={r.grade?.status === 'suggested' ? 'Borrador IA' : 'IA'} /> <RichText text={r.ai.summary} />
              </p>
            )}
            {!desktop && pages.length > 0 && (
              <Button variant="tinted" size="sm" icon={<Images size={16} />} className="review-summary__sheet" onClick={() => setViewer(0)}>Ver hoja</Button>
            )}
          </div>
        )}
        {!desktop && pages.length === 0 && !missed && (
          <div className="review-nopages muted"><FileX size={22} /><span>Sin hojas escaneadas. Corrige con el examen en papel.</span></div>
        )}
        {missed ? null : hasItems ? (
          <div className="list review-items">
            {items.map((it) => {
              const ai = aiById.get(it.id);
              const open = unscored.includes(it.id); // «Sin corregir»
              const low = open || (!!ai && ai.confidence < LOW);
              const score = scores[it.id] ?? null;
              const changed = ai?.points != null && score !== null && Math.abs(score - ai.points) > 1e-9;
              const crops = r.crops[it.id] ?? [];
              return (
                <div key={it.id} className={`ritem${low ? ' ritem--low' : ''}${desktop && focus === it.id ? ' ritem--focus' : ''}`}
                  onFocus={() => setFocus(it.id)} onClick={() => setFocus(it.id)}>
                  <div className="ritem__head">
                    <span className="ritem__n num">{it.label || it.id}</span>
                    <button type="button" className="ritem__text" aria-expanded={!!expanded[it.id]}
                      onClick={() => setExpanded((o) => ({ ...o, [it.id]: !o[it.id] }))}>
                      <RichText oneLine={!expanded[it.id]} text={it.text || `Pregunta ${it.label || it.id}`} />
                    </button>
                  </div>
                  {!desktop && crops.map((c) => (
                    <CropImage key={`${c.page_id}-${c.y0}`} src={pages[c.index]} x0={c.x0} y0={c.y0} x1={c.x1} y1={c.y1}
                      alt={`Respuesta a la pregunta ${it.label || it.id} · ${caption(c.index)}`} onClick={() => setViewer(c.index)} />
                  ))}
                  {!desktop && !crops.length && pages.length > 0 && (
                    <Button variant="tinted" size="sm" icon={<Images size={16} />} className="ritem__sheet"
                      onClick={() => setViewer(r.page_hints[it.id] ?? 0)}>Ver hoja</Button>
                  )}
                  {open ? (
                    <div className="ritem__ai">
                      <Warning size={16} weight="fill" className="ritem__warn" aria-hidden />
                      <span><b>{recheck ? 'Contó 0 sin corregir.' : 'Sin corregir.'}</b>{ai?.feedback && <> <RichText text={ai.feedback} /></>}</span>
                    </div>
                  ) : ai?.feedback && (
                    <div className="ritem__ai">
                      {low && <Warning size={16} weight="fill" className="ritem__warn" aria-label="Revisa esta pregunta" />}
                      <RichText text={ai.feedback} />
                    </div>
                  )}
                  <div className="ritem__controls">
                    <Button variant="plain" size="sm" onClick={() => setSolution((o) => ({ ...o, [it.id]: !o[it.id] }))}>
                      {solution[it.id] ? 'Ocultar solución' : 'Solución'}
                    </Button>
                    <div className="ritem__score">
                      {changed && <span className="ritem__was num" title="Puntos que propuso la IA">IA: {pts(ai!.points!)}</span>}
                      <Stepper label={`Puntos de la pregunta ${it.label || it.id}`} value={score} min={0} max={it.points} step={0.25}
                        format={pts} onChange={(v) => { setTouched(true); setScores((s) => ({ ...s, [it.id]: v })); }} />
                      <span className="ritem__max num">/ {pts(it.points)}</span>
                    </div>
                  </div>
                  {solution[it.id] && (
                    <div className="ritem__answer">
                      <RichText text={it.answer || 'Sin solución en la rúbrica.'} />
                      {it.steps.length > 0 && <ol>{it.steps.map((s, i) => <li key={i}><RichText text={s} /></li>)}</ol>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <TextField label={`Nota sobre ${formatGrade(r.activity.max_score)}`} inputMode="decimal" value={manual}
            onChange={(e) => setManual(e.target.value)} placeholder="—" autoFocus={!toConfirm} />
        )}
        {!missed && <TextField label="Comentario (opcional)" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)}
          placeholder="Sale en la ficha del alumno, junto a la nota" />}
        <div ref={foot} className="review-foot">
          {hasItems && !missed && (
            <div className="review-total">
              <span className="muted">Total</span>
              <span className={`review-total__value grade grade--${tone}`}>{pts(sum)}</span>
              <span className="muted num">/ {pts(r.rubric_total)}</span>
              {left.length > 0 ? <span className="review-total__note muted">Sin {questions(left)}</span>
                : r.grade?.status === 'confirmed' && <span className="review-total__note muted">Revisado</span>}
              {r.grade?.status === 'absent' && <span className="review-total__note muted">Marcado NP</span>}
            </div>
          )}
          <div className="review-foot__buttons">
            {!desktop && (
              <Button variant="neutral" icon={<CaretLeft size={18} weight="bold" />} aria-label="Alumno anterior" className="review-foot__nav"
                disabled={!r.prev_student_id} onClick={() => r.prev_student_id && onGo(r.prev_student_id)} />
            )}
            <Button onClick={accept} loading={confirmReview.isPending || (missed && busy)} disabled={toConfirm || toScore || (busy && !missed) || !settled}
              className="review-accept">{acceptLabel}</Button>
            {!desktop && (
              <Button variant="neutral" icon={<CaretRight size={18} weight="bold" />} aria-label="Alumno siguiente, sin aceptar" className="review-foot__nav"
                disabled={!r.next_student_id} onClick={() => r.next_student_id && onGo(r.next_student_id)} />
            )}
          </div>
        </div>
      </section>
      {viewer !== null && (
        <Lightbox images={pages} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} label={`Hoja de ${r.student.name}`}
          caption={`${r.student.name} · ${caption(viewer)}`} />
      )}
      {correction.data && (
        <StudentPickerSheet open={picking} onClose={() => setPicking(false)}
          students={correction.data.students.filter((s) => s.student.id !== r.student.id)}
          thumbUrl={r.pages[0]?.thumb_url} detected={r.detected_name} onPick={reassign} />
      )}
    </div>
  );
}
