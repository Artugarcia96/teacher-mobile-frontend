import { useState } from 'react';
import {
  IonPage,
  IonContent,
  IonInput,
  IonButton,
  IonText,
  IonSpinner,
  IonCard,
  IonCardContent,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { auth } from '../../services/api';
import SepiaLogo from '../../components/SepiaLogo';
import './Login.css';

const Login: React.FC = () => {
  const history = useHistory();
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
      // Tokens are set as httpOnly cookies by the server — no localStorage
      history.replace('/tabs/calendar');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        // Validation errors - extract first message
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
    <IonPage>
      <IonContent className="login-content">
        <div className="login-container">
          <div className="login-brand">
            <div className="login-icon-wrap">
              <SepiaLogo size={80} className="login-logo" variant="colored" />
            </div>
            <h1 className="login-title">SEPIA Education</h1>
            <p className="login-subtitle">Tu asistente educativo inteligente</p>
          </div>

          <IonCard className="login-card">
            <IonCardContent>
              {error && (
                <div className="login-error" role="alert">
                  <IonText color="danger">{error}</IonText>
                </div>
              )}

              {isRegister && (
                <IonInput
                  className="login-input"
                  type="text"
                  label="Nombre"
                  labelPlacement="floating"
                  value={name}
                  onIonInput={(e) => setName(e.detail.value || '')}
                  onKeyDown={handleKeyDown}
                />
              )}

              <IonInput
                className="login-input"
                type="email"
                label="Correo electrónico"
                labelPlacement="floating"
                value={email}
                onIonInput={(e) => setEmail(e.detail.value || '')}
                onKeyDown={handleKeyDown}
              />

              <IonInput
                className="login-input"
                type="password"
                label="Contraseña"
                labelPlacement="floating"
                value={password}
                onIonInput={(e) => setPassword(e.detail.value || '')}
                onKeyDown={handleKeyDown}
              />

              <IonButton
                expand="block"
                className="login-button"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? <IonSpinner name="crescent" /> : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
              </IonButton>

              {!isRegister && (
                <button type="button" className="login-forgot" disabled>
                  ¿Olvidaste tu contraseña?
                </button>
              )}

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
                {isRegister ? '¿Ya tienes cuenta? Iniciar sesión' : '¿No tienes cuenta? Registrarse'}
              </button>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Login;
