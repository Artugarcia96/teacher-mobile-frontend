# E2E de Sepia (Playwright)

Cada flujo que un profesor puede recorrer tiene un spec: rutas, pestañas, hojas, menús, botones, formularios, teclado,
estados vacíos y de error, y descargas, en móvil (proyecto `mobile`, 390 px) y escritorio (`desktop`, 1440 px). Son la
red de regresión del proyecto: si cambias una pantalla, su spec tiene que seguir pasando o cambiar en el mismo commit.

## Ejecutar

```bash
npm run e2e:flows    # todo lo que no llama a la IA, en los dos proyectos
npm run e2e:ai       # solo los flujos @ai, con la IA real (claude_cli), en escritorio
npm run e2e          # todo
npx playwright test e2e/flows/hoy --project mobile    # un área, un proyecto
```

`playwright.config.ts` arranca `scripts/dev.sh --demo` del backend y `npm run dev` si no están ya en marcha; `APP` y
`API` apuntan a otros puertos. Para una demo recién sembrada sin tocar la de `./data` del backend:

```bash
cd ../teacher-mobile-backend
D=/tmp/sepia-e2e && rm -rf $D && mkdir -p $D
export SEPIA_DATA_DIR=$D SEPIA_DATABASE_URL=sqlite+aiosqlite:///$D/sepia.db SEPIA_TODAY=2026-11-19 SEPIA_NOW=10:40
.venv/bin/python -m app.seed --reset                     # IA real, 6-10 min; guarda una copia de $D para repetir
.venv/bin/python -m uvicorn app.main:app --port 8690 &
cd ../teacher-mobile-frontend
VITE_API_PROXY=http://127.0.0.1:8690 npx vite --port 5790 --strictPort &
APP=http://127.0.0.1:5790 API=http://127.0.0.1:8690 npm run e2e:flows
```

Playwright necesita las mismas `SEPIA_DATA_DIR` y `SEPIA_DATABASE_URL` que la API: los exámenes copian los del demo
con `flows/fixtures/exam_clone.py` y leen los PDF con el Python del backend (`BACKEND_DIR` y `BACKEND_PYTHON` si el
backend no está en `../teacher-mobile-backend`). `acceso-produccion` monta nginx con `deploy/nginx.conf.template` (se
salta si no hay nginx) y `acceso-registro` arranca una segunda API con el registro cerrado.

Variables: `SHOTS=1` guarda capturas en `e2e/screenshots/<proyecto>/`; `SHOW_BUGS=1` ejecuta como tests normales los
que están marcados como fallo esperado.

## Reglas de los specs

- **Independientes.** Cada test que cambia datos se registra como un profesor propio por la API (o trabaja sobre una
  copia de un examen del demo) y deja el demo como estaba; ningún test depende de otro ni del orden de los ficheros.
  Lo que solo lee el demo cuenta con su «hoy» congelado: jueves 19/11/2026, 10:40.
- **Selectores del profesor:** rol, etiqueta y texto (`getByRole`, `getByLabel`, `getByText`), nunca clases CSS
  salvo para comprobar un estado visual. Aserciones que esperan (`await expect(…).toBeVisible()`), no `waitForTimeout`.
- **Lo que el servidor guarda se comprueba por la API**, no solo en pantalla.
- **Bugs de la app:** el spec afirma lo correcto y llama a `bug('ÁREA-NN', 'qué pasa')` del helper de su área (en
  acceso, `test.fail(true, …)`), que lo marca como fallo esperado. Cuando se arregla, Playwright avisa «Expected to
  fail, but passed» y hay que quitar la llamada. Si la app cambia a propósito, el spec cambia con ella.
- **@ai** en el título = el flujo llama a la IA real (claude_cli, los mismos prompts y esquemas que producción). Cada
  paso de IA espera hasta 4 minutos (`AI_STEP`) mirando el progreso del trabajo en pantalla. Sin `@ai` no se llama a
  la IA: la suite normal es rápida y no depende de ella.

