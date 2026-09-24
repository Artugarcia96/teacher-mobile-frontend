import katex from 'katex';
import 'katex/dist/katex.min.css';
import { memo, useMemo } from 'react';

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

/** Text with inline LaTeX math ($…$), as produced by the AI and stored in materials/rubrics. */
export const RichText = memo(function RichText({ text, as = 'span', className }: { text: string; as?: 'span' | 'div' | 'p'; className?: string }) {
  const html = useMemo(() => renderRich(text || ''), [text]);
  const Tag = as;
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
