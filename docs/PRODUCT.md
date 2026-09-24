# Sepia — especificación de producto

> Documento canónico. Si el código contradice este documento, uno de los dos está mal: arréglalo o actualiza el documento en el mismo commit.
> El backend (`../teacher-mobile-backend`) y el frontend (este repo) implementan lo que aquí se describe.

## 1. Para quién y para qué

Sepia es el **cuaderno del profesor** de Secundaria/Bachillerato (y Primaria) en España. Un profesor típico tiene 4-6 grupos, ~120 alumnos, y abre la app **entre clases, con 30 segundos**. Sepia debe resolver, en este orden:

1. **Hoy**: qué clase tengo ahora, pasar lista en 2 toques, apuntar una incidencia en 5 segundos.
2. **Cuaderno**: poner notas (a mano o corrigiendo con IA), ver medias por evaluación que cuadren siempre.
3. **Programación**: unidades por trimestre y los materiales de cada unidad (apuntes, presentación, fichas, exámenes).
4. **Evaluación**: llegar a la sesión de evaluación con notas propuestas, notas finales y comentarios de boletín redactados.

### Principios (no negociables)

- **Operativo antes que vistoso.** Cada pantalla responde a una tarea real del día a día. Si algo no ayuda a dar clase, poner notas, pasar lista o evaluar, no existe.
- **Cero entropía.** Nada de paneles de "insights", resúmenes que repiten datos, contadores decorativos, onboarding con barra de progreso, confeti ni saludos. Un dato aparece una vez, en el sitio donde se usa.
- **La IA propone, el profesor decide.** Todo lo que genera la IA llega como *borrador* editable, marcado "Borrador IA". La IA nunca escribe una nota definitiva.
- **La IA solo donde ahorra horas**: corregir un montón de exámenes, redactar 30 comentarios de boletín, generar un examen/ficha/apuntes/presentación de una unidad, importar un temario. Nunca para repetir datos que la app ya tiene (el "Prepara tu día" con IA desaparece: "Hoy" es determinista e instantáneo).
- **Un número, una fórmula.** Las medias se calculan solo en el backend (`app/services/grading.py`). El frontend nunca recalcula notas.
- **Nada se pierde.** Editar un horario no borra sesiones pasadas; quitar un alumno de un grupo no lo borra; los comentarios de boletín se guardan.

## 2. Glosario (UI ↔ código)

| UI (español)        | Código          | Qué es |
|---------------------|-----------------|--------|
| Grupo               | `Group`         | Conjunto de alumnos: "2º ESO B". Tiene etapa y nivel. |
| Clase               | `Course`        | Una materia impartida a un grupo: "Matemáticas · 2º ESO B". **Unidad de trabajo de toda la app.** Tiene horario, aula, color y ponderaciones. |
| Alumno              | `Student`       | Pertenece al profesor; se matricula en grupos (`Enrollment`). Puede tener marca NEAE/ACNEE + adaptación. |
| Unidad              | `Unit`          | Tema de la programación de una clase, con trimestre y estado (pendiente / en curso / impartida). |
| Material            | `Material`      | Documento de una unidad: subido, apuntes, presentación, resumen, versión adaptada, ficha (con solucionario). |
| Actividad           | `Activity`      | Todo lo que se califica en el cuaderno: examen, trabajo, ficha, oral, cuaderno, actitud… Tiene categoría, fecha, evaluación, nota máxima y **para qué cuenta** (`counts_for`): la media, nada (evaluación inicial) o la recuperación de una evaluación. Puede ser solo para algunos alumnos (`student_ids`). |
| Recuperación        | `Activity` `counts_for=recovery` | Prueba para los suspensos de una evaluación (o la final; "extraordinaria" solo en Bachillerato). Su nota sustituye, topa en 5 o promedia el resultado de esa evaluación según la regla de la clase (`Course.grading`). Nunca baja la nota. |
| Repesca             | `Activity.repeat_of` | Examen para quien faltó al original. Su nota ocupa la misma columna del cuaderno. |
| Faltó               | `pending_absent` (derivado) | Alumno con falta en la lista del día del examen y sin nota: pendiente de repesca o NP. |
| Nota                | `Grade`         | Nota de un alumno en una actividad. Estados: sin nota, sugerida (IA), confirmada, NP. |
| Hoja / papel        | `Paper`         | Páginas escaneadas/fotografiadas de un alumno para una actividad. |
| Evaluación          | `term` 1/2/3 + final (4) | Trimestres del curso escolar. |
| Nota de evaluación  | `TermGrade`     | Nota calculada + nota final ajustada + comentario de boletín, por alumno/clase/evaluación. |
| Observación         | `Note`          | Nota rápida del profesor (observación, incidencia, positivo, familia) ligada a alumnos y/o clase. |
| Sesión              | calculada       | Cada hueco del horario en un día lectivo. No se guarda: se calcula de `Course.schedule` + curso escolar − festivos ± excepciones. |
| Curso escolar       | `SchoolYear`    | Fechas de inicio/fin, trimestres y festivos. Se crea solo con valores por defecto de España. |

