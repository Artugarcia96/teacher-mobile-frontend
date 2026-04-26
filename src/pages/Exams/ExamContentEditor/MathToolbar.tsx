import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sigma, ChevronDown, Omega, Grid3x3 } from 'lucide-react';

/**
 * Math-insertion toolbar for the enunciado textarea.
 *
 * Three surfaces (each a popover whose `onOpenAutoFocus` is cancelled so the
 * parent textarea retains focus — otherwise Radix moves focus into the
 * popover content, which triggers the textarea's `onBlur` and unmounts the
 * whole toolbar mid-click).
 *
 * 1. Quick row: highest-frequency Unicode (one tap inserts).
 * 2. Ω  Símbolos: Greek + relations + arrows + set notation, grouped grids.
 * 3. ▦  Matriz:   Word-style grid picker (rows × cols) with bracket type.
 * 4. Σ  Fórmulas: a handful of LaTeX templates (fracción, raíz, integral…).
 */

interface MathToolbarProps {
  onInsert: (text: string, caretBack?: number) => void;
}

// ── Quick Unicode — one-tap, no LaTeX needed ─────────────────────────────
const QUICK_SYMBOLS: { sym: string; label?: string }[] = [
  { sym: '×' }, { sym: '÷' }, { sym: '·' },
  { sym: '²' }, { sym: '³' }, { sym: '°' },
  { sym: 'π' }, { sym: '√', label: 'raíz inline' },
  { sym: '≤' }, { sym: '≥' }, { sym: '≠' },
  { sym: '±' }, { sym: '∞' },
];

// ── Extra Unicode symbols (popover) ──────────────────────────────────────
interface SymbolGroup {
  title: string;
  items: { sym: string; label: string }[];
}

const EXTRA_SYMBOLS: SymbolGroup[] = [
  {
    title: 'Letras griegas (minúsculas)',
    items: [
      { sym: 'α', label: 'alpha' },   { sym: 'β', label: 'beta' },    { sym: 'γ', label: 'gamma' },
      { sym: 'δ', label: 'delta' },   { sym: 'ε', label: 'epsilon' }, { sym: 'ζ', label: 'zeta' },
      { sym: 'η', label: 'eta' },     { sym: 'θ', label: 'theta' },   { sym: 'λ', label: 'lambda' },
      { sym: 'μ', label: 'mu' },      { sym: 'ν', label: 'nu' },      { sym: 'ξ', label: 'xi' },
      { sym: 'π', label: 'pi' },      { sym: 'ρ', label: 'rho' },     { sym: 'σ', label: 'sigma' },
      { sym: 'τ', label: 'tau' },     { sym: 'φ', label: 'phi' },     { sym: 'ψ', label: 'psi' },
      { sym: 'ω', label: 'omega' },
    ],
  },
  {
    title: 'Letras griegas (mayúsculas)',
    items: [
      { sym: 'Γ', label: 'Gamma' }, { sym: 'Δ', label: 'Delta' }, { sym: 'Θ', label: 'Theta' },
      { sym: 'Λ', label: 'Lambda' }, { sym: 'Π', label: 'Pi' }, { sym: 'Σ', label: 'Sigma' },
      { sym: 'Φ', label: 'Phi' }, { sym: 'Ψ', label: 'Psi' }, { sym: 'Ω', label: 'Omega' },
    ],
  },
  {
    title: 'Relaciones y flechas',
    items: [
      { sym: '≈', label: 'aprox.' }, { sym: '≡', label: 'equivalente' }, { sym: '∝', label: 'proporcional' },
      { sym: '≪', label: 'mucho menor' }, { sym: '≫', label: 'mucho mayor' },
      { sym: '→', label: 'derecha' }, { sym: '←', label: 'izquierda' }, { sym: '↔', label: 'biyección' },
      { sym: '⇒', label: 'implica' }, { sym: '⇔', label: 'si y solo si' }, { sym: '↦', label: 'mapsto' },
    ],
  },
  {
    title: 'Conjuntos y lógica',
    items: [
      { sym: '∈', label: 'pertenece' }, { sym: '∉', label: 'no pertenece' },
      { sym: '⊂', label: 'subconjunto' }, { sym: '⊆', label: 'subconjunto o igual' },
      { sym: '∪', label: 'unión' }, { sym: '∩', label: 'intersección' }, { sym: '∅', label: 'vacío' },
      { sym: 'ℕ', label: 'naturales' }, { sym: 'ℤ', label: 'enteros' }, { sym: 'ℚ', label: 'racionales' },
      { sym: 'ℝ', label: 'reales' }, { sym: 'ℂ', label: 'complejos' },
      { sym: '∀', label: 'para todo' }, { sym: '∃', label: 'existe' },
      { sym: '∧', label: 'y (and)' }, { sym: '∨', label: 'o (or)' }, { sym: '¬', label: 'no (not)' },
    ],
  },
  {
    title: 'Geometría',
    items: [
      { sym: '∠', label: 'ángulo' }, { sym: '∡', label: 'ángulo medido' },
      { sym: '∥', label: 'paralelo a' }, { sym: '⊥', label: 'perpendicular a' },
      { sym: '△', label: 'triángulo' }, { sym: '□', label: 'cuadrado / paralelogramo' },
      { sym: '⌒', label: 'arco' }, { sym: '≅', label: 'congruente' },
      { sym: '~', label: 'semejante' }, { sym: '°', label: 'grado' },
      { sym: '′', label: 'minuto / prima' }, { sym: '″', label: 'segundo / doble prima' },
    ],
  },
];

