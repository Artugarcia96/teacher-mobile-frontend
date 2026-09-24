import { Plus, SignOut, Warning, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useAiUsage, useMe, usePatchMe, useSaveSchoolYear, useSendFeedback } from '../../api/core';
import type { Holiday, Me, Term } from '../../api/types';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatNumber, numericDate, plural, shortDate, TERM_LABEL } from '../../lib/format';
import { getTheme, setTheme, type Theme } from '../../lib/theme';
import {
  Button, EmptyState, IconButton, List, Page, Row, Section, Segmented, Select, SkeletonList, TextArea, TextField, useFeedback,
} from '../../ui';
import './settings.css';

const REGIONS = [
  'Andalucía', 'Aragón', 'Principado de Asturias', 'Illes Balears', 'Canarias', 'Cantabria', 'Castilla-La Mancha',
  'Castilla y León', 'Cataluña', 'Comunitat Valenciana', 'Extremadura', 'Galicia', 'Comunidad de Madrid', 'Región de Murcia',
  'Comunidad Foral de Navarra', 'País Vasco', 'La Rioja', 'Ceuta', 'Melilla',
];

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function Profile({ me }: { me: Me }) {
  const { toast } = useFeedback();
  const patch = usePatchMe();
  const [name, setName] = useState(me.teacher.name);
  const [school, setSchool] = useState(me.teacher.school ?? '');
  const [region, setRegion] = useState(me.teacher.region ?? '');
  const dirty = name !== me.teacher.name || school !== (me.teacher.school ?? '') || region !== (me.teacher.region ?? '');

  const save = async () => {
    try {
      await patch.mutateAsync({ name: name.trim(), school: school.trim() || null, region: region || null });
      toast('Perfil guardado');
    } catch (e) {
      toast(errText(e, 'No se ha podido guardar el perfil.'), { tone: 'error' });
    }
  };

  return (
    <Section title="Perfil" footer={me.teacher.email}>
      <div className="card card--pad form">
        <TextField label="Nombre" value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        <TextField label="Centro" placeholder="IES Miguel de Cervantes" value={school} onChange={(e) => setSchool(e.target.value)} />
        <Select label="Comunidad autónoma" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">Sin indicar</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        {dirty && <div><Button onClick={save} loading={patch.isPending} disabled={!name.trim()}>{name.trim() ? 'Guardar perfil' : 'Escribe tu nombre'}</Button></div>}
      </div>
    </Section>
  );
}