## 3. Navegación

Tres destinos y un menú de cuenta. Profundidad máxima 3.

```
Hoy            /hoy                     ← inicio
Clases         /clases                  lista "Matemáticas · 2º ESO B"
  Clase        /clases/:courseId        pestañas: Cuaderno · Alumnos · Programación · Asistencia
    Actividad  /clases/:courseId/actividades/:activityId      (examen: preparar → recoger → revisar)
    Revisión   /clases/:courseId/actividades/:activityId/revisar   (modo foco, alumno a alumno)
    Unidad     /clases/:courseId/unidades/:unitId
    Material   /clases/:courseId/unidades/:unitId/materiales/:materialId
    Evaluación /clases/:courseId/evaluacion/:term             notas finales + boletín
  Alumno       /alumnos/:studentId      ficha del alumno (todas sus clases)
Evaluar        /evaluar                 bandeja: por revisar · por calificar · evaluación actual · informe del departamento
Ajustes        /ajustes                 perfil, curso escolar, festivos, cerrar sesión, sugerencias
```

- Móvil: barra inferior flotante (cápsula de cristal) con Hoy · Clases · Evaluar. Ajustes desde el avatar.
- La insignia de **Evaluar** cuenta las actividades con borradores de nota de la IA por revisar (las filas "Por revisar" con "N por revisar"). Nada más.
- Escritorio (≥1024px): barra lateral de cristal con los 3 destinos + lista de clases; Hoy a dos columnas.

## 4. Flujos por momento del curso

### 4.1 Septiembre — poner en marcha (≤ 5 minutos)
1. Registro → se crea el curso escolar con trimestres y festivos nacionales por defecto (editables en Ajustes).
2. "Nueva clase": materia + grupo (crear o elegir) + horario (días y horas, tramos de 55 min por defecto) + aula.
3. "Añadir alumnos": **pegar la lista** (un alumno por línea, acepta "Apellidos, Nombre" y "Nombre Apellidos") o importar CSV/Excel (detecta `;`, Latin-1, BOM). Si el grupo ya tiene alumnos (otra materia), se reutilizan.
4. Programación: añadir unidades a mano, o **"Importar temario"**: pegar el índice del libro / programación → la IA propone unidades con trimestre → confirmar.
5. Ponderaciones de la clase: por defecto *Exámenes 60 %, Trabajos y fichas 30 %, Observación 10 %*. Editable en una hoja.

### 4.2 Cada día — Hoy
- Tarjeta **Ahora / Siguiente**: materia · grupo, aula, hora, unidad en curso, "la última vez: …" (última observación de la clase).
  - **Pasar lista**: todos presentes por defecto; tocar un alumno = falta, otro toque = retraso, otro = presente. Guardado automático. Al final, campo opcional "nota de la sesión".
  - **Anotar**: hoja con chips de alumnos + tipo (observación / incidencia / positivo / familia) + texto.
- **Agenda del día**: filas compactas por hora. Las sesiones pasadas sin lista muestran "Lista sin pasar".
- **Pendiente**: exámenes con hojas por revisar, listas sin pasar, comentarios de boletín que faltan antes de la sesión de evaluación.
- **A vigilar** (reglas deterministas, mismas en toda la app): media de la evaluación actual < 5, ≥3 faltas injustificadas en 14 días, bajada de más de 1,5 puntos, ≥2 incidencias en 7 días.
- Selector de semana para ver otros días. Nada de IA automática; como mucho un botón "Resumen del día (IA)" con 3 viñetas.

### 4.3 Exámenes y corrección (el flujo más valioso)
Un examen es una **Actividad** de tipo examen. Pantalla única con 3 pasos:

1. **Preparar**: sin documento (solo nota) · subir mi examen (PDF/fotos) · generar con IA desde unidades. Si hay documento, la IA extrae la **rúbrica** (preguntas, puntos, solución) → el profesor la revisa en una tabla compacta. Descargas: examen para imprimir (se fotocopia **el mismo** para todos; cabecera "Nombre y apellidos ____"), soluciones.
   - **Se elimina el QR personalizado y cifrado por alumno.** En los centros se fotocopia un original; las copias personalizadas no son realistas.
