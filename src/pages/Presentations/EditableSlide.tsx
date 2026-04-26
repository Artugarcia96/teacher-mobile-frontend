import { useState } from 'react';
import {
  Trash2, Plus, Copy, ArrowUp, ArrowDown, Type, List as ListIcon, Quote, BarChart3,
  Info, Lightbulb, Sparkles, AlertTriangle, Target, StickyNote, LayoutGrid,
} from 'lucide-react';
import type { Block, CalloutVariant, Slide } from '../../types/presentations';
import type { SlideThemeTokens } from '../../components/slides/themes';
import { slideThemeToDiagramOverride } from '../../components/slides/themes';
import { useLogicalCanvas } from '../../components/slides/useLogicalCanvas';
import DiagramRenderer from '../../components/diagrams/DiagramRenderer';
import EquationBlock from '../../components/slides/blocks/EquationBlock';
import CodeBlock from '../../components/slides/blocks/CodeBlock';
import TableBlock from '../../components/slides/blocks/TableBlock';
import MermaidBlock from '../../components/slides/blocks/MermaidBlock';
import InlineText from './InlineText';

interface Props {
  slide: Slide;
  index: number;
  total: number;
  theme: SlideThemeTokens;
  logoUrl?: string | null;
  onUpdate: (patch: Partial<Slide>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (delta: -1 | 1) => void;
  onInsertAfter: () => void;
}

const EditableSlide: React.FC<Props> = ({ slide, index, total, theme, logoUrl, onUpdate, onDelete, onDuplicate, onMove, onInsertAfter }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { frameRef } = useLogicalCanvas<HTMLDivElement>();

  const setBlock = (i: number, patch: Partial<Block>) => {
    const blocks = slide.blocks.map((b, j) => (j === i ? ({ ...b, ...patch } as Block) : b));
    onUpdate({ blocks });
  };
  const removeBlock = (i: number) => {
    onUpdate({ blocks: slide.blocks.filter((_, j) => j !== i) });
  };
  const addBlock = (kind: Block['kind']) => {
    const fresh: Block = (() => {
      switch (kind) {
        case 'heading':   return { kind: 'heading', text: 'Nuevo título' };
        case 'paragraph': return { kind: 'paragraph', text: 'Escribe aquí…' };
        case 'bullets':   return { kind: 'bullets', items: ['Punto 1', 'Punto 2'] };
        case 'quote':     return { kind: 'quote', text: 'Una cita…' };
        case 'stat':      return { kind: 'stat', value: '95%', label: 'Indicador' };
        case 'callout':   return { kind: 'callout', variant: 'tip', title: 'Consejo', text: 'Texto del callout…' };
        case 'cards':     return { kind: 'cards', items: [
          { title: 'Tarjeta 1', text: 'Descripción…', tone: 'primary' },
          { title: 'Tarjeta 2', text: 'Descripción…', tone: 'accent' },
        ] };
        default:          return { kind: 'paragraph', text: '…' };
      }
    })();
    onUpdate({ blocks: [...slide.blocks, fresh] });
  };

  const bg = slide.layout === 'cover' ? (theme.coverBg || theme.bg)
           : slide.layout === 'section' ? (theme.sectionBg || theme.bg)
           : theme.bg;
  const color = slide.layout === 'cover' ? (theme.coverText || theme.text)
             : slide.layout === 'section' ? (theme.sectionText || theme.text)
             : theme.text;

  const frameStyle: React.CSSProperties = {
    background: bg,
    color,
    fontFamily: theme.fontFamily,
    ['--slide-border' as any]: theme.border,
    ['--slide-primary' as any]: theme.primary,
    ['--slide-accent' as any]: theme.accent,
    ['--slide-text-muted' as any]: theme.textMuted,
    ['--slide-font-display' as any]: theme.fontFamilyDisplay || theme.fontFamily || 'inherit',
    ['--slide-title-weight' as any]: theme.titleWeight ?? 700,
  };

  // Decoración ambiental igual que en SlideRenderer (mismo tratamiento visual
  // en el editor que en modo presentación).
  const decoration = (() => {
    if (slide.layout === 'cover') {
      switch (theme.coverDecoration) {
        case 'orb':
          return <div className="slide-decoration slide-decoration--orb" aria-hidden />;
        case 'grid':
          return <div className="slide-decoration slide-decoration--grid" aria-hidden />;
        case 'stripe':
          return <div className="slide-decoration slide-decoration--stripe" aria-hidden />;
        default:
          return null;
      }
    }
    if (slide.layout === 'content' && theme.pattern) {
      return (
        <div
          className="slide-decoration slide-decoration--pattern"
          aria-hidden
          style={{ backgroundImage: theme.pattern }}
        />
      );
    }
    return null;
  })();

  return (
    <div className="editable-slide-wrap" id={`slide-${slide.id}`}>
      <div className="slide-frame editable-slide-frame" style={frameStyle} ref={frameRef}>
        <div className="slide-canvas">
          {decoration}
          <SlideBody slide={slide} theme={theme} onUpdate={onUpdate} setBlock={setBlock} removeBlock={removeBlock} />
          {logoUrl && slide.layout !== 'cover' && (
            <img
              src={`${import.meta.env.VITE_API_URL || ''}/files${logoUrl.replace('/uploads', '')}`}
              alt=""
              className="slide-logo"
              aria-hidden
            />
          )}
          {slide.layout !== 'cover' && (
            <span className="slide-page-indicator" style={{ color: theme.textMuted }}>
              {index + 1} / {total}
            </span>
          )}
        </div>
      </div>

      {/* Acciones flotantes a la derecha */}
      <div className="editable-slide-actions" onMouseLeave={() => setMenuOpen(false)}>
        <button title="Subir" onClick={() => onMove(-1)} disabled={index === 0}>
          <ArrowUp size={14} />
        </button>
        <button title="Bajar" onClick={() => onMove(1)} disabled={index === total - 1}>
          <ArrowDown size={14} />
        </button>
        <button title="Duplicar" onClick={onDuplicate}>
          <Copy size={14} />
        </button>
        {slide.layout === 'content' && (
          <div className="editable-slide-add">
            <button title="Añadir bloque" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
              <Plus size={14} />
            </button>
            {menuOpen && (
              <div className="editable-slide-add-menu">
                <button onClick={() => { addBlock('heading'); setMenuOpen(false); }}><Type size={12} /> Título</button>
                <button onClick={() => { addBlock('paragraph'); setMenuOpen(false); }}><Type size={12} /> Párrafo</button>
                <button onClick={() => { addBlock('bullets'); setMenuOpen(false); }}><ListIcon size={12} /> Lista</button>
                <button onClick={() => { addBlock('quote'); setMenuOpen(false); }}><Quote size={12} /> Cita</button>
                <button onClick={() => { addBlock('stat'); setMenuOpen(false); }}><BarChart3 size={12} /> Stat</button>
                <button onClick={() => { addBlock('callout'); setMenuOpen(false); }}><Lightbulb size={12} /> Callout</button>
                <button onClick={() => { addBlock('cards'); setMenuOpen(false); }}><LayoutGrid size={12} /> Tarjetas</button>
              </div>
            )}
          </div>
        )}
        <button title="Eliminar slide" onClick={onDelete} className="danger">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Separador con botón de insertar entre slides */}
      <button className="editable-slide-insert" title="Insertar slide aquí" onClick={onInsertAfter}>
        <Plus size={14} />
        <span>Insertar slide</span>
      </button>
    </div>
  );
};

