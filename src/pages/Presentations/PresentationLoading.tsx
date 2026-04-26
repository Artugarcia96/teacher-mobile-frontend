import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, Check, Compass, PenLine, Wand2, ScanSearch } from 'lucide-react';
import {
  usePresentationsStore,
  type GenerateParams,
  type StreamingEvent,
} from '../../store/presentationsStore';
import SlideRenderer from '../../components/slides/SlideRenderer';
import { getTheme } from '../../components/slides/themes';
import type { Slide } from '../../types/presentations';
import './PresentationLoading.css';

interface Phase {
  id: string;
  label: string;
  hint: string;
  icon: typeof Compass;
}

const PHASES: Phase[] = [
  { id: 'plan',     label: 'Planificando la narrativa', hint: 'Eligiendo arquetipo, tono, sesgo por asignatura.', icon: Compass },
  { id: 'expand',   label: 'Escribiendo cada slide',    hint: 'Una llamada por slide en paralelo.',              icon: PenLine },
  { id: 'critic',   label: 'Revisión editorial',         hint: 'Verificando datos, variedad y profundidad.',     icon: ScanSearch },
  { id: 'refine',   label: 'Afinando lo flojo',          hint: 'Regenerando solo las slides marcadas.',          icon: Wand2 },
];

const PresentationLoading: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const generate = usePresentationsStore((s) => s.generate);
  const generateStream = usePresentationsStore((s) => s.generateStream);
  const started = useRef(false);

  const params = (location.state as { params?: GenerateParams } | null)?.params;
  const targetSlides = params?.target_slides ?? 12;

  const [phase, setPhase] = useState<string>('plan');
  const [phasesDone, setPhasesDone] = useState<Set<string>>(new Set());
  const [outline, setOutline] = useState<{ title?: string; archetype?: string; slide_ids?: string[] } | null>(null);
  const [slides, setSlides] = useState<Map<number, Slide>>(new Map());
  const [refinedIdx, setRefinedIdx] = useState<Set<number>>(new Set());
  const [criticInfo, setCriticInfo] = useState<{ score: number; toRefine: number } | null>(null);
  const [errored, setErrored] = useState<string | null>(null);

  // theme: usamos minimal por defecto durante el streaming (el editor puede
  // cambiarlo después si el caller lo pidió distinto).
  const theme = useMemo(
    () => getTheme(params?.theme_id || 'minimal'),
    [params?.theme_id],
  );

  useEffect(() => {
    if (!params) {
      navigate('/tabs/calendar', { replace: true });
      return;
    }
    if (started.current) return;
    started.current = true;

    const handleEvent = (ev: StreamingEvent) => {
      switch (ev.type) {
        case 'phase':
          setPhase((prev) => {
            if (prev !== ev.phase) {
              setPhasesDone((s) => new Set(s).add(prev));
            }
            return ev.phase;
          });
          break;
        case 'outline':
          setOutline({ title: ev.title, archetype: ev.archetype, slide_ids: ev.slide_ids });
          break;
        case 'slide':
          setSlides((map) => {
            const next = new Map(map);
            next.set(ev.index, ev.slide);
            return next;
          });
          break;
        case 'slide_refined':
          setSlides((map) => {
            const next = new Map(map);
            next.set(ev.index, ev.slide);
            return next;
          });
          setRefinedIdx((s) => new Set(s).add(ev.index));
          break;
        case 'critic':
          setCriticInfo({ score: ev.score, toRefine: ev.slides_to_refine.length });
          break;
        case 'done':
          setPhasesDone((s) => new Set(s).add('refine').add('critic').add('expand').add('plan'));
          break;
        case 'created':
          sessionStorage.setItem(`pres:stream:${ev.presentation_id}`, '1');
          // Pequeño delay para que el último frame se vea
          setTimeout(() => {
            navigate(`/tabs/presentations/${ev.presentation_id}`, { replace: true });
          }, 350);
          break;
        case 'error':
          setErrored(ev.detail);
          break;
      }
    };

    let handle: { cancel: () => void } | null = null;
    let fellback = false;

    // Lanzamos SSE. Si la conexión falla en seguida (CORS, 401), caemos al
    // método síncrono para no romper la generación.
    try {
      handle = generateStream(params, handleEvent);
      // Failsafe: si tras 8s no hay outline ni phase events, asumimos que
      // SSE no llega y fallback. (Casi nunca debería disparar.)
      const timeout = window.setTimeout(() => {
        if (!outline && !phasesDone.size && !slides.size && !errored) {
          fellback = true;
          handle?.cancel();
          (async () => {
            try {
              const p = await generate(params);
              sessionStorage.setItem(`pres:stream:${p.id}`, '1');
              navigate(`/tabs/presentations/${p.id}`, { replace: true });
            } catch (err: any) {
              setErrored(err?.response?.data?.detail || 'No se pudo generar la presentación');
            }
          })();
        }
      }, 8000);
      return () => {
        if (!fellback) handle?.cancel();
        window.clearTimeout(timeout);
      };
    } catch {
      // EventSource no disponible — síncrono directo
      (async () => {
        try {
          const p = await generate(params);
          sessionStorage.setItem(`pres:stream:${p.id}`, '1');
          navigate(`/tabs/presentations/${p.id}`, { replace: true });
        } catch (err: any) {
          setErrored(err?.response?.data?.detail || 'No se pudo generar la presentación');
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (errored) {
    return (
      <div className="pl-shell">
        <div className="pl-error">
          <h2>No hemos podido generar la presentación</h2>
          <p>{errored}</p>
          <button type="button" onClick={() => navigate(-1)}>Volver</button>
        </div>
      </div>
    );
  }

  const promptText = params?.prompt || 'Nueva presentación';
  const previewTitle = outline?.title || promptText.split(/[.\n]/)[0].slice(0, 90);
  const expectedTotal = outline?.slide_ids?.length || targetSlides;
  const slidesArr = Array.from({ length: expectedTotal }, (_, i) => slides.get(i));

  const phaseState = (id: string): 'completed' | 'current' | 'pending' => {
    if (phasesDone.has(id)) return 'completed';
    if (phase === id) return 'current';
    // El refine es la última fase y solo aparece como current si el critic detectó issues
    if (id === 'refine' && phase !== 'refine' && criticInfo && criticInfo.toRefine === 0) return 'completed';
    return 'pending';
  };

  return (
    <div className="pl-shell" role="status" aria-live="polite">
      <div className="pl-stage">
        <div className="pl-hero">
          <div className="pl-badge">
            <Sparkles size={13} />
            <span>Generando con IA</span>
          </div>
          <h1 className="pl-title">{previewTitle}</h1>
          <p className="pl-meta">
            <span>{expectedTotal} slides</span>
            <span className="pl-meta-dot">·</span>
            <span>{params?.tone || 'didáctico'}</span>
            {params?.subject_name && (
              <>
                <span className="pl-meta-dot">·</span>
                <span>{params.subject_name}</span>
              </>
            )}
            {outline?.archetype && (
              <>
                <span className="pl-meta-dot">·</span>
                <span>{outline.archetype.replace(/_/g, ' ')}</span>
              </>
            )}
          </p>
        </div>

        <ol className="pl-phases">
          {PHASES.map((p) => {
            const Icon = p.icon;
            const state = phaseState(p.id);
            return (
              <li key={p.id} className={`pl-phase pl-phase--${state}`}>
                <div className="pl-phase-dot">
                  {state === 'completed' ? <Check size={14} strokeWidth={3} /> :
                   state === 'current'   ? <Loader2 size={14} className="pl-phase-spin" /> :
                   <Icon size={13} />}
                </div>
                <div className="pl-phase-text">
                  <span className="pl-phase-label">{p.label}</span>
                  <span className="pl-phase-hint">
                    {p.id === 'critic' && criticInfo
                      ? `Puntuación ${criticInfo.score.toFixed(1)} — ${criticInfo.toRefine} slide${criticInfo.toRefine === 1 ? '' : 's'} a refinar`
                      : p.id === 'refine' && criticInfo && criticInfo.toRefine === 0
                      ? 'No hay nada que refinar — saltado'
                      : p.hint}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Grid de slides en construcción. Cada celda es un mini-render real
            cuando llega del backend, o un skeleton mientras tanto. */}
        <div className="pl-grid">
          {slidesArr.map((slide, i) => (
            <div
              key={i}
              className={`pl-card ${slide ? 'pl-card--filled pl-card--live' : ''} ${refinedIdx.has(i) ? 'pl-card--refined' : ''}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {slide ? (
                <div className="pl-card-mini">
                  <SlideRenderer slide={slide} theme={theme} animate={false} />
                </div>
              ) : (
                <>
                  <div className="pl-card-bar pl-card-bar--title" />
                  <div className="pl-card-bar pl-card-bar--short" />
                  <div className="pl-card-bar" />
                  <div className="pl-card-bar pl-card-bar--short" />
                  <div className="pl-card-shimmer" aria-hidden />
                </>
              )}
            </div>
          ))}
        </div>

        <p className="pl-foot">
          Se construye en directo: cada slide aparece en cuanto el modelo la termina. Si una slide queda
          floja, un revisor automático la detecta y la regeneramos.
        </p>
      </div>
    </div>
  );
};

export default PresentationLoading;