2. **Recoger**: subir el PDF del escáner de la copistería o hacer fotos del montón, en cualquier orden. Se indica "páginas por examen" (se autodetecta del original). El servidor agrupa páginas por alumno, la IA lee el nombre manuscrito de la cabecera y se empareja **localmente** con la lista (no se envía la lista a la IA). Resultado: lista de la clase con miniatura y punto de confianza (verde = seguro, ámbar = confirmar con un toque, "sin entregar"). Modo alternativo "en orden de lista" (sin leer nombres).
3. **Revisar**: la IA sugiere puntos por pregunta contra la rúbrica. **Modo foco** alumno a alumno: hoja escaneada a la izquierda (zoom), preguntas con pasos de puntos a la derecha, comentario opcional, "Aceptar y siguiente" (Enter / deslizar). La nota = suma de puntos confirmados (escalada a la nota máxima). Siempre se puede teclear la nota a mano sin papel.
   - Al confirmar, la nota entra en el cuaderno al instante. No hay botón "Finalizar".
   - Tras corregir: "Errores frecuentes" (top 5) y "Crear ficha de refuerzo para los que han suspendido".

### 4.4 Fichas, apuntes y presentaciones (por unidad)
Dentro de la unidad, un único botón **"Crear con IA"** con 5 tipos:

| Tipo | Resultado | Tiempo objetivo |
|------|-----------|-----------------|
| Apuntes | 2-6 páginas: objetivos, apartados, definiciones, ejemplos resueltos, ejercicios con solución | < 1 min |
| Presentación | 10-15 diapositivas, .pptx editable + PDF, con notas del orador | < 1 min |
| Resumen / esquema | 1 página | < 30 s |
| Versión adaptada | lectura fácil para NEAE a partir de unos apuntes | < 1 min |
| Ficha | refuerzo / práctica / ampliación, 4-10 ejercicios, PDF alumno + **un** solucionario | < 1 min |

Entradas: tipo, extensión/nivel, número de ejercicios (ficha) e "indicaciones" (una línea). La IA usa el nombre de la unidad, el curso, la materia y el texto de los materiales subidos a la unidad. Resultado: vista previa en la app, editar por bloques, "reescribir este apartado", descargar PDF (y .pptx).
- **Se elimina el generador de libros de texto** (80-200 páginas, 10-35 min, falla la mayoría de las veces) y el flujo "dividir libro en temas".
- Una ficha puede "Evaluarse": crea una actividad en el cuaderno con su rúbrica.

### 4.5 Cuaderno (cada semana)
- Tabla alumnos × actividades de la evaluación elegida (1ª / 2ª / 3ª / Final). Columna fija con nombres (ordenados por apellidos) a la izquierda y columna **Media** fija a la derecha (en móvil, 56 px con la píldora; en escritorio también la propuesta). Las actividades van de la más reciente a la más antigua; un degradado en el borde avisa de que hay más columnas.
- Cabecera de columna: tipo + fecha + título ("Oral · densidad") y, si hace falta, una marca: `Borrador IA` (hay notas sugeridas), "No cuenta", "Recuperación" o "N alumnos".
- Celdas: nota tal cual se puso (hasta 2 decimales); borrador de la IA en tono secundario (sin superíndices); "—" sin nota; "NP"; **"Faltó"** si la lista del día del examen le marca falta y no tiene nota. Las medias, siempre con 1 decimal.
- Encima de la tabla, solo si hay algo: "Revisar N borradores" (→ la actividad), "Faltaron N alumnos a Examen U3" (→ hoja: programar repesca o poner NP; el NP va a la repesca si ya estaba programada) y "Examen U1: ausente con nota" ("¿hoja mal asignada o lista mal pasada?", → la misma hoja). Una repesca programada no aparece hasta su fecha. Para que la tabla mande: en el móvil, con dos o más avisos, una sola fila ("Revisar 18 borradores" · "2 faltas en exámenes · 1 aviso de lista") que abre la lista; en escritorio, igual a partir de tres. Las medias no cuentan los borradores ("sin contar borradores" bajo Media).
- Tocar una celda = teclado numérico; Enter baja al siguiente alumno (así se pasan notas de un montón de exámenes corregidos a mano). La celda activa queda siempre por encima de la cápsula de pestañas.
- "+ Actividad": nombre, tipo/categoría, fecha (la evaluación se deduce de la fecha), nota máxima; en "Más opciones", **Cuenta para** (la media · no cuenta, evaluación inicial · recuperar la 1.ª/2.ª/3.ª/final) y los alumnos (toda la clase o solo algunos).
- **Repesca**: su nota entra en la columna del examen original (misma categoría y peso). **Recuperación**: columna en la evaluación que recupera, solo con celdas para sus alumnos; la media muestra "rec.".
- Fila "Media de la clase" con la media de cada actividad (en la vista Final, la de cada evaluación). Columna "Media" calculada en el servidor; tocarla muestra la fórmula (y la recuperación aplicada).
- Exportar CSV (Excel español: `;`, coma decimal, BOM).

