import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { useDashboardStore } from './store/dashboardStore';
import AppLayout from './components/layout/AppLayout';
import PostClassCommentPrompt from './components/PostClassCommentPrompt';
import FeedbackFab from './components/FeedbackFab';
import BackgroundTasksFab from './components/BackgroundTasksFab';
import { useTallerStore } from './store/tallerStore';

import Login from './pages/Login/Login';
import Calendar from './pages/Calendar/Calendar';
import Classes from './pages/Classes/Classes';
import ClassSettings from './pages/ClassSettings/ClassSettings';
import SubjectGradeBook from './pages/GradeBook/SubjectGradeBook';
import StudentFile from './pages/StudentFile/StudentFile';
import TopicDetail from './pages/Topics/TopicDetail';
import ProgramacionView from './pages/Programacion/ProgramacionView';
import ExamEditor from './pages/Exams/ExamEditor';
import ExamDetail from './pages/Exams/ExamDetail';
import ExamContentEditor from './pages/Exams/ExamContentEditor';
import ExamsList from './pages/Exams/ExamsList';
import ExamsGlobal from './pages/Exams/ExamsGlobal';
import DiagramShowcase from './pages/DiagramShowcase';
import PresentationEditor from './pages/Presentations/PresentationEditor';
import PresentationLoading from './pages/Presentations/PresentationLoading';
import SessionsView from './pages/Sessions/SessionsView';
import SyllabusView from './pages/Syllabus/SyllabusView';
import AttendanceList from './pages/Attendance/AttendanceList';
import Guide from './pages/Guide/Guide';
import { auth } from './services/api';

const TrimesterSummary = lazy(() => import('./pages/GradeBook/TrimesterSummary'));
const ReportComments = lazy(() => import('./pages/GradeBook/ReportComments'));
const ClassReport = lazy(() => import('./pages/GradeBook/ClassReport'));

import './theme/variables.css';
import './theme/animations.css';

/* Helper: renders ExamEditor for "new" or ExamDetail for existing */
const ExamRoute: React.FC = () => {
  const { examId } = useParams();
  return examId === 'new' ? <ExamEditor /> : <ExamDetail />;
};

/* Legacy topic routes → Temario (hogar único del contenido). Los topicId
   antiguos se descartan; la vista de Temario permite expandir un tema para
   ver sus materiales inline. */
const RedirectToSyllabus: React.FC = () => {
  const { classId, subjectId } = useParams() as { classId: string; subjectId: string };
  return <Navigate to={`/tabs/classes/${classId}/subjects/${subjectId}/syllabus`} replace />;
};

/* Legacy /classes/:classId/topics (sin subject). No podemos adivinar la
   asignatura, así que devolvemos al hub de clases donde el profe la elige. */
const RedirectClassTopics: React.FC = () => {
  const { classId } = useParams() as { classId: string };
  return <Navigate to={`/tabs/classes/${classId}`} replace />;
};

const LazyFallback = (
  <div className="flex justify-center items-center h-64">
    <Loader2 className="animate-spin text-primary" size={32} />
  </div>
);

/* Auth guard — redirects to /login if not authenticated */
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return auth.isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />;
};

/* Wraps all authenticated routes with shared overlays */
const AuthenticatedLayout: React.FC = () => {
  // Mientras hay un Taller abierto ocultamos los FABs: ocupan el mismo
  // z-index que el Sheet y en móvil interceptan taps sobre los chips.
  const tallerOpen = useTallerStore((s) => s.open);
  return (
    <RequireAuth>
      <AppLayout />
      <PostClassCommentPrompt />
      {!tallerOpen && <BackgroundTasksFab />}
      {!tallerOpen && <FeedbackFab />}
    </RequireAuth>
  );
};

