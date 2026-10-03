import { DownloadSimple, FilePdf, FileZip, PresentationChart, Scissors } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { downloadMaterial, type FileVariant, type LessonInfo } from '../../api/units';
import { List, Row, RowIcon, Section, Sheet, Spinner, useFeedback } from '../../ui';

const PER_LESSON: { variant: FileVariant; label: string; aria: string; icon: ReactNode }[] = [
  { variant: 'pptx', label: 'PowerPoint', aria: 'PowerPoint', icon: <PresentationChart size={20} /> },
  { variant: 'pdf', label: 'PDF para alumnos', aria: 'PDF para alumnos', icon: <FilePdf size={20} /> },
  { variant: 'teacher', label: 'PDF del profesor (con notas)', aria: 'PDF del profesor', icon: <FilePdf size={20} /> },
  { variant: 'sheet', label: 'Hoja para los alumnos', aria: 'Hoja para los alumnos', icon: <Scissors size={20} /> },
];

/** «Descargar» of a presentation: the four files of each ready lesson, and the whole deck as one ZIP of PowerPoints
 *  or one students' PDF. A lesson still being written has nothing to download yet. */
export default function DownloadsSheet({ materialId, lessons, onClose }: {
  materialId: string; lessons: LessonInfo[]; onClose: () => void;
}) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const get = async (variant: FileVariant, lesson?: number) => {
    const key = `${variant}:${lesson ?? ''}`;
    setBusy(key);
    try {
      await downloadMaterial(materialId, variant, lesson);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const trail = (key: string) => (busy === key ? <Spinner /> : <DownloadSimple size={18} />);
  const ready = lessons.filter((l) => l.status === 'ready');
  const pending = lessons.length - ready.length;
  return (
    <Sheet open onClose={onClose} title="Descargar" size="large"
      subtitle={pending ? `${pending === 1 ? 'Una sesión se está' : `${pending} sesiones se están`} preparando: sus archivos aparecerán aquí.` : undefined}>
      <div className="downloads">
        {ready.map((l) => (
          <Section key={l.n} title={`Sesión ${l.n} · ${l.title}`}>
            <List>
              {PER_LESSON.map((f) => (
                <Row key={f.variant} lead={<RowIcon>{f.icon}</RowIcon>} title={f.label} chevron={false}
                  trail={trail(`${f.variant}:${l.n}`)} aria-label={`Descargar ${f.aria} de la sesión ${l.n}`}
                  onClick={() => void get(f.variant, l.n)} />
              ))}
            </List>
          </Section>
        ))}
        {ready.length > 1 && (
          <Section title="Todas las sesiones">
            <List>
              <Row lead={<RowIcon><FileZip size={20} /></RowIcon>} title="Todas las sesiones (PowerPoint, ZIP)" chevron={false}
                trail={trail('zip:')} onClick={() => void get('zip')} />
              <Row lead={<RowIcon><FilePdf size={20} /></RowIcon>} title="PDF para alumnos (todas las sesiones)" chevron={false}
                trail={trail('pdf:')} onClick={() => void get('pdf')} />
            </List>
          </Section>
        )}
        <p className="downloads__note">Los cambios que hagas en PowerPoint no vuelven a Sepia. Las fórmulas se editan en Sepia.</p>
      </div>
    </Sheet>
  );
}