// ── LaTeX templates (simplified — matrices/systems moved to MatrixPicker) ─
interface Template {
  label: string;
  preview: string;
  insert: string;
  caretBack: number;
}

const TEMPLATES: Template[] = [
  // Básico — primaria / ESO / todos
  { label: 'Fracción',       preview: 'a⁄b', insert: '$\\frac{a}{b}$',       caretBack: 5 },
  { label: 'Exponente',      preview: 'a^n', insert: '$a^{n}$',              caretBack: 3 },
  { label: 'Subíndice',      preview: 'a₁',  insert: '$a_{1}$',              caretBack: 3 },
  { label: 'Raíz',           preview: '√a',  insert: '$\\sqrt{a}$',          caretBack: 3 },
  { label: 'Raíz n-sima',    preview: 'ⁿ√a', insert: '$\\sqrt[n]{a}$',       caretBack: 3 },
  { label: 'Valor absoluto', preview: '|a|', insert: '$\\lvert a \\rvert$',  caretBack: 9 },
  // Trig & logaritmos — ESO superior / Bachillerato
  { label: 'Seno',           preview: 'sin', insert: '$\\sin(x)$',           caretBack: 3 },
  { label: 'Coseno',         preview: 'cos', insert: '$\\cos(x)$',           caretBack: 3 },
  { label: 'Tangente',       preview: 'tan', insert: '$\\tan(x)$',           caretBack: 3 },
  { label: 'Logaritmo',      preview: 'logₐ', insert: '$\\log_{b}(x)$',      caretBack: 6 },
  // Cálculo — Bachillerato / Universidad
  { label: 'Integral',       preview: '∫',   insert: '$\\int_{a}^{b} f(x)\\, dx$', caretBack: 16 },
  { label: 'Derivada',       preview: 'd/dx', insert: '$\\dfrac{d}{dx}\\left( f(x) \\right)$', caretBack: 14 },
  { label: 'Límite',         preview: 'lim', insert: '$\\lim_{x \\to a} f(x)$',    caretBack: 9 },
  { label: 'Sumatorio',      preview: 'Σ',   insert: '$\\sum_{i=1}^{n} a_i$',      caretBack: 6 },
  // Accents — estadística / física
  { label: 'Vector',         preview: 'v⃗',   insert: '$\\vec{v}$',            caretBack: 3 },
  { label: 'Media (barra)',  preview: 'x̄',   insert: '$\\bar{x}$',            caretBack: 3 },
];

