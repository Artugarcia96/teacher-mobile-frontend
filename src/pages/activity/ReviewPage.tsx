import { CaretLeft, CaretRight, FileX, Warning } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { prefetchReview, useConfirmReview, useCorrection, useReview, type Review } from '../../api/papers';
import { fileUrl } from '../../lib/api';
import { formatGrade, formatNumber, gradeTone, parseGradeInput } from '../../lib/format';
import { AIBadge, Button, Callout, EmptyState, IconButton, Lightbox, RichText, Skeleton, Stepper, TextField, useFeedback } from '../../ui';
import { flagLabel, isAttention, pageCaption, pageTag } from '../../features/papers/pageLabels';
import '../../features/papers/papers.css';
import './review.css';

const pts = (v: number) => formatNumber(v, 2);
const LOW = 0.7;

/** Focus mode: one student at a time — scanned pages on the left, rubric with AI suggestions on the right. */
export default function ReviewPage() {
  const { courseId, activityId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const correction = useCorrection(activityId);
  const studentId = params.get('alumno') ?? correction.data?.next_pending_id ?? correction.data?.students[0]?.student.id ?? null;
  const review = useReview(activityId, studentId);
  const qc = useQueryClient();
  const exit = `/clases/${courseId}/actividades/${activityId}`;

  useEffect(() => {
    const r = review.data;
    if (!r) return;
    document.title = `${r.student.name} · Revisar · Sepia`;
    prefetchReview(qc, activityId!, r.next_pending_id);
    prefetchReview(qc, activityId!, r.next_student_id);
  }, [review.data, qc, activityId]);

  const go = useCallback((id: string | null | undefined) => {
    if (id) setParams({ alumno: id }, { replace: true });
  }, [setParams]);

  const r = review.data;
  return (
    <div className="review">
      <header className="review-bar glass">
        <button className="back-btn" onClick={() => navigate(exit)}>
          <CaretLeft size={20} weight="bold" /><span>Salir</span>
        </button>
        <div className="review-bar__title">
          {r ? <><strong>{r.student.name}</strong><span className="num">{r.position} de {r.total}</span></> : <Skeleton h={16} w={160} />}
        </div>
        <div className="review-bar__nav">
          <IconButton label="Alumno anterior" size="sm" disabled={!r?.prev_student_id} onClick={() => go(r?.prev_student_id)}><CaretLeft size={18} /></IconButton>
          <IconButton label="Alumno siguiente" size="sm" disabled={!r?.next_student_id} onClick={() => go(r?.next_student_id)}><CaretRight size={18} /></IconButton>
        </div>
      </header>
      {review.error ? (
        <EmptyState icon={<FileX size={24} />} title="No se ha podido abrir la revisión" text={review.error.message}
          action={<Button variant="tinted" onClick={() => navigate(exit)}>Volver al examen</Button>} />
      ) : !r ? (
        <div className="review-body"><div className="review-pages"><Skeleton h={480} r={14} /></div><div className="review-panel"><Skeleton h={300} r={20} /></div></div>
      ) : (
        <ReviewStudent key={r.student.id} review={r} activityId={activityId!} courseId={courseId!} onNext={go} exit={exit} />
      )}
    </div>
  );
}

function ReviewStudent({ review: r, activityId, courseId, onNext, exit }: {
  review: Review; activityId: string; courseId: string; onNext: (id: string) => void; exit: string;
}) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const confirm = useConfirmReview(activityId, courseId);
  const aiById = useMemo(() => new Map((r.ai?.items ?? []).map((i) => [i.id, i])), [r.ai]);
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(
    r.items.map((it) => [it.id, r.grade?.status === 'confirmed' && r.grade.item_scores ? r.grade.item_scores[it.id] ?? 0 : aiById.get(it.id)?.points ?? 0]),
  ));
  const [manual, setManual] = useState(() => (r.grade?.score != null ? formatGrade(r.grade.score, 2) : r.ai?.suggested_score != null ? formatGrade(r.ai.suggested_score, 2) : ''));
  const [comment, setComment] = useState(r.grade?.comment ?? '');
  const [open, setOpen] = useState<Record<string, 'text' | 'answer' | undefined>>({});
  const [viewer, setViewer] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Low-confidence AI items first: those are the ones the teacher must look at.
  const items = useMemo(() => {
    const low = r.items.filter((it) => (aiById.get(it.id)?.confidence ?? 1) < LOW);
    return [...low, ...r.items.filter((it) => !low.includes(it))];
  }, [r.items, aiById]);

  const hasItems = r.items.length > 0;
  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  const manualValue = parseGradeInput(manual);

  const finish = (next: string | null) => {
    if (next) onNext(next);
    else { toast('Corrección completada'); navigate(exit); }
  };

  const accept = () => {
    let body: { item_scores?: Record<string, number>; score?: number } = {};
    if (hasItems) body = { item_scores: scores };
    else if (typeof manualValue === 'number') body = { score: manualValue };
    else { toast(`Escribe la nota (0 a ${formatGrade(r.activity.max_score)}).`, { tone: 'error' }); return; }
    confirm.mutate({ studentId: r.student.id, ...body, comment: comment.trim() || null }, {
      onSuccess: (res) => finish(res.next_student_id),
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  const markAbsent = () => confirm.mutate({ studentId: r.student.id, absent: true }, {
    onSuccess: (res) => { toast(`${r.student.first_name}: NP`); finish(res.next_student_id); },
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (viewer !== null || document.querySelector('.sheet')) return;
      const typing = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && e.key !== 'Enter');
      if (typing) return;
      if (e.key === 'Enter' && !t.closest('.review-foot') && !e.isComposing) { e.preventDefault(); acceptRef.current(); }
      if (e.key === 'ArrowRight' && r.next_student_id && t.tagName !== 'INPUT') onNext(r.next_student_id);
      if (e.key === 'ArrowLeft' && r.prev_student_id && t.tagName !== 'INPUT') onNext(r.prev_student_id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer, r.next_student_id, r.prev_student_id, onNext]);

  const pages = r.pages_urls.map((u) => fileUrl(u)!);
  const info = r.pages; // aligned with pages_urls: exam pages by number, written backs after their page, extra sheets last
  const extraTag = (i: number) => (info[i]?.kind === 'extra_sheet' ? pageCaption(info[i]) : null);
  const thumbTag = (i: number) => (info[i] ? pageTag(info[i]) || '?' : String(i + 1)); // the printed number, not the position
  // Before confirming: is the paper complete and only this student's? (after confirming, the grade is never touched)
  const warnings = r.flags.filter((f) => isAttention(f) || f.code === 'pagina_nueva_tras_nota');
  const tone = gradeTone(r.rubric_total ? (sum / r.rubric_total) * 10 : null);

  return (
    <div className="review-body">
      <section className={`review-pages${warnings.length ? ' review-pages--flagged' : ''}`} aria-label="Hojas escaneadas">
        {warnings.length > 0 && (
          <div className="review-flags">
            <Callout tone="warn" icon={<Warning size={18} weight="fill" />}>
              <span>{warnings.map(flagLabel).join(' · ')}. </span>
              <Link className="link-btn" to={`${exit}?paso=recoger`}>Ordenar páginas</Link>
            </Callout>
          </div>
        )}
        {pages.length === 0 ? (
          <div className="review-nopages muted">
            <FileX size={22} />
            <span>Sin hojas escaneadas. Corrige con el examen en papel.</span>
          </div>
        ) : (
          <>
            {pages.length > 1 && (
              <div className="review-thumbs">
                {pages.map((src, i) => (
                  <button key={src} type="button" onClick={() => pageRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    aria-label={`Ir a ${info[i] ? pageCaption(info[i]).toLowerCase() : `la página ${i + 1}`}`}>
                    <img src={src} alt="" loading="lazy" />
                    <span className="num">{thumbTag(i)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="review-scroll">
              {pages.map((src, i) => (
                <div key={src} ref={(el) => { pageRefs.current[i] = el; }} className={`review-page${zoom === i ? ' review-page--zoom' : ''}`}>
                  {extraTag(i) && <span className="review-page__tag">{extraTag(i)}</span>}
                  <img src={src} alt={info[i] ? pageCaption(info[i]) : `Página ${i + 1}`} loading={i < 2 ? 'eager' : 'lazy'}
                    onClick={() => (window.matchMedia('(min-width: 1024px)').matches ? setZoom(zoom === i ? null : i) : setViewer(i))} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="review-panel" aria-label="Puntuación">
        {r.ai?.summary && (
          <div className="review-summary">
            <AIBadge />
            <span>{r.ai.summary}</span>
          </div>
        )}
        {hasItems ? (
          <div className="list review-items">
            {items.map((it) => {
              const ai = aiById.get(it.id);
              const low = !!ai && ai.confidence < LOW;
              const state = open[it.id];
              return (
                <div key={it.id} className={`ritem${low ? ' ritem--low' : ''}`}>
                  <div className="ritem__head">
                    <span className="ritem__n num">{it.label || it.id}</span>
                    <button type="button" className="ritem__text" onClick={() => setOpen((o) => ({ ...o, [it.id]: state === 'text' ? undefined : 'text' }))}
                      aria-expanded={state === 'text'}>
                      <RichText className={state === 'text' ? '' : 'clamp-2'} text={it.text || `Pregunta ${it.label || it.id}`} />
                    </button>
                  </div>
                  {ai && (
                    <div className="ritem__ai">
                      {low && <Warning size={16} weight="fill" className="ritem__warn" aria-label="Revisa esta pregunta" />}
                      <span><b className="num">IA {pts(ai.points)}</b> · {ai.feedback}</span>
                    </div>
                  )}
                  <div className="ritem__controls">
                    <Button variant="plain" size="sm" onClick={() => setOpen((o) => ({ ...o, [it.id]: state === 'answer' ? undefined : 'answer' }))}>
                      {state === 'answer' ? 'Ocultar solución' : 'Solución'}
                    </Button>
                    <div className="ritem__score">
                      <Stepper label={`Puntos de la pregunta ${it.label || it.id}`} value={scores[it.id] ?? 0} min={0} max={it.points} step={0.25}
                        format={pts} onChange={(v) => setScores((s) => ({ ...s, [it.id]: v }))} />
                      <span className="ritem__max num">/ {pts(it.points)}</span>
                    </div>
                  </div>
                  {state === 'answer' && (
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
            onChange={(e) => setManual(e.target.value)} placeholder="—" autoFocus />
        )}
        <TextField label="Comentario (opcional)" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)}
          placeholder="Una nota para ti o para la familia" />
        <div className="review-foot glass glass-strong">
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
            <Button variant="neutral" onClick={markAbsent} disabled={confirm.isPending}>Marcar NP</Button>
            <Button variant="neutral" className="review-prev" disabled={!r.prev_student_id} onClick={() => r.prev_student_id && onNext(r.prev_student_id)}>Anterior</Button>
            <Button onClick={accept} loading={confirm.isPending} className="review-accept">Aceptar y siguiente</Button>
          </div>
        </div>
      </section>
      {viewer !== null && <Lightbox images={pages} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} label={`Hojas de ${r.student.name}`}
        caption={extraTag(viewer) ?? undefined} />}
    </div>
  );
}
