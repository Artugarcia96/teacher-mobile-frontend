import '@fontsource-variable/instrument-sans';
import '@fontsource/instrument-serif';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme } from './lib/theme';
import './styles/tokens.css';
import './styles/base.css';
import './ui/ui.css';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
