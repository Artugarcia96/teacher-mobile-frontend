import { mkdirSync, writeFileSync } from 'node:fs';

// Log in as the demo teacher through the API and store the tokens as Playwright storage state.
export default async function globalSetup() {
  const APP = process.env.APP || 'http://127.0.0.1:5173';
  const API = process.env.API || 'http://127.0.0.1:8000';
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo@sepia.es', password: 'sepia1234' }),
  });
  if (!r.ok) throw new Error('Demo login failed: run ../teacher-mobile-backend/scripts/dev.sh --demo');
  const t = await r.json();
  mkdirSync('e2e/.results', { recursive: true });
  writeFileSync('e2e/.results/auth.json', JSON.stringify({
    cookies: [],
    origins: [{ origin: APP, localStorage: [{ name: 'sepia.tokens', value: JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token }) }] }],
  }));
}