## Inventario

| Área | Specs (`e2e/flows/`) | Qué cubre |
| --- | --- | --- |
| Acceso | `acceso-landing`, `acceso-registro`, `acceso-entrar`, `acceso-sesion`, `acceso-primer-dia`, `acceso-primer-temario`, `acceso-produccion` | Landing y páginas legales, crear cuenta (y registro cerrado), entrar y salir, sesión caducada, el primer día de una cuenta nueva (clases, horario, lista de alumnos, perfil), el primer temario y la web tal como la sirve nginx |
| Hoy | `hoy`, `hoy-lista`, `hoy-clase`, `hoy-vigilar`, `hoy-agenda` | La tarjeta del día a cada hora, otros días, Pendiente, materiales, Pasar lista, Revisar deberes, Cerrar clase, Anotar, «No hay clase», A vigilar, eventos y «Voy a faltar» |
| Clases | `clases-lista`, `clases-nueva`, `clases-clase`, `clases-ajustes`, `clases-temario`, `clases-importar` | Lista de clases y búsqueda, Nueva clase, cabecera y menú de la clase, Ajustes de la clase, archivar y borrar, Ponderaciones, Temario y su importación con IA |
| Cuaderno | `cuaderno-notas`, `cuaderno-columnas`, `cuaderno-medias`, `cuaderno-faltas`, `cuaderno-deberes`, `cuaderno-menu`, `cuaderno-ia` | Poner notas (toque y teclado), columnas, medias y «Cómo se calcula», Final, repescas y recuperaciones, «Deberes», menú y CSV, borradores de la IA |
| Alumnos | `alumnos-lista`, `alumnos-anadir`, `alumnos-ficha`, `alumnos-apoyos`, `alumnos-observaciones`, `alumnos-vigilar`, `alumnos-quitar`, `alumnos-buscar`, `alumnos-tutoria`, `alumnos-red`, `alumnos-teclado` | Lista de la clase, Añadir alumnos (pegar, archivo, otro grupo), ficha, datos y apoyos, observaciones, A vigilar, quitar de un grupo, búsqueda, Preparar tutoría, sin conexión y teclado |
| Faltas | `faltas-tab`, `faltas-listas`, `faltas-efectos` | Pestaña Faltas, listas de hoy y sin pasar, editar una lista, y lo que una falta cambia en la ficha, A vigilar, Evaluación, acta, examen y deberes |
| Exámenes | `examenes-actividad`, `examenes-preparar`, `examenes-versiones`, `examenes-recoger`, `examenes-revisar`, `examenes-faltas`, `examenes-ia` | Página de la actividad, Preparar (rúbrica, PDF), versiones, Recoger el montón escaneado, Revisar y modo foco, faltas al examen y repesca, y generar, corregir y adaptar con IA |
| Evaluación | `evaluacion-bandeja`, `evaluacion-pagina`, `evaluacion-alumno`, `evaluacion-menu`, `evaluacion-informe`, `evaluacion-comentarios`, `evaluacion-ia` | Evaluar (bandeja e insignia), la página de la evaluación, la hoja del alumno, el menú y las recuperaciones, el informe del departamento, y los comentarios de boletín con IA |
| Marco | `marco-navegacion`, `marco-ajustes`, `marco-kit`, `marco-ficheros`, `marco-red`, `marco-ia` | Barra lateral y cápsula, volver, rutas profundas, Ajustes, avisos, menús, hojas, buscador de escritorio, ficheros firmados y compartidos, red y servidor, avisos de IA al terminar |

Los specs de `e2e/*.spec.ts` son regresiones concretas anteriores (dos dispositivos en una lista, nota sin guardar,
festivos, hojas y gesto atrás, presentación de materiales…) y siguen las mismas reglas. Cada área tiene su helper
(`flows/<área>-helpers.ts` o `flows/<área>.helpers.ts`) con su cliente de API, sus profesores de prueba y su `bug()`.
