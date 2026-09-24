/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { realpathSync } from 'node:fs';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

// Dev: the app calls /api/* on the same origin and Vite proxies to the backend.
// Set VITE_API_PROXY to point to another backend (default http://127.0.0.1:8000).
const target = process.env.VITE_API_PROXY || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT || 5173),
    proxy: { '/api': { target, changeOrigin: true } },
    allowedHosts: ['.trycloudflare.com'],
    // node_modules may be a symlink (git worktrees): allow serving its real path (fonts, KaTeX).
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules')] },
  },
  preview: { proxy: { '/api': { target, changeOrigin: true } } },
  test: { globals: true, environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