const App: React.FC = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    auth.check().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex justify-center items-center h-screen bg-background">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Main app with sidebar/tabs layout */}
        <Route element={<AuthenticatedLayout />}>
          {/* Main tabs */}
          <Route path="/tabs/calendar" element={<Calendar />} />
          <Route path="/tabs/classes" element={<Classes />} />
          <Route path="/tabs/guide" element={<Guide />} />

          {/* Global exam routes (purpose=evaluation) */}
          <Route path="/tabs/exams" element={<ExamsGlobal purposes={['evaluation']} title="Exámenes" createHref="/tabs/exams/new" />} />
          <Route path="/tabs/exams/new" element={<ExamEditor />} />
          <Route path="/tabs/exams/:examId" element={<ExamDetail />} />
          <Route path="/tabs/exams/:examId/edit" element={<ExamEditor />} />
          <Route path="/tabs/exams/:examId/content" element={<ExamContentEditor />} />

          {/* Librería interna de diagramas (ruta oculta, sin entrada en nav) */}
          <Route path="/tabs/diagrams/preview" element={<DiagramShowcase />} />

          {/* Editor + carga de presentaciones siguen accesibles vía deep-link.
              La pantalla "Material" global se eliminó: las presentaciones
              viven asociadas a un tema (Syllabus) y/o sesión (Calendar). */}
          <Route path="/tabs/presentations" element={<Navigate to="/tabs/calendar" replace />} />
          <Route path="/tabs/presentations/new" element={<PresentationLoading />} />
          <Route path="/tabs/presentations/:presentationId" element={<PresentationEditor />} />

          {/* Global exercises routes (purpose=practice|recovery) — reuses the exam infra */}
          <Route path="/tabs/exercises" element={<ExamsGlobal purposes={['practice', 'recovery']} title="Ejercicios" createHref="/tabs/exercises/new" detailHrefBuilder={(id) => `/tabs/exercises/${id}`} />} />
          <Route path="/tabs/exercises/new" element={<ExamEditor defaultPurpose="practice" />} />
          <Route path="/tabs/exercises/:examId" element={<ExamDetail />} />
          <Route path="/tabs/exercises/:examId/edit" element={<ExamEditor />} />
          <Route path="/tabs/exercises/:examId/content" element={<ExamContentEditor />} />

          {/* Class-specific routes */}
          <Route path="/tabs/classes/:classId" element={<Navigate to="/tabs/classes" replace />} />
          <Route path="/tabs/classes/:classId/settings" element={<ClassSettings />} />
          <Route path="/tabs/classes/:classId/students/:id" element={<StudentFile />} />
          {/* /topics a nivel de clase (sin subject): redirige a la primera
              asignatura de la clase. Sessions vive bajo subject porque la
              unidad mental del profe es "qué doy de esta asignatura". */}
          <Route path="/tabs/classes/:classId/topics" element={<RedirectClassTopics />} />
          <Route path="/tabs/classes/:classId/topics/:topicId" element={<RedirectClassTopics />} />
          <Route path="/tabs/classes/:classId/exams" element={<ExamsList />} />
          <Route path="/tabs/classes/:classId/exams/:examId" element={<ExamRoute />} />
          <Route path="/tabs/classes/:classId/exercises" element={<ExamsList purposes={['practice', 'recovery']} />} />
          <Route path="/tabs/classes/:classId/exercises/new" element={<ExamEditor defaultPurpose="practice" />} />
          <Route path="/tabs/classes/:classId/exercises/:examId" element={<ExamDetail />} />
          <Route path="/tabs/classes/:classId/exercises/:examId/edit" element={<ExamEditor />} />
          <Route path="/tabs/classes/:classId/exercises/:examId/content" element={<ExamContentEditor />} />
          <Route path="/tabs/classes/:classId/attendance" element={<AttendanceList />} />

          {/* Subject-scoped routes */}
          <Route path="/tabs/classes/:classId/subjects/:subjectId" element={<SubjectGradeBook />} />
          {/* Temario = hogar único del contenido didáctico por asignatura.
              Lista de topics con sus materiales (presentaciones, PDFs,
              documentos). Es la vista a la que deberían ir los antiguos
              links /topics. */}
          <Route
            path="/tabs/classes/:classId/subjects/:subjectId/syllabus"
            element={<SyllabusView />}
          />
          {/* Sessions = cuándo imparto qué (complementario al temario). */}
          <Route
            path="/tabs/classes/:classId/subjects/:subjectId/sessions"
            element={<SessionsView />}
          />
          {/* Programación = source of truth didáctica + planificación.
              Reemplaza los modales CoursePlanCreator/Detail con una página
              en dos fases (validar programación → confirmar planificación). */}
          <Route
            path="/tabs/classes/:classId/subjects/:subjectId/programacion"
            element={<ProgramacionView />}
          />
          {/* Alias en inglés para deep-links externos. */}
          <Route
            path="/tabs/classes/:classId/subjects/:subjectId/program"
            element={<Navigate to=".." replace />}
          />
          {/* Rutas legacy de topics — redirigen al Temario. */}
          <Route
            path="/tabs/classes/:classId/subjects/:subjectId/topics"
            element={<RedirectToSyllabus />}
          />
          <Route
            path="/tabs/classes/:classId/subjects/:subjectId/topics/:topicId"
            element={<TopicDetail />}
          />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exams" element={<ExamsList />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exams/:examId" element={<ExamRoute />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exercises" element={<ExamsList purposes={['practice', 'recovery']} />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exercises/new" element={<ExamEditor defaultPurpose="practice" />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exercises/:examId" element={<ExamDetail />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exercises/:examId/edit" element={<ExamEditor />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exercises/:examId/content" element={<ExamContentEditor />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/attendance" element={<AttendanceList />} />
          {/* Ruta legacy /material → redirige al syllabus (donde vive ahora el material). */}
          <Route
            path="/tabs/classes/:classId/subjects/:subjectId/material"
            element={<RedirectToSyllabus />}
          />

          {/* Trimester / reports (lazy, subject-scoped) */}
          <Route path="/tabs/classes/:classId/subjects/:subjectId/trimester-summary" element={<Suspense fallback={LazyFallback}><TrimesterSummary /></Suspense>} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/reports" element={<Suspense fallback={LazyFallback}><ClassReport /></Suspense>} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/report-comments" element={<Suspense fallback={LazyFallback}><ReportComments /></Suspense>} />

          {/* Exam editor routes */}
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exams/:examId/edit" element={<ExamEditor />} />
          <Route path="/tabs/classes/:classId/exams/:examId/edit" element={<ExamEditor />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exams/:examId/content" element={<ExamContentEditor />} />
          <Route path="/tabs/classes/:classId/exams/:examId/content" element={<ExamContentEditor />} />

          <Route path="/tabs" element={<Navigate to="/tabs/calendar" replace />} />
        </Route>

        {/* Root redirect */}
        <Route path="/" element={<Navigate to={auth.isLoggedIn() ? '/tabs/calendar' : '/login'} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
