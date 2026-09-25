import { CaretLeft, CaretRight, DotsThree, FileX, Images, Rows, UserMinus, Warning } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  prefetchReview, useAssignPaper, useConfirmReview, useCorrection, useReview, type Crop, type Review, type ReviewResult,
} from '../../api/papers';
import StudentPickerSheet from '../../features/papers/StudentPickerSheet';
import { flagLabel, isAttention, pageCaption, pageTag } from '../../features/papers/pageLabels';
import { fileUrl } from '../../lib/api';
import { formatGrade, formatNumber, formatScore, gradeTone, parseGradeInput } from '../../lib/format';
import {
  AIBadge, Button, Callout, CropImage, DESKTOP, EmptyState, IconButton, Lightbox, Menu, RichText, Skeleton, Stepper, TextField,
  useFeedback, useMediaQuery, type MenuItem,
} from '../../ui';
import '../../features/papers/papers.css';
import './review.css';

const pts = (v: number) => formatNumber(v, 2);
const LOW = 0.7;
const FINAL = ['confirmed', 'absent', 'exempt'];

/** "7 de 24 · faltan 18" */
function progress(r: Review): string {
  return `${r.position} de ${r.total} · ${r.pending ? `faltan ${r.pending}` : 'todos revisados'}`;
}

/** Focus mode: one student at a time. Phone: each question with the crop of its answer, the whole sheet behind
 * «Ver hoja». Desktop: the sheet on the left follows the question in focus. */
export default function ReviewPage() {
  const { courseId, activityId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const desktop = useMediaQuery(DESKTOP);
  const { toast, confirm } = useFeedback();
  const correction = useCorrection(activityId);
  const c = correction.data;
  const requested = params.get('alumno');
  // Entering without a student: the first one not reviewed yet.
  const studentId = requested ?? (c
    ? c.next_pending_id ?? c.students.find((s) => !FINAL.includes(s.grade?.status ?? ''))?.student.id ?? c.students[0]?.student.id ?? null
    : null);
  const review = useReview(activityId, studentId);
  const setNp = useConfirmReview(activityId!, courseId);
  const exit = `/clases/${courseId}/actividades/${activityId}`;
  const r = review.data;
  const title = r?.activity.title ?? c?.activity.title ?? 'Examen';

  useEffect(() => {
    if (!requested && studentId) setParams({ alumno: studentId }, { replace: true });
  }, [requested, studentId, setParams]);

  useEffect(() => {
    if (!r) return;
    document.title = `${r.student.name} · Revisar · Sepia`;
    prefetchReview(qc, activityId!, r.next_pending_id);
    prefetchReview(qc, activityId!, r.next_student_id);
  }, [r, qc, activityId]);

  const go = useCallback((id: string | null | undefined) => {
    if (id) setParams({ alumno: id }, { replace: true });
  }, [setParams]);

  const back = () => navigate(exit, { state: { restoreScroll: true } });
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
  if (r && r.grade?.status !== 'absent') menu.push({ label: 'Marcar NP', icon: <UserMinus size={18} />, onSelect: markAbsent, separatorBefore: menu.length > 0 });

  return (
    <div className="review">
      <header className="review-bar glass">
        <button className="back-btn review-bar__back" onClick={leave} aria-label={`Volver a ${title}`}>
          <CaretLeft size={20} weight="bold" /><span>{title}</span>
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
          onGo={go} onDone={after} busy={setNp.isPending} exit={exit} />
      )}
    </div>
  );
}