// ── Matrix picker — Word-style grid ──────────────────────────────────────

type MatrixKind = 'pmatrix' | 'bmatrix' | 'vmatrix' | 'cases';

const MATRIX_KINDS: { value: MatrixKind; label: string; preview: string; title: string }[] = [
  { value: 'pmatrix', label: '(  )', preview: '( )', title: 'Paréntesis' },
  { value: 'bmatrix', label: '[  ]', preview: '[ ]', title: 'Corchetes' },
  { value: 'vmatrix', label: '| |',  preview: '|·|', title: 'Determinante' },
  { value: 'cases',   label: '{',    preview: '{',   title: 'Sistema de ecuaciones' },
];

const MATRIX_MAX = 6;

function buildMatrixLatex(kind: MatrixKind, rows: number, cols: number): { text: string; caretBack: number } {
  if (kind === 'cases') {
    // System of equations: N rows, one expression per row.
    const body = Array.from({ length: rows }, () => ' ').join(' \\\\ ');
    const text = `$\\begin{cases} ${body} \\end{cases}$`;
    // Caret lands on the first row's empty slot.
    const preLen = '$\\begin{cases} '.length;
    const caretBack = text.length - preLen;
    return { text, caretBack };
  }
  const rowStrs = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ' ').join(' & '),
  );
  const body = rowStrs.join(' \\\\ ');
  const text = `$\\begin{${kind}} ${body} \\end{${kind}}$`;
  const preLen = `$\\begin{${kind}} `.length;
  const caretBack = text.length - preLen;
  return { text, caretBack };
}

const MatrixPicker: React.FC<{
  onInsert: (text: string, caretBack?: number) => void;
  onClose: () => void;
}> = ({ onInsert, onClose }) => {
  const [kind, setKind] = useState<MatrixKind>('pmatrix');
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  const isCases = kind === 'cases';
  const cols = isCases ? 1 : MATRIX_MAX;

  const pick = (r: number, c: number) => {
    const { text, caretBack } = buildMatrixLatex(kind, r, isCases ? 1 : c);
    onInsert(text, caretBack);
    onClose();
  };

  return (
    <div className="space-y-3">
      {/* Type selector */}
      <div>
        <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Tipo
        </div>
        <div className="flex gap-1">
          {MATRIX_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              title={k.title}
              onMouseDown={(e) => {
                e.preventDefault();
                setKind(k.value);
                setHover(null);
              }}
              className={`flex-1 h-9 rounded border transition-colors font-serif text-base
                ${kind === k.value
                  ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                  : 'border-border text-foreground hover:bg-accent'}`}
            >
              {k.preview}
            </button>
          ))}
        </div>
      </div>

      {/* Size grid */}
      <div>
        <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex justify-between">
          <span>{isCases ? 'Filas' : 'Filas × columnas'}</span>
          <span className="text-foreground font-semibold">
            {hover ? `${hover.r} × ${isCases ? 1 : hover.c}` : '—'}
          </span>
        </div>
        <div
          className="inline-grid gap-0.5 p-1 bg-muted/40 rounded border border-border"
          style={{ gridTemplateColumns: `repeat(${cols}, 1.4rem)` }}
          onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: MATRIX_MAX * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const filled = !!hover && r < hover.r && c < hover.c;
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                onMouseDown={(e) => { e.preventDefault(); pick(r + 1, c + 1); }}
                className={`w-5 h-5 rounded-[3px] border transition-colors
                  ${filled
                    ? 'bg-indigo-500 border-indigo-600'
                    : 'bg-background border-border hover:border-indigo-400'}`}
              />
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground leading-tight">
        Pasa el ratón por la cuadrícula para elegir el tamaño y haz click para insertar.
      </p>
    </div>
  );
};

