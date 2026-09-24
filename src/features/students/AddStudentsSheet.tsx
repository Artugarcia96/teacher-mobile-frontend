import { CheckCircle, Circle, FileArrowUp, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAddStudents, useCourseStudents, useGroups, useGroupStudents, useImportStudentsFile, useParseStudents,
  type ParsedStudents,
} from '../../api/core';
import type { CourseDetail } from '../../api/types';
import { ApiError } from '../../lib/api';
import { ordinals, plural } from '../../lib/format';
import {
  Avatar, Button, Callout, Chip, EmptyState, IconButton, List, Row, Segmented, Sheet, SkeletonList, TextArea, useFeedback,
} from '../../ui';
import './students.css';

type Mode = 'paste' | 'csv' | 'group';
type Name = { first_name: string; last_name: string };

const PLACEHOLDER = 'García López, Ana\nPablo Ruiz Serrano\nMaría José Fernández Gil\n…';
const initials = (n: Name) => ((n.first_name[0] ?? '') + (n.last_name[0] ?? n.first_name[1] ?? '')).toUpperCase();
const sortName = (n: Name) => (n.last_name ? `${n.last_name}, ${n.first_name}` : n.first_name);

/** Preview of parsed names: the teacher checks the surname/name split and can drop lines. */
function Preview({ parsed, onRemove }: { parsed: ParsedStudents; onRemove: (i: number) => void }) {
  return (
    <div className="add-st__preview">
      {parsed.warnings.length > 0 && <Callout tone="warn"><div>{parsed.warnings.map((w) => <div key={w}>{w}</div>)}</div></Callout>}
      {parsed.students.length > 0 && (
        <>
          <div className="section__head"><h3 className="section__title">{plural(parsed.students.length, 'alumno', 'alumnos')} · Apellidos, Nombre</h3></div>
          <List inset={56}>
            {parsed.students.map((n, i) => (
              <Row key={`${n.last_name}-${n.first_name}-${i}`} lead={<Avatar size="sm" initials={initials(n)} />} title={sortName(n)}
                trail={<IconButton size="sm" label={`Quitar ${n.first_name}`} onClick={() => onRemove(i)}><X size={16} /></IconButton>} />
            ))}
          </List>
        </>
      )}
    </div>
  );
}

/** "Añadir alumnos": paste a list, import a CSV, or reuse students from another group. */
export default function AddStudentsSheet({ open, onClose, course }: { open: boolean; onClose: () => void; course: CourseDetail }) {
  const { toast } = useFeedback();
  const groupId = course.group.id;
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedStudents | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
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

  // Live preview while pasting (debounced).
  const { mutate: runParse } = parse;
  useEffect(() => {
    if (mode !== 'paste') return;
    if (!text.trim()) { setParsed(null); return; }
    const t = setTimeout(() => runParse(text, { onSuccess: setParsed, onError: (e) => setError(e.message) }), 350);
    return () => clearTimeout(t);
  }, [text, mode, runParse]);

  const changeMode = (m: Mode) => {
    setMode(m); setParsed(null); setError(null); setFileName(null);
    if (m === 'paste' && text.trim()) runParse(text, { onSuccess: setParsed });
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name); setError(null); setParsed(null);
    importFile.mutate(f, { onSuccess: setParsed, onError: (e) => setError(e.message) });
  };

  const enrolled = useMemo(() => new Set(roster.data?.map((s) => s.id)), [roster.data]);
  const candidates = (others.data ?? []).filter((s) => !enrolled.has(s.id));
  const otherGroups = (groups.data ?? []).filter((g) => g.id !== groupId && g.student_count > 0);

  const count = mode === 'group' ? picked.size : parsed?.students.length ?? 0;
  const blocker = count > 0 ? null
    : mode === 'paste' ? 'Pega al menos un nombre' : mode === 'csv' ? 'Elige un archivo' : 'Elige alumnos';

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
  const removeParsed = (i: number) => parsed && setParsed({ ...parsed, students: parsed.students.filter((_, j) => j !== i) });

  return (
    <Sheet open={open} onClose={onClose} title="Añadir alumnos" subtitle={ordinals(course.group.name)} size="large"
      footer={<Button full onClick={submit} loading={add.isPending} disabled={!!blocker}>
        {blocker ?? `Añadir ${plural(count, 'alumno', 'alumnos')}`}
      </Button>}>
      <div className="form">
        <Segmented full label="Cómo añadir" value={mode} onChange={changeMode} options={[
          { value: 'paste', label: 'Pegar lista' }, { value: 'csv', label: 'Importar CSV' },
          ...(otherGroups.length ? [{ value: 'group' as const, label: 'De otro grupo' }] : []),
        ]} />

        {mode === 'paste' && (
          <>
            <TextArea label="Un alumno por línea" hint="Vale «Apellidos, Nombre» y «Nombre Apellidos». Los repetidos se añaden una vez."
              placeholder={PLACEHOLDER} rows={7} value={text} onChange={(e) => setText(e.target.value)} />
            {parsed && <Preview parsed={parsed} onRemove={removeParsed} />}
          </>
        )}

        {mode === 'csv' && (
          <>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="list">
              <Row lead={<FileArrowUp size={22} />} title={fileName ?? 'Elegir archivo CSV'} onClick={() => fileRef.current?.click()}
                sub={fileName ? 'Toca para elegir otro' : 'Columnas «Nombre» y «Apellidos», o una sola columna «Alumno». Excel: guárdalo como CSV.'} wrapSub />
            </div>
            {importFile.isPending && <SkeletonList rows={3} />}
            {parsed && <Preview parsed={parsed} onRemove={removeParsed} />}
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
