/** How the edit sheets write a field as text: one line, a paragraph, one item per line, the cells of one row, a table
 *  (one row per line) or pairs («izquierda | derecha»). Cells are separated by « | » with a space on each side, so an
 *  absolute value |x| stays in its cell. */
export type TextKind = 'line' | 'area' | 'lines' | 'cells' | 'rows' | 'pairs';

export const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

/** The cells of one line: a «|» is a separator when it has a space (or the start or end of the line) on each side. */
export function cells(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  for (let i = 0; i < line.length; i++) {
    const separator = line[i] === '|' && (i === 0 || line[i - 1] === ' ') && (i === line.length - 1 || line[i + 1] === ' ');
    if (separator) {
      out.push(cell.trim());
      cell = '';
    } else cell += line[i];
  }
  out.push(cell.trim());
  return out;
}

export function toText(kind: TextKind, v: unknown): string {
  if (kind === 'lines') return ((v as string[]) ?? []).join('\n');
  if (kind === 'cells') return ((v as string[]) ?? []).join(' | ');
  if (kind === 'rows' || kind === 'pairs') return ((v as string[][]) ?? []).map((r) => r.join(' | ')).join('\n');
  return String(v ?? '');
}

export function fromText(kind: TextKind, text: string): unknown {
  if (kind === 'lines') return lines(text);
  if (kind === 'cells') return cells(text).filter(Boolean);
  if (kind === 'rows') return lines(text).map(cells);
  if (kind === 'pairs') return lines(text).map(cells).filter((p) => p.length === 2 && p[0] && p[1]);
  return text.trim();
}
