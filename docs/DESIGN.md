# Sepia — sistema de diseño

> "Cristal para el marco, papel para el contenido."
> Todo color, radio, sombra, tipografía y duración sale de `src/styles/tokens.css`. Ningún componente escribe un hex o un `rgba()` fuera de ese archivo (lo comprueba `npm run check:tokens`).

## 1. Materiales

| Material | Dónde | Cómo |
|---|---|---|
| **Lienzo** (`--canvas`) | Fondo de la app | Papel cálido `#F3F1EC` (claro) / `#0E0F11` (oscuro) con un tinte ambiental muy suave (`.ambient`) para que el cristal tenga algo que refractar. |
| **Papel** (`--paper`) | Todo el contenido: tarjetas, listas, tablas, formularios | Sólido, blanco / `#18191C`. Sombra `--e1`. Nunca translúcido. |
| **Cristal** (`.glass`, `.glass-strong`) | Solo el marco: barra superior al hacer scroll, cápsula de pestañas (móvil), barra lateral (escritorio), hojas (sheets), menús, avisos (toasts), botones flotantes | `backdrop-filter: blur(22px) saturate(180%)`, fondo `--glass`, borde de 0,5 px `--glass-stroke`, brillo interior superior (`inset 0 1px 0 --glass-edge`) y sombra `--e2`. Con `prefers-reduced-transparency` o sin soporte de `backdrop-filter` se vuelve sólido. |

Regla: si es contenido que se lee o se edita, es papel. Si flota sobre el contenido o lo enmarca, es cristal. Nunca cristal sobre cristal.

## 2. Color

- Neutros cálidos (grafito), no el gris azulado de Tailwind: `--ink` `#1C1C1E`, `--ink-2` `#6B6A67`, `--ink-3` `#A3A19C`, `--line` separadores.
- **Un acento**: verde sepia `--accent` `#0E6B63` (oscuro `#4FB8AC`). Para acciones primarias, selección y enlaces. Variante suave `--accent-soft` para botones "tinted" y fondos de selección.
- Semánticos (AA): `--ok` `#247A3D`, `--warn` `#B25B00`, `--danger` `#C2352E`, `--info` `#1F5FAF`, cada uno con su `-soft`.
- **Notas: tres estados, ni uno más** (`format.ts › gradeTone`, tokens `--grade-*`): suspenso `< 5` → `--danger`; aprobado `5–8,9` → `--ink`; destacado `≥ 9` → `--accent`. Igual en `GradePill`, `Grade` y las celdas. Números tabulares y coma decimal. Etiquetas IN · SU · BI · NT · SB. En la barra de distribución de Evaluación, NT usa `--band-notable` (mezcla de acento y papel), entre la tinta del aprobado y el acento del SB. Medias con 1 decimal y redondeo "mitad hacia arriba" sobre el valor decimal (4,25 → 4,3), igual que el backend; notas como se pusieron (hasta 2 decimales); propuestas y notas finales enteras (`GradePill proposal`).
- **Formato de las notas** (una regla en `format.ts`, la misma en toda la app): medias (evaluación, categoría, clase, final) **siempre con 1 decimal** (`formatAverage`: "6,9", "7,0"); la nota de una actividad **tal como se puso**, hasta 2 decimales (`formatScore`: "6,25"); nota propuesta / final de evaluación **entera** (`formatProposal`). `Grade` sin `max` es una media; con `max`, una nota de actividad (con `average`, la media de la clase en esa actividad).
- **Ordinales**: "2.º ESO B", "1.ª evaluación" (con punto). Los nombres de grupo se muestran siempre con `ordinals()` ("2º"/"2°" → "2.º"); en los títulos serif el indicador se acerca al punto (`.ordinal`).
- **Color de clase**: 8 tonos apagados (`--c-teal`, `--c-ochre`, `--c-indigo`, `--c-rose`, `--c-olive`, `--c-plum`, `--c-slate`, `--c-clay`). Solo como punto/cuadradito de 8 px o fina barra lateral. Nunca tiñen la interfaz.
- Modo oscuro con `prefers-color-scheme` y `[data-theme="dark"]`, definido una sola vez en `tokens.css`.

## 3. Tipografía

- UI: **Instrument Sans** (variable). Títulos grandes de página y cifras destacadas: **Instrument Serif**.
- Escala (px/line-height): caption 12/16 · footnote 13/18 · body 15/22 · headline 17/22 (600) · title 22/28 (600) · display 40/40 serif (títulos de página) · numeral 28/32 serif (medias grandes).
- Pesos: 400, 500, 600. Nunca 800/900.
- Etiquetas de sección: 12–13 px, 600, mayúsculas, `letter-spacing .05em`, `--ink-2`.
- Números: `font-variant-numeric: tabular-nums` en tablas, horas y notas.