### 4.6 Evaluación (final de trimestre)
Pantalla por clase y evaluación (título en palabras: "Primera evaluación"). Las evaluaciones que aún no han empezado aparecen atenuadas; al tocarlas se dice cuándo empiezan (y el lector de pantalla lo lee); su página no carga datos ni muestra acciones.
- Una línea de cifras que solo se parte entre " · ": "Media 6,9 · 81 % aprobados · IN 5 · SU 2 · BI 1 · NT 12 · SB 6" (fuera de ESO: "<5: 4 · 5: 3 · 6: 5 · 7-8: 10 · 9-10: 2").
- Si hay borradores de IA sin revisar, aviso: las propuestas aún no los cuentan (→ revisar).
- Botón principal a todo el ancho: **"Redactar 26 comentarios con IA"** (solo los que faltan). Los comentarios aparecen en la lista según termina cada lote ("10 de 26"); si se sale y se vuelve, el progreso sigue (solo en la página de esa evaluación). Se puede seguir trabajando: **lo que el profesor escribe o edita mientras tanto no se pisa** (el aviso final dice cuántos se dejaron). "Redactar de nuevo N borradores" es secundario y nunca toca los comentarios escritos a mano ni los definitivos.
- Botones visibles: **Crear recuperación (N)** (preselecciona a los suspensos, crea la actividad y abre su página; en la final, "recuperación final", o "extraordinaria" en Bachillerato), **Acta (PDF)** y **Exportar CSV** (aviso "Acta descargada" / "CSV descargado").
- Por alumno: media, **nota propuesta** o "Ajustada (prop. 4)", faltas, "4 → 6 (rec.)" si recuperó, "Pendiente: Examen U2" si faltó, marca ACS, y el comentario de boletín solo si existe.
- Si una nota se ajustó antes de una recuperación que ahora propone más, se avisa ("La nota ajustada (4) no incluye la recuperación (8)") con **"Usar 8"** en un toque; ese alumno no se lista para otra recuperación.
- Menú: copiar comentarios, **regla de las recuperaciones** (sustituye si es mayor · como máximo un 5 · media de ambas; la acuerda el departamento) e **informe del departamento**.
- Comentarios con IA: la IA recibe la nota que irá al boletín (la ajustada), las actividades de la evaluación y lo que peor salió en cada examen, faltas, pendientes, hasta 3 observaciones de esa evaluación y la marca ACS; nunca inventa evolución sin evaluación anterior, varía las recomendaciones, omite salud, familia o conflictos entre alumnos y escribe en impersonal o primera del plural. Máximo 60 palabras; a los ACS se les cierra con "Calificación referida a su adaptación curricular.". Se guardan como borrador.
- **Informe para el departamento** (también desde Evaluar): una fila por clase con alumnos (y cuántos con nota si faltan), % aprobados, media, distribución (IN/SU/BI/NT/SB en ESO, bandas numéricas fuera), unidades previstas frente a impartidas y una línea editable "Causas y propuestas" (se guarda al salir del campo, antes de descargar y al cerrar); se descarga en PDF y CSV ("Informe descargado").

### 4.7 Evaluar (bandeja)
- Cabecera: "Sesión de la 1.ª evaluación: martes, 15 de diciembre, en 26 días" (la evaluación sale de la fecha de la sesión; un evento con otro título, p. ej. "Evaluación inicial", se nombra por su título).
- **Por revisar** ("18 por revisar", hojas sin alumno) · **Por calificar** ("2 sin nota"; quien faltó al examen no cuenta como "sin nota") · **evaluación actual** por clase, en el orden de la lista de clases, diciendo lo que falta: "Falta revisar Examen U2 (18) · 3 alumnos con examen pendiente por falta · faltan 26 comentarios". Un comentario solo cuenta como hecho si es definitivo. Lo que no cuenta (evaluación inicial) no retrasa la evaluación.
- Todas las descargas tienen nombres legibles sin tildes ("Acta - Fisica y Quimica - 3o ESO A - 1a evaluacion.pdf").

