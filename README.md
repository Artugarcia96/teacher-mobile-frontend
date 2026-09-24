# Sepia · app

**Sepia** es el cuaderno del profesor de Secundaria y Bachillerato: Hoy (clase actual, pasar lista, anotar), Clases (cuaderno de notas, alumnos, programación y materiales, asistencia) y Evaluar (corrección de exámenes con IA, evaluación trimestral y comentarios de boletín).

React 19 + Vite + TanStack Query, con un kit de componentes propio de estilo *Liquid Glass* («cristal para el marco, papel para el contenido»). Se empaqueta para móvil con Capacitor.

- Qué hace y por qué: [`docs/PRODUCT.md`](docs/PRODUCT.md)
- Sistema de diseño: [`docs/DESIGN.md`](docs/DESIGN.md)
- Reglas para agentes y colaboradores: [`CLAUDE.md`](CLAUDE.md)
- API: [`../teacher-mobile-backend/docs/ARCHITECTURE.md`](../teacher-mobile-backend/docs/ARCHITECTURE.md)
- Landing: [`landing/`](landing/) (estática, con capturas reales)

## Arrancar

```bash
npm install
../teacher-mobile-backend/scripts/dev.sh --demo   # en otra terminal: API con datos de ejemplo e IA simulada
npm run dev                                       # http://127.0.0.1:5173 · demo@sepia.es / sepia1234
```

## Comprobar

```bash
npm run check    # tipos, tokens de diseño y lint
npm run e2e      # flujos de profesor con Playwright (móvil y escritorio)
npm run shots    # lo mismo guardando capturas en e2e/screenshots/
```
