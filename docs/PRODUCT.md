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
| Grupo               | `Group`         | Conjunto de alumnos: "2.º ESO B". Tiene etapa y nivel. El nombre se muestra siempre con el ordinal abreviado con punto ("2º" → "2.º", `format.ts › ordinals`). |
| Clase               | `Course`        | Una materia impartida a un grupo: "Matemáticas · 2.º ESO B" (en la barra lateral, "2.º ESO B · Mates" con la abreviatura). **Unidad de trabajo de toda la app.** Tiene horario, aula, color y ponderaciones. |
| Alumno              | `Student`       | Pertenece al profesor; se matricula en grupos (`Enrollment`). Puede tener marca NEAE/ACNEE, tipo y **medidas** de adaptación. |
| Medidas             | `Student.support.measures` | Más tiempo · letra ampliada · enunciados por pasos · lectura en voz alta · examen adaptado · ACS (con su nivel). Se eligen con interruptores; en las listas salen como chips cortos ("Más tiempo", "Por pasos", "ACS 5.º Primaria"). |
| Temario (pestaña)   | `Unit` (ruta `programacion`) | La programación de la clase: sus unidades. |
| Faltas (pestaña)    | asistencia (ruta `asistencia`) | Listas pasadas, faltas y retrasos de la clase. |
| Unidad              | `Unit`          | Tema de la programación de una clase, con trimestre y estado (pendiente / en curso / impartida). |
| Material            | `Material`      | Documento de una unidad: archivo subido (o fotos del libro), enlace, apuntes, presentación, resumen, versión adaptada, ficha (con solucionario). Es «para alumnos» o «solo para ti». |
| Biblioteca          | `GET /library`  | Todos los materiales del profesor, de todas sus clases (Clases › Materiales). |
| Actividad           | `Activity`      | Todo lo que se califica en el cuaderno: examen, trabajo, ficha, oral, cuaderno, actitud… Tiene categoría, fecha, evaluación, nota máxima y **para qué cuenta** (`counts_for`): la media, nada (evaluación inicial) o la recuperación de una evaluación. Puede ser solo para algunos alumnos (`student_ids`). |
| Recuperación        | `Activity` `counts_for=recovery` | Prueba para los suspensos de una evaluación (o la final; "extraordinaria" solo en Bachillerato). Su nota sustituye, topa en 5 o promedia el resultado de esa evaluación según la regla de la clase (`Course.grading`). Nunca baja la nota. |
| Repesca             | `Activity.repeat_of` | Examen para quien faltó al original. Su nota ocupa la misma columna del cuaderno. |
| Faltó               | `pending_absent` (derivado) | Alumno con falta en la lista del día del examen y sin nota: pendiente de repesca o NP. |
| Examen pendiente (ficha) | `pending_exams` del alumno (derivado) | En la ficha y en «Copiar resumen»: examen ya corregido para otros en el que el alumno tiene NP o no tiene nota, ni en el original ni en su repesca. A diferencia de «Faltó», un NP sigue pendiente. |
| Nota                | `Grade`         | Nota de un alumno en una actividad. Estados: sin nota, sugerida (IA), confirmada, NP. |
| Hoja / papel        | `Paper`         | Páginas escaneadas/fotografiadas de un alumno para una actividad. |
| Evaluación          | `term` 1/2/3 + final (4) | Trimestres del curso escolar. |
| Nota de evaluación  | `TermGrade`     | Nota calculada + nota final ajustada + comentario de boletín, por alumno/clase/evaluación. |
| Observación         | `Note`          | Nota rápida del profesor (observación, incidencia, positivo, familia) ligada a alumnos y/o clase. |
| Sesión              | calculada       | Cada hueco del horario en un día lectivo. No se guarda: se calcula de `Course.schedule` + curso escolar − festivos ± excepciones. |
| Cierre de clase (diario) | `SessionLog` | «Cerrar clase»: hecho hoy, para la próxima y deberes de una sesión. Lo que la siguiente sesión muestra como «Toca: …». |
| Deberes (revisión)  | `HomeworkCheck` | Revisión a toques de los deberes en una sesión; alimenta la actividad «Deberes (1.ª)» del cuaderno. |
| Guardia             | `SessionCancel` `kind=guardia` | Sesión que da el profesorado de guardia porque el profesor falta; guarda la tarea. |
| Curso escolar       | `SchoolYear`    | Periodo lectivo (inicio/fin), trimestres y festivos. Se crea solo con valores por defecto de España. |
| Comunidad autónoma  | `Teacher.region` (código "MD") | Decide la plataforma de notas a la que se exporta: Raíces (Madrid), Séneca (Andalucía), Ítaca (C. Valenciana), Rayuela (Extremadura), Gestib (Baleares), Educamos (CLM)… (`/me › region.export_label`). |

