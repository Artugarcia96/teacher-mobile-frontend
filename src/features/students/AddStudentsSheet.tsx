import { CheckCircle, Circle, Trash } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAddStudents, useCourseStudents, useGroups, useGroupStudents, useImportStudentsFile, useParseStudents,
  type ParsedStudents,
} from '../../api/core';
import type { CourseDetail } from '../../api/types';
import { ApiError } from '../../lib/api';
import { ordinals, plural } from '../../lib/format';
import {
  Avatar, Button, Callout, Chip, EmptyState, List, Row, Segmented, Sheet, SkeletonList, TextArea, TextField, useFeedback,
} from '../../ui';
import './students.css';

type Mode = 'paste' | 'group';
type Name = { first_name: string; last_name: string };

const PLACEHOLDER = 'García López, Ana\nPablo Ruiz Serrano\nMaría José Fernández Gil\n…';
const initials = (n: Name) => ((n.first_name[0] ?? '') + (n.last_name[0] ?? n.first_name[1] ?? '')).toUpperCase();
const sortName = (n: Name) => (n.last_name ? `${n.last_name}, ${n.first_name}` : n.first_name);

/** One name of the preview being corrected: surname and first name, «Quitar» drops the line. */
function EditName({ name, onChange, onRemove, onDone }: {
  name: Name; onChange: (n: Name) => void; onRemove: () => void; onDone: () => void;
}) {
  return (
    <div className="row add-st__edit">
      <TextField label="Apellidos" value={name.last_name} autoFocus onChange={(e) => onChange({ ...name, last_name: e.target.value })} />
      <TextField label="Nombre" value={name.first_name} onChange={(e) => onChange({ ...name, first_name: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter') onDone(); }} />
      <div className="add-st__edit-actions">
        <Button variant="neutral" size="sm" icon={<Trash size={16} />} onClick={onRemove}>Quitar</Button>
        <Button size="sm" onClick={onDone} disabled={!name.first_name.trim()} title={!name.first_name.trim() ? 'Escribe el nombre' : undefined}>Hecho</Button>
      </div>
    </div>
  );
}

/** Preview of parsed names: the teacher checks the surname/name split; tapping a name corrects it or drops it. */
function Preview({ parsed, onChange }: { parsed: ParsedStudents; onChange: (students: Name[]) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const set = (i: number, n: Name) => onChange(parsed.students.map((x, j) => (j === i ? n : x)));
  return (
    <div className="add-st__preview">
      {parsed.warnings.length > 0 && <Callout tone="warn"><div>{parsed.warnings.map((w, i) => <div key={i}>{w}</div>)}</div></Callout>}
      {parsed.students.length > 0 && (
        <>
          <div className="section__head">
            <h3 className="section__title">{plural(parsed.students.length, 'alumno', 'alumnos')} · Apellidos, Nombre</h3>
          </div>
          <List inset={56}>
            {parsed.students.map((n, i) => (editing === i
              ? <EditName key={i} name={n} onChange={(x) => set(i, x)} onDone={() => setEditing(null)}
                  onRemove={() => { setEditing(null); onChange(parsed.students.filter((_, j) => j !== i)); }} />
              : <Row key={i} lead={<Avatar size="sm" initials={initials(n)} />} title={sortName(n)} chevron={false}
                  trail={<span className="add-st__fix">Corregir</span>} onClick={() => setEditing(i)} />))}
          </List>
        </>
      )}
    </div>
  );
}

/** "Añadir alumnos": paste a list (or pick a PDF/Excel/CSV/TXT file, same preview), or reuse students from another group. */
export default function AddStudentsSheet({ open, onClose, course }: { open: boolean; onClose: () => void; course: CourseDetail }) {
  const { toast } = useFeedback();
  const groupId = course.group.id;
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedStudents | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);  // the preview comes from this file, not the pasted text
  const [fromGroup, setFromGroup] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = useParseStudents();
  const importFile = useImportStudentsFile(groupId);
  const add = useAddStudents(groupId);
  const groups = useGroups();
  const roster = useCourseStudents(open ? course.id : undefined);
  const others = useGroupStudents(mode === 'group' && fromGroup ? fromGroup : undefined);

  useEffect(() => {
    if (!open) return;
    setMode('paste'); setText(''); setParsed(null); setFileName(null); setFromGroup(null); setPicked(new Set()); setError(null);
  }, [open]);

  // Live preview while pasting (debounced). A chosen file fills the same preview until the teacher types again.
  const { mutate: runParse } = parse;
  useEffect(() => {
    if (mode !== 'paste' || fileName) return;
    if (!text.trim()) { setParsed(null); return; }
    const t = setTimeout(() => runParse(text, { onSuccess: setParsed, onError: (e) => setError(e.message) }), 350);
    return () => clearTimeout(t);
  }, [text, mode, fileName, runParse]);

  const changeMode = (m: Mode) => {
    setMode(m); setError(null);
    if (m === 'paste' && text.trim() && !fileName) runParse(text, { onSuccess: setParsed });
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name); setError(null); setParsed(null);
    importFile.mutate(f, { onSuccess: setParsed, onError: (e) => setError(e.message) });
  };
  const onText = (value: string) => { setText(value); setFileName(null); };

  const enrolled = useMemo(() => new Set(roster.data?.map((s) => s.id)), [roster.data]);
  const candidates = (others.data ?? []).filter((s) => !enrolled.has(s.id));
  const otherGroups = (groups.data ?? []).filter((g) => g.id !== groupId && g.student_count > 0);

  const count = mode === 'group' ? picked.size : parsed?.students.length ?? 0;
  const dirty = open && (!!text.trim() || !!parsed || picked.size > 0);
  const blocker = count > 0 ? null : mode === 'paste' ? 'Pega al menos un nombre' : 'Elige alumnos';

  const submit = async () => {
    setError(null);
    try {
      const out = await add.mutateAsync(mode === 'group' ? { student_ids: [...picked] } : { students: parsed!.students });
      const skipped = count - out.length;
      toast(out.length
        ? `${plural(out.length, 'alumno añadido', 'alumnos añadidos')}${skipped > 0 ? ` (${skipped} ya estaban)` : ''}`
        : 'Todos ya estaban en el grupo');
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se han podido añadir. Inténtalo de nuevo.');
    }
  };

  const togglePick = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };
  const editParsed = (students: Name[]) => parsed && setParsed({ ...parsed, students });

  return (
    <Sheet open={open} onClose={onClose} title="Añadir alumnos" subtitle={ordinals(course.group.name)} size="large" dirty={dirty}
      footer={<Button full onClick={submit} loading={add.isPending} disabled={!!blocker}>
        {blocker ?? `Añadir ${plural(count, 'alumno', 'alumnos')}`}
      </Button>}>
      <div className="form">
        {otherGroups.length > 0 && (
          <Segmented full label="Cómo añadir" value={mode} onChange={changeMode} options={[
            { value: 'paste', label: 'Pegar lista' }, { value: 'group', label: 'De otro grupo' },
          ]} />
        )}

        {mode === 'paste' && (
          <>
            <TextArea label="Un alumno por línea" hint="Vale «Apellidos, Nombre» y «Nombre Apellidos», también copiado de Séneca, Raíces o un PDF. Los repetidos se añaden una vez."
              placeholder={PLACEHOLDER} rows={7} value={text} onChange={(e) => onText(e.target.value)} />
            <input ref={fileRef} type="file" accept=".pdf,.csv,.txt,.xlsx,application/pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <p className="add-st__file">
              <button type="button" className="add-st__link" onClick={() => fileRef.current?.click()}>o elige un archivo</button>
              <span className="faint">{fileName ? ` · ${fileName}` : ' (PDF, Excel, CSV o TXT)'}</span>
            </p>
            {importFile.isPending && <SkeletonList rows={3} />}
            {parsed && <Preview key={fileName ?? 'text'} parsed={parsed} onChange={editParsed} />}
          </>
        )}

        {mode === 'group' && (
          <>
            <div className="chip-row">
              {otherGroups.map((g) => (
                <Chip key={g.id} selected={fromGroup === g.id} onClick={() => { setFromGroup(g.id); setPicked(new Set()); }}>{ordinals(g.name)}</Chip>
              ))}
            </div>
            {!fromGroup ? <p className="muted">Elige el grupo del que vienen. Sus notas y observaciones siguen con ellos.</p>
              : others.isLoading ? <SkeletonList rows={4} />
                : candidates.length === 0 ? <EmptyState icon={<CheckCircle size={24} />} title="Ya están todos en esta clase" />
                  : (
                    <>
                      <div className="section__head">
                        <h3 className="section__title">{plural(candidates.length, 'alumno', 'alumnos')}</h3>
                        <button type="button" className="section__action" onClick={() => setPicked(picked.size === candidates.length ? new Set() : new Set(candidates.map((s) => s.id)))}>
                          {picked.size === candidates.length ? 'Ninguno' : 'Todos'}
                        </button>
                      </div>
                      <List inset={52}>
                        {candidates.map((s) => (
                          <Row key={s.id} onClick={() => togglePick(s.id)} chevron={false} title={s.sort_name}
                            lead={picked.has(s.id) ? <CheckCircle size={24} weight="fill" className="add-st__on" /> : <Circle size={24} className="faint" />} />
                        ))}
                      </List>
                    </>
                  )}
          </>
        )}
        {error && <div className="field__error" role="alert">{error}</div>}
      </div>
    </Sheet>
  );
}
