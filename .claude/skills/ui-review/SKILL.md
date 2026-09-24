---
name: ui-review
description: Screenshot Sepia screens on phone and desktop and review them against the design system and a teacher's perspective. Use after any UI change and before saying a screen is done.
---

# Revisión visual

1. Con la app arrancada (skill `run-app`), captura las rutas afectadas:
   ```bash
   node e2e/shoot.mjs e2e/screenshots/review /hoy "/clases" "/clases/<id>/cuaderno"
   # acciones: "/hoy::click=text=Pasar lista" abre la hoja antes de capturar
   ```
2. **Abre y mira cada PNG** (herramienta Read). No declares nada terminado sin haberlo visto.
3. Revisa con esta lista (y arregla lo que falle):
   - ¿Un profesor con 30 segundos entre clases entiende la pantalla y encuentra la acción principal sin buscar?
   - ¿Hay información repetida, decorativa o que no sirve para una decisión? Quítala.
   - Cabecera = `Page` (título serif grande). Contenido en `List`/`Row` o `card`. Nada de tarjetas o cabeceras inventadas.
   - Cristal solo en marco (barra superior al hacer scroll, cápsula, barra lateral, hojas, menús, avisos). Contenido = papel.
   - Textos: español de España, sin emojis ni exclamaciones; decimales con coma; fechas "jueves, 19 de noviembre".
   - Estados: cargando (skeleton), vacío (icono + frase + acción), error (mensaje útil), IA pendiente (progreso).
   - Móvil 390 px: nada se corta ni hace scroll horizontal (salvo tablas del cuaderno); la cápsula no tapa acciones.
   - Escritorio 1440 px: aprovecha el ancho con criterio (2 columnas en Hoy, tabla ancha en Cuaderno), sin líneas de texto kilométricas.
   - Contraste suficiente, áreas táctiles ≥ 44 px, foco visible.
4. Para una segunda opinión exigente, lanza el subagente `ux-reviewer` con las rutas de las capturas.
