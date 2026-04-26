import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, FileText, Library, PenLine,
  Presentation as PresentationIcon, Sparkles, X,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/shared/Modal';
import Spinner from '@/components/shared/Spinner';
import { Input } from '@/components/ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { useTextbooksStore } from '../store/textbooksStore';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';
import { useTallerStore } from '../store/tallerStore';
import { EDUCATION_LEVELS } from '../pages/Exams/examConstants';
import { exams as examsApi } from '../services/api';
import LogoUploader from '../pages/Exams/LogoUploader';
import { THEME_LIST } from './slides/themes';
import type { ExamPurpose } from '../types';
import type { MaterialListItem } from '../types/presentations';
import type { ThemeId } from '../types/presentations';
import TallerReferencesPicker from './TallerReferencesPicker';
import './TallerDialog.css';
import '../pages/Exams/ExamEditor.css';

const TONES: Array<{ value: 'didactico' | 'formal' | 'inspirador' | 'conversacional'; label: string }> = [
  { value: 'didactico', label: 'Didáctico' },
  { value: 'formal', label: 'Formal' },
  { value: 'inspirador', label: 'Inspirador' },
  { value: 'conversacional', label: 'Conversacional' },
];

const DENSITIES: Array<{ value: 'muy_visual' | 'equilibrado' | 'texto_denso'; label: string }> = [
  { value: 'muy_visual', label: 'Muy visual' },
  { value: 'equilibrado', label: 'Equilibrado' },
  { value: 'texto_denso', label: 'Texto denso' },
];

type MaterialType = 'exam' | 'exercise' | 'presentation' | 'textbook';
type MaterialGroup = 'content' | 'assessment';

const GROUP_META: Record<MaterialGroup, { label: string; hint: string }> = {
  content: { label: 'Para enseñar', hint: 'Lo que llevas a clase' },
  assessment: { label: 'Para evaluar', hint: 'Calificar o practicar' },
};

const TYPE_META: Record<MaterialType, {
  label: string;
  description: string;
  group: MaterialGroup;
  purpose?: ExamPurpose;
  icon: typeof FileText;
  detailBase: string;
  placeholder: string;
  progressCopy: string;
  flow: 'exam' | 'presentation' | 'textbook';
  requiresContext?: boolean;
  requiresContextHint?: string;
}> = {
  presentation: {
    label: 'Presentación', description: 'Slides con diagramas',
    group: 'content', icon: PresentationIcon, detailBase: '/tabs/presentations',
    placeholder: 'Ej.: Presentación para 3º ESO sobre el ciclo del agua, con diagramas y un cuestionario al final.',
    progressCopy: 'La IA está montando tu presentación…',
    flow: 'presentation',
  },
  textbook: {
    label: 'Apuntes', description: 'Libro o dossier de teoría',
    group: 'content', icon: BookOpen, detailBase: '/tabs/calendar',
    placeholder: 'Ej.: Apuntes de cinemática para 1º Bach, con ejemplos resueltos y ejercicios al final de cada apartado.',
    progressCopy: 'La IA está montando tus apuntes…',
    flow: 'textbook',
    requiresContext: true,
    requiresContextHint: 'Los apuntes se generan dentro de una asignatura: ábrelos desde un tema o sesión.',
  },
  exam: {
    label: 'Examen', description: 'Evaluación calificable',
    group: 'assessment', purpose: 'evaluation', icon: FileText, detailBase: '/tabs/exams',
    placeholder: 'Ej.: Examen corto de derivadas para 2º Bach, 8 preguntas, nivel medio.',
    progressCopy: 'La IA está generando el examen…',
    flow: 'exam',
  },
  exercise: {
    label: 'Ejercicio', description: 'Práctica o refuerzo',
    group: 'assessment', purpose: 'practice', icon: PenLine, detailBase: '/tabs/exercises',
    placeholder: 'Ej.: Hoja de fracciones para 6º Primaria con pistas y soluciones.',
    progressCopy: 'La IA está generando los ejercicios…',
    flow: 'exam',
  },
};

const TYPES_BY_GROUP: Record<MaterialGroup, MaterialType[]> = {
  content: (Object.keys(TYPE_META) as MaterialType[]).filter((k) => TYPE_META[k].group === 'content'),
  assessment: (Object.keys(TYPE_META) as MaterialType[]).filter((k) => TYPE_META[k].group === 'assessment'),
};

