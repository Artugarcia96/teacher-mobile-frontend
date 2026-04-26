import type { Block, Slide } from '../../types/presentations';
import type { SlideThemeTokens } from './themes';
import BlockRenderer from './BlockRenderer';
import { useLogicalCanvas } from './useLogicalCanvas';
import { TypewriterScope, TypedText } from './typewriter';
import '../diagrams/styles.css';
import './slides.css';

interface Props {
  slide: Slide;
  theme: SlideThemeTokens;
  /** Si true, juega la animación de entrada (stagger). */
  animate?: boolean;
  /** Si true, aplica efecto typewriter letra a letra en títulos/textos. */
  typewriter?: boolean;
  /** Índice del slide dentro de la presentación; se muestra en el footer. */
  index?: number;
  total?: number;
  /** URL del logo del centro; se muestra en esquina inferior izquierda
   *  (excepto en slides de portada). */
  logoUrl?: string | null;
}

const SlideRenderer: React.FC<Props> = ({
  slide, theme, animate = true, typewriter = false, index, total, logoUrl,
}) => {
  const { frameRef } = useLogicalCanvas<HTMLDivElement>();
  const baseStyle: React.CSSProperties = {
    background: slide.layout === 'cover' ? (theme.coverBg || theme.bg)
              : slide.layout === 'section' ? (theme.sectionBg || theme.bg)
              : theme.bg,
    color: slide.layout === 'cover' ? (theme.coverText || theme.text)
         : slide.layout === 'section' ? (theme.sectionText || theme.text)
         : theme.text,
    fontFamily: theme.fontFamily,
    ['--slide-border' as any]: theme.border,
    ['--slide-primary' as any]: theme.primary,
    ['--slide-accent' as any]: theme.accent,
    ['--slide-text-muted' as any]: theme.textMuted,
    ['--slide-font-display' as any]: theme.fontFamilyDisplay || theme.fontFamily || 'inherit',
    ['--slide-title-weight' as any]: theme.titleWeight ?? 700,
  };

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

  const body = renderSlideBody(slide, theme, { animate });

  return (
    <div className="slide-frame" style={baseStyle} ref={frameRef}>
      <TypewriterScope
        active={typewriter}
        resetKey={slide.id}
        clickToSkip
        className="slide-canvas"
      >
        {decoration}
        {body}
        {logoUrl && slide.layout !== 'cover' && (
          <img
            src={`${import.meta.env.VITE_API_URL || ''}/files${logoUrl.replace('/uploads', '')}`}
            alt=""
            className="slide-logo"
            aria-hidden
          />
        )}
        {typeof index === 'number' && typeof total === 'number' && slide.layout !== 'cover' && (
          <span className="slide-page-indicator" style={{ color: theme.textMuted }}>
            {index + 1} / {total}
          </span>
        )}
      </TypewriterScope>
    </div>
  );
};

/* ── Cuerpo del slide: cover / section / content / closing ───────── */

function renderSlideBody(
  slide: Slide,
  theme: SlideThemeTokens,
  opts: { animate: boolean },
): React.ReactNode {
  const { animate } = opts;

  if (slide.layout === 'cover') {
    return (
      <div className="slide-body slide-body--cover">
        {slide.title && (
          <h1 className={`slide-title-xl ${animate ? 'diag-reveal' : ''}`}>
            <TypedText value={slide.title} delay={0} />
          </h1>
        )}
        {slide.subtitle && (
          <p className={`slide-subtitle-xl ${animate ? 'diag-reveal' : ''}`} style={{ animationDelay: '160ms' }}>
            <TypedText value={slide.subtitle} delay={320} />
          </p>
        )}
      </div>
    );
  }

  if (slide.layout === 'section') {
    return (
      <div className="slide-body slide-body--section">
        <span className={`slide-eyebrow ${animate ? 'diag-reveal' : ''}`}>Sección</span>
        {slide.title && (
          <h2 className={`slide-title-section ${animate ? 'diag-reveal' : ''}`} style={{ animationDelay: '120ms' }}>
            <TypedText value={slide.title} delay={180} />
          </h2>
        )}
      </div>
    );
  }

  if (slide.layout === 'closing') {
    return (
      <div className="slide-body slide-body--closing">
        {slide.title && (
          <h2 className={`slide-title-section ${animate ? 'diag-reveal' : ''}`}>
            <TypedText value={slide.title} delay={0} />
          </h2>
        )}
        {slide.subtitle && (
          <p className={`slide-subtitle-xl ${animate ? 'diag-reveal' : ''}`} style={{ animationDelay: '120ms' }}>
            <TypedText value={slide.subtitle} delay={220} />
          </p>
        )}
        <div className="slide-blocks" style={{ maxWidth: '80%' }}>
          {slide.blocks.map((b, i) => (
            <BlockRenderer key={i} block={b} theme={theme} revealDelayMs={animate ? 240 + i * 90 : 0} />
          ))}
        </div>
      </div>
    );
  }

  return renderContentVariant(slide, theme, opts);
}