## 3. Navegación

Tres destinos y un menú de cuenta. Profundidad máxima 3.

```
Hoy            /hoy                     ← inicio
Clases         /clases                  buscador + lista "Matemáticas · 2.º ESO B"  ·  Segmented «Clases | Materiales» (?vista=materiales = biblioteca)
  Clase        /clases/:courseId/:tab   pestañas: Cuaderno · Alumnos · Temario · Faltas (cuaderno|alumnos|programacion|asistencia)
    Actividad  /clases/:courseId/actividades/:activityId      (examen: preparar → recoger → revisar)
    Revisión   /clases/:courseId/actividades/:activityId/revisar   (modo foco, alumno a alumno)
    Unidad     /clases/:courseId/unidades/:unitId
    Material   /clases/:courseId/unidades/:unitId/materiales/:materialId
    Evaluación /clases/:courseId/evaluacion/:term             notas finales + boletín
  Alumno       /alumnos/:studentId      ficha del alumno (todas sus clases)
Evaluar        /evaluar                 bandeja: por revisar · por calificar · evaluación actual · informe del departamento
Ajustes        /ajustes                 perfil, curso escolar, festivos, cerrar sesión, sugerencias
```

- Móvil: barra inferior flotante (cápsula de cristal) con Hoy · Clases · Evaluar. Ajustes desde el menú «···» de Hoy. Toda página deja al final el hueco de la cápsula, así la última fila siempre se puede leer.
- La insignia de **Evaluar** cuenta las actividades con borradores de nota de la IA por revisar (las filas "Por revisar" con "N por revisar"). Nada más.
- Escritorio (≥1024px): barra lateral de cristal con los 3 destinos, "Buscar" y la lista de clases con el grupo delante ("2.º ESO B · Mates"); Hoy a dos columnas.
- **Volver** nombra siempre el origen: si la pantalla se abrió desde otra de la app, "‹ Hoy", "‹ 2.º ESO B"…; si se abrió directamente, su pantalla madre ("‹ Clases", el grupo del alumno, "‹ Hoy" en Ajustes).
- **Buscador de alumnos**: en Clases (móvil y escritorio) y, en escritorio, desde cualquier pantalla con "/" o Ctrl/⌘+K. Busca alumnos por nombre o apellidos sin importar las tildes ("nunez" encuentra a Núñez), con sus clases, y clases por materia o grupo ("2 eso b"). Intro abre el primer resultado.
- Fuera de la app: `/api/s/{token}` es el enlace público (sin sesión) de un material compartido con los alumnos.

## 4. Flujos por momento del curso

### 4.1 Septiembre — poner en marcha (≤ 5 minutos)
1. Registro → se crea el curso escolar con trimestres y festivos nacionales por defecto (editables en Ajustes).
2. "Nueva clase": materia + grupo (crear o elegir) + horario (días y horas, tramos de 55 min por defecto) + aula.
3. "Añadir alumnos": **pegar la lista** (un alumno por línea, acepta "Apellidos, Nombre" y "Nombre Apellidos") o importar CSV/Excel (detecta `;`, Latin-1, BOM). Si el grupo ya tiene alumnos (otra materia), se reutilizan.
4. Programación: añadir unidades a mano, o **"Importar temario"**: pegar el índice del libro / programación → la IA propone unidades con trimestre → confirmar.
5. Ponderaciones de la clase: por defecto *Exámenes 60 %, Trabajos y fichas 30 %, Observación 10 %*. Editable en una hoja.