interface TallerDialogProps { open: boolean; onClose: () => void; }

function deriveName(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'Material sin título';
  const firstLine = trimmed.split(/[.\n]/)[0];
  const name = firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const TallerDialog: React.FC<TallerDialogProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const generateTextbook = useTextbooksStore((s) => s.generateTextbook);
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);
  const context = useTallerStore((s) => s.context);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [type, setType] = useState<MaterialType>('presentation');
  const [prompt, setPrompt] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [educationLevel, setEducationLevel] = useState('secundaria');
  const [submitting, setSubmitting] = useState(false);

  const [targetSlides, setTargetSlides] = useState(12);
  const [tone, setTone] = useState<'didactico' | 'formal' | 'inspirador' | 'conversacional'>('didactico');
  const [density, setDensity] = useState<'muy_visual' | 'equilibrado' | 'texto_denso'>('equilibrado');
  const [themeId, setThemeId] = useState<ThemeId>('minimal');
  const [refIds, setRefIds] = useState<string[]>([]);
  const [refItems, setRefItems] = useState<MaterialListItem[]>([]);
  const [refsPickerOpen, setRefsPickerOpen] = useState(false);

  // Configuración específica de apuntes (textbook).
  const [tbPages, setTbPages] = useState(20);
  const [tbEnfoque, setTbEnfoque] = useState<'practico' | 'teorico'>('practico');
  const [tbExercises, setTbExercises] = useState(8);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (open) {
      if (context) {
        // Saneamos defaultType: algunos callers legacy pasan 'textbook' (o
        // cualquier otro valor fuera de los tipos actualmente soportados) y
        // si lo aceptamos TYPE_META[type] queda undefined y rompe el render.
        if (context.defaultType && context.defaultType in TYPE_META) {
          setType(context.defaultType as MaterialType);
        }
        if (context.promptHint) setPrompt(context.promptHint);
        if (context.subjectName) setSubjectName(context.subjectName);
        if (context.educationLevel) setEducationLevel(context.educationLevel);
      }
      examsApi.getLogo().then(res => {
        if (res.data?.logo_url) setLogoUrl(res.data.logo_url);
      }).catch(() => {});
      const t = setTimeout(() => textareaRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    setType('presentation');
    setPrompt('');
    setSubjectName('');
    setEducationLevel('secundaria');
    setSubmitting(false);
    setTargetSlides(12);
    setTone('didactico');
    setDensity('equilibrado');
    setThemeId('minimal');
    setRefIds([]);
    setRefItems([]);
    setRefsPickerOpen(false);
    setTbPages(20);
    setTbEnfoque('practico');
    setTbExercises(8);
  }, [open, context]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const res = await examsApi.uploadLogo(file);
      setLogoUrl(res.data.logo_url);
    } catch { toast.error('No se pudo subir el logo'); }
    finally { setUploadingLogo(false); e.target.value = ''; }
  };

  const handleSubmit = async () => {
    const text = prompt.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const meta = TYPE_META[type];

      if (meta.flow === 'presentation') {
        // Navegamos INMEDIATAMENTE a la pantalla de carga. Ella dispara el
        // request de generación y muestra un skeleton animado; al completar,
        // hace replace a /tabs/presentations/:id. Así el profe nunca se queda
        // viendo un modal spinner mientras la IA trabaja ~20s.
        const params = {
          prompt: text,
          subject_name: subjectName.trim() || context?.subjectName || undefined,
          education_level: educationLevel,
          target_slides: targetSlides,
          tone,
          visual_density: density,
          theme_id: themeId,
          reference_material_ids: refIds.length > 0 ? refIds : undefined,
          class_id: context?.classId,
          class_ids: context?.classId ? [context.classId] : undefined,
          subject_id: context?.subjectId,
          calendar_event_id: context?.calendarEventId,
          topic_id: context?.topicId,
        };
        onClose();
        navigate('/tabs/presentations/new', { state: { params } });
        return;
      }

      if (meta.flow === 'textbook') {
        // Apuntes/libro requieren contexto de asignatura+clase: el pipeline
        // necesita derivar education_level del aula y usar el class_id para
        // ámbito. Si no hay contexto, avisamos.
        if (!context?.classId || !context?.subjectId) {
          toast.error(meta.requiresContextHint || 'Abre el Taller desde un tema o sesión.');
          setSubmitting(false);
          return;
        }
        const { id, batchJobId } = await generateTextbook({
          subject_id: context.subjectId,
          class_id: context.classId,
          enfoque: tbEnfoque,
          notas: text,
          target_pages: tbPages,
          exercises_per_chapter: tbExercises,
          examples_per_section: 2,
          visual_density: density,
          topic_id: context.topicId,
          calendar_event_id: context.calendarEventId,
        });
        const destination = '/tabs/calendar';
        if (batchJobId) {
          addBackgroundTask({
            type: 'textbook',
            label: deriveName(text),
            description: meta.progressCopy,
            batchJobId,
            expectedResultUrl: destination,
            execute: async () => destination,
          });
        }
        toast.success('Generación de apuntes iniciada — los verás en el tema cuando estén.');
        onClose();
        return;
      }

      // Examen / Ejercicio: en lugar de generar directamente, abrimos el
      // editor existente con el prompt pre-rellenado y el contexto que
      // tengamos (clase, asignatura, tema, fecha). El profesor revisa los
      // campos avanzados (dificultad, número de preguntas, formato, …) y
      // pulsa "Generar" en la pantalla completa de configuración.
      // Reutilizamos el mismo módulo de exámenes en lugar de duplicar UI.
      const params = new URLSearchParams();
      if (meta.purpose) params.set('purpose', meta.purpose);
      if (context?.topicId) params.set('topicIds', context.topicId);
      if (context?.date) params.set('date', context.date);
      const derivedName = deriveName(text);
      if (derivedName) params.set('name', derivedName);

      // Si tenemos clase + asignatura, vamos a la ruta scoped (preconfigura
      // automáticamente esos campos en el editor); si no, a la global.
      const base = (() => {
        if (context?.classId && context?.subjectId) {
          const scope = `/tabs/classes/${context.classId}/subjects/${context.subjectId}`;
          return meta.purpose === 'evaluation' ? `${scope}/exams/new` : `${scope}/exercises/new`;
        }
        return meta.purpose === 'evaluation' ? '/tabs/exams/new' : '/tabs/exercises/new';
      })();

      const destination = `${base}?${params.toString()}`;
      onClose();
      navigate(destination, { state: { prompt: text } });
      return;
    } catch (err: any) {
      console.error('[Taller] generate failed:', err);
      toast.error(err?.response?.data?.detail || 'No se ha podido iniciar la generación');
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Garantiza acceso seguro a los metadatos del tipo actual: si por alguna
  // race condition `type` quedara con un valor fuera del diccionario
  // (callers legacy pasando 'textbook' etc.), caemos a "presentation" en
  // lugar de romper el render con un TypeError.
  const currentMeta = TYPE_META[type] ?? TYPE_META.presentation;
  const isPresentation = type === 'presentation';
  const isTextbook = type === 'textbook';
  const groupsToShow: MaterialGroup[] = context?.limitTo ? [context.limitTo] : ['content', 'assessment'];
  const bodyClass = isPresentation ? 'taller__body taller__body--split' : 'taller__body';
  // Textbook necesita contexto (subject + class) para que la pipeline derive
  // education_level. Si falta, deshabilitamos el submit y avisamos.
  const textbookMissingContext = isTextbook && (!context?.classId || !context?.subjectId);

  const renderTypeSelector = () => (
    <div className="taller__step">
      <div className="taller__step-header">
        <span className="taller__step-num">1</span>
        <h3 className="taller__step-title">¿Qué quieres crear?</h3>
      </div>
      {groupsToShow.map((group) => {
        const types = TYPES_BY_GROUP[group];
        if (types.length === 0) return null;
        const groupMeta = GROUP_META[group];
        return (
          <div key={group}>
            {groupsToShow.length > 1 && (
              <div className="taller__label taller__label--inline">
                {groupMeta.label}
                <span className="taller__optional">· {groupMeta.hint}</span>
              </div>
            )}
            <div className="taller__types">
              {types.map((key) => {
                const meta = TYPE_META[key];
                const Icon = meta.icon;
                const active = type === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    className={`taller__type-card ${active ? 'taller__type-card--active' : ''}`}
                  >
                    <span className="taller__type-icon-wrap">
                      <Icon className="taller__type-icon" />
                    </span>
                    <span className="taller__type-text">
                      <span className="taller__type-label">{meta.label}</span>
                      <span className="taller__type-desc">{meta.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderPromptStep = () => (
    <div className="taller__step">
      <div className="taller__step-header">
        <span className="taller__step-num">2</span>
        <h3 className="taller__step-title">Descríbelo en una frase</h3>
      </div>
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={currentMeta.placeholder}
        className="taller__textarea"
        rows={4}
      />
      <span className="taller__hint">
        Pulsa <kbd>⌘</kbd>+<kbd>Enter</kbd> para crear · todo es editable después
      </span>
    </div>
  );

  const renderContextStep = () => (
    <div className="taller__step">
      <div className="taller__step-header">
        <span className="taller__step-num">3</span>
        <h3 className="taller__step-title">Contexto</h3>
      </div>
      <div className="taller__fields">
        <div className="taller__field">
          <label className="taller__label">Nivel</label>
          <Select value={educationLevel} onValueChange={setEducationLevel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EDUCATION_LEVELS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="taller__field">
          <label className="taller__label">
            Asignatura <span className="taller__optional">(opcional)</span>
          </label>
          <Input
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder="Ej.: Matemáticas"
          />
        </div>
      </div>
    </div>
  );

  const renderPresentationConfig = () => (
    <>
      <div className="taller__step">
        <div className="taller__step-header">
          <span className="taller__step-num">4</span>
          <h3 className="taller__step-title">Formato</h3>
        </div>
        <div className="taller__slider-block">
          <div className="taller__slider-row-header">
            <label className="taller__label">Número de slides</label>
            <span className="taller__slider-value">{targetSlides}</span>
          </div>
          <input
            className="taller__slider"
            type="range"
            min={4}
            max={20}
            value={targetSlides}
            onChange={(e) => setTargetSlides(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="taller__label taller__label--inline">Tono</label>
          <div className="taller__chips">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                className={`taller__chip ${tone === t.value ? 'taller__chip--active' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="taller__label taller__label--inline">Densidad visual</label>
          <div className="taller__chips">
            {DENSITIES.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDensity(d.value)}
                className={`taller__chip ${density === d.value ? 'taller__chip--active' : ''}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="taller__step">
        <div className="taller__step-header">
          <span className="taller__step-num">5</span>
          <h3 className="taller__step-title">Apariencia</h3>
        </div>
        <div>
          <label className="taller__label taller__label--inline">Tema visual</label>
          <div className="taller__themes">
            {THEME_LIST.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setThemeId(t.id)}
                className={`taller__theme ${themeId === t.id ? 'taller__theme--active' : ''}`}
              >
                <span className="taller__theme-swatch" style={{ background: t.coverBg || t.bg }}>
                  <span className="taller__theme-dot" style={{ background: t.accent }} />
                </span>
                <span className="taller__theme-meta">
                  <span className="taller__theme-label">{t.label}</span>
                  <span className="taller__theme-desc">{t.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="taller__label taller__label--inline">Logo del centro</label>
          <LogoUploader
            logoUrl={logoUrl}
            uploading={uploadingLogo}
            onUpload={handleLogoUpload}
          />
        </div>
        <div>
          <label className="taller__label taller__label--inline">
            Material de referencia <span className="taller__optional">(opcional)</span>
          </label>
          {refItems.length > 0 && (
            <div className="taller__refs-list">
              {refItems.map((it) => (
                <div key={it.id} className="taller__ref-item">
                  {it.type === 'presentation'
                    ? <PresentationIcon size={14} className="taller__ref-item__icon" />
                    : <BookOpen size={14} className="taller__ref-item__icon" />}
                  <span className="taller__ref-item__title">{it.title}</span>
                  <button
                    type="button"
                    className="taller__ref-item__remove"
                    onClick={() => {
                      setRefIds((xs) => xs.filter((x) => x !== it.id));
                      setRefItems((xs) => xs.filter((x) => x.id !== it.id));
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="taller__refs-add"
            onClick={() => setRefsPickerOpen(true)}
          >
            <Library size={12} />
            {refItems.length > 0 ? 'Editar referencias' : 'Usar otro material como referencia'}
          </button>
        </div>
      </div>
    </>
  );

  const renderTextbookConfig = () => (
    <div className="taller__step">
      <div className="taller__step-header">
        <span className="taller__step-num">4</span>
        <h3 className="taller__step-title">Formato</h3>
      </div>

      <div className="taller__slider-block">
        <div className="taller__slider-row-header">
          <label className="taller__label">Páginas aproximadas</label>
          <span className="taller__slider-value">{tbPages}</span>
        </div>
        <input
          className="taller__slider"
          type="range"
          min={4}
          max={120}
          step={2}
          value={tbPages}
          onChange={(e) => setTbPages(Number(e.target.value))}
        />
      </div>

      <div>
        <label className="taller__label taller__label--inline">Enfoque</label>
        <div className="taller__chips">
          <button
            type="button"
            onClick={() => setTbEnfoque('practico')}
            className={`taller__chip ${tbEnfoque === 'practico' ? 'taller__chip--active' : ''}`}
          >Práctico</button>
          <button
            type="button"
            onClick={() => setTbEnfoque('teorico')}
            className={`taller__chip ${tbEnfoque === 'teorico' ? 'taller__chip--active' : ''}`}
          >Teórico</button>
        </div>
      </div>

      <div>
        <label className="taller__label taller__label--inline">Densidad visual</label>
        <div className="taller__chips">
          {DENSITIES.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDensity(d.value)}
              className={`taller__chip ${density === d.value ? 'taller__chip--active' : ''}`}
            >{d.label}</button>
          ))}
        </div>
      </div>

      <div className="taller__slider-block">
        <div className="taller__slider-row-header">
          <label className="taller__label">Ejercicios por capítulo</label>
          <span className="taller__slider-value">{tbExercises}</span>
        </div>
        <input
          className="taller__slider"
          type="range"
          min={0}
          max={20}
          value={tbExercises}
          onChange={(e) => setTbExercises(Number(e.target.value))}
        />
      </div>

      {textbookMissingContext && (
        <p className="taller__hint" style={{ color: '#B45309' }}>
          {currentMeta.requiresContextHint || 'Abre el Taller desde un tema o sesión.'}
        </p>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      sheetHeight="full"
      dialogSize={isPresentation ? 'xl' : 'lg'}
      flush
      /* shadow-none elimina la sombra "shadow-lg" por defecto del Sheet
         de shadcn, que visualmente parecía un indicador de scroll arriba
         del modal cuando el Taller se abre como sheet en móvil. */
      className="!shadow-none"
    >
      <div className="taller">
        <div className="taller__header">
          <h2 className="taller__title">Crear material</h2>
          <p className="taller__subtitle">
            Descríbelo en una frase. Todo es editable después.
          </p>
        </div>

        <div className={bodyClass}>
          {isPresentation ? (
            <>
              {/* Columna izquierda */}
              <div className="taller__step" style={{ gap: 'var(--space-xl)' }}>
                {renderTypeSelector()}
                {renderPromptStep()}
                {renderContextStep()}
              </div>
              {/* Columna derecha */}
              <div className="taller__step" style={{ gap: 'var(--space-xl)' }}>
                {renderPresentationConfig()}
              </div>
            </>
          ) : isTextbook ? (
            <>
              {renderTypeSelector()}
              {renderPromptStep()}
              {renderContextStep()}
              {renderTextbookConfig()}
            </>
          ) : (
            <>
              {renderTypeSelector()}
              {renderPromptStep()}
              {renderContextStep()}
            </>
          )}
        </div>

        <div className="taller__footer">
          <button
            type="button"
            className="taller__submit"
            onClick={handleSubmit}
            disabled={!prompt.trim() || submitting || textbookMissingContext}
          >
            {submitting ? (
              <><Spinner size={16} /> Creando…</>
            ) : (
              <><Sparkles size={16} /> Crear {currentMeta.label.toLowerCase()}</>
            )}
          </button>
          <p className="taller__footnote">
            {context?.classId
              ? 'Se asociará a la clase desde la que lo estás creando.'
              : 'Se crea sin clase. Podrás asociarlo desde el editor.'}
          </p>
        </div>
      </div>

      <TallerReferencesPicker
        open={refsPickerOpen}
        onClose={() => setRefsPickerOpen(false)}
        selectedIds={refIds}
        onConfirm={(ids, items) => { setRefIds(ids); setRefItems(items); }}
        classId={context?.classId}
      />
    </Modal>
  );
};

export default TallerDialog;