/* ── Dispatcher de variantes visuales ─────────────────────────── */

function renderContentVariant(
  slide: Slide,
  theme: SlideThemeTokens,
  opts: { animate: boolean },
): React.ReactNode {
  const tpl = slide.layout_template;

  switch (tpl) {
    case 'stat_spotlight':
      if (slide.blocks.some((b) => b.kind === 'stat')) return renderStatHero(slide, theme, opts);
      break;
    case 'quote_spotlight':
      if (slide.blocks.some((b) => b.kind === 'quote')) return renderQuoteHero(slide, theme, opts);
      break;
    case 'full_bleed_diagram':
      if (slide.blocks.some((b) => b.kind === 'diagram' || b.kind === 'mermaid' || b.kind === 'table')) return renderDiagramBleed(slide, theme, opts);
      break;
    case 'split_text_visual':
      if (hasTextAndVisual(slide.blocks)) return renderSplit(slide, theme, opts);
      break;
    case 'cards_row':
      if (slide.blocks.some((b) => b.kind === 'cards')) return renderCardsHero(slide, theme, opts);
      break;
    case 'comparison_duo':
      if (canRenderDuo(slide.blocks)) return renderDuo(slide, theme, opts);
      break;
    case 'numbered_list':
      if (canRenderNumbered(slide.blocks)) return renderNumbered(slide, theme, opts);
      break;
    case 'equation_spotlight':
      if (slide.blocks.some((b) => b.kind === 'equation')) return renderEquationHero(slide, theme, opts);
      break;
    case 'theorem_proof':
      return renderTheoremProof(slide, theme, opts);
    case 'code_walkthrough':
      if (slide.blocks.some((b) => b.kind === 'codeBlock')) return renderCodeWalkthrough(slide, theme, opts);
      break;
    case 'data_table':
      if (slide.blocks.some((b) => b.kind === 'table')) return renderTableHero(slide, theme, opts);
      break;
  }
  return renderTitleStack(slide, theme, opts);
}

/* ── Vertical stack genérico ─────────────────────────────────── */
function renderTitleStack(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  return (
    <div className="slide-body slide-body--content">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div className="slide-blocks">
        {slide.blocks.map((b, i) => (
          <BlockRenderer key={i} block={b} theme={theme} revealDelayMs={animate ? 180 + i * 120 : 0} />
        ))}
      </div>
    </div>
  );
}

function renderStatHero(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  const stat = slide.blocks.find((b) => b.kind === 'stat') as Extract<Block, { kind: 'stat' }> | undefined;
  const aside = slide.blocks.find((b) => b.kind === 'callout' || b.kind === 'paragraph');
  if (!stat) return renderTitleStack(slide, theme, opts);
  return (
    <div className="slide-body slide-body--stat-hero">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div>
        <div className={`slide-stat-hero-value ${animate ? 'diag-reveal' : ''}`} style={{ animationDelay: '120ms' }}>
          {stat.value}
        </div>
        <p className={`slide-stat-hero-label ${animate ? 'diag-reveal' : ''}`} style={{ animationDelay: '240ms' }}>
          {stat.label}
        </p>
      </div>
      {aside && (
        <div className={`stat-hero-aside ${animate ? 'diag-reveal' : ''}`} style={{ animationDelay: '360ms' }}>
          <BlockRenderer block={aside} theme={theme} revealDelayMs={0} />
        </div>
      )}
    </div>
  );
}

function renderQuoteHero(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  const quote = slide.blocks.find((b) => b.kind === 'quote') as Extract<Block, { kind: 'quote' }> | undefined;
  if (!quote) return renderTitleStack(slide, theme, opts);
  return (
    <div className="slide-body slide-body--quote-hero">
      <svg
        className={`slide-quote-hero-mark ${animate ? 'diag-reveal' : ''}`}
        viewBox="0 0 64 44" width="64" height="44" aria-hidden
        style={{ overflow: 'visible' }}
      >
        <g fill="currentColor">
          <path d="M 4 4 C 4 2, 6 0, 10 0 L 18 0 C 22 0, 24 2, 24 6 L 24 18 C 24 26, 19 32, 8 36 L 6 30 C 12 28, 16 25, 16 20 L 10 20 C 6 20, 4 18, 4 14 Z" />
          <path d="M 32 4 C 32 2, 34 0, 38 0 L 46 0 C 50 0, 52 2, 52 6 L 52 18 C 52 26, 47 32, 36 36 L 34 30 C 40 28, 44 25, 44 20 L 38 20 C 34 20, 32 18, 32 14 Z" />
        </g>
      </svg>
      <p className={`slide-quote-hero-text ${animate ? 'diag-reveal' : ''}`} style={{ animationDelay: '120ms' }}>
        <TypedText value={quote.text} delay={0} />
      </p>
      {quote.author && (
        <p className={`slide-quote-hero-author ${animate ? 'diag-reveal' : ''}`} style={{ animationDelay: '260ms' }}>
          — {quote.author}
        </p>
      )}
    </div>
  );
}

