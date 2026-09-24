import { ClipboardText, Eyeglasses, FileText, ImageSquare, Notebook, Paperclip, PresentationChart, TextAlignLeft } from '@phosphor-icons/react';
import type { Material, MaterialKind } from '../../api/units';

/** Line icon for a material kind (uploads: by file extension). */
export function MaterialIcon({ kind, filename, size = 20 }: { kind: MaterialKind; filename?: string; size?: number }) {
  switch (kind) {
    case 'notes': return <Notebook size={size} />;
    case 'slides': return <PresentationChart size={size} />;
    case 'summary': return <TextAlignLeft size={size} />;
    case 'adapted': return <Eyeglasses size={size} />;
    case 'worksheet': return <ClipboardText size={size} />;
    default: {
      const ext = (filename ?? '').split('.').pop()?.toLowerCase();
      if (ext && ['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(ext)) return <ImageSquare size={size} />;
      if (ext === 'pdf' || ext === 'docx' || ext === 'txt') return <FileText size={size} />;
      if (ext === 'pptx') return <PresentationChart size={size} />;
      return <Paperclip size={size} />;
    }
  }
}

export const WORKSHEET_KIND_LABEL: Record<string, string> = { refuerzo: 'refuerzo', practica: 'práctica', ampliacion: 'ampliación' };

/** "Ficha de refuerzo", "Apuntes"… */
export function kindLabel(m: Pick<Material, 'kind' | 'options'>): string {
  if (m.kind === 'worksheet') return `Ficha de ${WORKSHEET_KIND_LABEL[String(m.options?.worksheet_kind ?? 'practica')] ?? 'práctica'}`;
  return { upload: 'Archivo subido', notes: 'Apuntes', slides: 'Presentación', summary: 'Resumen', adapted: 'Lectura fácil' }[m.kind];
}