// ── Shared popover props to keep focus on the parent textarea ────────────
// Without these, opening the popover moves focus into the popover, which
// fires the textarea's onBlur → exits edit mode → unmounts the toolbar
// mid-interaction (user-visible symptom: "the window closes when I click").
const keepFocusProps = {
  onOpenAutoFocus: (e: Event) => e.preventDefault(),
  onCloseAutoFocus: (e: Event) => e.preventDefault(),
} as const;

// ── Main toolbar ─────────────────────────────────────────────────────────

const MathToolbar: React.FC<MathToolbarProps> = ({ onInsert }) => {
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1 rounded-md border border-border bg-muted/30">
      {QUICK_SYMBOLS.map(({ sym, label }) => (
        <button
          key={sym}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onInsert(sym); }}
          className="inline-flex items-center justify-center w-7 h-7 rounded text-sm font-medium hover:bg-accent transition-colors"
          title={label || sym}
        >
          {sym}
        </button>
      ))}

      <div className="w-px h-5 bg-border mx-1" />

      {/* Símbolos — griegas, relaciones, flechas, conjuntos */}
      <Popover open={symbolsOpen} onOpenChange={setSymbolsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs font-medium hover:bg-accent transition-colors"
            title="Símbolos (griegas, flechas, relaciones…)"
          >
            <Omega size={13} />
            <span className="hidden sm:inline">símbolos</span>
            <ChevronDown size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={8}
          className="w-[min(320px,calc(100vw-1rem))] p-2 max-h-[60vh] overflow-y-auto"
          {...keepFocusProps}
        >
          {EXTRA_SYMBOLS.map((group) => (
            <div key={group.title} className="mb-3 last:mb-0">
              <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {group.items.map((item) => (
                  <button
                    key={item.sym}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); onInsert(item.sym); }}
                    title={item.label}
                    className="inline-flex items-center justify-center w-9 h-9 rounded text-base hover:bg-accent transition-colors font-serif"
                  >
                    {item.sym}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-1 px-1 text-[10px] text-muted-foreground leading-tight">
            Pulsa para insertar. La ventana se queda abierta para encadenar varios.
          </p>
        </PopoverContent>
      </Popover>

      {/* Matriz — grid picker like Word's */}
      <Popover open={matrixOpen} onOpenChange={setMatrixOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs font-medium hover:bg-accent transition-colors"
            title="Matriz, determinante o sistema de ecuaciones"
          >
            <Grid3x3 size={13} />
            <span className="hidden sm:inline">matriz</span>
            <ChevronDown size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={8}
          className="w-auto p-2"
          {...keepFocusProps}
        >
          <MatrixPicker onInsert={onInsert} onClose={() => setMatrixOpen(false)} />
        </PopoverContent>
      </Popover>

      {/* Fórmulas — small set of LaTeX templates */}
      <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs font-medium hover:bg-accent transition-colors"
            title="Plantillas: fracción, raíz, integral…"
          >
            <Sigma size={13} />
            <span className="hidden sm:inline">fórmulas</span>
            <ChevronDown size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={4}
          collisionPadding={8}
          className="w-[min(300px,calc(100vw-1rem))] p-2 max-h-[60vh] overflow-y-auto"
          {...keepFocusProps}
        >
          <div className="grid grid-cols-3 gap-1">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onInsert(t.insert, t.caretBack);
                  setTemplatesOpen(false);
                }}
                className="flex flex-col items-center justify-center h-14 p-1 rounded hover:bg-accent transition-colors text-center"
                title={t.label}
              >
                <span className="text-[0.95rem] font-serif leading-none">{t.preview}</span>
                <span className="mt-1 text-[9.5px] leading-tight text-muted-foreground line-clamp-1">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 px-1 text-[10px] text-muted-foreground leading-tight">
            Inserta una plantilla lista para rellenar.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default MathToolbar;