## 4. Forma, espacio y movimiento

- Radios concéntricos: controles 10 · filas y campos 14 · tarjetas 20 · hojas y cápsula 28 · chips 999. Radio interior = exterior − padding.
- Rejilla de 4 pt: 4, 8, 12, 16, 22, 32, 48. Márgenes laterales: 16 móvil · 24 tablet · 40 escritorio. Ancho de lectura 720; contenido máx. 1180.
- Elevación: `--e1` (papel), `--e2` (cristal flotante), `--e3` (hojas).
- Movimiento: `--ease: cubic-bezier(.2,.8,.2,1)`, 180–320 ms. Solo para: hojas, pulsación (escala .97), colapso del título grande, aparición de avisos. Sin rebotes decorativos, brillos, pulsos ni confeti. Respeta `prefers-reduced-motion`.
- Área táctil mínima 44 × 44. En pantallas táctiles (`pointer: coarse`) el kit lo garantiza: `Segmented` mide 44 de alto; `IconButton`, `Button size="sm"`, `.section__action` y `.link-btn` conservan su aspecto con un área de toque invisible alrededor. Un chip que solo informa (p. ej. «Lista sin pasar» en la agenda) no es un botón: la fila entera abre la sesión.

## 5. Componentes (kit único en `src/ui/`)

`AppShell` · `Sidebar` · `TabCapsule` · `PageHeader` (título grande serif que colapsa en barra de cristal) · `Sheet` (detents medio/grande, pie fijo con la acción principal) · `List` / `Row` (listas agrupadas estilo iOS) · `Card` · `Segmented` (pulgar de cristal; una opción `disabled` se ve atenuada y con `reason` dice por qué al tocarla) · `Button` (`primary` · `tinted` · `plain` · `danger`; tamaños `md` 46 px y `sm` 34 px) · `IconButton` · `Field` / `TextArea` / `Select` · `DateField` · `SearchField` · `ActionBar` · `Chip` · `Badge` · `GradePill` · `Avatar` (iniciales monocromas) · `EmptyState` · `Toast` · `Skeleton` · `Dot` (color de clase) · `AIBadge` ("Borrador IA") · `DropTarget` (toda una página acepta archivos arrastrados; un velo lo dice mientras se arrastran) · `RichText` (`$…$` con KaTeX, **negrita**; fórmulas químicas y °C en redonda) · `CropImage` (una franja de una imagen: la respuesta a una pregunta en una hoja escaneada; al tocarla se abre la página en `Lightbox`).

- **`Page`**: la barra superior se vuelve cristal desde el primer píxel de scroll (el botón atrás nunca se pinta sobre el título grande); el título pequeño aparece cuando el grande pasa bajo la barra. Reserva abajo, en móvil, el alto de la cápsula + zona segura + 24 px (`--capsule-clearance`), en todas las páginas. `backToOrigin`: si la página se abrió desde otra de la app, "Volver" regresa a ella y la nombra ("‹ Hoy", "‹ 2.º ESO B"); si no, usa `back`/`backLabel`.
- **Barra de revisión** (modo foco, móvil): fija abajo con la zona segura y **opaca** (`--glass-opaque`): mientras se leen respuestas línea a línea, nada se transparenta; el contenido termina 16 px por encima de ella.
- **`GradePill`**: media (1 decimal), `proposal` (entera) o, con `max`, la nota de una actividad tal como se puso (hasta 2 decimales), solo para notas validadas; un borrador de la IA va con `AIBadge` y la nota en gris.
- **`ActionBar`**: barra fija de cristal casi opaco (`--glass-solid` + desenfoque: el texto del formulario de debajo no se lee a través) para la acción pendiente de una página ("Sin guardar · Descartar · Guardar cambios"). Va al final del contenido al que pertenece y en móvil flota por encima de la cápsula (`bottom: --capsule-clearance + 10px`). Los errores de guardado salen en su nota, no en un aviso que la tape. Cualquier barra pegada abajo o zona con scroll propio (el cuaderno) descuenta `--capsule-clearance`.
- **`Sheet side`**: en escritorio (≥ 1024) se abre como panel lateral derecho de 440 px junto a la página, que sigue visible, con scroll y pulsable (editar un alumno con su ficha al lado, pasar lista con la agenda). Sin velo: el panel solo se cierra con ✕ o Esc, así que un clic en la página nunca descarta lo que se está editando. En móvil y tableta es una hoja normal (velo que cierra, fondo bloqueado).
- **Hojas y el gesto atrás**: cada hoja abierta ocupa una entrada del historial (misma URL), así que atrás (Android, botón del navegador) cierra la hoja de arriba y no la página. `dirty` (hay texto escrito: una nota, un cierre de clase, el título de una actividad, las indicaciones para la IA): el velo no hace nada y ✕, Esc o atrás preguntan «Descartar los cambios». Esc solo cierra la hoja de arriba.
- **Foco al abrir una hoja**: solo donde escribir es la tarea. `data-autofocus` enfoca ese campo en escritorio; `data-autofocus="always"` también en móvil (la nota de Anotar, el buscador), porque el teclado del teléfono tapa los botones y los selectores. Nunca el primer campo por defecto.
- Nunca se abren dos hojas a la vez: los atajos globales ("/", Ctrl/⌘+K) no hacen nada con una hoja abierta (un solo Esc las cerraría las dos).
- **`DateField`** / **`TimeField`**: nunca `<input type="date">` ni `type="time"` a la vista. Muestra la fecha en español ("martes, 8 sept 2026"; `short` → "8 sept 2026" para rangos) con el selector nativo (calendario / rueda de iOS) invisible encima, sea cual sea el idioma del navegador. `clearable` para fechas opcionales. `TimeField` igual, con la hora en 24 h ("16:00") y "Sin hora" si está vacía.
- **`useDraft(server)`**: borrador local de un formulario de ajustes. Sigue al servidor por valor (no por objeto: las consultas se recargan al volver a la pestaña) y solo mientras no se edita, así que una recarga nunca borra cambios sin guardar; tras guardar, `setDraft(lo guardado)`. Con `ActionBar` es el patrón de guardado explícito.
- **`SearchField`**: lupa, borrar y Esc. `useMediaQuery(DESKTOP)` para lo que cambia entre móvil y escritorio (p. ej. notas desplegadas en la ficha).