### 4.2 Cada día — Hoy
- Cabecera: calendario (ir a una fecha) y «···» con *Añadir evento*, *Voy a faltar* y *Ajustes*. En el selector de semana, el punto solo marca días con un evento o con una lista que aún sale en Pendiente (misma regla: últimos 7 días lectivos).
- Tarjeta **Ahora / Acaba de terminar / Siguiente / Primera clase**: «Ahora · quedan 35 min» (en el recreo o una hora libre, la clase que acaba de terminar sigue 15 min con «Cerrar clase»; tras la última del día, «Última clase · terminó a las 14:30»), materia · grupo, aula, hora, unidad en curso y actividades del día. Debajo, lo que dejó el **cierre de la clase anterior** (solo de ahí, nunca de observaciones de alumnos): **«Toca: problemas de la p. 34»** en negrita, «Deberes: p. 33, ej. 15-18» con *Revisar*, y en gris «El martes: suma y resta con distinto denominador».
  - Una fila de chips con los materiales de la unidad en curso (hasta 4: la presentación primero, luego lo «para alumnos»). Un toque lo abre; la presentación se abre directamente en modo proyección (`?presentar=1`).
  - **Pasar lista** (acción principal): todos presentes por defecto; tocar = falta, otro toque = retraso, otro = presente. Filas de 48 px con número de lista, «Apellidos, Nombre» y el estado a la derecha (Presente apagado · Falta · Retraso · Justificada). Resumen siempre visible («24 presentes · 1 falta · 1 retraso») y quién falta o llega tarde. Cabecera mínima: hora y aula, resumen, nombres y «Toca a quien falte. Otro toque: retraso.». Mantener pulsado (clic derecho en escritorio): justificar o añadir nota (lo recuerda una línea bajo la lista). Guardado automático y «Cerrar lista». En escritorio se abre como panel lateral y Hoy sigue a la vista.
  - **Revisar deberes**: la misma lista a toques (hechos por defecto; tocar = sin hacer; otro toque = incompletos). Quien faltó ese día no cuenta. Cada revisión recalcula en el cuaderno la actividad **«Deberes (1.ª)»** (categoría Trabajos) con nota **sugerida** = 10 × (hechos + 0,5·incompletos) / revisiones (también se recalcula si luego se pasa lista y alguien faltó); el profesor la confirma en el cuaderno y a partir de ahí es una nota más. «Deberes» no es un tipo que el profesor pueda elegir al crear una actividad.
  - **Anotar**: hoja con chips de alumnos + tipo (observación / incidencia / positivo / familia) + texto.
  - **Cerrar clase** (durante o después de la sesión): «Hecho hoy» (rellenado con la unidad en curso), «Para la próxima», «Deberes» (opcional) e interruptor «Unidad terminada · empezar la siguiente».
