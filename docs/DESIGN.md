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
- **Notas** (escala española): `< 5` → `--danger`; `5–6,9` → `--ink`; `7–8,9` → `--accent`; `≥ 9` → `--ok`. Siempre números tabulares y coma decimal (`6,5`). Etiquetas IN · SU · BI · NT · SB.
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
- Área táctil mínima 44 × 44.

## 5. Componentes (kit único en `src/ui/`)

`AppShell` · `Sidebar` · `TabCapsule` · `PageHeader` (título grande serif que colapsa en barra de cristal) · `Sheet` (detents medio/grande, pie fijo con la acción principal) · `List` / `Row` (listas agrupadas estilo iOS) · `Card` · `Segmented` (pulgar de cristal) · `Button` (`primary` · `tinted` · `plain` · `danger`; tamaños `md` 46 px y `sm` 34 px) · `IconButton` · `Field` / `TextArea` / `Select` · `Chip` · `Badge` · `GradePill` · `Avatar` (iniciales monocromas) · `EmptyState` · `Toast` · `Skeleton` · `Dot` (color de clase) · `AIBadge` ("Borrador IA").

Reglas:
- Una página = `PageHeader` + contenido en `List`/`Card`. No se inventan cabeceras, tarjetas ni estados vacíos propios.
- CSS de página: solo layout (grid, gaps). Máximo ~200 líneas por archivo.
- Iconos: Phosphor (peso *regular*; *fill* solo para la pestaña activa). Nada de emojis ni "chispas" para la IA: la IA se indica con el texto "IA" o `AIBadge`.
- Acciones destructivas: siempre en un menú o al final de una hoja, con confirmación. Nunca como icono suelto de papelera en una tarjeta.

## 6. Voz y tono

- Español de España, sobrio y concreto. Sin exclamaciones, sin saludos, sin emojis.
- Botones con verbo: "Pasar lista", "Añadir alumnos", "Crear examen", "Aceptar y siguiente".
- Estados vacíos: icono de línea + una frase + una acción. Ej.: "Aún no hay actividades en esta evaluación." [Añadir actividad]
- Errores: qué ha pasado y qué hacer. "No se ha podido guardar. Revisa la conexión y vuelve a intentarlo."
- Botón deshabilitado → dice por qué ("Elige al menos una unidad").
- Fechas: "jueves, 24 de septiembre"; horas "10:20"; decimales con coma.

## 7. Diseño adaptable

- Móvil (≤ 767): una columna, cápsula de pestañas flotante abajo, hojas desde abajo.
- Tablet (768–1023): una columna ancha, cápsula abajo.
- Escritorio (≥ 1024): barra lateral de cristal (248 px) con destinos + "Mis clases"; hojas como paneles centrados; Hoy a dos columnas; Cuaderno a ancho completo.