/* ─── Cuerpo del slide por layout (usa clases escaladas de slides.css) ── */

const SlideBody: React.FC<{
  slide: Slide;
  theme: SlideThemeTokens;
  onUpdate: (patch: Partial<Slide>) => void;
  setBlock: (i: number, patch: Partial<Block>) => void;
  removeBlock: (i: number) => void;
}> = ({ slide, theme, onUpdate, setBlock, removeBlock }) => {
  if (slide.layout === 'cover') {
    return (
      <div className="slide-body slide-body--cover">
        <InlineText
          value={slide.title || ''}
          onChange={(v) => onUpdate({ title: v })}
          placeholder="Título"
          as="h1"
          multiline
          className="slide-title-xl"
        />
        <InlineText
          value={slide.subtitle || ''}
          onChange={(v) => onUpdate({ subtitle: v || undefined })}
          placeholder="Subtítulo (opcional)"
          as="p"
          suppressEmpty
          className="slide-subtitle-xl"
        />
      </div>
    );
  }

  if (slide.layout === 'section') {
    return (
      <div className="slide-body slide-body--section">
        <span className="slide-eyebrow">Sección</span>
        <InlineText
          value={slide.title || ''}
          onChange={(v) => onUpdate({ title: v })}
          placeholder="Título de sección"
          as="h2"
          multiline
          className="slide-title-section"
        />
      </div>
    );
  }

  if (slide.layout === 'closing') {
    return (
      <div className="slide-body slide-body--closing">
        <InlineText
          value={slide.title || ''}
          onChange={(v) => onUpdate({ title: v })}
          placeholder="Mensaje final"
          as="h2"
          multiline
          className="slide-title-section"
        />
        <InlineText
          value={slide.subtitle || ''}
          onChange={(v) => onUpdate({ subtitle: v || undefined })}
          placeholder="Subtítulo (opcional)"
          as="p"
          suppressEmpty
          className="slide-subtitle-xl"
        />
      </div>
    );
  }

  // content — variante visual según layout_template
  return renderContentVariant({ slide, theme, onUpdate, setBlock, removeBlock });
};

