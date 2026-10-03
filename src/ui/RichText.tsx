import katex from 'katex';
import 'katex/dist/katex.min.css';
import { createContext, memo, useContext, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

const MATH = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Plain text around the math: escaped, **bold** (key terms in materials) and line breaks. */
function plain(s: string): string {
  return esc(s).replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
}

/** Degrees Celsius / Fahrenheit are units: upright C, never the variable C. */
const DEGREES = /(°|\^\{?\\circ\}?)\s*([CF])(?![A-Za-z])/g;
/** Chemical notation written as math ($Mg^{2+}$, $H_2O$, $CO_2$) is set upright, like the PDF: an ion (a charge) or a
 *  formula of two or more element symbols with subscripts. A single letter with an index ($V_1$) stays a variable. */
const CHEM = /^(?:[A-Z][a-z]?(?:_\{?\d+\}?)?)+(?:\^\{?\d*[+\-−]\}?)?$/;
function chemistry(tex: string): string {
  const t = tex.replace(/\s+/g, '');
  if (!CHEM.test(t)) return tex.replace(DEGREES, '$1\\mathrm{$2}');
  const charge = t.includes('^');
  const formula = t.includes('_') && (t.match(/[A-Z]/g) ?? []).length >= 2;
  return charge || formula ? `\\mathrm{${t}}` : tex;
}

function renderRich(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    out += plain(text.slice(last, m.index));
    const display = Boolean(m[1]);
    try {
      out += katex.renderToString(chemistry((m[1] ?? m[2]).trim()), { displayMode: display, throwOnError: false, strict: 'ignore' });
    } catch {
      out += esc(m[0]);
    }
    last = (m.index ?? 0) + m[0].length;
  }
  return out + plain(text.slice(last));
}

/** What a material's text stands for when it is shown: `refs` «[[mapa-expansion]]» → «fig. 3», `names` «{nombre1}» →
 *  «Lucía» (the server's fill, the same as the PDF's). */
export interface TextSubs { refs?: Record<string, string>; names?: Record<string, string> }

const SubsContext = createContext<TextSubs>({});
/** Every RichText inside reads its `[[ref]]` and `{nombreN}` from here (the material page sets it once). */
export const TextSubsProvider = SubsContext.Provider;

/** `[[ref]]` and `{nombreN}` replaced by what they stand for; an unknown one is left as written. */
export function resolveText(text: string, subs: TextSubs): string {
  const { refs = {}, names = {} } = subs;
  return text
    .replace(/\[\[([^\]\n]+)\]\]/g, (m, ref: string) => refs[ref.trim()] ?? m)
    .replace(/\{nombre\d+\}/g, (m) => names[m] ?? m);
}

/** Text with inline LaTeX math ($…$) and **bold**, as produced by the AI and stored in materials/rubrics. `oneLine`: a single line
 * (line breaks become spaces) that fades out at the right edge only when it is cut. */
export const RichText = memo(function RichText({ text, as = 'span', className, oneLine = false }: {
  text: string; as?: 'span' | 'div' | 'p'; className?: string; oneLine?: boolean;
}) {
  const subs = useContext(SubsContext);
  const html = useMemo(() => {
    const t = resolveText(text || '', subs);
    return renderRich(oneLine ? t.replace(/\s*\n+\s*/g, ' ') : t);
  }, [text, oneLine, subs]);
  const ref = useRef<HTMLElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!oneLine || !el) return undefined;
    const measure = () => setCut(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    document.fonts?.ready.then(measure); // KaTeX fonts change the width once loaded
    return () => ro.disconnect();
  }, [oneLine, html]);
  const Tag = as;
  const cls = [className, oneLine && 'rich-line', oneLine && cut && 'rich-line--cut'].filter(Boolean).join(' ') || undefined;
  return <Tag ref={ref as RefObject<never>} className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
});