- **Agenda del día**: filas compactas por hora con el estado siempre en el mismo sitio: «Lista pasada», «Lista sin pasar» (se toca y abre la lista), «Guardia», «Cancelada», «Examen». Tocar la fila abre la sesión: pasar lista, revisar deberes, cerrar clase, anotar, cancelar o quitar la guardia.
- **Pendiente**, por urgencia: listas de hoy sin pasar > exámenes por revisar (hojas o notas sugeridas, exámenes pasados sin notas) > listas de días anteriores (últimos 7 días lectivos, nunca anteriores a la creación de la clase) > **una** fila «Comentarios de evaluación · faltan 73 en 3 clases · 15 dic», solo en los 10 días lectivos previos a la sesión de evaluación. Siempre respecto a hoy: viendo otro día se titula «Pendiente de hoy».
- **A vigilar**: solo **hechos recientes**, no estados (una media baja está en Evaluación, no aquí). Reglas deterministas, las mismas en toda la app: bajó de ≥ 5 a < 5 respecto a la nota anterior **de la misma categoría** («Bajó de 7,8 a 3,6 en «Examen U2»»; un examen no se compara con actitud y la columna de deberes no cuenta), 2 o más suspensos seguidos en exámenes, ≥ 3 faltas sin justificar en 14 días, ≥ 2 incidencias en 7 días, 3 veces seguidas sin deberes. En Hoy, como mucho 4 alumnos de las clases de ese día, por gravedad; «Ver todos» muestra el resto. Cada alumno: motivo concreto y fecha del último hecho, con **«Ya lo sé»** (no vuelve a salir en Hoy hasta que haya algo nuevo; en Clase › Alumnos y en la ficha sigue viéndose el motivo) y **«Avisar a la familia»**: mensaje editable hecho con los hechos (faltas con fecha, suspensos con actividad, incidencias), «Copiar» y «Guardar como observación (Familia)», que también cuenta como «Ya lo sé».
- **Voy a faltar** (menú «···», también desde un día futuro): días, sesiones (todas por defecto), motivo y, por sesión, la tarea («Continuar con <unidad en curso>» + un material de la unidad, o texto libre). Resultado: las sesiones quedan como **Guardia** en la agenda y un **PDF para jefatura** con una página por sesión (grupo, aula, hora, tarea, materiales y lista con casillas) seguida del material elegido.
- Selector de semana para ver otros días. Si en «A vigilar» no hay nadie de las clases de ese día pero sí de otras: «Nadie en las clases de este día · Hay 3 en otras clases» (o «Este día tienes guardias»). Sin IA: Hoy es determinista e instantáneo.

### 4.3 Exámenes y corrección (el flujo más valioso)
Un examen es una **Actividad** de tipo examen. Pantalla única con 3 pasos:

- Asistencia del día del examen: quien tiene falta en la lista y aún no tiene nota sale como **«Faltó»** en Revisar (y en la lista de notas a mano). «Faltaron N» en la cabecera abre la misma hoja que en el cuaderno (programar repesca o poner NP), y si alguien figura como ausente y tiene hoja o nota, un aviso arriba: «¿Hoja mal asignada o lista mal pasada?» con «Revisar».
- Una recuperación o repesca (solo para algunos alumnos) empareja las hojas escaneadas solo con esos alumnos.

1. **Preparar**: sin documento (solo nota) · subir mi examen (PDF/fotos) · generar con IA desde unidades. Si hay documento, la IA extrae la **rúbrica** (preguntas, puntos, solución) → el profesor la revisa en una tabla compacta. Descargas: examen para imprimir (se fotocopia **el mismo** para todos; cabecera "Nombre y apellidos ____"), **hoja extra** (folio pautado con nombre y "Ejercicio nº ___" para quien necesite más espacio), soluciones.
   - Cada página impresa lleva una marca discreta, igual para todos: «Sepia · FRAC-7K2 · Pág. 1/2» (en la hoja extra, «· Hoja extra»). En los exámenes generados, las páginas 2+ vuelven a pedir el nombre. Al examen subido por el profesor se le estampa la marca (sobre un recuadro blanco) al descargarlo para imprimir; su original no cambia. Si el PDF está protegido y no admite la marca, se imprime tal cual y se avisa. Subir un examen propio sustituye del todo al generado antes.
   - **El mismo examen en varios grupos** (2.º ESO A y B): el mismo PDF subido a las dos actividades lleva el mismo código. Si el montón de B se fotocopió del original impreso para A (otro código), Sepia lo reconoce igualmente: la mayoría de las páginas llevan el código de otro examen del mismo profesor → se acepta y se avisa («Impreso desde «Examen U3» de 2.º ESO A»).
   - **Se elimina el QR personalizado y cifrado por alumno.** En los centros se fotocopia un original; las copias personalizadas no son realistas.
