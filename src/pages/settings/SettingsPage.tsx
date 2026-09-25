import { Plus, SignOut, Warning } from '@phosphor-icons/react';
import { useState } from 'react';
import { useMe, usePatchMe, useRegions, useSaveSchoolYear, useSendFeedback } from '../../api/core';
import type { Holiday, Me, Term } from '../../api/types';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { shortDate, TERM_LABEL } from '../../lib/format';
import { getTheme, setTheme, type Theme } from '../../lib/theme';
import {
  ActionBar, Button, DateField, EmptyState, List, Page, Row, Section, Segmented, Select, SkeletonList, TextArea, TextField,
  useDraft, useFeedback,
} from '../../ui';
import './settings.css';

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

interface Profile { name: string; school: string; region: string }
interface Year { label: string; terms: Term[]; holidays: Holiday[] }

const profileOf = (me: Me): Profile => ({ name: me.teacher.name, school: me.teacher.school ?? '', region: me.teacher.region ?? '' });
const yearOf = (me: Me): Year => {
  const y = me.school_year;
  return { label: y.label, terms: y.terms, holidays: y.holidays };
};

/** "8 sept 2026 – 22 dic 2026" pair of date fields. */
function Range({ label, start, end, onChange }: { label: string; start: string; end: string; onChange: (start: string, end: string) => void }) {
  return (
    <div className="set-range">
      <span className="field__label">{label}</span>
      <div className="set-dates">
        <DateField short aria-label={`${label}: primer día`} value={start} onChange={(v) => v && onChange(v, end)} />
        <span className="faint">a</span>
        <DateField short aria-label={`${label}: último día`} value={end} min={start} onChange={(v) => v && onChange(start, v)} />
      </div>
    </div>
  );
}

