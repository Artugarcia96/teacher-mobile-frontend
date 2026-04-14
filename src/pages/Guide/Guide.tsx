import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogIn, Navigation, Calendar, GraduationCap,
  Settings, Grid3X3, User, BookOpen,
  FileText, CheckCheck, Pencil,
  ClipboardList, Users, BarChart3, Sparkles,
  RefreshCw, MessageCircle, Map, HelpCircle,
  ArrowLeft, BookOpenText,
  type LucideIcon,
} from 'lucide-react';
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from '@/components/ui/accordion';
import Searchbar from '@/components/shared/Searchbar';
import './Guide.css';

/* ── Section data ── */
interface Section {
  id: string;
  title: string;
  icon: LucideIcon;
  keywords: string[];
  content: React.ReactNode;
}

const sections: Section[] = [
  /* 1 */
  {
    id: 'intro',
    title: 'Primeros pasos',
    icon: LogIn,
    keywords: ['registro', 'login', 'iniciar sesion', 'cuenta', 'contrasena', 'correo', 'acceso'],
    content: (
      <>
        <p>SEPIA Education es una plataforma para docentes que integra inteligencia artificial en el flujo de trabajo academico: creacion de examenes, correccion asistida, ejercicios personalizados, seguimiento de alumnos e informes.</p>

        <h4>Acceder a la plataforma</h4>
        <ol className="guide-steps">
          <li>Abre <strong>www.sepiaeducation.com</strong> en tu navegador (funciona en movil y escritorio).</li>
          <li>En la pantalla de inicio veras el logotipo de SEPIA, el titulo y el subtitulo &laquo;Tu asistente educativo inteligente&raquo;.</li>
          <li>Si ya tienes cuenta, introduce tu <strong>correo electronico</strong> y <strong>contrasena</strong> y pulsa <strong>Iniciar Sesion</strong>.</li>
          <li>Si no tienes cuenta, pulsa <strong>Registrarse</strong> debajo del formulario. Introduce tu correo y una contrasena. El registro puede estar restringido a correos autorizados por el administrador.</li>
          <li>Tras iniciar sesion seras redirigido al <strong>Calendario</strong>.</li>
        </ol>

        <div className="guide-tip">
          <strong>Sesion persistente</strong> &mdash; SEPIA mantiene tu sesion abierta usando tokens de acceso. Si caduca, se renueva automaticamente. Para cerrar sesion usa la opcion en el menu.
        </div>
      </>
    ),
  },
  /* 2 */
  {
    id: 'nav',
    title: 'Navegacion',
    icon: Navigation,
    keywords: ['menu', 'pestanas', 'sidebar', 'lateral', 'barra', 'navegacion', 'movil', 'escritorio', 'feedback', 'tareas'],
    content: (
      <>
        <h4>Menu lateral (escritorio)</h4>
        <p>En pantallas grandes aparece un menu lateral fijo con dos opciones:</p>
        <table className="guide-table">
          <thead><tr><th>Opcion</th><th>Descripcion</th></tr></thead>
          <tbody>
            <tr><td><strong>Calendario</strong></td><td>Vista de calendario con clases, examenes y eventos. Muestra un badge con las correcciones pendientes.</td></tr>
            <tr><td><strong>Clases</strong></td><td>Lista de todos tus grupos con acceso a calificaciones, alumnos, examenes, ejercicios y configuracion.</td></tr>
          </tbody>
        </table>

        <h4>Barra de pestanas (movil)</h4>
        <p>En movil la navegacion aparece como una barra inferior con las mismas dos pestanas: Calendario y Clases. El badge de correcciones pendientes aparece sobre el icono de Calendario.</p>

        <h4>Elementos flotantes</h4>
        <ul>
          <li><strong>Boton de tareas en segundo plano</strong> &mdash; muestra cuantas tareas de IA se estan ejecutando. Pulsalo para ver el progreso de cada tarea.</li>
          <li><strong>Boton de feedback</strong> &mdash; para enviar sugerencias, reportar errores o dejar comentarios sobre la plataforma.</li>
        </ul>
      </>
    ),
  },
  /* 3 */
  {
    id: 'calendar',
    title: 'Calendario y panel del dia',
    icon: Calendar,
    keywords: ['calendario', 'semanal', 'mensual', 'evento', 'clase', 'tutoria', 'prepara tu dia', 'briefing', 'pendientes', 'correccion'],
    content: (
      <>
        <p>El Calendario es tu centro de operaciones diario. Muestra sesiones de clase, eventos personalizados y tutorias.</p>

        <h4>Vistas disponibles</h4>
        <table className="guide-table">
          <thead><tr><th>Vista</th><th>Que muestra</th></tr></thead>
          <tbody>
            <tr><td><strong>Semanal</strong></td><td>Dias de lunes a domingo con todos los eventos del periodo. Navega con flechas.</td></tr>
            <tr><td><strong>Mensual</strong></td><td>Cuadricula del mes completo. Los dias con eventos se marcan con puntos de color.</td></tr>
          </tbody>
        </table>
        <p>Un saludo contextual (&laquo;Buenos dias&raquo;, &laquo;Buenas tardes&raquo;, &laquo;Buenas noches&raquo;) aparece en la cabecera.</p>

        <h4>Tipos de eventos</h4>
        <ul>
          <li><strong>Sesion de clase</strong> &mdash; generada automaticamente a partir de los horarios. Muestra nombre de clase, asignatura y aula. Pulsala para ver alumnos o pasar lista.</li>
          <li><strong>Evento personalizado</strong> &mdash; notas o recordatorios que creas manualmente. Puedes mencionar alumnos con <kbd>@nombre</kbd>. Editable y borrable.</li>
          <li><strong>Tutoria</strong> &mdash; sesion individual o grupal con alumnos seleccionados. Util para seguimiento personalizado.</li>
        </ul>
        <p>Los examenes no aparecen como eventos independientes, sino en el <strong>panel de correcciones pendientes</strong> de la vista de calendario, con indicadores de urgencia por colores.</p>

        <h4>Crear un evento</h4>
        <ol className="guide-steps">
          <li>Pulsa el boton <strong>+</strong> o toca un espacio vacio en el calendario.</li>
          <li>Selecciona el <strong>tipo de evento</strong>: sesion de clase, personalizado o tutoria.</li>
          <li>Rellena los campos: titulo, fecha, hora de inicio y fin.</li>
          <li>Para tutorias o eventos personalizados puedes usar <strong>@menciones</strong> en las notas.</li>
          <li>Pulsa <strong>Guardar</strong>.</li>
        </ol>

        <h4>&laquo;Prepara tu dia&raquo;</h4>
        <div className="guide-highlight">
          <p>Pulsa el boton <strong>&laquo;Prepara tu dia&raquo;</strong> en la vista de calendario. SEPIA genera un informe organizado por prioridad:</p>
          <ul>
            <li><strong>Urgente</strong>: deadlines vencidos, alumnos con notas en descenso, examenes del dia.</li>
            <li><strong>Pendiente</strong>: correcciones y ejercicios por procesar, deadlines proximos.</li>
            <li><strong>Positivo</strong>: alumnos que mejoran, logros destacados.</li>
          </ul>
          <p>Tambien muestra las clases del dia y permite navegar entre fechas.</p>
        </div>

        <h4>Correcciones pendientes</h4>
        <p>En la vista de calendario un panel muestra un resumen de correcciones pendientes con el numero de examenes y alumnos por corregir, junto con indicadores de urgencia por colores. Pulsa cualquier examen pendiente para ir directamente a la interfaz de correccion.</p>
      </>
    ),
  },
  /* 4 */
  {
    id: 'classes',
    title: 'Gestion de clases',
    icon: GraduationCap,
    keywords: ['clase', 'grupo', 'crear clase', 'nueva clase', 'eliminar', 'hub', 'asignatura', 'alumnos'],
    content: (
      <>
        <h4>Lista de clases</h4>
        <p>La vista principal muestra tus clases como tarjetas, cada una con:</p>
        <ul>
          <li>Nombre de la clase.</li>
          <li>Numero de alumnos matriculados.</li>
          <li>Fecha de ultima actividad.</li>
          <li>Asignaturas vinculadas con aula y correcciones pendientes por asignatura.</li>
        </ul>
        <p>Puedes buscar por nombre o asignatura y ordenar por nombre, asignatura o numero de alumnos.</p>

        <h4>Crear una nueva clase</h4>
        <ol className="guide-steps">
          <li>Pulsa <strong>+ Nueva Clase</strong>.</li>
          <li>Introduce el nombre (ej: &laquo;3.&ordm; ESO B&raquo;).</li>
          <li>Elige el nivel educativo (Infantil, Primaria, Secundaria, Bachillerato, Universidad).</li>
          <li>Establece el curso academico (desde/hasta).</li>
          <li>Pulsa <strong>Crear</strong>. Seras redirigido a la configuracion para anadir asignaturas y alumnos.</li>
        </ol>

        <h4>Acciones sobre una clase</h4>
        <table className="guide-table">
          <thead><tr><th>Accion</th><th>Descripcion</th></tr></thead>
          <tbody>
            <tr><td><strong>Editar</strong></td><td>Modifica nombre y configuracion.</td></tr>
            <tr><td><strong>Eliminar</strong></td><td>Eliminacion con vista previa de lo que se borrara (alumnos, examenes, ejercicios, eventos).</td></tr>
            <tr><td><strong>Configuracion</strong></td><td>Accede a horarios, alumnos y asignaturas.</td></tr>
          </tbody>
        </table>

        <h4>Hub de clase</h4>
        <p>Al pulsar una clase accedes a su hub central con dos pestanas:</p>
        <p><strong>Pestana Resumen:</strong></p>
        <ul>
          <li>Panel de Insights: resumen generado por IA sobre el estado de la clase.</li>
          <li>Tarjetas de asignatura: cada una muestra su color, numero de examenes, ejercicios pendientes, media de notas y tasa de aprobacion.</li>
          <li>Botones de accion rapida: Anadir Alumnos, Anadir Ejercicio, Subir Examenes, Configuracion, Resumen Trimestral, Informe de Clase, Comentarios de Informes.</li>
        </ul>
        <p><strong>Pestana Alumnos:</strong></p>
        <ul>
          <li>Lista buscable de todos los alumnos.</li>
          <li>Acciones por alumno: ver ficha, eliminar de la clase, dejar comentarios.</li>
          <li>Boton para anadir o importar alumnos en bloque.</li>
        </ul>
      </>
    ),
  },
  /* 5 */
  {
    id: 'class-settings',
    title: 'Configuracion de clase',
    icon: Settings,
    keywords: ['configuracion', 'horario', 'alumnos', 'importar', 'codigo', 'asignatura'],
    content: (
      <>
        <h4>Asignaturas y horarios</h4>
        <p>Cada clase puede tener multiples asignaturas. Para cada una puedes configurar horarios:</p>
        <ol className="guide-steps">
          <li>Pulsa <strong>Anadir Horario</strong> dentro de la configuracion.</li>
          <li>Introduce un nombre y selecciona un color.</li>
          <li>Configura los dias de la semana y las horas de inicio y fin.</li>
          <li>Opcionalmente indica el aula.</li>
          <li>Pulsa <strong>Guardar</strong>. Las sesiones aparecen automaticamente en el calendario.</li>
        </ol>
        <p>SEPIA detecta conflictos de horario si dos asignaturas se solapan en el mismo dia y hora.</p>

        <h4>Gestion de alumnos</h4>
        <p><strong>Anadir alumnos existentes:</strong> si ya has creado alumnos en otras clases puedes anadirlos desde el pool de alumnos existente. Puedes buscarlos por nombre y ver en que otras clases estan.</p>
        <p><strong>Importar en bloque:</strong></p>
        <ol className="guide-steps">
          <li>Anade nombres directamente o importa un archivo CSV.</li>
          <li>SEPIA genera automaticamente un codigo de alumno unico para cada uno.</li>
          <li>Confirma la importacion.</li>
        </ol>
        <p>Los codigos de alumno se usan para el reconocimiento automatico al escanear examenes.</p>
      </>
    ),
  },
  /* 6 */
  {
    id: 'gradebook',
    title: 'Libro de calificaciones',
    icon: Grid3X3,
    keywords: ['calificaciones', 'notas', 'gradebook', 'csv', 'exportar', 'media', 'aprobado', 'suspenso', 'ponderado'],
    content: (
      <>
        <p>El libro de calificaciones es una tabla interactiva que muestra todas las notas de tus alumnos, con promedios ponderados y codificacion por colores.</p>

        <h4>Vistas del libro</h4>
        <p>Al acceder a una asignatura concreta dentro de una clase se muestra el libro de calificaciones con tres pestanas:</p>
        <table className="guide-table">
          <thead><tr><th>Pestana</th><th>Contenido</th></tr></thead>
          <tbody>
            <tr><td><strong>Resumen</strong></td><td>Promedios calculados y tabla con medias ponderadas (examenes vs. ejercicios).</td></tr>
            <tr><td><strong>Calificaciones</strong></td><td>Tabla con columna por cada examen y ejercicio, con la nota individual de cada alumno. Permite ajustar los pesos de cada evaluacion.</td></tr>
            <tr><td><strong>Alumnos</strong></td><td>Lista de alumnos de la clase con acceso a sus fichas.</td></tr>
          </tbody>
        </table>

        <h4>Codificacion por colores</h4>
        <div className="guide-colors">
          <span className="guide-swatch guide-swatch--green">Verde: aprobado (&ge; 60%)</span>
          <span className="guide-swatch guide-swatch--yellow">Amarillo: en riesgo (&ge; 40%)</span>
          <span className="guide-swatch guide-swatch--red">Rojo: suspenso (&lt; 40%)</span>
        </div>

        <h4>Edicion de notas</h4>
        <p>Puedes editar notas directamente en la tabla haciendo clic en cualquier celda. Pulsa Enter o haz clic fuera para guardar. Tambien puedes ajustar los pesos porcentuales de cada examen o ejercicio sobre la nota final.</p>

        <h4>Exportacion</h4>
        <p>Pulsa <strong>Exportar CSV</strong> en la pestana de calificaciones para descargar las notas de examenes de la asignatura.</p>

        <h4>Navegacion desde el libro</h4>
        <ul>
          <li>Clic en un nombre de alumno &rarr; abre la ficha del estudiante.</li>
          <li>Clic en un titulo de examen &rarr; abre la interfaz de correccion.</li>
          <li>Clic en un titulo de ejercicio &rarr; abre la correccion del ejercicio.</li>
        </ul>
      </>
    ),
  },
  /* 7 */
  {
    id: 'student',
    title: 'Ficha del estudiante',
    icon: User,
    keywords: ['alumno', 'estudiante', 'ficha', 'perfil', 'tendencia', 'areas debiles', 'comentarios', 'notas', 'grafico'],
    content: (
      <>
        <p>La ficha de cada alumno reune toda la informacion academica, tendencias, areas debiles y comentarios en un unico lugar.</p>

        <h4>Perfil</h4>
        <ul>
          <li>Avatar generado automaticamente con un color unico basado en el nombre.</li>
          <li>Nombre completo y codigo de alumno.</li>
        </ul>

        <h4>Resumen de notas</h4>
        <ul>
          <li><strong>Grafico de dona</strong>: distribucion de notas respecto al umbral de aprobado.</li>
          <li><strong>Grafico de linea</strong>: progresion de notas a lo largo del tiempo.</li>
          <li><strong>Estadisticas</strong>: nota media, mejor nota, peor nota.</li>
          <li><strong>Tendencia</strong>: Mejorando / Estable / Declinando.</li>
        </ul>

        <h4>Examenes y ejercicios del alumno</h4>
        <p>Listas de todos los examenes realizados y ejercicios asignados, con nota, porcentaje, fecha y estado con colores. Pulsa cualquiera para ver la correccion detallada.</p>

        <h4>Areas debiles</h4>
        <div className="guide-highlight">
          <p>SEPIA analiza las correcciones con IA para identificar los temas donde el alumno tiene dificultades. Estas areas debiles se usan para:</p>
          <ul>
            <li>Generar ejercicios personalizados centrados en esos temas.</li>
            <li>Incluirlos en informes de progreso.</li>
            <li>Alertar al profesor sobre areas que necesitan refuerzo.</li>
          </ul>
        </div>

        <h4>Asistencia</h4>
        <p>Si hay una asignatura seleccionada se muestra el resumen de asistencia: presente, ausente, tarde, justificado y porcentaje.</p>

        <h4>Comentarios</h4>
        <p>Cronologia de todos los comentarios que mencionan al alumno. Puedes anadir nuevos comentarios con soporte para @menciones.</p>

        <h4>Acciones disponibles</h4>
        <table className="guide-table">
          <thead><tr><th>Accion</th><th>Descripcion</th></tr></thead>
          <tbody>
            <tr><td><strong>Generar ejercicio</strong></td><td>Abre el generador con las areas debiles del alumno preseleccionadas.</td></tr>
            <tr><td><strong>Anadir comentario</strong></td><td>Abre un editor de comentarios con soporte para @menciones.</td></tr>
          </tbody>
        </table>
      </>
    ),
  },
  /* 8 */
  {
    id: 'topics',
    title: 'Temas y materiales',
    icon: BookOpen,
    keywords: ['temas', 'materiales', 'libro de texto', 'textbook', 'subtemas', 'trimestre', 'curriculum', 'pdf', 'generar'],
    content: (
      <>
        <p>Organiza el contenido curricular de cada asignatura en temas, sube materiales y usa la IA para generar recursos.</p>

        <h4>Estructura de temas</h4>
        <p>Los temas se organizan por asignatura y son compartidos entre todas las clases que la imparten. Cada tema tiene:</p>
        <ul>
          <li>Nombre y descripcion.</li>
          <li>Trimestre asignado (1, 2 o 3).</li>
          <li>Opcion de incluir o excluir en la generacion de contenido con IA.</li>
          <li>Jerarquia: los temas pueden tener subtemas.</li>
          <li>Orden personalizable arrastrando y soltando.</li>
        </ul>

        <h4>Crear temas</h4>
        <p>Hay tres formas de crear temas:</p>
        <ul>
          <li><strong>Manualmente</strong>: pulsa <strong>+ Nuevo Tema</strong>, introduce nombre, descripcion, trimestre y materiales opcionales.</li>
          <li><strong>Desde un libro de texto</strong>: si has generado un libro con IA, pulsa <strong>&laquo;Sugerir Temas&raquo;</strong> para crear temas a partir de la estructura de capitulos.</li>
          <li><strong>Desde una planificacion</strong>: al aceptar una planificacion de curso se crean automaticamente los temas con fechas y sesiones programadas. Consulta la seccion &laquo;Planificacion del curso&raquo;.</li>
        </ul>

        <h4>Gestion de materiales</h4>
        <ul>
          <li><strong>Subir archivos</strong>: PDFs, imagenes, documentos.</li>
          <li><strong>Marcar para generacion</strong>: indica que el material debe usarse como contexto al generar ejercicios o examenes.</li>
          <li><strong>Generar material con IA</strong>: crea contenido didactico a partir del nombre y descripcion del tema.</li>
          <li><strong>Eliminar</strong> materiales individuales.</li>
        </ul>

        <h4>Libros de texto con IA</h4>
        <div className="guide-highlight">
          <p>Desde la vista de temas puedes generar un libro de texto completo para tu asignatura. Consulta la seccion &laquo;Generacion de contenido con IA&raquo; para el flujo detallado.</p>
        </div>

        <h4>Sugerencia de temas desde libro</h4>
        <p>Si has generado un libro de texto, SEPIA puede sugerir temas automaticamente basandose en la estructura de capitulos. La IA agrupa los capitulos en unidades logicas, asigna trimestres y te deja revisar la propuesta antes de crear los temas.</p>
      </>
    ),
  },
  /* 9 */
  {
    id: 'course-plan',
    title: 'Planificacion del curso',
    icon: BookOpenText,
    keywords: ['planificacion', 'programacion', 'planificar', 'curso', 'calendario', 'sesiones', 'trimestre', 'curriculo', 'progreso', 'repaso', 'margen'],
    content: (
      <>
        <p>SEPIA puede generar una planificacion completa del curso a partir de la programacion oficial (PDF). La IA analiza el curriculo, distribuye los temas en sesiones reales segun los horarios configurados y programa examenes, repasos y entregas de ejercicios.</p>

        <h4>Acceso</h4>
        <p>La planificacion se crea y gestiona desde la vista de <strong>Temas</strong> de una asignatura. Si aun no hay temas creados, aparece un boton destacado <strong>&laquo;Planificar curso con IA&raquo;</strong>. Tambien puedes acceder desde la vista de asignatura en el libro de calificaciones, donde se muestra el progreso de la planificacion activa.</p>

        <h4>Crear una planificacion</h4>
        <ol className="guide-steps">
          <li>Ve a la clase &rarr; <strong>Temas</strong> &rarr; pulsa <strong>&laquo;Planificar curso con IA&raquo;</strong>.</li>
          <li>Sube uno o varios PDFs con la programacion del curso (temario oficial).</li>
          <li>Selecciona los trimestres activos. SEPIA detecta automaticamente cuantas sesiones hay en cada trimestre segun los horarios configurados.</li>
          <li>Configura las opciones:
            <ul>
              <li><strong>Repaso antes de examenes</strong>: incluye sesiones de repaso previas a cada examen.</li>
              <li><strong>Margen por trimestre</strong>: sesiones de reserva para imprevistos (0 a 5).</li>
              <li><strong>Notas para la IA</strong>: instrucciones opcionales, por ejemplo &laquo;dedicar mas tiempo a fracciones&raquo; o &laquo;saltar combinatoria&raquo;.</li>
            </ul>
          </li>
          <li>Pulsa <strong>&laquo;Generar planificacion&raquo;</strong>. La tarea se ejecuta en segundo plano.</li>
        </ol>

        <h4>Revisar la planificacion generada</h4>
        <p>Cuando la planificacion esta lista, pulsa la tarjeta para abrirla. La vista de linea temporal muestra:</p>
        <ul>
          <li><strong>Selector de trimestre</strong> con fechas de inicio y fin.</li>
          <li><strong>Sesiones por mes</strong>: barras de distribucion con el numero de sesiones y examenes previstos en cada mes.</li>
          <li><strong>Unidades y temas</strong>: cada unidad muestra sus temas con el numero de sesiones asignadas.</li>
          <li><strong>Sesiones individuales</strong>: al expandir un tema se ven las sesiones con su tipo (Intro, Teoria, T+Pract, Practica, Profund., Repaso), titulo y fecha.</li>
          <li><strong>Eventos del plan</strong>: entregas de ejercicios, sesiones de repaso, examenes de unidad, examenes finales de trimestre y sesiones de margen.</li>
        </ul>

        <h4>Editar antes de aceptar</h4>
        <div className="guide-highlight">
          <p>Puedes ajustar la planificacion antes de aceptarla:</p>
          <ul>
            <li><strong>Ajustar sesiones</strong>: usa los controles +/- para aumentar o reducir las sesiones dedicadas a un tema.</li>
            <li><strong>Mover temas de trimestre</strong>: pulsa el boton del trimestre destino para reubicar un tema.</li>
            <li><strong>Editar contenido de sesiones</strong>: toca una sesion para editar su titulo, enfoque y puntos clave.</li>
            <li><strong>Regenerar</strong>: tras hacer cambios, pulsa <strong>&laquo;Regenerar plan&raquo;</strong> para que la IA recalcule las fechas con tus ajustes.</li>
          </ul>
        </div>

        <h4>Aceptar la planificacion</h4>
        <ol className="guide-steps">
          <li>Pulsa <strong>&laquo;Revisar y aceptar&raquo;</strong>.</li>
          <li>Revisa el resumen: numero de temas, sesiones y examenes.</li>
          <li>Opcionalmente activa <strong>&laquo;Generar material para cada tema&raquo;</strong> para que la IA cree automaticamente contenido teorico con PDF.</li>
          <li>Revisa los examenes del plan y desmarca los que no quieras crear.</li>
          <li>Opcionalmente anade examenes adicionales con <strong>&laquo;+ Anadir examen propio&raquo;</strong>.</li>
          <li>Pulsa <strong>&laquo;Aceptar planificacion&raquo;</strong> (o <strong>&laquo;Aceptar y generar material&raquo;</strong> si activaste la generacion de contenido).</li>
        </ol>
        <p>Al aceptar, SEPIA crea automaticamente los temas y los eventos en el calendario.</p>

        <h4>Seguimiento de progreso</h4>
        <p>Una vez aceptada, la planificacion muestra una pestana de <strong>Progreso</strong> con:</p>
        <ul>
          <li><strong>Anillo de completitud</strong>: porcentaje de temas impartidos sobre el total.</li>
          <li><strong>Ritmo</strong>: sesiones de adelanto o retraso respecto al plan. Verde si vas adelantado, rojo si vas retrasado.</li>
          <li><strong>Progreso por trimestre</strong>: temas completados vs. planificados en cada periodo.</li>
          <li><strong>Tema actual y proximos</strong>: el tema en curso y los siguientes con sus fechas.</li>
        </ul>
        <p>SEPIA marca automaticamente los temas como impartidos cuando pasan todas sus fechas programadas.</p>

        <div className="guide-tip">
          <strong>Widget en el libro de calificaciones</strong> &mdash; en la vista de asignatura del libro de calificaciones aparece un widget compacto con el progreso de la planificacion activa: porcentaje, tema actual, ritmo y desglose por trimestre. Pulsa sobre el para ir a los temas.
        </div>
      </>
    ),
  },
  /* 10 */
  {
    id: 'exams',
    title: 'Gestion de examenes',
    icon: FileText,
    keywords: ['examen', 'crear examen', 'subir', 'generar', 'preguntas', 'dificultad', 'deadline', 'asignar', 'iterar'],
    content: (
      <>
        <h4>Lista de examenes</h4>
        <p>En la vista de examenes de una clase encontraras filtros por estado (subidos / pendientes / corregidos) y por asignatura. Cada examen muestra: nombre, fecha, puntuacion maxima, estado, deadline y contador de pendientes/corregidos. Los examenes se codifican por colores segun su asignatura.</p>

        <h4>Estados del examen</h4>
        <table className="guide-table">
          <thead><tr><th>Estado</th><th>Significado</th></tr></thead>
          <tbody>
            <tr><td><strong>Subido</strong></td><td>El examen esta en el sistema pero no se ha asignado a alumnos.</td></tr>
            <tr><td><strong>Por corregir</strong></td><td>Asignado y con correcciones pendientes.</td></tr>
            <tr><td><strong>Corregido</strong></td><td>Todas las correcciones completadas.</td></tr>
          </tbody>
        </table>

        <h4>Modo 1: Subir examen existente</h4>
        <ol className="guide-steps">
          <li>Ve a la clase &rarr; <strong>Examenes</strong> &rarr; <strong>+ Nuevo Examen</strong>.</li>
          <li>Selecciona el modo <strong>&laquo;Subir&raquo;</strong>.</li>
          <li>Elige la clase y la asignatura.</li>
          <li>Sube el PDF o imagenes del examen.</li>
          <li>Establece la fecha, puntuacion maxima y opcionalmente una fecha limite de correccion.</li>
          <li>Activa <strong>&laquo;Personalizado&raquo;</strong> si cada alumno tiene una version diferente.</li>
          <li>Pulsa <strong>Crear</strong>. La IA procesara el documento para extraer preguntas y soluciones.</li>
        </ol>

        <h4>Modo 2: Generar examen con IA</h4>
        <ol className="guide-steps">
          <li>Ve a la clase &rarr; <strong>Examenes</strong> &rarr; <strong>+ Nuevo Examen</strong>.</li>
          <li>Selecciona el modo <strong>&laquo;Generar&raquo;</strong>.</li>
          <li>Elige la clase y la asignatura.</li>
          <li>Selecciona los temas en los que basar el examen.</li>
          <li>Configura: nivel de dificultad, numero de preguntas, puntuacion maxima.</li>
          <li>Opcionalmente activa personalizacion (versiones diferentes por alumno).</li>
          <li>Anade un prompt de refinamiento si quieres personalizar el estilo (ej: &laquo;incluir mas problemas practicos&raquo;).</li>
          <li>Pulsa <strong>Generar</strong>. La IA creara un examen con preguntas y clave de respuestas.</li>
        </ol>

        <h4>Detalle del examen</h4>
        <p>La vista de detalle muestra: metadatos, vista previa del documento, preguntas extraidas por la IA, clave de soluciones, historial de iteraciones y lista de alumnos con su estado de correccion.</p>

        <h4>Iterar y refinar</h4>
        <p>Tanto los examenes subidos como los generados pueden iterarse. Escribe instrucciones de refinamiento y la IA genera una nueva version manteniendo el historial de cambios. Puedes volver a versiones anteriores si lo necesitas.</p>

        <h4>Asignar examen</h4>
        <p>Cuando el examen esta listo, pulsa <strong>&laquo;Asignar&raquo;</strong>. Esto cambia el estado y activa el flujo de correccion. El examen aparecera en las correcciones pendientes del calendario.</p>
      </>
    ),
  },
  /* 11 */
  {
    id: 'correction',
    title: 'Correccion de examenes',
    icon: CheckCheck,
    keywords: ['correccion', 'corregir', 'escanear', 'IA', 'analisis', 'nota', 'subir papeles', 'emparejar', 'QR', 'revision'],
    content: (
      <>
        <h4>Flujo general</h4>
        <div className="guide-workflow">
          <span>Subir papeles</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Emparejar alumnos</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Analisis IA</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Revision manual</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Finalizar</span>
        </div>

        <h4>1. Subir los papeles de los alumnos</h4>
        <p>Abre el examen y pulsa <strong>&laquo;Corregir&raquo;</strong>, o accede desde el calendario. Sube los papeles escaneados: un PDF con todos o imagenes individuales. Si los alumnos tienen codigos, SEPIA intentara emparejar automaticamente.</p>

        <h4>2. Emparejamiento con alumnos</h4>
        <table className="guide-table">
          <thead><tr><th>Categoria</th><th>Descripcion</th></tr></thead>
          <tbody>
            <tr><td><strong>Emparejado</strong></td><td>El codigo fue reconocido con alta confianza.</td></tr>
            <tr><td><strong>Revision necesaria</strong></td><td>Baja confianza, requiere confirmacion manual.</td></tr>
            <tr><td><strong>Sin emparejar</strong></td><td>No se pudo identificar al alumno, asignalo manualmente.</td></tr>
          </tbody>
        </table>

        <h4>3. Analisis con IA</h4>
        <div className="guide-highlight">
          <p>Pulsa <strong>&laquo;Procesar con IA&raquo;</strong> para que SEPIA analice cada papel:</p>
          <ul>
            <li>Analiza cada pregunta del examen individualmente.</li>
            <li>Marca como correcta, parcialmente correcta, incorrecta o en blanco.</li>
            <li>Sugiere una puntuacion total para el alumno.</li>
            <li>Identifica areas debiles basandose en los errores.</li>
            <li>Genera feedback resumido.</li>
          </ul>
          <p>El procesamiento se ejecuta en segundo plano. Puedes ver el progreso en el boton de tareas flotante.</p>
        </div>

        <h4>4. Revision y ajuste manual</h4>
        <p>Para cada alumno la interfaz muestra:</p>
        <ul>
          <li>Imagen del papel escaneado.</li>
          <li>Analisis por pregunta de la IA con feedback detallado.</li>
          <li>Nota sugerida que puedes aceptar o modificar.</li>
          <li>Areas debiles identificadas que puedes editar, aceptar o rechazar.</li>
          <li>Campo de comentarios para notas adicionales.</li>
        </ul>
        <p>Puedes filtrar (todos / aprobados / suspensos), ordenar (por nombre o nota) y los cambios se guardan automaticamente.</p>

        <h4>5. Finalizar correccion</h4>
        <p>Revisa que todos los alumnos tengan nota asignada y pulsa <strong>&laquo;Finalizar Correccion&raquo;</strong>. Las notas se reflejan en el libro de calificaciones y las areas debiles se agregan al perfil de cada alumno.</p>

        <div className="guide-tip">
          <strong>Consejo:</strong> tras corregir un examen, SEPIA te sugiere generar ejercicios personalizados para los alumnos con areas debiles. Esto cierra el ciclo de aprendizaje.
        </div>
      </>
    ),
  },
  /* 12 */
  {
    id: 'exercises',
    title: 'Ejercicios personalizados',
    icon: Pencil,
    keywords: ['ejercicio', 'generar', 'personalizado', 'practica', 'recuperacion', 'debilidad', 'agrupar', 'pdf', 'descargar'],
    content: (
      <>
        <h4>Acceso al generador</h4>
        <ul>
          <li>Hub de clase &rarr; boton <strong>&laquo;Anadir Ejercicio&raquo;</strong></li>
          <li>Ficha del alumno &rarr; boton <strong>&laquo;Generar Ejercicio&raquo;</strong> (areas debiles preseleccionadas)</li>
          <li>Detalle del examen (tras correccion con IA)</li>
          <li>Lista de ejercicios &rarr; boton <strong>+</strong></li>
        </ul>

        <h4>Tipos de ejercicio</h4>
        <table className="guide-table">
          <thead><tr><th>Tipo</th><th>Descripcion</th><th>Uso ideal</th></tr></thead>
          <tbody>
            <tr><td><strong>Practica</strong></td><td>Ejercicios genericos sobre temas seleccionados.</td><td>Refuerzo general de la clase.</td></tr>
            <tr><td><strong>Recuperacion</strong></td><td>Ejercicios personalizados segun areas debiles del alumno.</td><td>Refuerzo individual tras un examen.</td></tr>
          </tbody>
        </table>

        <h4>Generacion para un alumno individual</h4>
        <ol className="guide-steps">
          <li>Desde la ficha del alumno, pulsa <strong>&laquo;Generar Ejercicio&raquo;</strong>.</li>
          <li>El alumno y sus areas debiles se preseleccionan automaticamente.</li>
          <li>Ajusta la dificultad: mas facil, igual o mas dificil que el examen fuente.</li>
          <li>Configura el numero de preguntas y la puntuacion maxima.</li>
          <li>Establece las fechas de entrega y correccion.</li>
          <li>Opcionalmente anade instrucciones adicionales para la IA.</li>
          <li>Pulsa <strong>Generar</strong>. Se crea un PDF con el ejercicio y otro con las soluciones.</li>
        </ol>

        <h4>Generacion masiva para la clase</h4>
        <ol className="guide-steps">
          <li>Desde el hub de clase, pulsa <strong>&laquo;Anadir Ejercicio&raquo;</strong>.</li>
          <li>Selecciona la asignatura.</li>
          <li>Elige la fuente: basado en examenes o en temas.</li>
          <li>Selecciona los alumnos (todos o un subconjunto).</li>
          <li>Activa <strong>&laquo;Agrupar por debilidad&raquo;</strong> para que alumnos con areas debiles similares reciban el mismo ejercicio.</li>
          <li>Configura dificultad, cantidad de preguntas, fechas.</li>
          <li>Pulsa <strong>Generar</strong>. La tarea se ejecuta en segundo plano.</li>
        </ol>

        <div className="guide-highlight">
          <p><strong>Agrupacion inteligente:</strong> cuando activas &laquo;Agrupar por debilidad&raquo;, SEPIA analiza las areas debiles de todos los alumnos seleccionados, crea grupos con debilidades similares y genera un ejercicio unico por grupo. Puedes previsualizar los grupos antes de confirmar.</p>
        </div>

        <h4>Descargar ejercicios</h4>
        <p>Descarga el PDF de un ejercicio individual o sus soluciones. Los PDFs incluyen preguntas y espacio para respuestas.</p>
      </>
    ),
  },
  /* 13 */
  {
    id: 'exercise-correction',
    title: 'Correccion de ejercicios',
    icon: ClipboardList,
    keywords: ['correccion', 'ejercicio', 'masiva', 'bulk', 'procesar', 'nota'],
    content: (
      <>
        <h4>Correccion individual</h4>
        <ol className="guide-steps">
          <li>Ve al detalle del ejercicio desde la lista o la ficha del alumno.</li>
          <li>Sube el papel del alumno (PDF o imagenes).</li>
          <li>Pulsa <strong>&laquo;Procesar con IA&raquo;</strong> para el analisis automatico.</li>
          <li>Revisa las sugerencias: feedback por pregunta, nota sugerida, areas debiles.</li>
          <li>Ajusta la nota y anade comentarios.</li>
          <li>Pulsa <strong>Guardar</strong>.</li>
        </ol>

        <h4>Correccion masiva</h4>
        <div className="guide-highlight">
          <p>La correccion masiva permite procesar todos los ejercicios pendientes de una clase de una sola vez:</p>
          <ol className="guide-steps">
            <li>Accede a <strong>Correccion Masiva</strong> desde la lista de ejercicios.</li>
            <li>Se muestran todos los ejercicios pendientes.</li>
            <li>Sube los papeles, procesa con IA y revisa cada uno.</li>
            <li>La interfaz avanza automaticamente al siguiente tras guardar.</li>
            <li>Al terminar, pulsa <strong>&laquo;Finalizar Todo&raquo;</strong>.</li>
          </ol>
        </div>
      </>
    ),
  },
  /* 14 */
  {
    id: 'attendance',
    title: 'Asistencia',
    icon: Users,
    keywords: ['asistencia', 'presente', 'ausente', 'tarde', 'justificado', 'justificacion', 'lista'],
    content: (
      <>
        <h4>Registrar asistencia desde el calendario</h4>
        <ol className="guide-steps">
          <li>En el Calendario, pulsa una sesion de clase del dia actual o cualquier dia pasado.</li>
          <li>Se abre la hoja de asistencia con la lista de alumnos.</li>
          <li>Marca a cada alumno como: Presente / Ausente / Tarde / Justificado. Puedes usar el boton <strong>&laquo;Todos presentes&raquo;</strong> para marcar a todos de una vez.</li>
          <li>Pulsa <strong>Guardar</strong>.</li>
        </ol>

        <h4>Consultar el resumen</h4>
        <p>Ve a la clase &rarr; <strong>Asistencia</strong>. Veras un resumen por alumno:</p>
        <ul>
          <li>Total de sesiones registradas.</li>
          <li>Contadores y porcentajes de: presente, ausente, tarde, justificado.</li>
          <li>Tasa de asistencia con grafico de dona.</li>
          <li>Filtro para identificar alumnos con baja asistencia (por debajo del 80%).</li>
          <li>Busqueda por nombre.</li>
        </ul>

        <h4>Justificaciones</h4>
        <ol className="guide-steps">
          <li>Pulsa en un alumno con ausencias.</li>
          <li>Busca la ausencia que necesitas justificar.</li>
          <li>Pulsa <strong>&laquo;Subir Justificacion&raquo;</strong> y sube el documento (PDF o imagen).</li>
          <li>La ausencia se marca como justificada y deja de contar como falta.</li>
        </ol>
      </>
    ),
  },
  /* 15 */
  {
    id: 'reports',
    title: 'Informes y analiticas',
    icon: BarChart3,
    keywords: ['informe', 'trimestral', 'analitica', 'reporte', 'comentario', 'boletin', 'tendencia', 'riesgo', 'exportar'],
    content: (
      <>
        <h4>Resumen trimestral</h4>
        <p>Accede desde el hub de clase &rarr; <strong>&laquo;Resumen Trimestral&raquo;</strong>.</p>
        <ul>
          <li>Tabla con notas medias por alumno en cada trimestre (1, 2, 3).</li>
          <li>Media final ponderada.</li>
          <li>Indicador de riesgo: OK / Limite / En riesgo.</li>
          <li>Celdas codificadas por color segun el nivel de la nota.</li>
          <li>Exportacion CSV para uso externo.</li>
        </ul>

        <h4>Informe de clase</h4>
        <p>Accede desde el hub de clase &rarr; <strong>&laquo;Informe de Clase&raquo;</strong>.</p>
        <ul>
          <li>Estadisticas globales: nota media, tasa de aprobacion, numero de examenes y alumnos.</li>
          <li>Informe generado por IA con recomendaciones pedagogicas.</li>
          <li>Descarga como PDF.</li>
        </ul>

        <h4>Comentarios para informes (boletines)</h4>
        <div className="guide-highlight">
          <p>Para reuniones con familias o boletines trimestrales:</p>
          <ol className="guide-steps">
            <li>Desde el hub de clase, pulsa <strong>&laquo;Comentarios de Informes&raquo;</strong>.</li>
            <li>Pulsa <strong>Generar</strong>. La IA crea un comentario para cada alumno basandose en notas, tendencias, fortalezas, areas de mejora y comentarios previos del profesor.</li>
            <li>Revisa y edita cada comentario. Puedes regenerar individualmente los que no te convenzan.</li>
            <li>Exporta los comentarios finales como CSV.</li>
          </ol>
        </div>
      </>
    ),
  },
  /* 16 */
  {
    id: 'ai',
    title: 'Generacion de contenido con IA',
    icon: Sparkles,
    keywords: ['IA', 'inteligencia artificial', 'generar', 'libro de texto', 'textbook', 'vision', 'imagen', 'iteracion'],
    content: (
      <>
        <p>SEPIA integra modelos de inteligencia artificial para automatizar la creacion de materiales didacticos, examenes, ejercicios y analisis.</p>

        <h4>Que puede hacer la IA</h4>
        <ul>
          <li><strong>Vision e imagen</strong> &mdash; analiza imagenes de examenes manuscritos, extrae texto, reconoce codigos de alumno e identifica respuestas.</li>
          <li><strong>Generacion de examenes</strong> &mdash; crea examenes completos a partir de temas, con preguntas variadas y clave de soluciones.</li>
          <li><strong>Ejercicios adaptativos</strong> &mdash; genera ejercicios personalizados por areas debiles, ajustables en dificultad y cantidad.</li>
          <li><strong>Planificacion del curso</strong> &mdash; analiza la programacion oficial en PDF y genera una planificacion completa con sesiones, examenes, repasos y seguimiento de progreso.</li>
          <li><strong>Libros de texto</strong> &mdash; crea libros completos con capitulos, secciones, ejercicios y soluciones.</li>
          <li><strong>Analisis inteligente</strong> &mdash; insights de clase, evaluacion de riesgo, tendencias y el resumen diario &laquo;Prepara tu dia&raquo;.</li>
          <li><strong>Comentarios automaticos</strong> &mdash; genera comentarios para informes trimestrales adaptados al rendimiento de cada alumno.</li>
        </ul>

        <h4>Generar un libro de texto</h4>
        <ol className="guide-steps">
          <li>Ve a la clase &rarr; <strong>Temas</strong> &rarr; pulsa <strong>&laquo;Generar Libro de Texto&raquo;</strong>.</li>
          <li>Selecciona la asignatura.</li>
          <li>Configura: titulo, enfoque (teorico o practico), paginas objetivo, ejercicios por capitulo, ejemplos por seccion, nivel educativo.</li>
          <li>Opcionalmente sube PDFs de referencia con tus materiales para guiar el estilo.</li>
          <li>Pulsa <strong>Generar</strong>. El proceso se ejecuta en segundo plano (puede tardar varios minutos para libros extensos).</li>
          <li>Una vez completado, revisa la estructura de capitulos y descarga el PDF.</li>
          <li>Usa <strong>&laquo;Sugerir Temas&raquo;</strong> para crear automaticamente los temas a partir del indice del libro.</li>
        </ol>

        <h4>Iteraciones y refinamiento</h4>
        <p>Todo el contenido generado por IA puede iterarse. Tras cada generacion, revisa el resultado, escribe instrucciones de refinamiento y SEPIA genera una nueva version manteniendo el historial.</p>
      </>
    ),
  },
  /* 17 */
  {
    id: 'background-tasks',
    title: 'Tareas en segundo plano',
    icon: RefreshCw,
    keywords: ['tarea', 'segundo plano', 'progreso', 'cancelar', 'error', 'completada'],
    content: (
      <>
        <p>Las operaciones que requieren tiempo (correcciones, generacion de libros, creacion de ejercicios) se ejecutan en segundo plano para que puedas seguir trabajando.</p>

        <h4>Panel de tareas</h4>
        <p>El boton flotante en la esquina inferior muestra el numero de tareas activas. Al pulsarlo se despliega un panel con:</p>
        <ul>
          <li>Tipo de tarea: examen, ejercicios, libro de texto, informe, preparacion, iteracion.</li>
          <li>Porcentaje de progreso con barra visual.</li>
          <li>Paso actual: descripcion de lo que se esta procesando.</li>
        </ul>

        <h4>Estados de las tareas</h4>
        <table className="guide-table">
          <thead><tr><th>Estado</th><th>Visual</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr><td>En ejecucion</td><td>Animacion de progreso</td><td>Cancelar</td></tr>
            <tr><td>Completada</td><td>Checkmark verde</td><td>Navegar al resultado</td></tr>
            <tr><td>Fallida</td><td>Icono de error rojo</td><td>Reintentar, ver error</td></tr>
          </tbody>
        </table>
        <p>Las tareas completadas se descartan automaticamente tras un minuto. Si refrescas la pagina, las tareas activas se reanudan automaticamente.</p>
      </>
    ),
  },
  /* 18 */
  {
    id: 'comments',
    title: 'Comentarios y comunicacion',
    icon: MessageCircle,
    keywords: ['comentario', 'mencion', '@', 'post-clase', 'feedback', 'sugerencia', 'bug'],
    content: (
      <>
        <h4>Tipos de comentarios</h4>
        <table className="guide-table">
          <thead><tr><th>Tipo</th><th>Contexto</th><th>Ejemplo</th></tr></thead>
          <tbody>
            <tr><td><strong>De clase</strong></td><td>Asociados a una clase</td><td>&laquo;Hoy hemos avanzado rapido con el tema de fracciones&raquo;</td></tr>
            <tr><td><strong>De evento</strong></td><td>Vinculados a un evento del calendario</td><td>&laquo;Tutoria con @Maria sobre dificultades en algebra&raquo;</td></tr>
            <tr><td><strong>Generales</strong></td><td>Observaciones sueltas</td><td>&laquo;@Pedro ha mejorado significativamente su actitud&raquo;</td></tr>
          </tbody>
        </table>

        <h4>Menciones con @</h4>
        <p>En cualquier campo de comentarios escribe <kbd>@</kbd> seguido del nombre del alumno para crear una mencion. Las menciones aparecen en la ficha del alumno mencionado, se usan como contexto para informes generados por IA y crean un historial buscable.</p>

        <h4>Comentario rapido</h4>
        <p>El modal de comentario rapido esta disponible desde el libro de calificaciones, la lista de alumnos y otras vistas. Permite anotar observaciones breves sin salir de la vista actual.</p>

        <h4>Comentario post-clase</h4>
        <p>Tras finalizar una sesion de clase, SEPIA puede mostrarte un prompt automatico para dejar notas sobre la sesion. Esto facilita mantener un registro continuo sin esfuerzo adicional.</p>

        <h4>Feedback sobre la plataforma</h4>
        <p>El boton flotante de feedback te permite enviar:</p>
        <ul>
          <li><strong>Sugerencia</strong>: ideas para mejorar la plataforma.</li>
          <li><strong>Bug</strong>: reportar un error o comportamiento inesperado.</li>
          <li><strong>Otro</strong>: cualquier otro comentario.</li>
        </ul>
      </>
    ),
  },
  /* 19 */
  {
    id: 'workflows',
    title: 'Flujos de trabajo completos',
    icon: Map,
    keywords: ['flujo', 'workflow', 'configuracion inicial', 'evaluacion', 'dia a dia', 'trimestre', 'material'],
    content: (
      <>
        <h4>Configuracion inicial de un curso</h4>
        <ol className="guide-steps">
          <li><strong>Crear la clase</strong>: nombre, nivel y curso academico.</li>
          <li><strong>Anadir asignaturas</strong>: vincula todas las materias que impartes y configura sus horarios.</li>
          <li><strong>Importar alumnos</strong>: sube la lista en bloque o anadilos uno a uno.</li>
          <li><strong>Planificar el curso</strong>: sube la programacion oficial y genera automaticamente temas, sesiones con fechas, examenes y repasos. Tambien puedes crear temas manualmente o desde un libro de texto generado con IA.</li>
        </ol>

        <h4>Ciclo completo de evaluacion</h4>
        <div className="guide-workflow">
          <span>Crear examen</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Asignar</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Escanear</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>IA analiza</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Revisar</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Finalizar</span>
        </div>
        <div className="guide-workflow" style={{ marginTop: 8 }}>
          <span>Areas debiles</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Ejercicios</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Corregir</span>
          <span className="guide-workflow__arrow">&rarr;</span>
          <span>Medir progreso</span>
        </div>
        <p>Evaluar &rarr; diagnosticar &rarr; reforzar &rarr; reevaluar.</p>

        <h4>Dia a dia del profesor</h4>
        <ol className="guide-steps">
          <li><strong>Por la manana</strong>: abre el Calendario y pulsa &laquo;Prepara tu dia&raquo;.</li>
          <li><strong>Antes de clase</strong>: revisa notas y comentarios de alumnos.</li>
          <li><strong>Durante la clase</strong>: pasa lista desde el evento del calendario.</li>
          <li><strong>Despues de clase</strong>: anade un comentario post-clase.</li>
          <li><strong>Correccion</strong>: accede a examenes pendientes y corrige con IA.</li>
          <li><strong>Refuerzo</strong>: genera ejercicios para alumnos con dificultades.</li>
        </ol>

        <h4>Final de trimestre</h4>
        <ol className="guide-steps">
          <li>Revisa el <strong>Resumen Trimestral</strong> para ver las notas de todos los alumnos.</li>
          <li>Genera el <strong>Informe de Clase</strong> como PDF.</li>
          <li>Genera <strong>Comentarios de Informes</strong> para cada alumno.</li>
          <li>Revisa, edita y exporta los comentarios como CSV.</li>
        </ol>
      </>
    ),
  },
  /* 20 */
  {
    id: 'faq',
    title: 'Preguntas frecuentes',
    icon: HelpCircle,
    keywords: ['pregunta', 'FAQ', 'movil', 'error', 'seguridad', 'datos', 'formato', 'recuperar'],
    content: (
      <>
        <div className="guide-faq">
          <h4>Puedo usar SEPIA en el movil?</h4>
          <p>Si. SEPIA tiene un diseno mobile-first. Funciona en cualquier navegador moderno, tanto en movil como en escritorio.</p>
        </div>

        <div className="guide-faq">
          <h4>Que pasa si la IA se equivoca en una correccion?</h4>
          <p>Las sugerencias de la IA son siempre revisables y editables. Puedes ajustar cualquier nota, modificar las areas debiles o rechazar el feedback. El profesor siempre tiene la ultima palabra.</p>
        </div>

        <div className="guide-faq">
          <h4>Puedo compartir datos con otros profesores?</h4>
          <p>SEPIA esta disenado para uso individual. Cada profesor solo puede ver y gestionar sus propios datos. No hay colaboracion multi-profesor por el momento.</p>
        </div>

        <div className="guide-faq">
          <h4>Cuanto tarda en generarse un libro de texto?</h4>
          <p>Depende de la extension. Un libro de 40 paginas puede tardar entre 5 y 15 minutos. Libros de 80+ paginas pueden tardar hasta 30 minutos. La tarea se ejecuta en segundo plano.</p>
        </div>

        <div className="guide-faq">
          <h4>Puedo exportar las notas?</h4>
          <p>Si. Desde el libro de calificaciones puedes descargar un CSV con todas las notas, incluyendo medias trimestrales y estado.</p>
        </div>

        <div className="guide-faq">
          <h4>Que formatos acepta para subir examenes?</h4>
          <p>PDFs e imagenes (JPG, PNG). Para la subida masiva, lo ideal es un PDF con un examen completo por pagina, o imagenes individuales nombradas con el codigo del alumno.</p>
        </div>

        <div className="guide-faq">
          <h4>Puedo cancelar una tarea de IA?</h4>
          <p>Si. Las tareas en segundo plano pueden cancelarse desde el panel de tareas flotante que aparece en la esquina inferior.</p>
        </div>

        <div className="guide-faq">
          <h4>Los datos de mis alumnos estan seguros?</h4>
          <p>Si. Toda la comunicacion esta cifrada, el acceso requiere autenticacion y cada profesor solo accede a sus propios datos. Los archivos subidos estan protegidos y requieren un token valido.</p>
        </div>

        <div className="guide-faq">
          <h4>Que hago si encuentro un error?</h4>
          <p>Usa el boton de feedback (icono de burbuja flotante) para reportar el error con la categoria &laquo;Bug&raquo;. Incluye una descripcion de lo que estabas haciendo.</p>
        </div>

        <div className="guide-faq">
          <h4>Puedo eliminar una clase sin perder los datos?</h4>
          <p>Al eliminar una clase, SEPIA te muestra una vista previa con todo lo que se borrara (alumnos, examenes, ejercicios, eventos). Revisa con cuidado antes de confirmar, ya que la eliminacion es permanente.</p>
        </div>
      </>
    ),
  },
];

