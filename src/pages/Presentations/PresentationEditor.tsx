import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Download, Save, CheckCircle2, Paintbrush, Loader2,
  Play, Sparkles, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { usePresentationsStore } from '../../store/presentationsStore';
import { exams as examsApi } from '../../services/api';
import SlideRenderer from '../../components/slides/SlideRenderer';
import EditableSlide from './EditableSlide';
import PresentationMode from './PresentationMode';
import PresentationChat from './PresentationChat';
import MultiClassSelector from '../../components/MultiClassSelector';
import ErrorBoundary from '../../components/shared/ErrorBoundary';
import { THEME_LIST, getTheme } from '../../components/slides/themes';
import type { Slide, ThemeId } from '../../types/presentations';
import { exportPresentationToPdf } from '../../utils/exportPresentation';
import '../../components/slides/slides.css';
import '../../components/diagrams/styles.css';
import './PresentationEditor.css';

const DRAFT_KEY = (id: string) => `presentation:draft:${id}`;
// Tiempo entre slides reveladas durante el streaming inicial. Rápido —
// el usuario quiere ver la versión definitiva, no esperar 20 segundos.
const STREAM_DELAY = 320;

const PresentationEditor: React.FC = () => {
  const { presentationId } = useParams() as { presentationId: string };
  const navigate = useNavigate();

  const current = usePresentationsStore((s) => s.current);
  const fetchDetail = usePresentationsStore((s) => s.fetchDetail);
  const update = usePresentationsStore((s) => s.update);
  const loading = usePresentationsStore((s) => s.loadingDetail);

  const [title, setTitle] = useState('');
  const [slides, setSlides] = useState<Slide[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [themeId, setThemeId] = useState<ThemeId>('minimal');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [presentMode, setPresentMode] = useState(false);
  const [presentFrom, setPresentFrom] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const themePickerRef = useRef<HTMLDivElement | null>(null);

  const theme = useMemo(() => getTheme(themeId), [themeId]);

  // Cierra el theme picker al hacer click fuera (también en tap en móvil)
  useEffect(() => {
    if (!themePickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (themePickerRef.current && !themePickerRef.current.contains(e.target as Node)) {
        setThemePickerOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setThemePickerOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [themePickerOpen]);

  // Cargar presentación
  useEffect(() => {
    if (!presentationId) return;
    fetchDetail(presentationId).then((p) => {
      if (!p) { navigate('/tabs/calendar', { replace: true }); return; }
      setTitle(p.title);
      setSlides(p.slides || []);
      setClassIds(p.class_ids || []);
      setThemeId((p.theme?.id as ThemeId) || 'minimal');
      // Logo del profe: compartido con exámenes (teachers.logo_url)
      examsApi.getLogo().then((res) => {
        if (res.data?.logo_url) setLogoUrl(res.data.logo_url);
      }).catch(() => {});

      const justCreated = sessionStorage.getItem(`pres:stream:${p.id}`) === '1';
      if (justCreated) {
        sessionStorage.removeItem(`pres:stream:${p.id}`);
        setRevealedCount(0);
      } else {
        setRevealedCount(p.slides.length);
      }
      setDirty(false);
    });
  }, [presentationId, fetchDetail, navigate]);

  // Cuando el chat aplica un edit, current cambia → sincronizamos slides/title
  useEffect(() => {
    if (!current || current.id !== presentationId) return;
    // Sólo sincronizamos si el usuario no tiene cambios locales pendientes.
    // Si tiene dirty=true, respetamos su trabajo y dejamos que guarde manualmente.
    if (!dirty) {
      setTitle(current.title);
      setSlides(current.slides || []);
      setClassIds(current.class_ids || []);
      setThemeId((current.theme?.id as ThemeId) || 'minimal');
      setRevealedCount(current.slides.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.updated_at]);

  // Streaming simulado
  useEffect(() => {
    if (!slides.length || revealedCount >= slides.length) return;
    const t = window.setTimeout(() => setRevealedCount((n) => Math.min(n + 1, slides.length)), STREAM_DELAY);
    return () => window.clearTimeout(t);
  }, [revealedCount, slides.length]);

  // Draft autosave
  useEffect(() => {
    if (!presentationId || !dirty) return;
    const t = window.setTimeout(() => {
      localStorage.setItem(DRAFT_KEY(presentationId), JSON.stringify({ title, slides, themeId }));
    }, 500);
    return () => window.clearTimeout(t);
  }, [presentationId, title, slides, themeId, dirty]);

  const markDirty = () => setDirty(true);

  /** Guarda la presentación. Si `andExit` es true, vuelve al listado tras
   *  un toast de confirmación — flujo "Listo, ya está hecha y guardada". */
  const handleSave = useCallback(async (andExit = false) => {
    if (!presentationId) return;
    setSaving(true);
    try {
      await update(presentationId, { title, slides, theme: { id: themeId }, class_ids: classIds });
      localStorage.removeItem(DRAFT_KEY(presentationId));
      setDirty(false);
      setLastSaved(new Date());
      toast.success(andExit ? 'Guardado · volviendo' : 'Guardado');
      if (andExit) {
        // Pequeño delay para que el usuario vea la confirmación
        setTimeout(() => navigate(-1), 600);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [presentationId, update, title, slides, themeId, classIds, navigate]);

  // Cmd/Ctrl+S — quick save, no navigation
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleSave]);

  // Warn unsaved
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  /* ── mutadores ── */

  const updateSlide = (idx: number, patch: Partial<Slide>) => {
    setSlides((xs) => xs.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    markDirty();
  };

  const moveSlide = (idx: number, delta: -1 | 1) => {
    const to = idx + delta;
    if (to < 0 || to >= slides.length) return;
    setSlides((xs) => {
      const next = [...xs];
      const [item] = next.splice(idx, 1);
      next.splice(to, 0, item);
      return next;
    });
    markDirty();
  };

  const deleteSlide = (idx: number) => {
    if (slides.length <= 1) { toast.error('La presentación debe tener al menos un slide'); return; }
    setSlides((xs) => xs.filter((_, i) => i !== idx));
    markDirty();
  };

  const duplicateSlide = (idx: number) => {
    setSlides((xs) => {
      const src = xs[idx];
      const copy: Slide = { ...src, id: `s-${Date.now()}` };
      const next = [...xs];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    markDirty();
  };

  const insertAt = (idx: number, layout: Slide['layout'] = 'content') => {
    const fresh: Slide = {
      id: `s-${Date.now()}`,
      layout,
      title: layout === 'content' ? 'Nueva sección' : layout === 'cover' ? 'Título' : layout === 'section' ? 'Sección' : 'Conclusión',
      subtitle: layout === 'cover' ? 'Subtítulo' : undefined,
      blocks: layout === 'content' ? [{ kind: 'paragraph', text: 'Escribe aquí…' }] : [],
    };
    setSlides((xs) => {
      const next = [...xs];
      next.splice(idx, 0, fresh);
      return next;
    });
    markDirty();
    // scroll al nuevo slide tras el render
    requestAnimationFrame(() => {
      const el = document.getElementById(`slide-${fresh.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try { await exportPresentationToPdf({ title, slides, theme }); }
    catch { toast.error('No se pudo exportar a PDF'); }
    finally { setExporting(false); }
  };

  const openPresentFrom = (idx: number) => { setPresentFrom(idx); setPresentMode(true); };

  if (loading || !current) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  const streaming = revealedCount < slides.length;

  return (
    <div className="pe-shell">
      {/* Header fijo: fila 1 (back + título + meta), fila 2 (toolbar scrollable) */}
      <header className="pe-header">
        <div className="pe-header-row pe-header-row--title">
          <button
            className="pe-back"
            aria-label="Volver"
            onClick={() => {
              if (dirty && !confirm('Tienes cambios sin guardar. ¿Salir de todas formas?')) return;
              navigate(-1);
            }}
          >
            <ArrowLeft size={20} />
          </button>

          <div className="pe-title-area">
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); markDirty(); }}
              className="pe-title-input"
              placeholder="Título de la presentación"
            />
            <MultiClassSelector
              value={classIds}
              onChange={(next) => { setClassIds(next); markDirty(); }}
              compact
            />
          </div>

          <div className="pe-header-meta">
            {streaming ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                <span className="hidden sm:inline">Generando… {revealedCount}/{slides.length}</span>
                <span className="sm:hidden">{revealedCount}/{slides.length}</span>
              </span>
            ) : saving ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                <span className="hidden sm:inline">Guardando…</span>
              </span>
            ) : dirty ? (
              <span className="text-xs text-amber-600">Sin guardar</span>
            ) : lastSaved ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle2 size={14} />
                <span className="hidden sm:inline">Guardado</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="pe-header-actions">
          <div className="pe-theme-picker" ref={themePickerRef}>
            <button
              type="button"
              className={`pe-toolbar-btn ${themePickerOpen ? 'pe-toolbar-btn--active' : ''}`}
              onClick={() => setThemePickerOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={themePickerOpen}
            >
              <Paintbrush size={14} />
              <span className="pe-toolbar-label">Tema</span>
            </button>
            {themePickerOpen && (
              <div className="pe-theme-menu" role="menu">
                {THEME_LIST.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { setThemeId(t.id); setThemePickerOpen(false); markDirty(); }}
                    className={`pe-theme-option ${themeId === t.id ? 'pe-theme-option--active' : ''}`}
                  >
                    <div className="pe-theme-swatch" style={{ background: t.coverBg || t.bg }}>
                      <span className="pe-theme-swatch-dot" style={{ background: t.accent }} />
                    </div>
                    <div className="pe-theme-meta">
                      <span className="pe-theme-meta-name">{t.label}</span>
                      <span className="pe-theme-meta-desc">{t.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="pe-toolbar-btn"
            onClick={() => setChatOpen((v) => !v)}
            disabled={streaming}
            aria-label="Asistente"
          >
            <Sparkles size={14} />
            <span className="pe-toolbar-label">Asistente</span>
          </button>

          <button
            type="button"
            className="pe-toolbar-btn"
            onClick={() => openPresentFrom(0)}
            disabled={streaming}
            aria-label="Presentar"
          >
            <Play size={14} />
            <span className="pe-toolbar-label">Presentar</span>
          </button>

          <button
            type="button"
            className="pe-toolbar-btn"
            onClick={handleExport}
            disabled={exporting || streaming}
            aria-label="Descargar PDF"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span className="pe-toolbar-label">PDF</span>
          </button>

          <button
            type="button"
            className="pe-toolbar-btn"
            onClick={() => handleSave(false)}
            disabled={saving || streaming || !dirty}
            aria-label="Guardar"
            title="Guardar cambios sin salir"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span className="pe-toolbar-label">Guardar</span>
          </button>

          <button
            type="button"
            className="pe-toolbar-btn pe-toolbar-btn--primary"
            onClick={() => handleSave(true)}
            disabled={saving || streaming}
            aria-label="Listo"
            title="Guardar y volver al listado"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            <span className="pe-toolbar-label">Listo</span>
          </button>
        </div>
      </header>

      {/* Cuerpo scrollable con todas las slides apiladas */}
      <div className="pe-body-wrap">
        <main className={`pe-stack ${chatOpen ? 'pe-stack--with-chat' : ''}`}>
          {/* Botón insertar al inicio */}
          {!streaming && (
            <button className="pe-insert-top" onClick={() => insertAt(0, 'content')}>
              <Plus size={14} /> Insertar slide al inicio
            </button>
          )}

          {slides.map((slide, idx) => {
            const revealed = idx < revealedCount;
            if (!revealed) {
              return (
                <div key={slide.id || idx} className="pe-slide-pending">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                  <span className="ml-2 text-xs text-muted-foreground">Slide {idx + 1}…</span>
                </div>
              );
            }
            // Durante el streaming: render no-editable con animación de
            // entrada (sin typewriter — el usuario quiere ver la versión
            // definitiva ya, no esperar a que se "escriba" letra a letra).
            // Cada slide va dentro de su propio ErrorBoundary.
            if (streaming) {
              return (
                <div key={slide.id || idx} className="pe-slide-row">
                  <ErrorBoundary label={`slide:${idx}`}>
                    <SlideRenderer
                      slide={slide}
                      theme={theme}
                      animate
                      typewriter={false}
                      index={idx}
                      total={slides.length}
                      logoUrl={logoUrl}
                    />
                  </ErrorBoundary>
                </div>
              );
            }
            return (
              <div key={slide.id || idx} className="pe-slide-row">
                <ErrorBoundary label={`slide-edit:${idx}`}>
                  <EditableSlide
                    slide={slide}
                    index={idx}
                    total={slides.length}
                    theme={theme}
                    logoUrl={logoUrl}
                    onUpdate={(patch) => updateSlide(idx, patch)}
                    onDelete={() => deleteSlide(idx)}
                    onDuplicate={() => duplicateSlide(idx)}
                    onMove={(delta) => moveSlide(idx, delta)}
                    onInsertAfter={() => insertAt(idx + 1, 'content')}
                  />
                </ErrorBoundary>
                <button
                  className="pe-slide-present-here"
                  onClick={() => openPresentFrom(idx)}
                  title="Presentar desde aquí"
                >
                  <Play size={12} />
                  Desde aquí
                </button>
              </div>
            );
          })}

          {!streaming && slides.length > 0 && (
            <div className="pe-end-actions">
              <button
                type="button"
                className="pe-toolbar-btn"
                onClick={() => insertAt(slides.length, 'closing')}
              >
                <Plus size={14} /> Añadir slide de cierre
              </button>
            </div>
          )}
        </main>

        {chatOpen && (
          <PresentationChat
            open={chatOpen}
            presentationId={presentationId}
            onClose={() => setChatOpen(false)}
          />
        )}
      </div>

      {presentMode && (
        <PresentationMode
          slides={slides}
          theme={theme}
          initialIndex={presentFrom}
          logoUrl={logoUrl}
          onClose={() => setPresentMode(false)}
        />
      )}
    </div>
  );
};

export default PresentationEditor;