function renderDiagramBleed(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  const visual = slide.blocks.find((b) => b.kind === 'diagram' || b.kind === 'mermaid' || b.kind === 'table');
  if (!visual) return renderTitleStack(slide, theme, opts);
  return (
    <div className="slide-body slide-body--diagram-bleed">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div className="bleed-stage">
        <BlockRenderer block={visual} theme={theme} revealDelayMs={animate ? 160 : 0} />
      </div>
    </div>
  );
}

function renderSplit(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  const visualKinds: Block['kind'][] = ['diagram', 'stat', 'equation', 'codeBlock', 'table', 'mermaid'];
  const textKinds: Block['kind'][] = ['paragraph', 'bullets', 'callout', 'heading'];
  const text = slide.blocks.find((b) => textKinds.includes(b.kind));
  const visual = slide.blocks.find((b) => visualKinds.includes(b.kind));
  if (!text || !visual) return renderTitleStack(slide, theme, opts);
  return (
    <div className="slide-body slide-body--split">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div className="split-grid">
        <div className="split-text">
          <BlockRenderer block={text} theme={theme} revealDelayMs={animate ? 140 : 0} />
        </div>
        <div className="split-visual">
          <BlockRenderer block={visual} theme={theme} revealDelayMs={animate ? 260 : 0} />
        </div>
      </div>
    </div>
  );
}

function renderCardsHero(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  const cards = slide.blocks.find((b) => b.kind === 'cards');
  if (!cards) return renderTitleStack(slide, theme, opts);
  return (
    <div className="slide-body slide-body--cards-hero">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div className="cards-hero-stage">
        <BlockRenderer block={cards} theme={theme} revealDelayMs={animate ? 160 : 0} />
      </div>
    </div>
  );
}

function renderDuo(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  const cards = slide.blocks.find((b) => b.kind === 'cards') as Extract<Block, { kind: 'cards' }> | undefined;
  let leftBlock: Block | undefined;
  let rightBlock: Block | undefined;
  if (cards && cards.items.length >= 2) {
    leftBlock = { kind: 'cards', items: [cards.items[0]] };
    rightBlock = { kind: 'cards', items: [cards.items[1]] };
  } else {
    const candidates = slide.blocks.filter((b) => b.kind !== 'diagram');
    leftBlock = candidates[0];
    rightBlock = candidates[1];
  }
  if (!leftBlock || !rightBlock) return renderTitleStack(slide, theme, opts);
  return (
    <div className="slide-body slide-body--duo">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div className="duo-grid">
        <div className="duo-col">
          <BlockRenderer block={leftBlock} theme={theme} revealDelayMs={animate ? 140 : 0} />
        </div>
        <div className="duo-col">
          <BlockRenderer block={rightBlock} theme={theme} revealDelayMs={animate ? 220 : 0} />
        </div>
      </div>
    </div>
  );
}