function SchoolYearSection({ me }: { me: Me }) {
  const { toast } = useFeedback();
  const save = useSaveSchoolYear();
  const y = me.school_year;
  const [label, setLabel] = useState(y.label);
  const [start, setStart] = useState(y.start_date);
  const [end, setEnd] = useState(y.end_date);
  const [terms, setTerms] = useState<Term[]>(y.terms);
  const [holidays, setHolidays] = useState<Holiday[]>(y.holidays);
  const [adding, setAdding] = useState(false);
  const [h, setH] = useState<Holiday>({ label: '', start: '', end: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(y.label); setStart(y.start_date); setEnd(y.end_date); setTerms(y.terms); setHolidays(y.holidays);
  }, [y]);

  const dirty = JSON.stringify([label, start, end, terms, holidays]) !== JSON.stringify([y.label, y.start_date, y.end_date, y.terms, y.holidays]);
  const setTerm = (n: number, k: 'start' | 'end', v: string) => setTerms(terms.map((t) => (t.n === n ? { ...t, [k]: v } : t)));

  const addHoliday = () => {
    const item = { label: h.label.trim() || 'Festivo', start: h.start, end: h.end || h.start };
    setHolidays([...holidays, item].sort((a, b) => a.start.localeCompare(b.start)));
    setH({ label: '', start: '', end: '' });
    setAdding(false);
  };

  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({ label, start_date: start, end_date: end, terms, holidays });
      toast('Curso escolar guardado');
    } catch (e) {
      setError(errText(e, 'No se ha podido guardar. Revisa la conexión y vuelve a intentarlo.'));
    }
  };

  const hBlocker = !h.start ? 'Pon la fecha' : h.end && h.end < h.start ? 'El fin va después del inicio' : null;

  return (
    <Section title="Curso escolar" footer="Las evaluaciones deciden a qué trimestre va cada nota. Los festivos no tienen clase en Hoy.">
      <div className="card card--pad form">
        <TextField label="Curso" value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="set-term">
          <span className="field__label">Clases</span>
          <div className="set-dates">
            <input className="input" type="date" aria-label="Primer día de clase" value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="faint">a</span>
            <input className="input" type="date" aria-label="Último día de clase" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {terms.map((t) => (
          <div key={t.n} className="set-term">
            <span className="field__label">{TERM_LABEL[t.n]}</span>
            <div className="set-dates">
              <input className="input" type="date" aria-label={`${TERM_LABEL[t.n]}: inicio`} value={t.start} onChange={(e) => setTerm(t.n, 'start', e.target.value)} />
              <span className="faint">a</span>
              <input className="input" type="date" aria-label={`${TERM_LABEL[t.n]}: fin`} value={t.end} onChange={(e) => setTerm(t.n, 'end', e.target.value)} />
            </div>
          </div>
        ))}
      </div>

      <div className="section__head set-sub"><h3 className="section__title">Festivos y vacaciones</h3></div>
      <List>
        {holidays.map((x, i) => (
          <Row key={`${x.start}-${x.label}`} title={x.label}
            sub={x.end && x.end !== x.start ? `${shortDate(x.start)} – ${shortDate(x.end)}` : numericDate(x.start)}
            trail={<IconButton size="sm" label={`Quitar ${x.label}`} onClick={() => setHolidays(holidays.filter((_, j) => j !== i))}><X size={16} /></IconButton>} />
        ))}
        {!adding ? (
          <Row lead={<Plus size={18} className="set-accent" />} title={<span className="set-accent">Añadir festivo</span>} onClick={() => setAdding(true)} chevron={false} />
        ) : (
          <div className="row set-add">
            <TextField label="Motivo" placeholder="Día del centro" value={h.label} onChange={(e) => setH({ ...h, label: e.target.value })} />
            <div className="set-pair">
              <TextField label="Desde" type="date" value={h.start} onChange={(e) => setH({ ...h, start: e.target.value })} />
              <TextField label="Hasta (opcional)" type="date" value={h.end} onChange={(e) => setH({ ...h, end: e.target.value })} />
            </div>
            <div className="set-add__btns">
              <Button size="sm" variant="neutral" onClick={() => setAdding(false)}>Cancelar</Button>
              <Button size="sm" variant="tinted" onClick={addHoliday} disabled={!!hBlocker}>{hBlocker ?? 'Añadir'}</Button>
            </div>
          </div>
        )}
      </List>
      {error && <div className="field__error" role="alert">{error}</div>}
      {dirty && <div><Button onClick={submit} loading={save.isPending}>Guardar curso escolar</Button></div>}
    </Section>
  );
}

function Appearance() {
  const [theme, set] = useState<Theme>(getTheme);
  return (
    <Section title="Apariencia">
      <Segmented full label="Tema" value={theme} onChange={(t) => { set(t); setTheme(t); }}
        options={[{ value: 'system', label: 'Sistema' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]} />
    </Section>
  );
}

function AISection({ me }: { me: Me }) {
  const usage = useAiUsage();
  const mock = me.ai_provider === 'mock';
  return (
    <Section title="IA" footer="La IA solo propone borradores; nada se guarda como definitivo sin que lo revises.">
      <List>
        <Row title="Modo" trail={<span>{mock ? 'Respuestas simuladas (sin coste)' : 'OpenAI'}</span>} />
        <Row title="Uso este mes" trail={usage.isLoading ? <span className="faint">…</span> : usage.data ? (
          <span className="num">{plural(usage.data.calls, 'petición', 'peticiones')}{!mock && ` · ${formatNumber(usage.data.cost_usd, 2)} US$`}</span>
        ) : <span className="faint">No disponible</span>} />
      </List>
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

/** /ajustes — perfil, curso escolar, apariencia, IA, sugerencias y cerrar sesión. */
export default function SettingsPage() {
  const { logout } = useAuth();
  const { data: me, error, refetch } = useMe();
  const { confirm } = useFeedback();

  const signOut = async () => {
    if (await confirm({ title: 'Cerrar sesión', text: 'Tendrás que volver a entrar con tu correo y contraseña.', confirm: 'Cerrar sesión', danger: true })) logout();
  };

  return (
    <Page title="Ajustes">
      {error ? (
        <EmptyState icon={<Warning size={26} />} title="No se han podido cargar los ajustes" text={error.message}
          action={<Button variant="tinted" onClick={() => refetch()}>Reintentar</Button>} />
      ) : !me ? <SkeletonList rows={6} /> : (
        <div className="settings">
          <Profile me={me} />
          <SchoolYearSection me={me} />
          <Appearance />
          <AISection me={me} />
          <FeedbackSection />
          <Button variant="danger" full icon={<SignOut size={18} />} onClick={signOut}>Cerrar sesión</Button>
        </div>
      )}
    </Page>
  );
}