/* ─── Dispatcher de variantes editables (espejo de SlideRenderer) ── */

interface VariantArgs {
  slide: Slide;
  theme: SlideThemeTokens;
  onUpdate: (patch: Partial<Slide>) => void;
  setBlock: (i: number, patch: Partial<Block>) => void;
  removeBlock: (i: number) => void;
}

function renderContentVariant(args: VariantArgs): React.ReactElement {
  const tpl = args.slide.layout_template;
  switch (tpl) {
    case 'stat_spotlight':
      if (args.slide.blocks.some((b) => b.kind === 'stat')) return <EditableStatHero {...args} />;
      break;
    case 'quote_spotlight':
      if (args.slide.blocks.some((b) => b.kind === 'quote')) return <EditableQuoteHero {...args} />;
      break;
    case 'full_bleed_diagram':
      if (args.slide.blocks.some((b) => b.kind === 'diagram')) return <EditableDiagramBleed {...args} />;
      break;
    case 'split_text_visual':
      if (hasTextAndVisual(args.slide.blocks)) return <EditableSplit {...args} />;
      break;
    case 'cards_row':
      if (args.slide.blocks.some((b) => b.kind === 'cards')) return <EditableCardsHero {...args} />;
      break;
    case 'comparison_duo':
      if (canRenderDuo(args.slide.blocks)) return <EditableDuo {...args} />;
      break;
    case 'numbered_list':
      if (args.slide.blocks.some((b) => b.kind === 'bullets' || b.kind === 'cards')) return <EditableNumbered {...args} />;
      break;
  }
  return <EditableTitleStack {...args} />;
}

function hasTextAndVisual(blocks: Block[]): boolean {
  const visualKinds: Block['kind'][] = ['diagram', 'stat'];
  const textKinds: Block['kind'][] = ['paragraph', 'bullets', 'callout', 'heading'];
  return blocks.some((b) => visualKinds.includes(b.kind)) && blocks.some((b) => textKinds.includes(b.kind));
}

function canRenderDuo(blocks: Block[]): boolean {
  const cards = blocks.find((b) => b.kind === 'cards') as Extract<Block, { kind: 'cards' }> | undefined;
  if (cards && cards.items.length >= 2) return true;
  return blocks.filter((b) => b.kind !== 'diagram').length >= 2;
}

const InlineTitle: React.FC<{ slide: Slide; theme: SlideThemeTokens; onUpdate: (p: Partial<Slide>) => void; centered?: boolean; small?: boolean }> = ({ slide, theme, onUpdate, centered, small }) => (
  <InlineText
    value={slide.title || ''}
    onChange={(v) => onUpdate({ title: v })}
    placeholder="Título del slide"
    as="h2"
    className="slide-title-content"
    style={{
      color: theme.primary,
      ...(centered ? { textAlign: 'center' } : {}),
      ...(small ? { fontSize: '30px' } : {}),
    }}
  />
);

/* ── Variante: vertical stack genérico (default) ─────────────── */
const EditableTitleStack: React.FC<VariantArgs> = ({ slide, theme, onUpdate, setBlock, removeBlock }) => (
  <div className="slide-body slide-body--content">
    <InlineTitle slide={slide} theme={theme} onUpdate={onUpdate} />
    <div className="slide-blocks">
      {slide.blocks.map((b, i) => (
        <EditableBlock key={i} block={b} theme={theme} onChange={(patch) => setBlock(i, patch)} onRemove={() => removeBlock(i)} />
      ))}
      {slide.blocks.length === 0 && (
        <div className="slide-text-sm" style={{ opacity: 0.55, fontStyle: 'italic' }}>
          Usa el botón + a la derecha para añadir bloques.
        </div>
      )}
    </div>
  </div>
);

