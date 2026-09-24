---
name: run-app
description: Start Sepia locally (backend in demo mode with mock AI + frontend dev server) to try a change, take screenshots or run E2E. Use before any UI verification.
---

# Arrancar Sepia en local (modo demo, IA real vía Claude por terminal)

1. Backend (puerto 8000), resembrando el profesor demo y congelando "hoy" en jueves 19/11/2026 10:40:
   ```bash
   cd ../teacher-mobile-backend && scripts/dev.sh --demo      # en segundo plano (run_in_background)
   curl -s localhost:8000/api/health    # → {"ok":true,"ai_provider":"mock"}
   ```
   `ai_provider` debe ser `claude_cli` (prompts reales vía Claude por terminal). Si dice `openai`, PARA: alguien ha puesto `SEPIA_AI_PROVIDER=openai` (cuesta dinero). La siembra con IA real tarda unos minutos; `python -m app.seed --reset --mock` es rápida pero solo sirve para comprobar que no se rompe nada, no para evaluar la experiencia.
2. Frontend (puerto 5173): `npm run dev` (en segundo plano). Proxy `/api` → 8000.
3. Entrar: `demo@sepia.es` / `sepia1234`.

Si otro agente ya usa los puertos, usa otros: `PORT=8011 scripts/dev.sh --demo` y `VITE_API_PROXY=http://127.0.0.1:8011 PORT=5184 npm run dev`
(y `API=http://127.0.0.1:8011 APP=http://127.0.0.1:5184` para `e2e/shoot.mjs`).

Para parar: mata solo los procesos que arrancaste tú (por puerto), nunca todos los `uvicorn`/`vite` de la máquina.