2. **Recoger**: subir el PDF del escáner de la copistería (a una o dos caras) o hacer fotos del montón, en varias tandas. Si se imprimió desde Sepia, cada página lleva su marca y el montón se ordena solo aunque venga desordenado. No hace falta indicar páginas por examen (manda la N impresa). Cada página se clasifica (página n del examen, hoja extra, reverso en blanco, otro documento) mirando solo la cabecera y el pie **de la hoja** (en las fotos se quita la mesa de alrededor); si no se lee el número, se mira la página entera reducida. Los reversos claramente en blanco se descartan sin IA; uno con algo escrito nunca se descarta: se queda tras su página como «Reverso escrito» (sin aviso, la IA lo ve al corregir). Las páginas se agrupan por alumno con la marca y el nombre escrito: páginas al revés se reordenan, una página sin número que solo puede ser la que falta recibe ese número, una hoja extra con nombre va con su dueño aunque esté en otro punto del montón, sin nombre va con la hoja anterior (con aviso), una página de otro examen queda aparte con el título de ese examen. Dos alumnos que escriben el mismo nombre dan dos hojas (aviso «Mismo nombre en otra hoja»), nunca una mezclada. El nombre se empareja **localmente** con la lista (no se envía la lista a la IA). Modo alternativo "en orden de lista": empareja por orden de apellidos y lee el nombre solo para comprobar el orden (si no cuadra, la hoja queda «Por confirmar»). Si la IA falla en muchas páginas, la tanda no se guarda y se pide repetirla; si falla en pocas, quedan en «por colocar» con «Volver a leer».
   - Lo que necesita al profesor, primero y en tono de aviso: hojas sin identificar, **páginas por colocar** (con alumnos sugeridos: por el nombre escrito o a quién le falta esa página) y **hojas por revisar** («Falta pág. 2», «Hoja extra sin nombre», «Revisa la pág. 2» cuando dos hojas vecinas se disputan una página). Cada fila muestra una tira de miniaturas («1», «1 rev.», «2», «extra»); al tocar una: «Mover a otro alumno», «Separar aquí», «Quitar» (se puede deshacer y vuelve a su hoja). Una página colocada por el profesor, o una hoja marcada «Está bien así», no vuelve a avisar. «Descartar hoja» manda sus páginas a descartadas (recuperables). Las hojas completas y los «Reversos en blanco descartados (n)» quedan plegados, salvo si alguno puede tener algo escrito. Nada dudoso se mezcla en silencio.
   - La corrección de la IA va en un trabajo aparte al terminar de colocar las páginas («Corrigiendo… 5/24»): mientras, el profesor puede seguir ordenando (una hoja que cambia no recibe una sugerencia hecha con sus páginas viejas). La IA no corrige las hojas que pueden estar incompletas o mezcladas hasta que se arreglan o se marcan «Está bien así». Si llegan páginas a una hoja con nota ya confirmada, se avisa para revisarla.
   - Cambiar las páginas de una hoja quita su sugerencia de la IA sin confirmar (nunca una nota confirmada) y se ofrece «Sugerir notas» para las hojas que se han quedado sin ella.
3. **Revisar**: la IA sugiere puntos por pregunta contra la rúbrica, viendo todas las páginas del alumno, también los reversos escritos y las hojas extra (que en la revisión aparecen al final, marcadas «Hoja extra · ej. 4»). Las miniaturas llevan el número impreso de cada página; si la hoja tiene avisos («Falta pág. 2»), se muestran encima de las páginas con «Ordenar páginas» antes de confirmar la nota. **Modo foco** alumno a alumno: hoja escaneada a la izquierda (zoom), preguntas con pasos de puntos a la derecha, comentario opcional, "Aceptar y siguiente" (Enter / deslizar). La nota = suma de puntos confirmados (escalada a la nota máxima). Siempre se puede teclear la nota a mano sin papel.
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

### 4.4 bis Materiales de la unidad (lo que el profesor ya tiene)
El profesor ya tiene material: el libro, sus apuntes, presentaciones, vídeos. Sepia lo guarda por unidad, lo usa como base de la IA y lo lleva al aula.