function ReviewStudent({ review: r, activityId, courseId, desktop, onGo, onDone, busy, exit }: {
  review: Review; activityId: string; courseId: string; desktop: boolean; onGo: (id: string) => void;
  onDone: (res: ReviewResult) => void; busy: boolean; exit: string;
}) {
  const { toast } = useFeedback();
  const confirmReview = useConfirmReview(activityId, courseId);
  const assign = useAssignPaper(activityId);
  const correction = useCorrection(activityId);
  const aiById = useMemo(() => new Map((r.ai?.items ?? []).map((i) => [i.id, i])), [r.ai]);
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(
    r.items.map((it) => [it.id, r.grade?.status === 'confirmed' && r.grade.item_scores ? r.grade.item_scores[it.id] ?? 0 : aiById.get(it.id)?.points ?? 0]),
  ));
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

  // Low-confidence AI items first: those are the ones the teacher must look at.
  const items = useMemo(() => {
    const low = r.items.filter((it) => (aiById.get(it.id)?.confidence ?? 1) < LOW);
    return [...low, ...r.items.filter((it) => !low.includes(it))];
  }, [r.items, aiById]);
  const [focus, setFocus] = useState<string | null>(() => items[0]?.id ?? null);

  const hasItems = r.items.length > 0;
  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  const manualValue = parseGradeInput(manual);
  const toConfirm = r.match_status === 'suggested';
  const last = !r.next_pending_id;

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

  // Desktop: the sheet follows the question in focus.
  const focusCrop: Crop | undefined = focus ? r.crops[focus]?.[0] : undefined;
  useEffect(() => {
    const page = focusCrop ? pageRefs.current[focusCrop.index] : null;
    if (!desktop || !page || !scroller.current || !focusCrop) return;
    scroller.current.scrollTo({ top: Math.max(0, page.offsetTop + focusCrop.y0 * page.offsetHeight - 24), behavior: 'smooth' });
  }, [desktop, focusCrop]);

  const accept = () => {
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
    onSuccess: () => {
      const s = correction.data?.students.find((x) => x.student.id === studentId);
      toast(`Hoja asignada a ${s?.student.name ?? 'otro alumno'}`);
      onGo(studentId);
    },
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (viewer !== null || document.querySelector('[role="dialog"]')) return;
      const typing = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && e.key !== 'Enter');
      if (typing) return;
      if (e.key === 'Enter' && !t.closest('.review-foot') && !e.isComposing && !toConfirm) { e.preventDefault(); acceptRef.current(); }
      if (e.key === 'ArrowRight' && r.next_student_id && t.tagName !== 'INPUT') onGo(r.next_student_id);
      if (e.key === 'ArrowLeft' && r.prev_student_id && t.tagName !== 'INPUT') onGo(r.prev_student_id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer, r.next_student_id, r.prev_student_id, onGo, toConfirm]);

  const pages = r.pages.map((p) => fileUrl(p.url)!);
  const caption = (i: number) => (r.pages[i] ? pageCaption(r.pages[i]) : `Página ${i + 1}`);
  // Before confirming: is the paper complete and only this student's? (after confirming, the grade is never touched)
  const warnings = r.flags.filter((f) => isAttention(f) || f.code === 'pagina_nueva_tras_nota');
  const tone = gradeTone(r.rubric_total ? (sum / r.rubric_total) * 10 : null);
  const acceptLabel = toConfirm ? 'Confirma el nombre' : last ? 'Aceptar y terminar' : 'Aceptar y siguiente';

  return (
    <div ref={body} className="review-body">
      {desktop && (
        <section className="review-pages" aria-label="Hoja escaneada">
          {pages.length === 0 ? (
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
        {warnings.length > 0 && (
          <Callout tone="warn" icon={<Warning size={18} weight="fill" />}>
            <span>{warnings.map(flagLabel).join(' · ')}. </span>
            <Link className="link-btn" to={`${exit}?paso=recoger`}>Ordenar páginas</Link>
          </Callout>
        )}
        {(r.ai?.summary || (!desktop && pages.length > 0)) && (
          <div className="review-summary">
            {r.ai?.summary && <><AIBadge label={r.grade?.status === 'suggested' ? 'Borrador IA' : 'IA'} /><span>{r.ai.summary}</span></>}
            {!desktop && pages.length > 0 && (
              <Button variant="tinted" size="sm" icon={<Images size={16} />} className="review-summary__sheet" onClick={() => setViewer(0)}>Ver hoja</Button>
            )}
          </div>
        )}
        {!desktop && pages.length === 0 && (
          <div className="review-nopages muted"><FileX size={22} /><span>Sin hojas escaneadas. Corrige con el examen en papel.</span></div>
        )}
        {hasItems ? (
          <div className="list review-items">
            {items.map((it) => {
              const ai = aiById.get(it.id);
              const low = !!ai && ai.confidence < LOW;
              const changed = !!ai && Math.abs((scores[it.id] ?? 0) - ai.points) > 1e-9;
              const crops = r.crops[it.id] ?? [];
              return (
                <div key={it.id} className={`ritem${low ? ' ritem--low' : ''}${desktop && focus === it.id ? ' ritem--focus' : ''}`}
                  onFocus={() => setFocus(it.id)} onClick={() => setFocus(it.id)}>
                  <div className="ritem__head">
                    <span className="ritem__n num">{it.label || it.id}</span>
                    <button type="button" className="ritem__text" aria-expanded={!!expanded[it.id]}
                      onClick={() => setExpanded((o) => ({ ...o, [it.id]: !o[it.id] }))}>
                      <RichText className={expanded[it.id] ? '' : 'one-line'} text={it.text || `Pregunta ${it.label || it.id}`} />
                    </button>
                  </div>
                  {!desktop && crops.map((c) => (
                    <CropImage key={`${c.page_id}-${c.y0}`} src={pages[c.index]} x0={c.x0} y0={c.y0} x1={c.x1} y1={c.y1}
                      alt={`Respuesta a la pregunta ${it.label || it.id} · ${caption(c.index)}`} onClick={() => setViewer(c.index)} />
                  ))}
                  {ai?.feedback && (
                    <div className="ritem__ai">
                      {low && <Warning size={16} weight="fill" className="ritem__warn" aria-label="Revisa esta pregunta" />}
                      <span>{ai.feedback}</span>
                    </div>
                  )}
                  <div className="ritem__controls">
                    <Button variant="plain" size="sm" onClick={() => setSolution((o) => ({ ...o, [it.id]: !o[it.id] }))}>
                      {solution[it.id] ? 'Ocultar solución' : 'Solución'}
                    </Button>
                    <div className="ritem__score">
                      {changed && <span className="ritem__was num" title="Puntos que propuso la IA">IA: {pts(ai!.points)}</span>}
                      <Stepper label={`Puntos de la pregunta ${it.label || it.id}`} value={scores[it.id] ?? 0} min={0} max={it.points} step={0.25}
                        format={pts} onChange={(v) => setScores((s) => ({ ...s, [it.id]: v }))} />
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
        <TextField label="Comentario (opcional)" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)}
          placeholder="Sale en la ficha del alumno, junto a la nota" />
        <div ref={foot} className="review-foot">
          {hasItems && (
            <div className="review-total">
              <span className="muted">Total</span>
              <span className={`review-total__value grade grade--${tone}`}>{pts(sum)}</span>
              <span className="muted num">/ {pts(r.rubric_total)}</span>
              {r.grade?.status === 'confirmed' && <span className="review-total__note muted">Revisado</span>}
              {r.grade?.status === 'absent' && <span className="review-total__note muted">Marcado NP</span>}
            </div>
          )}
          <div className="review-foot__buttons">
            {!desktop && (
              <Button variant="neutral" icon={<CaretLeft size={16} weight="bold" />} disabled={!r.prev_student_id}
                onClick={() => r.prev_student_id && onGo(r.prev_student_id)}>Anterior</Button>
            )}
            <Button onClick={accept} loading={confirmReview.isPending} disabled={toConfirm || busy} className="review-accept">{acceptLabel}</Button>
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
