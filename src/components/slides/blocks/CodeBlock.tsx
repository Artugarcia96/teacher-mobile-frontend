import type { SlideThemeTokens } from '../themes';

interface Props {
  language: string;
  code: string;
  caption?: string;
  theme: SlideThemeTokens;
  revealDelayMs?: number;
}

/* Sintaxis ligera (sin highlight.js — coste cero, suficientemente bonito).
 * Tokeniza palabras-clave, strings, comments y números con regex simples por
 * lenguaje. Si aparece un lenguaje no reconocido, muestra el código sin
 * resaltar pero respetando indentación. */

type Tokenizer = (line: string) => Array<{ type: TokenType; text: string }>;
type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'fn' | 'plain';

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: '#a855f7',
  string:  '#16a34a',
  comment: '#94a3b8',
  number:  '#0ea5e9',
  fn:      '#ea580c',
  plain:   '#0f172a',
};

const KEYWORDS: Record<string, string[]> = {
  python:     ['def','class','return','if','elif','else','for','while','import','from','as','with','try','except','finally','raise','lambda','True','False','None','and','or','not','in','is','pass','yield','async','await','self'],
  javascript: ['function','const','let','var','if','else','for','while','return','class','extends','new','this','async','await','import','export','from','default','try','catch','finally','throw','typeof','instanceof','in','of','true','false','null','undefined'],
  typescript: ['function','const','let','var','if','else','for','while','return','class','extends','new','this','async','await','import','export','from','default','try','catch','finally','throw','typeof','instanceof','in','of','true','false','null','undefined','interface','type','enum','readonly','public','private','protected','as'],
  java:       ['public','private','protected','class','interface','extends','implements','new','if','else','for','while','do','return','try','catch','finally','throw','throws','static','final','void','int','long','double','float','boolean','char','String','true','false','null','this','super','import','package'],
  cpp:        ['int','long','double','float','char','bool','void','if','else','for','while','do','return','class','struct','public','private','protected','using','namespace','template','typename','include','new','delete','true','false','nullptr','this','const','static','virtual','override'],
  sql:        ['SELECT','FROM','WHERE','GROUP','BY','ORDER','HAVING','JOIN','LEFT','RIGHT','INNER','OUTER','ON','AS','INSERT','INTO','UPDATE','SET','DELETE','CREATE','TABLE','ALTER','DROP','INDEX','PRIMARY','KEY','FOREIGN','REFERENCES','NOT','NULL','UNIQUE','DEFAULT','CASE','WHEN','THEN','ELSE','END','UNION','ALL','DISTINCT','LIMIT','OFFSET','AND','OR','IN','BETWEEN','LIKE','EXISTS'],
  bash:       ['if','then','else','elif','fi','for','do','done','while','until','case','esac','function','return','echo','export','cd','ls','mkdir','rm','cp','mv','grep','sed','awk','cat','exit','source'],
  rust:       ['fn','let','mut','const','if','else','for','while','loop','match','return','struct','enum','trait','impl','pub','use','mod','crate','self','Self','as','where','async','await','move','ref','true','false','None','Some','Ok','Err','Box','Vec','String','str','i32','u32','i64','u64','f64','bool'],
};

function buildTokenizer(language: string): Tokenizer {
  const lang = language.toLowerCase();
  const kwSet = new Set(KEYWORDS[lang] || []);
  const isCommentLine = (line: string): { i: number } | null => {
    if (lang === 'python' || lang === 'bash' || lang === 'sql' || lang === 'yaml' || lang === 'ruby') {
      const i = line.indexOf('#');
      if (i >= 0) return { i };
    }
    if (['javascript','typescript','java','cpp','c','rust','go'].includes(lang)) {
      const i = line.indexOf('//');
      if (i >= 0) return { i };
    }
    if (lang === 'sql') {
      const i = line.indexOf('--');
      if (i >= 0) return { i };
    }
    return null;
  };
  return (line: string) => {
    const out: Array<{ type: TokenType; text: string }> = [];
    const cm = isCommentLine(line);
    let prefix = line;
    let comment = '';
    if (cm) {
      prefix = line.slice(0, cm.i);
      comment = line.slice(cm.i);
    }
    // Tokenize prefix: strings, numbers, identifiers/keywords, plain
    const re = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(prefix)) !== null) {
      if (m.index > last) out.push({ type: 'plain', text: prefix.slice(last, m.index) });
      const t = m[0];
      if (t.startsWith('"') || t.startsWith("'") || t.startsWith('`')) {
        out.push({ type: 'string', text: t });
      } else if (/^\d/.test(t)) {
        out.push({ type: 'number', text: t });
      } else if (kwSet.has(t)) {
        out.push({ type: 'keyword', text: t });
      } else {
        // Heurística: si va seguido de '(' es función
        const next = prefix[m.index + t.length];
        out.push({ type: next === '(' ? 'fn' : 'plain', text: t });
      }
      last = m.index + t.length;
    }
    if (last < prefix.length) out.push({ type: 'plain', text: prefix.slice(last) });
    if (comment) out.push({ type: 'comment', text: comment });
    return out;
  };
}

const CodeBlock: React.FC<Props> = ({ language, code, caption, theme, revealDelayMs = 0 }) => {
  const tokenize = buildTokenizer(language);
  const lines = code.replace(/\t/g, '  ').split('\n');
  const showLineNumbers = lines.length >= 4;

  return (
    <div
      className="diag-reveal slide-codeblock"
      style={{
        animationDelay: `${revealDelayMs}ms`,
        background: '#0f172a',
        color: '#e2e8f0',
        borderRadius: 12,
        padding: '16px 18px',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 14,
        lineHeight: 1.55,
        overflow: 'auto',
        maxHeight: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          paddingBottom: 10,
          borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
          {language}
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
        </span>
      </div>
      <pre style={{ margin: 0, whiteSpace: 'pre' }}>
        <code>
          {lines.map((line, idx) => (
            <span key={idx} style={{ display: 'block' }}>
              {showLineNumbers && (
                <span style={{ color: '#475569', marginRight: 14, userSelect: 'none', display: 'inline-block', width: 22, textAlign: 'right' }}>
                  {idx + 1}
                </span>
              )}
              {tokenize(line).map((tok, j) => (
                <span key={j} style={{ color: TOKEN_COLORS[tok.type] === TOKEN_COLORS.plain ? '#e2e8f0' : TOKEN_COLORS[tok.type] }}>
                  {tok.text}
                </span>
              ))}
              {line.length === 0 && <span>&nbsp;</span>}
            </span>
          ))}
        </code>
      </pre>
      {caption && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8', fontFamily: theme.fontFamily, fontStyle: 'italic' }}>
          {caption}
        </div>
      )}
    </div>
  );
};

export default CodeBlock;