- **Añadir** (unidad): «Subir archivos» (varios a la vez, arrastrando en escritorio: PDF, Word, PowerPoint, texto, imágenes; se guardan tal cual, con barra de progreso), **«Fotografiar páginas del libro»** (una foto por página, hasta 30; el móvil las reduce antes de subirlas y se guardan juntas como un PDF; en un ordenador sin cámara se llama «Añadir fotos de páginas») y **«Añadir enlace»** (YouTube, Drive, Genially, Canva, Wordwall o cualquier web; no se descarga nada). En el móvil los tres viven en «Añadir material»; en escritorio son botones.
- **La IA lee lo que no es texto**: las fotos y los PDF escaneados se transcriben en segundo plano (fielmente, fórmulas en LaTeX, sin inventar; las 30 primeras páginas, y la fila dice «Leídas 30 de 84 páginas» si el escaneo es más largo). Mientras, la fila dice «Leyendo…» y el profesor puede seguir trabajando con ella (renombrar, mover, ordenar, compartir: nada se pierde al terminar); si falla o se corta, «No se ha podido leer» y el menú ofrece «Volver a leer».
- **La IA se basa en el material del profesor**: apuntes, fichas y exámenes de la unidad leen primero los archivos y fotos del profesor (no los enlaces), en el orden de la unidad, y luego los apuntes de Sepia. Cada material recibe una parte justa del espacio, así que un escaneo largo no deja fuera la página concreta que se subió después. «Crear con IA» y «Generar examen» muestran qué materiales usará, cuáles solo en parte, y avisan si aún se está leyendo alguno.
- **Dos grupos**: «Para alumnos» (lo generado por defecto) y «Solo para ti» (lo subido y los enlaces por defecto). Menú de cada material: Abrir, Renombrar (con nota privada), Mover a… (otra unidad, también de otra clase), Usar en otra clase… (copia que comparte los archivos), Compartir con alumnos, Cambiar a «para alumnos» / «solo para mí», Subir / Bajar, Eliminar.
- **Compartir con alumnos** (menú de la unidad y de la página del material): primero explica qué pasará (enlace de solo lectura sin iniciar sesión, 60 días, pasa a «Para alumnos», las fichas sin solucionario) y el profesor pulsa «Crear enlace». Después: código QR, dirección corta sin letras ambiguas, «Copiar enlace», **«Proyectar»** (QR y dirección a pantalla completa del navegador) y «Dejar de compartir». Cada vez que se abre se alarga 60 días con el mismo QR (los códigos impresos siguen valiendo). Un enlace compartido abre una página que dice a qué web lleva, con un botón «Abrir enlace» (nunca una redirección directa). Pasar un material a «solo para mí» o eliminarlo retira su enlace. En Temario, las unidades con algo compartido muestran un icono.
- **Biblioteca** (Clases › Materiales): todo lo del profesor de todas sus clases (también las archivadas), más reciente primero; búsqueda por nombre, unidad o contenido (también el texto leído de las fotos) y filtros por clase y tipo, que se conservan en la dirección al abrir un material y volver. Cada fila dice materia y grupo, y «Leyendo…» o «No se ha podido leer» cuando toca.

