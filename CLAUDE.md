# Sepia — frontend (React + Vite)

Cuaderno del profesor para Secundaria/Bachillerato en España. Backend hermano en `../teacher-mobile-backend`.

**Antes de tocar nada lee:** `docs/PRODUCT.md` (qué y por qué, glosario, flujos) y `docs/DESIGN.md` (sistema visual). El contrato de API está en `../teacher-mobile-backend/docs/ARCHITECTURE.md`.

## Comandos

```bash
npm run dev          # http://127.0.0.1:5173 — proxy /api → http://127.0.0.1:8000 (VITE_API_PROXY para cambiarlo)
npm run check        # typecheck + tokens (sin colores sueltos) + eslint. Debe pasar antes de cada commit.
npm run build        # build de producción
npm run e2e          # Playwright: flujos de profesor contra el backend en modo demo
npm run shots        # igual, guardando capturas en e2e/screenshots/
```

Backend en modo demo (IA real vía Claude, datos de ejemplo, "hoy" congelado en 19/11/2026 10:40):
`../teacher-mobile-backend/scripts/dev.sh --demo` · usuario `demo@sepia.es` / `sepia1234`.

## Reglas

1. **IA real en desarrollo, igual que en producción.** El backend usa por defecto `claude_cli` (mismos prompts y esquemas que producción, ejecutados con Claude por terminal). Nunca pongas `SEPIA_AI_PROVIDER=openai` en desarrollo (cuesta dinero) ni uses el `mock` para probar la experiencia: el mock es solo para tests unitarios. Las operaciones de IA tardan de verdad (10-80 s): la interfaz debe mostrar progreso y dejar seguir trabajando.
2. **Nada de cálculos de notas en el cliente.** Medias, propuestas y "a vigilar" vienen del backend. Aquí solo se formatea (`src/lib/format.ts`).
3. **Kit único** (`src/ui`): `Page`, `Section`, `List`/`Row`, `Sheet`, `Segmented`, `Button`, campos, `Chip`, `GradePill`, `EmptyState`… No crees cabeceras, tarjetas o modales propios. Si falta algo genérico, añádelo al kit (y a `src/ui/ui.css`).
4. **Colores solo en `src/styles/tokens.css`.** CSS de página = layout (grid, gap, tamaños). `npm run check:tokens` lo vigila.
5. **Datos con TanStack Query**: hooks por área en `src/api/<área>.ts` (`keys` + `useX` + `useXMutation` que invalida). Tipos compartidos en `src/api/types.ts`.
6. **Textos en español de España**, sobrios: sin emojis, sin exclamaciones, sin "chispas" de IA. La IA se marca con `AIBadge` ("Borrador IA"). Botones con verbo; deshabilitados dicen por qué.
7. **Cada mutación da feedback** (`useFeedback().toast`) y cada acción destructiva pide confirmación (`confirm`) y vive en un menú o al final de una hoja.
8. **Móvil primero** (390 px) y escritorio (1440 px). Área táctil ≥ 44 px. Comprueba ambos con capturas (skill `ui-review`).
9. Math en contenido: `$…$` LaTeX → usa `<RichText text=… />`.
10. **Código limpio, sin versiones paralelas.** Cuando algo se sustituye, lo anterior se borra en el mismo cambio. Prohibido nombrar por versión (`v1`, `v2`, `New…`, `Old…`, `legacy`) componentes, hooks, rutas o textos; los nombres describen qué hacen. Nada de código muerto ni comentarios de historia: eso vive en git.

## Mapa

```
src/app/Shell.tsx        marco: barra lateral (escritorio) + cápsula de pestañas (móvil)
src/App.tsx              rutas (ver docs/PRODUCT.md §3)
src/pages/<área>/        una carpeta por pantalla; CoursePage monta las pestañas de la clase
src/features/            piezas usadas desde varias pantallas (QuickNoteSheet, TakeAttendanceSheet, CourseSettingsSheet…)
src/api/                 hooks de datos por área
src/lib/                 api.ts (fetch + auth + errores), auth.tsx, format.ts
src/ui/                  kit de componentes + ui.css
e2e/                     flujos Playwright + capturas
landing/                 landing page estática con capturas reales
```

## Flujo de trabajo para agentes

- Cambia lo mínimo que resuelve la tarea; no dejes código muerto ni TODOs sin dueño.
- Tras cambiar UI: `npm run check`, arranca backend demo + `npm run dev`, captura móvil y escritorio y **mira las capturas** antes de dar algo por terminado (skill `ui-review`).
- Si necesitas un endpoint nuevo o distinto: cámbialo en el backend (con test) y actualiza `docs/ARCHITECTURE.md` del backend en el mismo commit.