/* ── Variante: stat hero (cifra GIGANTE) ─────────────────────── */
const EditableStatHero: React.FC<VariantArgs> = ({ slide, theme, onUpdate, setBlock, removeBlock }) => {
  const statIdx = slide.blocks.findIndex((b) => b.kind === 'stat');
  const stat = slide.blocks[statIdx] as Extract<Block, { kind: 'stat' }>;
  const leftover = slide.blocks.map((b, i) => ({ b, i })).filter((x) => x.i !== statIdx);
  return (
    <div className="slide-body slide-body--stat-hero">
      <InlineTitle slide={slide} theme={theme} onUpdate={onUpdate} small />
      <div>
        <InlineText
          value={stat.value}
          onChange={(v) => setBlock(statIdx, { value: v } as Partial<Block>)}
          as="div"
          className="slide-stat-hero-value"
        />
        <InlineText
          value={stat.label}
          onChange={(v) => setBlock(statIdx, { label: v } as Partial<Block>)}
          as="div"
          multiline
          className="slide-stat-hero-label"
        />
      </div>
      {leftover.length > 0 && (
        <div className="stat-hero-aside" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {leftover.map(({ b, i }) => (
            <EditableBlock key={i} block={b} theme={theme} onChange={(patch) => setBlock(i, patch)} onRemove={() => removeBlock(i)} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Variante: quote hero ────────────────────────────────────── */
const EditableQuoteHero: React.FC<VariantArgs> = ({ slide, theme, setBlock }) => {
  const quoteIdx = slide.blocks.findIndex((b) => b.kind === 'quote');
  const quote = slide.blocks[quoteIdx] as Extract<Block, { kind: 'quote' }>;
  return (
    <div className="slide-body slide-body--quote-hero">
      <svg className="slide-quote-hero-mark" viewBox="0 0 64 44" width="64" height="44" aria-hidden style={{ overflow: 'visible' }}>
        <g fill="currentColor">
          <path d="M 4 4 C 4 2, 6 0, 10 0 L 18 0 C 22 0, 24 2, 24 6 L 24 18 C 24 26, 19 32, 8 36 L 6 30 C 12 28, 16 25, 16 20 L 10 20 C 6 20, 4 18, 4 14 Z" />
          <path d="M 32 4 C 32 2, 34 0, 38 0 L 46 0 C 50 0, 52 2, 52 6 L 52 18 C 52 26, 47 32, 36 36 L 34 30 C 40 28, 44 25, 44 20 L 38 20 C 34 20, 32 18, 32 14 Z" />
        </g>
      </svg>
      <InlineText
        value={quote.text}
        onChange={(v) => setBlock(quoteIdx, { text: v } as Partial<Block>)}
        as="div"
        multiline
        className="slide-quote-hero-text"
        placeholder="Escribe la cita…"
      />
      <InlineText
        value={quote.author || ''}
        onChange={(v) => setBlock(quoteIdx, { author: v || undefined } as Partial<Block>)}
        as="div"
        className="slide-quote-hero-author"
        placeholder="Autor"
        suppressEmpty
      />
      {/* Quitamos el title en quote-hero porque el patrón visual NO usa
          título — la cita ES el contenido. Si el slide tiene título, lo
          ignoramos en esta variante. */}
    </div>
  );
};

/* ── Variante: full-bleed diagram ────────────────────────────── */
const EditableDiagramBleed: React.FC<VariantArgs> = ({ slide, theme, onUpdate, setBlock, removeBlock }) => {
  const diagramIdx = slide.blocks.findIndex((b) => b.kind === 'diagram');
  const diagram = slide.blocks[diagramIdx];
  return (
    <div className="slide-body slide-body--diagram-bleed">
      <InlineTitle slide={slide} theme={theme} onUpdate={onUpdate} small />
      <div className="bleed-stage">
        {diagram && (
          <EditableBlock block={diagram} theme={theme} onChange={(patch) => setBlock(diagramIdx, patch)} onRemove={() => removeBlock(diagramIdx)} />
        )}
      </div>
    </div>
  );
};

/* ── Variante: split (texto izq + visual dcha) ───────────────── */
const EditableSplit: React.FC<VariantArgs> = ({ slide, theme, onUpdate, setBlock, removeBlock }) => {
  const visualKinds: Block['kind'][] = ['diagram', 'stat'];
  const textKinds: Block['kind'][] = ['paragraph', 'bullets', 'callout', 'heading'];
  const textIdx = slide.blocks.findIndex((b) => textKinds.includes(b.kind));
  const visualIdx = slide.blocks.findIndex((b) => visualKinds.includes(b.kind));
  const text = slide.blocks[textIdx];
  const visual = slide.blocks[visualIdx];
  return (
    <div className="slide-body slide-body--split">
      <InlineTitle slide={slide} theme={theme} onUpdate={onUpdate} />
      <div className="split-grid">
        <div className="split-text">
          {text && (
            <EditableBlock block={text} theme={theme} onChange={(patch) => setBlock(textIdx, patch)} onRemove={() => removeBlock(textIdx)} />
          )}
        </div>
        <div className="split-visual">
          {visual && (
            <EditableBlock block={visual} theme={theme} onChange={(patch) => setBlock(visualIdx, patch)} onRemove={() => removeBlock(visualIdx)} />
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Variante: cards centradas con título centrado ──────────── */
const EditableCardsHero: React.FC<VariantArgs> = ({ slide, theme, onUpdate, setBlock, removeBlock }) => {
  const cardsIdx = slide.blocks.findIndex((b) => b.kind === 'cards');
  const cards = slide.blocks[cardsIdx];
  return (
    <div className="slide-body slide-body--cards-hero">
      <InlineTitle slide={slide} theme={theme} onUpdate={onUpdate} centered />
      <div className="cards-hero-stage">
        {cards && (
          <EditableBlock block={cards} theme={theme} onChange={(patch) => setBlock(cardsIdx, patch)} onRemove={() => removeBlock(cardsIdx)} />
        )}
      </div>
    </div>
  );
};

/* ── Variante: duo (2 columnas comparación) ─────────────────── */
const EditableDuo: React.FC<VariantArgs> = ({ slide, theme, onUpdate, setBlock, removeBlock }) => {
  const cardsIdx = slide.blocks.findIndex((b) => b.kind === 'cards');
  const cards = slide.blocks[cardsIdx] as Extract<Block, { kind: 'cards' }> | undefined;

  // Renderizamos como 2 cards block (cada uno con 1 item)
  if (cards && cards.items.length >= 2) {
    const setHalf = (which: 0 | 1) => (patch: Partial<Block>) => {
      // Si el patch es a items, mergeamos correctamente; si es a kind, también
      const newItems = [...cards.items];
      const patchItems = (patch as any).items;
      if (Array.isArray(patchItems) && patchItems[0]) {
        newItems[which] = patchItems[0];
      }
      setBlock(cardsIdx, { items: newItems } as Partial<Block>);
    };
    return (
      <div className="slide-body slide-body--duo">
        <InlineTitle slide={slide} theme={theme} onUpdate={onUpdate} />
        <div className="duo-grid">
          <div className="duo-col">
            <EditableBlock
              block={{ kind: 'cards', items: [cards.items[0]] }}
              theme={theme}
              onChange={setHalf(0)}
              onRemove={() => {
                const newItems = cards.items.filter((_, i) => i !== 0);
                setBlock(cardsIdx, { items: newItems } as Partial<Block>);
              }}
            />
          </div>
          <div className="duo-col">
            <EditableBlock
              block={{ kind: 'cards', items: [cards.items[1]] }}
              theme={theme}
              onChange={setHalf(1)}
              onRemove={() => {
                const newItems = cards.items.filter((_, i) => i !== 1);
                setBlock(cardsIdx, { items: newItems } as Partial<Block>);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const others = slide.blocks.map((b, i) => ({ b, i })).filter((x) => x.b.kind !== 'diagram');
  const left = others[0];
  const right = others[1];
  return (
    <div className="slide-body slide-body--duo">
      <InlineTitle slide={slide} theme={theme} onUpdate={onUpdate} />
      <div className="duo-grid">
        <div className="duo-col">
          {left && <EditableBlock block={left.b} theme={theme} onChange={(patch) => setBlock(left.i, patch)} onRemove={() => removeBlock(left.i)} />}
        </div>
        <div className="duo-col">
          {right && <EditableBlock block={right.b} theme={theme} onChange={(patch) => setBlock(right.i, patch)} onRemove={() => removeBlock(right.i)} />}
        </div>
      </div>
    </div>
  );
};

/* ── Variante: numbered list ─────────────────────────────────── */
const EditableNumbered: React.FC<VariantArgs> = ({ slide, theme, onUpdate, setBlock, removeBlock }) => {
  const cardsIdx = slide.blocks.findIndex((b) => b.kind === 'cards');
  const bulletsIdx = slide.blocks.findIndex((b) => b.kind === 'bullets');
  const cards = slide.blocks[cardsIdx] as Extract<Block, { kind: 'cards' }> | undefined;
  const bullets = slide.blocks[bulletsIdx] as Extract<Block, { kind: 'bullets' }> | undefined;

  return (
    <div className="slide-body slide-body--numbered">
      <InlineTitle slide={slide} theme={theme} onUpdate={onUpdate} />
      <div className="numbered-list">
        {cards
          ? cards.items.slice(0, 5).map((c, i) => (
              <div key={i} className="slide-numbered-item">
                <span className="slide-numbered-marker">{String(i + 1).padStart(2, '0')}</span>
                <div className="slide-numbered-body">
                  <InlineText
                    value={c.title}
                    onChange={(v) => {
                      const items = [...cards.items];
                      items[i] = { ...items[i], title: v };
                      setBlock(cardsIdx, { items } as Partial<Block>);
                    }}
                    as="h3"
                    className="slide-numbered-title"
                    placeholder="Título"
                  />
                  <InlineText
                    value={c.text}
                    onChange={(v) => {
                      const items = [...cards.items];
                      items[i] = { ...items[i], text: v };
                      setBlock(cardsIdx, { items } as Partial<Block>);
                    }}
                    as="p"
                    multiline
                    className="slide-numbered-text"
                    placeholder="Descripción…"
                  />
                </div>
              </div>
            ))
          : bullets && bullets.items.slice(0, 5).map((it, i) => (
              <div key={i} className="slide-numbered-item">
                <span className="slide-numbered-marker">{String(i + 1).padStart(2, '0')}</span>
                <div className="slide-numbered-body">
                  <InlineText
                    value={it}
                    onChange={(v) => {
                      const items = [...bullets.items];
                      if (!v.trim()) items.splice(i, 1);
                      else items[i] = v;
                      setBlock(bulletsIdx, { items } as Partial<Block>);
                    }}
                    as="span"
                    multiline
                    className="slide-numbered-title"
                    placeholder="Punto"
                  />
                </div>
              </div>
            ))}
      </div>
      {/* Acción de quitar el bloque entero */}
      <button
        onClick={() => {
          if (cards) removeBlock(cardsIdx);
          else if (bullets) removeBlock(bulletsIdx);
        }}
        style={{
          alignSelf: 'flex-end', background: 'transparent', border: 'none',
          color: 'var(--color-muted-foreground, #94a3b8)', fontSize: '12px',
          cursor: 'pointer', padding: '4px 6px',
        }}
        title="Quitar lista numerada"
      >
        Quitar
      </button>
    </div>
  );
};

/* ─── Bloque editable inline (escalado) ────────────────────────── */

const EditableBlock: React.FC<{
  block: Block;
  theme: SlideThemeTokens;
  onChange: (patch: Partial<Block>) => void;
  onRemove: () => void;
}> = ({ block, theme, onChange, onRemove }) => {
  return (
    <div className="editable-block group">
      <button className="editable-block-remove" title="Quitar bloque" onClick={onRemove}>
        <Trash2 size={12} />
      </button>
      <BlockContent block={block} theme={theme} onChange={onChange} />
    </div>
  );
};

const BlockContent: React.FC<{
  block: Block;
  theme: SlideThemeTokens;
  onChange: (patch: Partial<Block>) => void;
}> = ({ block, theme, onChange }) => {
  switch (block.kind) {
    case 'heading':
      return (
        <InlineText
          value={block.text}
          onChange={(v) => onChange({ text: v } as Partial<Block>)}
          as="h3"
          multiline
          className="slide-title-content"
          style={{ color: theme.primary, border: 'none', padding: 0 }}
        />
      );

    case 'paragraph':
      return (
        <InlineText
          value={block.text}
          onChange={(v) => onChange({ text: v } as Partial<Block>)}
          as="p"
          multiline
          className="slide-text-base"
          style={{ margin: 0 }}
        />
      );

    case 'bullets':
      return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {block.items.map((item, i) => (
            <li key={i} className="slide-text-base" style={{ display: 'flex', gap: '16px', alignItems: 'baseline' }}>
              <span
                style={{
                  flex: '0 0 auto',
                  width: '14px', height: '2px',
                  background: theme.accent,
                  borderRadius: 1,
                  transform: 'translateY(-0.35em)',
                  opacity: 0.85,
                }}
              />
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <InlineText
                  value={item}
                  onChange={(v) => {
                    const items = [...block.items];
                    if (!v.trim()) items.splice(i, 1);
                    else items[i] = v;
                    onChange({ items } as Partial<Block>);
                  }}
                  as="span"
                  multiline
                  style={{ flex: 1 }}
                />
              </span>
            </li>
          ))}
          {block.items.length === 0 && (
            <button
              onClick={() => onChange({ items: [''] } as Partial<Block>)}
              className="slide-text-sm"
              style={{ opacity: 0.6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', textAlign: 'left', padding: 0 }}
            >
              + Añadir ítem
            </button>
          )}
        </ul>
      );

    case 'quote':
      return (
        <blockquote
          className="slide-text-base"
          style={{
            borderLeft: `5px solid ${theme.accent}`,
            paddingLeft: '24px',
            fontStyle: 'italic',
            margin: 0,
          }}
        >
          <InlineText
            value={block.text}
            onChange={(v) => onChange({ text: v } as Partial<Block>)}
            as="span"
            multiline
          />
          <footer className="slide-text-sm" style={{ marginTop: '6px', fontStyle: 'normal', color: theme.textMuted }}>
            — <InlineText
              value={block.author || ''}
              onChange={(v) => onChange({ author: v || undefined } as Partial<Block>)}
              placeholder="Autor"
              as="span"
              suppressEmpty
            />
          </footer>
        </blockquote>
      );

    case 'stat':
      return (
        <div style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '22px 28px',
          border: `1px solid ${theme.border}`,
          borderRadius: '16px',
        }}>
          <InlineText
            value={block.value}
            onChange={(v) => onChange({ value: v } as Partial<Block>)}
            as="span"
            className="slide-stat-value"
            style={{ color: theme.primary }}
          />
          <InlineText
            value={block.label}
            onChange={(v) => onChange({ label: v } as Partial<Block>)}
            as="span"
            className="slide-stat-label"
            style={{ color: theme.textMuted }}
          />
        </div>
      );

    case 'callout':
      return <CalloutBlock block={block} theme={theme} onChange={onChange} />;

    case 'cards':
      return <CardsBlock block={block} theme={theme} onChange={onChange} />;

    case 'diagram':
      return (
        <div style={{ minHeight: 0, maxHeight: '100%', overflow: 'hidden' }}>
          <DiagramRenderer data={block.diagram} theme={slideThemeToDiagramOverride(theme)} />
        </div>
      );

    case 'equation':
      return (
        <EquationBlock
          latex={block.latex}
          display={block.display !== false}
          caption={block.caption}
          theme={theme}
        />
      );

    case 'codeBlock':
      return (
        <CodeBlock
          language={block.language}
          code={block.code}
          caption={block.caption}
          theme={theme}
        />
      );

    case 'table':
      return (
        <TableBlock
          columns={block.columns}
          rows={block.rows}
          highlightedRow={block.highlightedRow}
          caption={block.caption}
          theme={theme}
        />
      );

    case 'mermaid':
      return (
        <MermaidBlock
          code={block.code}
          caption={block.caption}
          theme={theme}
        />
      );

    default:
      return null;
  }
};

/* ─── Callout (editable) — estilo editorial sutil ─────────────── */

const CALLOUT_META: Record<CalloutVariant, { icon: typeof Info; accent: string; label: string }> = {
  info:    { icon: Info,          accent: '#0284c7', label: 'Info' },
  tip:     { icon: Lightbulb,     accent: '#d97706', label: 'Tip' },
  example: { icon: Sparkles,      accent: '#7c3aed', label: 'Ejemplo' },
  warning: { icon: AlertTriangle, accent: '#dc2626', label: 'Atención' },
  key:     { icon: Target,        accent: '#059669', label: 'Clave' },
  note:    { icon: StickyNote,    accent: '#475569', label: 'Nota' },
};

const CalloutBlock: React.FC<{
  block: Extract<Block, { kind: 'callout' }>;
  theme: SlideThemeTokens;
  onChange: (patch: Partial<Block>) => void;
}> = ({ block, theme, onChange }) => {
  const v = CALLOUT_META[block.variant] || CALLOUT_META.info;
  const Icon = v.icon;
  const wash = `color-mix(in srgb, ${v.accent} 7%, ${theme.bg.startsWith('#') ? theme.bg : 'transparent'})`;
  return (
    <div
      style={{
        display: 'flex',
        gap: '14px',
        padding: '18px 22px',
        background: wash,
        color: theme.text,
        borderLeft: `3px solid ${v.accent}`,
        borderRadius: '8px',
        alignItems: 'flex-start',
      }}
    >
      <Icon
        style={{
          flex: '0 0 auto',
          width: '20px',
          height: '20px',
          color: v.accent,
          marginTop: '4px',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {(Object.keys(CALLOUT_META) as CalloutVariant[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ variant: key } as Partial<Block>)}
              style={{
                fontSize: 10,
                padding: '1px 7px',
                borderRadius: 999,
                border: `1px solid ${key === block.variant ? CALLOUT_META[key].accent : 'transparent'}`,
                background: key === block.variant ? CALLOUT_META[key].accent : 'transparent',
                color: key === block.variant ? '#fff' : theme.textMuted,
                cursor: 'pointer',
                opacity: key === block.variant ? 1 : 0.5,
              }}
            >
              {CALLOUT_META[key].label}
            </button>
          ))}
        </div>
        <InlineText
          value={block.title || ''}
          onChange={(t) => onChange({ title: t || undefined } as Partial<Block>)}
          as="span"
          placeholder="Título (opcional)"
          suppressEmpty
          style={{
            fontSize: '12px', fontWeight: 700, color: v.accent,
            letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block',
            marginBottom: 4,
          }}
        />
        <InlineText
          value={block.text}
          onChange={(t) => onChange({ text: t } as Partial<Block>)}
          as="div"
          multiline
          style={{ color: theme.text, lineHeight: 1.5, fontSize: '17px' }}
        />
      </div>
    </div>
  );
};

/* ─── Cards (editable) — estilo editorial con accent stripe ──── */

const CARD_ACCENTS: Record<string, string> = {
  accent:  '#6366f1',
  primary: '#0ea5e9',
  success: '#10b981',
  warning: '#f59e0b',
  danger:  '#ef4444',
  muted:   '#64748b',
};

const CardsBlock: React.FC<{
  block: Extract<Block, { kind: 'cards' }>;
  theme: SlideThemeTokens;
  onChange: (patch: Partial<Block>) => void;
}> = ({ block, theme, onChange }) => {
  const cols = Math.min(Math.max(block.items.length, 1), 3);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '18px' }}>
      {block.items.map((card, i) => {
        const accent = card.tone ? (CARD_ACCENTS[card.tone] || theme.accent) : theme.accent;
        return (
          <div
            key={i}
            style={{
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              borderTop: `3px solid ${accent}`,
              color: theme.text,
              padding: '22px 24px 20px',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              minWidth: 0,
              position: 'relative',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 6px 16px rgba(15, 23, 42, 0.04)',
            }}
          >
            <button
              onClick={() => {
                const items = [...block.items]; items.splice(i, 1);
                if (items.length === 0) onChange({ items: [{ title: 'Nueva tarjeta', text: 'Descripción…' }] } as Partial<Block>);
                else onChange({ items } as Partial<Block>);
              }}
              title="Quitar tarjeta"
              style={{
                position: 'absolute', top: 6, right: 6,
                background: 'transparent', border: 'none',
                color: theme.textMuted, opacity: 0.5, cursor: 'pointer', padding: 2,
              }}
            >
              <Trash2 size={11} />
            </button>
            <InlineText
              value={card.title}
              onChange={(t) => {
                const items = [...block.items];
                items[i] = { ...items[i], title: t };
                onChange({ items } as Partial<Block>);
              }}
              as="div"
              style={{ fontSize: '17px', fontWeight: 700, color: theme.primary, letterSpacing: '-0.005em', lineHeight: 1.25 }}
            />
            <InlineText
              value={card.text}
              onChange={(t) => {
                const items = [...block.items];
                items[i] = { ...items[i], text: t };
                onChange({ items } as Partial<Block>);
              }}
              as="div"
              multiline
              style={{ fontSize: '14px', lineHeight: 1.55, color: theme.textMuted }}
            />
          </div>
        );
      })}
      {block.items.length < 3 && (
        <button
          onClick={() => {
            const palettes = Object.keys(CARD_ACCENTS) as (keyof typeof CARD_ACCENTS)[];
            const tone = palettes[block.items.length % palettes.length];
            onChange({ items: [...block.items, { title: 'Nueva tarjeta', text: 'Descripción…', tone }] } as Partial<Block>);
          }}
          style={{
            border: `1px dashed ${theme.border}`,
            borderRadius: '10px',
            background: 'transparent',
            color: theme.textMuted,
            cursor: 'pointer',
            fontSize: '14px',
            padding: '20px',
          }}
        >
          + Tarjeta
        </button>
      )}
    </div>
  );
};

export default EditableSlide;