### 4.5 Cuaderno (cada semana)
- Tabla alumnos × actividades de la evaluación elegida (1ª / 2ª / 3ª / Final). Columna fija con nombres (ordenados por apellidos) a la izquierda y columna **Media** fija a la derecha (en móvil, 56 px con la píldora; en escritorio también la propuesta). Las actividades van de la más reciente a la más antigua; un degradado en el borde avisa de que hay más columnas.
- Cabecera de columna: tipo + fecha + título ("Oral · densidad") y, si hace falta, una marca: `Borrador IA` (hay notas sugeridas), "No cuenta", "Recuperación" o "N alumnos".
- Celdas: nota tal cual se puso (hasta 2 decimales); borrador de la IA en tono secundario (sin superíndices); "—" sin nota; "NP"; **"Faltó"** si la lista del día del examen le marca falta y no tiene nota. Las medias, siempre con 1 decimal.
- Columna **«Deberes (1.ª)»**: sus notas las calcula la revisión de deberes (10 × (hechos + 0,5·incompletos) / revisiones) y salen en el mismo tono secundario, pero no son borradores de la IA (sin marca `Borrador IA` ni aviso "Revisar"); tocar y Enter las confirma.
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
- Botones visibles: **Crear recuperación (N)** (preselecciona a los suspensos, crea la actividad y abre su página; en la final, "recuperación final", o "extraordinaria" en Bachillerato), **Acta (PDF)** y **Exportar CSV para Raíces (Madrid)** (la plataforma de la comunidad del profesor; aviso "Acta descargada" / "CSV descargado").
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
Cabecera: nombre, grupo(s), marcas (NEAE/ACNEE · tipo), chips con sus medidas y los detalles de la adaptación. Acciones: **Anotar** (la única entrada para observaciones), **Copiar resumen** (texto fijo, sin IA, para pegar en un mensaje o en la plataforma: nombre; por clase, media de la evaluación actual —"nota 6" si el profesor ya puso la de la evaluación—, faltas con las justificadas si las hay, retrasos y exámenes pendientes; las 3 últimas observaciones) y "Preparar tutoría" (IA: 5 líneas para hablar con la familia).

Secciones: notas por clase y evaluación con los **mismos** números que el cuaderno (medias con 1 decimal, cada nota tal como se puso, hasta 2 decimales, y el comentario del profesor debajo). La columna **Final** muestra "—" hasta que la 3.ª evaluación tenga media (o el profesor ponga la final). "Exámenes pendientes" (examen pendiente de la ficha, no «Faltó»): exámenes anteriores a hoy de la evaluación actual que cuentan y son del alumno, con NP (marcado "NP") o sin nota del alumno cuando el examen ya está corregido para otros. La nota de la repesca cubre el original y la repesca nunca sale sola; un examen que el profesor aún no ha corregido no es un pendiente del alumno. Por eso un NP sale aquí aunque en Evaluación ya no figure como pendiente. En escritorio las notas salen desplegadas; en móvil tras "Ver N notas". Asistencia (faltas, justificadas, retrasos y, en su propia línea, «Deberes: no hizo 4 de 10 · 1 incompleto») y observaciones (línea de tiempo editable). Si el alumno solo está en una clase no se repite "Matemáticas · 2.º ESO B" en cada fila.

"Editar datos y apoyos" (menú "···"; en escritorio, panel lateral con la ficha a la vista): nombre, NEAE/ACNEE y tipo, interruptores de **medidas** (ACS con su nivel), detalles de la adaptación y notas privadas. La ACS es solo para alumnado ACNEE de Primaria y ESO: activarla marca ACNEE y no se ofrece en Bachillerato ni FP. `GET /courses/{id}/adaptations` da los alumnos con medidas para preparar versiones adaptadas de un examen.

Privacidad: el tipo (diagnóstico) solo aparece en la cabecera de la ficha; las listas y el buscador, que a menudo se proyectan en clase, muestran solo "NEAE"/"ACNEE" y las medidas. A la IA ("Preparar tutoría") solo llegan las medidas y sus detalles, nunca la marca ni el diagnóstico.

### 4.9 Clases, cabecera de la clase y Alumnos
- **Clases**: buscador arriba; cada clase en una fila "Matemáticas · 2.º ESO B" con una línea "25 alumnos · Mañana 11:45" (sin aula) y, si hay trabajo pendiente según Hoy, un chip discreto ("1 lista sin pasar", "18 por revisar"). "Nueva clase" es un botón sin fondo; las archivadas, una fila discreta al final que se despliega.
- **Cabecera de la clase**: materia, grupo y una sola línea "26 alumnos · Aula 204 · En clase hasta 11:15" ("Hoy 12:40", "Mañana 11:45"; la fecha solo a partir de pasado mañana: "Martes 24 nov, 08:30"). Es el mismo texto que en Clases (`format.ts › sessionText`). Mientras la clase está en marcha y sin lista, un botón **Pasar lista** en la barra superior. Un solo menú "···" para la clase: las acciones de la pestaña abierta (Cuaderno: "Exportar CSV para Raíces (Madrid)" —la plataforma de la comunidad del profesor—, Ponderaciones; Temario: Importar temario, Copiar de otra clase) + Añadir alumnos + Ajustes de la clase. Las páginas que cuelgan de la clase vuelven con "‹ 2.º ESO B".
- **Alumnos**: sin avatares. Cada fila, "Apellidos, Nombre" y una línea con el primer motivo de "A vigilar" (texto del backend; una media baja no es motivo de "A vigilar": ya la dice la píldora roja), las medidas de apoyo (o solo "NEAE"/"ACNEE") y las faltas si son 3 o más; a la derecha la media de la evaluación. "Añadir alumnos" está en el "···" y como última fila de la lista.