/* ── Component ── */
const Guide: React.FC = () => {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase().trim();
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.includes(q)),
    );
  }, [search]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="guide-header shrink-0">
        <button className="guide-header__back" onClick={() => navigate(-1)} aria-label="Volver">
          <ArrowLeft size={20} />
        </button>
        <div className="guide-header__text">
          <h1>Guía de uso</h1>
          <p>Consulta cómo funciona cada parte de SEPIA</p>
        </div>
      </div>

      <div className="guide-body flex-1 overflow-y-auto">
        <Searchbar
          placeholder="Buscar tema..."
          value={search}
          onChange={setSearch}
          className="mb-3"
        />

        {filtered.length === 0 && (
          <div className="guide-empty">
            <HelpCircle size={40} className="opacity-35 mx-auto mb-3" />
            <p>No se encontraron resultados para &laquo;{search}&raquo;</p>
          </div>
        )}

        <Accordion type="multiple" className="guide-accordion">
          {filtered.map((section, i) => (
            <AccordionItem key={section.id} value={section.id} className="guide-accordion-item">
              <AccordionTrigger className="guide-accordion__header">
                <div className="flex items-center gap-2.5">
                  <div className="guide-accordion__num">{i + 1}</div>
                  <section.icon size={20} className="guide-accordion__icon" />
                  <span className="guide-accordion__title">{section.title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="guide-section">
                {section.content}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
};

export default Guide;
