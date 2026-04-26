import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
  text: string;
  className?: string;
  inline?: boolean;
}

/**
 * Renders a string that may contain inline (`$...$`) or block (`$$...$$`)
 * LaTeX segments. The rest of the text is rendered as-is (whitespace preserved
 * via `whitespace-pre-wrap` on the wrapping element).
 *
 * When KaTeX fails to parse, the raw `$...$` is shown in red so the teacher
 * notices the malformed formula instead of seeing silently broken math.
 */
const MathText: React.FC<MathTextProps> = ({ text, className, inline }) => {
  const nodes = useMemo(() => {
    if (!text) return [];
    const parts: React.ReactNode[] = [];
    // Block math first so it doesn't get caught by the inline pattern.
    const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`t-${key++}`}>{text.slice(lastIndex, match.index)}</span>);
      }
      const raw = match[0];
      const isBlock = raw.startsWith('$$');
      const latex = isBlock ? raw.slice(2, -2) : raw.slice(1, -1);
      try {
        const html = katex.renderToString(latex, {
          displayMode: isBlock && !inline,
          throwOnError: false,
          output: 'html',
          strict: 'ignore',
        });
        parts.push(
          <span
            key={`m-${key++}`}
            className={isBlock && !inline ? 'block my-2 text-center' : 'inline-block align-baseline'}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        parts.push(
          <span key={`err-${key++}`} className="text-red-600 font-mono text-sm">
            {raw}
          </span>
        );
      }
      lastIndex = match.index + raw.length;
    }
    if (lastIndex < text.length) {
      parts.push(<span key={`t-${key++}`}>{text.slice(lastIndex)}</span>);
    }
    return parts;
  }, [text, inline]);

  return <span className={`whitespace-pre-wrap ${className || ''}`}>{nodes}</span>;
};

export default MathText;