function renderNumbered(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  const items = extractNumberedItems(slide.blocks);
  if (items.length === 0) return renderTitleStack(slide, theme, opts);
  return (
    <div className="slide-body slide-body--numbered">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div className="numbered-list">
        {items.map((it, i) => (
          <div
            key={i}
            className={`slide-numbered-item ${animate ? 'diag-reveal' : ''}`}
            style={{ animationDelay: `${160 + i * 100}ms` }}
          >
            <span className="slide-numbered-marker">{String(i + 1).padStart(2, '0')}</span>
            <div className="slide-numbered-body">
              {it.title && <h3 className="slide-numbered-title">{it.title}</h3>}
              {it.text && <p className="slide-numbered-text">{it.text}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Variantes nuevas: equation / theorem / code / table ──────── */

function renderEquationHero(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  const eq = slide.blocks.find((b) => b.kind === 'equation');
  const aside = slide.blocks.find((b) => b.kind === 'paragraph' || b.kind === 'callout');
  if (!eq) return renderTitleStack(slide, theme, opts);
  return (
    <div className="slide-body slide-body--equation-hero">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <BlockRenderer block={eq} theme={theme} revealDelayMs={animate ? 160 : 0} />
        {aside && <BlockRenderer block={aside} theme={theme} revealDelayMs={animate ? 320 : 0} />}
      </div>
    </div>
  );
}

function renderTheoremProof(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  // Orden preferido: callout 'key' (enunciado) → equation (fórmula) → bullets/paragraph (pasos)
  const key = slide.blocks.find((b) => b.kind === 'callout');
  const eq = slide.blocks.find((b) => b.kind === 'equation');
  const proof = slide.blocks.find((b) => b.kind === 'bullets' || b.kind === 'paragraph');
  return (
    <div className="slide-body slide-body--theorem">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div className="slide-blocks" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {key && <BlockRenderer block={key} theme={theme} revealDelayMs={animate ? 160 : 0} />}
        {eq && <BlockRenderer block={eq} theme={theme} revealDelayMs={animate ? 280 : 0} />}
        {proof && <BlockRenderer block={proof} theme={theme} revealDelayMs={animate ? 400 : 0} />}
      </div>
    </div>
  );
}

function renderCodeWalkthrough(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  const code = slide.blocks.find((b) => b.kind === 'codeBlock');
  const text = slide.blocks.find((b) => b.kind === 'paragraph' || b.kind === 'bullets' || b.kind === 'callout');
  if (!code) return renderTitleStack(slide, theme, opts);
  return (
    <div className="slide-body slide-body--code">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div className="split-grid" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 28 }}>
        <div className="split-visual" style={{ minWidth: 0 }}>
          <BlockRenderer block={code} theme={theme} revealDelayMs={animate ? 160 : 0} />
        </div>
        <div className="split-text" style={{ minWidth: 0 }}>
          {text && <BlockRenderer block={text} theme={theme} revealDelayMs={animate ? 320 : 0} />}
        </div>
      </div>
    </div>
  );
}

function renderTableHero(slide: Slide, theme: SlideThemeTokens, opts: { animate: boolean }): React.ReactNode {
  const { animate } = opts;
  const table = slide.blocks.find((b) => b.kind === 'table');
  const aside = slide.blocks.find((b) => b.kind === 'paragraph' || b.kind === 'callout');
  if (!table) return renderTitleStack(slide, theme, opts);
  return (
    <div className="slide-body slide-body--table-hero">
      {slide.title && (
        <h2 className={`slide-title-content ${animate ? 'diag-reveal' : ''}`} style={{ color: theme.primary }}>
          <TypedText value={slide.title} delay={0} />
        </h2>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <BlockRenderer block={table} theme={theme} revealDelayMs={animate ? 160 : 0} />
        {aside && <BlockRenderer block={aside} theme={theme} revealDelayMs={animate ? 320 : 0} />}
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function hasTextAndVisual(blocks: Block[]): boolean {
  const visualKinds: Block['kind'][] = ['diagram', 'stat', 'equation', 'codeBlock', 'table', 'mermaid'];
  const textKinds: Block['kind'][] = ['paragraph', 'bullets', 'callout', 'heading'];
  return blocks.some((b) => visualKinds.includes(b.kind)) && blocks.some((b) => textKinds.includes(b.kind));
}

function canRenderDuo(blocks: Block[]): boolean {
  const cards = blocks.find((b) => b.kind === 'cards') as Extract<Block, { kind: 'cards' }> | undefined;
  if (cards && cards.items.length >= 2) return true;
  return blocks.filter((b) => b.kind !== 'diagram').length >= 2;
}

function canRenderNumbered(blocks: Block[]): boolean {
  return blocks.some((b) => b.kind === 'bullets' || b.kind === 'cards');
}

function extractNumberedItems(blocks: Block[]): Array<{ title?: string; text?: string }> {
  const cards = blocks.find((b) => b.kind === 'cards') as Extract<Block, { kind: 'cards' }> | undefined;
  if (cards) {
    return cards.items.slice(0, 5).map((c) => ({ title: c.title, text: c.text }));
  }
  const bullets = blocks.find((b) => b.kind === 'bullets') as Extract<Block, { kind: 'bullets' }> | undefined;
  if (bullets) {
    return bullets.items.slice(0, 5).map((s) => {
      const m = s.match(/^([^:—–-]{2,40})[:—–-]\s*(.+)$/);
      if (m) return { title: m[1].trim(), text: m[2].trim() };
      return { title: s };
    });
  }
  return [];
}

export default SlideRenderer;
