import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookOpen, Brain, BarChart3, ArrowRight } from 'lucide-react';
import Spinner from '@/components/shared/Spinner';
import { auth } from '../../services/api';
import SepiaLogo from '../../components/SepiaLogo';
import './Login.css';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      if (isRegister) {
        await auth.register(email, password, name);
      } else {
        await auth.login(email, password);
      }
      navigate('/tabs/calendar', { replace: true });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail[0]?.msg || 'Error de validación');
      } else if (typeof detail === 'string') {
        setError(detail);
      } else {
        setError('Ha ocurrido un error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* ── Animated mesh background ── */}
      <div className="login-bg">
        <div className="login-blob login-blob--1" />
        <div className="login-blob login-blob--2" />
        <div className="login-blob login-blob--3" />
        <div className="login-dot-grid" />
      </div>

      {/* ── Desktop: two-column layout ── */}
      <div className="login-layout">
        {/* Left brand panel (desktop) */}
        <div className="login-brand-panel">
          <div className="login-brand-inner">
            <div className="login-brand-logo">
              <SepiaLogo size={56} variant="white" responsive={false} />
            </div>
            <h1 className="login-brand-name">SEPIA</h1>
            <p className="login-brand-sub">Education</p>
            <p className="login-brand-tagline">
              La plataforma inteligente que transforma tu forma de enseñar
            </p>

            <div className="login-features">
              <div className="login-feature">
                <div className="login-feature-icon">
                  <Brain size={18} />
                </div>
                <span className="login-feature-text">Corrección automática con IA</span>
              </div>
              <div className="login-feature">
                <div className="login-feature-icon">
                  <BookOpen size={18} />
                </div>
                <span className="login-feature-text">Gestión de clases y exámenes</span>
              </div>
              <div className="login-feature">
                <div className="login-feature-icon">
                  <BarChart3 size={18} />
                </div>
                <span className="login-feature-text">Seguimiento del progreso estudiantil</span>
              </div>
            </div>
          </div>
        </div>

        {/* Form panel */}
        <div className="login-form-panel">
          <div className="login-glass-card">
            {/* Mobile logo inside card */}
            <div className="login-card-logo">
              <div className="login-card-logo-wrap">
                <SepiaLogo size={40} variant="white" responsive={false} />
              </div>
              <span className="login-card-logo-text">SEPIA Education</span>
            </div>

            <div className="login-form-header">
              <h2 className="login-form-title">
                {isRegister ? 'Crear cuenta' : '¡Bienvenido!'}
              </h2>
              <p className="login-form-desc">
                {isRegister
                  ? 'Completa tus datos para comenzar'
                  : 'Inicia sesión para continuar'}
              </p>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <span>{error}</span>
              </div>
            )}

            <div className="login-form-fields">
              {isRegister && (
                <div className="login-input-wrap">
                  <label className="login-input-label">Nombre</label>
                  <Input
                    type="text"
                    placeholder="Tu nombre completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="login-input"
                  />
                </div>
              )}

              <div className="login-input-wrap">
                <label className="login-input-label">Correo electrónico</label>
                <Input
                  type="email"
                  placeholder="nombre@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="login-input"
                />
              </div>

              <div className="login-input-wrap">
                <div className="login-input-row">
                  <label className="login-input-label">Contraseña</label>
                  {!isRegister && (
                    <button type="button" className="login-forgot" disabled>
                      ¿Olvidaste?
                    </button>
                  )}
                </div>
                <Input
                  type="password"
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="login-input"
                />
              </div>

              <Button
                className="w-full login-button"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <Spinner size={20} className="text-white" />
                ) : (
                  <>
                    {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
                    <ArrowRight size={16} className="login-button-arrow" />
                  </>
                )}
              </Button>
            </div>

            <div className="login-divider">
              <span>{isRegister ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}</span>
            </div>

            <button
              type="button"
              className="login-toggle"
              onClick={() => {
                setIsRegister(!isRegister);
                setEmail('');
                setPassword('');
                setName('');
                setError('');
              }}
            >
              {isRegister ? 'Iniciar sesión' : 'Registrarse'}
            </button>
          </div>

          <div className="login-footer">
            <p>Plataforma educativa impulsada por IA</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
