import katex from 'katex';
import 'katex/dist/katex.min.css';
import { memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

const MATH = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;

function renderRich(text: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  let out = '';
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    out += esc(text.slice(last, m.index)).replace(/\n/g, '<br/>');
    const display = Boolean(m[1]);
    try {
      out += katex.renderToString((m[1] ?? m[2]).trim(), { displayMode: display, throwOnError: false, strict: 'ignore' });
    } catch {
      out += esc(m[0]);
    }
    last = (m.index ?? 0) + m[0].length;
  }
  return out + esc(text.slice(last)).replace(/\n/g, '<br/>');
}

/** Text with inline LaTeX math ($…$), as produced by the AI and stored in materials/rubrics. `oneLine`: a single line
 * (line breaks become spaces) that fades out at the right edge only when it is cut. */
export const RichText = memo(function RichText({ text, as = 'span', className, oneLine = false }: {
  text: string; as?: 'span' | 'div' | 'p'; className?: string; oneLine?: boolean;
}) {
  const html = useMemo(() => renderRich(oneLine ? (text || '').replace(/\s*\n+\s*/g, ' ') : text || ''), [text, oneLine]);
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