### 4.8 Ficha del alumno
Cabecera: nombre, grupo(s), marcas (NEAE/ACNEE/adaptación). Secciones: notas por clase y evaluación (los **mismos** números que el cuaderno), asistencia (faltas/retrasos/justificadas), observaciones (línea de tiempo editable). Botón opcional "Preparar tutoría (IA)": 5 líneas para hablar con la familia.

## 5. Qué se conserva, qué se reconstruye y qué desaparece

| Módulo actual | Decisión | Motivo |
|---|---|---|
| Calendario como inicio + "Prepara tu día" (IA) | **Reconstruido → Hoy** determinista | La IA repetía datos, tardaba 10-60 s y costaba dinero en cada apertura. |
| Clases / Ajustes de clase / GradeBook / SubjectGradeBook | **Reconstruido → Clase** (grupo·materia) con 4 pestañas | Había dos páginas duplicadas (clase y asignatura) y ~40 rutas. |
| Exámenes (editor, detalle, corrección a pantalla completa) | **Reconstruido → Actividad** con 3 pasos + modo foco | Tres pantallas para lo mismo; la nota sugerida por IA se descartaba y había que teclearla. |
| QR cifrado y copias personalizadas | **Eliminado** | Irreal en centros (se fotocopia un original); el QR denso fallaba al escanear. |
| Ejercicios (una fila por alumno) + 3 pantallas de corrección | **Reconstruido → Ficha** (material de la unidad) + corrección común | La ficha de clase ignoraba los temas; tres correctores distintos. |
| Temario + Libros de texto (LangGraph, 7 agentes) | **Reconstruido → Programación** (unidades) + "Crear con IA" por unidad | Libros de 10-35 min con mayoría de fallos; binarios de Windows. |
| Presentaciones | **Nuevo** (.pptx editable) | No existían. |
| Resumen trimestral / Informes con IA / Comentarios de boletín | **Reconstruido → Evaluación** | Trimestres rotos (los exámenes no tenían evaluación), comentarios que no se guardaban, análisis inventado. |
| Asistencia | **Conservado el gesto**, reconstruido el modelo | Solo se guardan las excepciones; sin duplicados; editable. |
| Comentarios, menciones, observaciones de evento, generales | **Unificado → Observación** | Cuatro conceptos para lo mismo; no se podían editar ni borrar. |
| Insights de clase con IA, radar, donut, tendencia | **Eliminado** → "A vigilar" determinista | Cada pantalla daba una media distinta. |
| Categorías de nota, configuración académica, pesos en 5 sitios | **Unificado** → ponderaciones de la clase + curso escolar | Solo un sitio se usaba de verdad. |
| Onboarding con checklist, confeti, FAB de feedback, saludo | **Eliminado** | Ruido. Sugerencias desde Ajustes. |

## 6. Uso de la IA

Todas las llamadas pasan por **un único gateway** (`app/ai/`) con dos proveedores: `openai` y `mock`.
- En desarrollo los prompts y esquemas **reales** se ejecutan con Claude por terminal (`claude_cli`); en producción, con OpenAI. Solo cambia a dónde apunta. Las pruebas de uso, E2E y capturas usan IA real; el `mock` determinista queda solo para tests unitarios.
- Salidas estructuradas (esquemas Pydantic) — sin reparar JSON a mano.
- Registro de uso (`ai_calls`): funcionalidad, modelo, tokens, coste estimado, latencia.
- Privacidad: los nombres de alumnos no se envían para emparejar exámenes (el emparejamiento es local). Para comentarios de boletín se envía solo el nombre de pila.

| Función | Cuándo | Modelo (tier) |
|---|---|---|
| `extract_rubric` | Subir examen | vision |
| `generate_assessment` | Examen o ficha desde unidades | text |
| `read_names` | Recoger hojas | vision (recorte de cabecera) |
| `grade_paper` | Revisar hojas | vision |
| `generate_material` | Apuntes / presentación / resumen / adaptada | text |
| `import_units` | Importar temario | text |
| `report_comments` | Boletín, en lotes de ~10 | text |
| `brief` | Resumen del día / tutoría (bajo demanda) | text |

## 7. Lenguaje visual (resumen; detalle en `DESIGN.md`)

"**Cristal para el marco, papel para el contenido.**" Superficies de cristal translúcido (estilo Liquid Glass de Apple) solo en la barra superior, la cápsula de navegación, la barra lateral, las hojas y los avisos. El contenido va sobre tarjetas sólidas tipo papel, en listas agrupadas. Tipografía cuidada, un solo color de acento (verde sepia), números tabulares. Tono sobrio: sin emojis, sin exclamaciones, sin iconos de "chispas". Estados vacíos: un icono de línea, una frase, una acción.