- **Materiales en papel**: el documento de un material se ve como el PDF (apartados, paneles de definición, ejemplo, «Ojo», «Comprueba», ejercicios numerados) y la presentación como tarjetas 16:9 con medidas en unidades de contenedor (la misma cara en la tarjeta y en «Proyectar»). Las figuras son el SVG del servidor mostrado como imagen; en modo oscuro las invierte el token `--figure-filter`.

Reglas:
- Una página = `PageHeader` + contenido en `List`/`Card`. No se inventan cabeceras, tarjetas ni estados vacíos propios.
- CSS de página: solo layout (grid, gaps). Máximo ~200 líneas por archivo.
- Iconos: Phosphor (peso *regular*; *fill* solo para la pestaña activa). Nada de emojis ni "chispas" para la IA: la IA se indica con el texto "IA" o `AIBadge`.
- Acciones destructivas: siempre en un menú o al final de una hoja, con confirmación. Nunca como icono suelto de papelera en una tarjeta.

## 6. Voz y tono

- Español de España, sobrio y concreto. Sin exclamaciones, sin saludos, sin emojis.
- Botones con verbo: "Pasar lista", "Añadir alumnos", "Crear examen", "Aceptar y siguiente".
- Estados vacíos: icono de línea + una frase + una acción. Ej.: "Aún no hay actividades en esta evaluación." [Añadir actividad]
- Avisos: los de éxito se van solos (3 s); los de error se quedan hasta cerrarlos (✕). Una petición sin respuesta en 20 s falla con «El servidor no responde. Revisa la conexión y vuelve a intentarlo.» (salvo las que esperan a la IA o a un PDF, `{ slow: true }`); sin red, un guardado falla al momento en vez de quedarse en pausa.
- Errores: qué ha pasado y qué hacer. "No se ha podido guardar. Revisa la conexión y vuelve a intentarlo."
- Botón deshabilitado → dice por qué ("Elige al menos una unidad").
- Fechas: "jueves, 24 de septiembre"; en campos de fecha, con año: "martes, 8 sept 2026"; horas "10:20"; decimales con coma.
- Próxima clase, igual en todas partes (`sessionText`): "En clase hasta 11:15", "Hoy 12:40", "Mañana 11:45", "Martes 24 nov, 08:30".

## 7. Diseño adaptable

- Móvil (≤ 767): una columna, cápsula de pestañas flotante abajo, hojas desde abajo.
- Tablet (768–1023): una columna ancha, cápsula abajo.
- Escritorio (≥ 1024): barra lateral de cristal (248 px) con destinos + "Mis clases"; hojas como paneles centrados, o como panel lateral derecho (`Sheet side`, ~440 px) cuando conviene seguir viendo la página (pasar lista, deberes, cerrar clase); Hoy a dos columnas; Cuaderno a ancho completo.
