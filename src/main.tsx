import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/shared/ErrorBoundary';
import './index.css';

const container = document.getElementById('root');
const root = createRoot(container!);
// ErrorBoundary root: cualquier error de render no capturado más abajo
// aterriza aquí en lugar de dejar pantallazo blanco.
root.render(
  <React.StrictMode>
    <ErrorBoundary label="root">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);