function ProfileSection({ me, value, onChange }: { me: Me; value: Profile; onChange: (p: Profile) => void }) {
  const regions = useRegions();
  const region = regions.data?.find((r) => r.code === value.region);
  return (
    <Section title="Perfil">
      <div className="card card--pad form">
        <TextField label="Nombre" value={value.name} autoComplete="name" onChange={(e) => onChange({ ...value, name: e.target.value })}
          error={value.name.trim() ? undefined : 'Escribe tu nombre.'} />
        <TextField label="Centro" placeholder="IES Miguel de Cervantes" value={value.school} onChange={(e) => onChange({ ...value, school: e.target.value })} />
        <Select label="Comunidad autónoma" value={value.region} onChange={(e) => onChange({ ...value, region: e.target.value })}
          hint={region ? (region.platform ? `Plataforma de notas: ${region.platform}` : 'Sin una plataforma de notas única') : undefined}>
          <option value="">Sin indicar</option>
          {(regions.data ?? []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          {!regions.data && value.region && <option value={value.region}>{me.region?.name ?? value.region}</option>}
        </Select>
      </div>
      <List>
        <Row title="Cuenta" trail={<span className="set-email">{me.teacher.email}</span>} />
        {me.ai_provider === 'none' && <Row title="IA no configurada en este servidor" sub="Corregir con IA, crear materiales y redactar comentarios no están disponibles." wrapSub />}
      </List>
    </Section>
  );
}

/** One holiday of the draft, edited in place: motivo and dates. «Listo» folds it back into its row. */
function HolidayEditor({ value, onChange, onRemove, onDone }: {
  value: Holiday; onChange: (h: Holiday) => void; onRemove: () => void; onDone: () => void;
}) {
  return (
    <div className="row set-holiday">
      <TextField label="Motivo" placeholder="Día del centro" value={value.label} autoFocus={!value.label}
        onChange={(e) => onChange({ ...value, label: e.target.value })} />
      <div className="set-pair">
        <DateField label="Desde" value={value.start}
          onChange={(start) => onChange({ ...value, start, end: value.end && value.end < start ? '' : value.end })} />
        <DateField label="Hasta (opcional)" value={value.end === value.start ? '' : value.end} min={value.start || undefined} clearable
          onChange={(end) => onChange({ ...value, end })} />
      </div>
      <div className="set-holiday__btns">
        <Button size="sm" variant="danger" onClick={onRemove}>Quitar festivo</Button>
        <Button size="sm" variant="tinted" onClick={onDone} disabled={!value.start}>{value.start ? 'Listo' : 'Pon la fecha'}</Button>
      </div>
    </div>
  );
}

function SchoolYearSection({ value, onChange }: { value: Year; onChange: (y: Year) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const setTerm = (n: number, start: string, end: string) => onChange({ ...value, terms: value.terms.map((t) => (t.n === n ? { ...t, start, end } : t)) });
  const setHolidays = (holidays: Holiday[]) => onChange({ ...value, holidays });

  const add = () => {
    setHolidays([...value.holidays, { label: '', start: '', end: '' }]);
    setOpen(value.holidays.length);
  };
  const remove = (i: number) => {
    setHolidays(value.holidays.filter((_, j) => j !== i));
    setOpen(null);
  };

  return (
    <Section title="Curso escolar" footer="Las evaluaciones deciden a qué trimestre va cada nota. Los festivos no tienen clase en Hoy.">
      <div className="card card--pad form">
        <TextField label="Curso" value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} />
        {value.terms.map((t) => (
          <Range key={t.n} label={TERM_LABEL[t.n]} start={t.start} end={t.end} onChange={(s, e) => setTerm(t.n, s, e)} />
        ))}
      </div>

      <div className="section__head set-sub"><h3 className="section__title">Festivos y vacaciones</h3></div>
      <List>
        {value.holidays.map((x, i) => (i === open ? (
          <HolidayEditor key={i} value={x} onChange={(h) => setHolidays(value.holidays.map((y, j) => (j === i ? h : y)))}
            onRemove={() => remove(i)} onDone={() => setOpen(null)} />
        ) : (
          <Row key={i} title={x.label.trim() || 'Festivo'} onClick={() => setOpen(i)} aria-label={`Editar ${x.label.trim() || 'festivo'}`}
            sub={!x.start ? 'Sin fecha' : x.end && x.end !== x.start ? `${shortDate(x.start)} – ${shortDate(x.end)}` : shortDate(x.start)} />
        )))}
        <Row lead={<Plus size={18} className="set-accent" />} title={<span className="set-accent">Añadir festivo</span>} onClick={add} chevron={false} />
      </List>
    </Section>
  );
}

function Appearance() {
  const [theme, set] = useState<Theme>(getTheme);
  return (
    <Section title="Apariencia" footer="Se aplica al momento en este dispositivo.">
      <Segmented full label="Tema" value={theme} onChange={(t) => { set(t); setTheme(t); }}
        options={[{ value: 'system', label: 'Sistema' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]} />
    </Section>
  );
}

function FeedbackSection() {
  const { toast } = useFeedback();
  const send = useSendFeedback();
  const [text, setText] = useState('');
  const submit = async () => {
    try {
      await send.mutateAsync(text.trim());
      setText('');
      toast('Gracias. Leemos todas las sugerencias.');
    } catch (e) {
      toast(errText(e, 'No se ha podido enviar.'), { tone: 'error' });
    }
  };
  return (
    <Section title="Enviar sugerencia">
      <div className="card card--pad form">
        <TextArea aria-label="Sugerencia" placeholder="Qué te falta, qué te sobra o qué no funciona." rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <div><Button variant="tinted" onClick={submit} loading={send.isPending} disabled={text.trim().length < 3}>
          {text.trim().length < 3 ? 'Escribe tu sugerencia' : 'Enviar sugerencia'}
        </Button></div>
      </div>
    </Section>
  );
}

/** Profile + school year are edited as one draft: a sticky "Guardar cambios" bar appears while something changed.
 *  Each part follows /me only while untouched (useDraft) and keeps its edits until *it* is saved. */
function SettingsForm({ me }: { me: Me }) {
  const { toast } = useFeedback();
  const patchMe = usePatchMe();
  const saveYear = useSaveSchoolYear();
  const profile = useDraft(profileOf(me));
  const year = useDraft(yearOf(me));
  const [error, setError] = useState<string | null>(null);
  const saving = patchMe.isPending || saveYear.isPending;
  const blocker = !profile.draft.name.trim() ? 'Escribe tu nombre'
    : year.draft.holidays.some((h) => !h.start) ? 'Pon la fecha del festivo' : null;

  const discard = () => { profile.reset(); year.reset(); setError(null); };
  const save = async () => {
    setError(null);
    try {
      if (profile.dirty) {
        const p = profile.draft;
        const t = await patchMe.mutateAsync({ name: p.name.trim(), school: p.school.trim() || null, region: p.region || null });
        profile.setDraft({ name: t.name, school: t.school ?? '', region: t.region ?? '' });
      }
      if (year.dirty) {
        const holidays = year.draft.holidays.map((h) => ({ label: h.label.trim() || 'Festivo', start: h.start, end: h.end || h.start }));
        year.setDraft(yearOf({ ...me, school_year: await saveYear.mutateAsync({ ...year.draft, holidays }) }));
      }
      toast('Cambios guardados');
    } catch (e) {
      setError(errText(e, 'No se ha podido guardar. Revisa la conexión y vuelve a intentarlo.'));
    }
  };

  return (
    <>
      <ProfileSection me={me} value={profile.draft} onChange={profile.setDraft} />
      <SchoolYearSection value={year.draft} onChange={year.setDraft} />
      {(profile.dirty || year.dirty) && (
        <ActionBar note="Sin guardar" error={error}>
          <Button size="sm" variant="neutral" onClick={discard} disabled={saving}>Descartar</Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!!blocker}>{blocker ?? 'Guardar cambios'}</Button>
        </ActionBar>
      )}
    </>
  );
}

/** /ajustes — perfil, curso escolar, apariencia, sugerencias y cerrar sesión. */
export default function SettingsPage() {
  const { logout } = useAuth();
  const { data: me, error, refetch } = useMe();
  const { confirm } = useFeedback();

  const signOut = async () => {
    if (await confirm({ title: 'Cerrar sesión', text: 'Tendrás que volver a entrar con tu correo y contraseña.', confirm: 'Cerrar sesión', danger: true })) logout();
  };

  return (
    <Page title="Ajustes" back="/hoy" backLabel="Hoy" backToOrigin>
      {error ? (
        <EmptyState icon={<Warning size={26} />} title="No se han podido cargar los ajustes" text={error.message}
          action={<Button variant="tinted" onClick={() => refetch()}>Reintentar</Button>} />
      ) : !me ? <SkeletonList rows={6} /> : (
        <div className="settings">
          <SettingsForm me={me} />
          <Appearance />
          <FeedbackSection />
          <Button variant="danger" full icon={<SignOut size={18} />} onClick={signOut}>Cerrar sesión</Button>
        </div>
      )}
    </Page>
  );
}
