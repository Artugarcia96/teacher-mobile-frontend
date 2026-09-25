import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Bare } from '../../app/Shell';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, Logo, Segmented, TextField } from '../../ui';
import './login.css';

type Mode = 'login' | 'register';

function message(err: unknown, mode: Mode): string {
  if (err instanceof ApiError) {
    if (err.status === 422) return mode === 'register' ? 'Revisa el correo: no parece válido.' : 'Revisa el correo y la contraseña.';
    return err.message;
  }
  return 'Algo ha fallado. Inténtalo de nuevo.';
}

/** /entrar — sign in or create an account (?cuenta=nueva opens «Crear cuenta», as the landing links it). */
export default function LoginPage() {
  const { login, register, loggedIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => (params.get('cuenta') === 'nueva' ? 'register' : 'login'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loggedIn && !busy) return <Navigate to="/hoy" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        navigate('/hoy', { replace: true });
      } else {
        await register(name.trim(), email.trim(), password);
        navigate('/clases?nueva=1', { replace: true });
      }
    } catch (err) {
      setError(message(err, mode));
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <Bare>
      <main className="login glass">
        <div className="login__brand">
          <Logo size={52} />
          <h1 className="display login__name">Sepia</h1>
          <p className="muted">El cuaderno del profesor.</p>
        </div>
        <Segmented full label="Acceso" value={mode} onChange={switchMode}
          options={[{ value: 'login', label: 'Entrar' }, { value: 'register', label: 'Crear cuenta' }]} />
        <form className="form" onSubmit={submit} noValidate>
          {mode === 'register' && (
            <TextField label="Nombre" autoComplete="name" placeholder="Marta Ruiz" value={name} required
              onChange={(e) => setName(e.target.value)} />
          )}
          <TextField label="Correo" type="email" autoComplete="email" inputMode="email" placeholder="nombre@centro.es"
            value={email} required onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Contraseña" type="password" value={password} required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            hint={mode === 'register' ? 'Al menos 8 caracteres.' : undefined}
            onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="field__error" role="alert">{error}</div>}
          <Button type="submit" full loading={busy}
            disabled={!email.trim() || !password || (mode === 'register' && !name.trim())}>
            {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Button>
          {mode === 'register' && (
            <p className="login__legal muted">
              Al crear la cuenta aceptas la <a href="/landing/privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.
            </p>
          )}
        </form>
      </main>
    </Bare>
  );
}