### 4.10 Ajustes
Perfil (nombre, centro, comunidad autónoma con su plataforma de notas: "Plataforma de notas: Raíces"), fila "Cuenta" con el correo, curso escolar (periodo lectivo, las tres evaluaciones y festivos, con fechas en español "8 sept 2026" en cualquier navegador), apariencia, sugerencias y cerrar sesión. Un solo patrón de guardado: perfil y curso escolar son un borrador y, en cuanto cambia algo, aparece una barra fija "Sin guardar · Descartar · Guardar cambios" (aviso "Cambios guardados"; si falla, el error sale en la propia barra y lo no guardado se conserva). El borrador no se pierde aunque la app recargue los datos al volver a la pestaña. El tema se aplica al momento porque es del dispositivo. El uso y coste de la IA no se muestran al profesor (el endpoint `/me/ai-usage` sigue para administración).

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

Todas las llamadas pasan por **un único gateway** (`app/ai/`) con tres proveedores: `claude_cli` (desarrollo), `openai` (producción) y `mock` (solo tests, puesto a propósito). Un servidor sin IA configurada (`ai_provider: "none"`) desactiva lo que usa IA diciendo por qué («La IA no está configurada en este servidor.»); nunca responde con IA simulada.
- En desarrollo los prompts y esquemas **reales** se ejecutan con Claude por terminal (`claude_cli`); en producción, con OpenAI. Solo cambia a dónde apunta. Las pruebas de uso, E2E y capturas usan IA real; el `mock` determinista queda solo para tests unitarios.
- Salidas estructuradas (esquemas Pydantic) — sin reparar JSON a mano.
- Registro de uso (`ai_calls`): funcionalidad, modelo, tokens, coste estimado, latencia.
- Privacidad: los nombres de alumnos no se envían para emparejar exámenes (el emparejamiento es local). Para comentarios de boletín se envía solo el nombre de pila.

| Función | Cuándo | Modelo (tier) |
|---|---|---|
| `extract_rubric` | Subir examen | vision |
| `generate_assessment` | Examen o ficha desde unidades | text |
| `classify_page` | Recoger hojas: qué es cada página y el nombre escrito | vision (franjas superior e inferior de la hoja; página entera reducida si no se lee el número) |
| `grade_paper` | Revisar hojas | vision |
| `generate_material` | Apuntes / presentación / resumen / adaptada | text |
| `import_units` | Importar temario | text |
| `report_comments` | Boletín, en lotes de ~10 | text |
| `brief` | Preparar tutoría (bajo demanda) | text |
| `transcribe_pages` | Fotos del libro o PDF escaneados subidos a una unidad (en segundo plano) | vision |

## 7. Lenguaje visual (resumen; detalle en `DESIGN.md`)

"**Cristal para el marco, papel para el contenido.**" Superficies de cristal translúcido (estilo Liquid Glass de Apple) solo en la barra superior, la cápsula de navegación, la barra lateral, las hojas y los avisos. El contenido va sobre tarjetas sólidas tipo papel, en listas agrupadas. Tipografía cuidada, un solo color de acento (verde sepia), números tabulares. Tono sobrio: sin emojis, sin exclamaciones, sin iconos de "chispas". Estados vacíos: un icono de línea, una frase, una acción.
