import type { SlideThemeTokens } from '../themes';

interface Props {
  columns: string[];
  rows: string[][];
  highlightedRow?: number;
  caption?: string;
  theme: SlideThemeTokens;
  revealDelayMs?: number;
}

/* Tabla editorial limpia: header con fondo del primary tono al 8 %, filas
 * alternas con fondo muy sutil, fila destacada con borde lateral en accent.
 * Diseñada para que se vea integrada en la slide, no como un widget de admin
 * panel.
 */
const TableBlock: React.FC<Props> = ({ columns, rows, highlightedRow, caption, theme, revealDelayMs = 0 }) => {
  return (
    <div
      className="diag-reveal slide-table"
      style={{
        animationDelay: `${revealDelayMs}ms`,
        width: '100%',
        overflow: 'hidden',
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: theme.bg,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: theme.fontFamily }}>
        {columns.length > 0 && (
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: 'left',
                    padding: '12px 16px',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: theme.primary,
                    background: `color-mix(in srgb, ${theme.primary} 6%, transparent)`,
                    borderBottom: `2px solid ${theme.border}`,
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => {
            const isHighlight = highlightedRow === ri;
            return (
              <tr
                key={ri}
                style={{
                  background: isHighlight
                    ? `color-mix(in srgb, ${theme.accent} 7%, transparent)`
                    : ri % 2 === 1
                      ? `color-mix(in srgb, ${theme.text} 2%, transparent)`
                      : 'transparent',
                  borderLeft: isHighlight ? `3px solid ${theme.accent}` : '3px solid transparent',
                }}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: '12px 16px',
                      fontSize: 15,
                      color: theme.text,
                      borderTop: ri === 0 ? 'none' : `1px solid color-mix(in srgb, ${theme.border} 60%, transparent)`,
                      fontWeight: ci === 0 ? 600 : 400,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {caption && (
        <div style={{ padding: '10px 16px', fontSize: 12, color: theme.textMuted, fontStyle: 'italic', borderTop: `1px solid ${theme.border}` }}>
          {caption}
        </div>
      )}
    </div>
  );
};

export default TableBlock;
