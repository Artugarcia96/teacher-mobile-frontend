import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { useDashboardStore } from './store/dashboardStore';
import AppLayout from './components/layout/AppLayout';
import PostClassCommentPrompt from './components/PostClassCommentPrompt';
import FeedbackFab from './components/FeedbackFab';
import BackgroundTasksFab from './components/BackgroundTasksFab';

import Login from './pages/Login/Login';
import Calendar from './pages/Calendar/Calendar';
import Classes from './pages/Classes/Classes';
import ClassSettings from './pages/ClassSettings/ClassSettings';
import SubjectGradeBook from './pages/GradeBook/SubjectGradeBook';
import StudentFile from './pages/StudentFile/StudentFile';
import TopicsList from './pages/Topics/TopicsList';
import TopicDetail from './pages/Topics/TopicDetail';
import ExamEditor from './pages/Exams/ExamEditor';
import ExamDetail from './pages/Exams/ExamDetail';
import ExamsList from './pages/Exams/ExamsList';
import ExamsGlobal from './pages/Exams/ExamsGlobal';
import ExercisesList from './pages/Exercises/ExercisesList';
import ExerciseDetail from './pages/Exercises/ExerciseDetail';
import AttendanceList from './pages/Attendance/AttendanceList';
import ExerciseCorrection from './pages/ExerciseCorrection/ExerciseCorrection';
import ExerciseBulkCorrection from './pages/ExerciseCorrection/ExerciseBulkCorrection';
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
  return (
    <RequireAuth>
      <AppLayout />
      <PostClassCommentPrompt />
      <BackgroundTasksFab />
      <FeedbackFab />
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

        {/* Standalone correction pages (no tabs) */}
        <Route path="/exercise-correction/:exerciseId" element={<RequireAuth><ExerciseCorrection /></RequireAuth>} />
        <Route path="/exercise-bulk-correction/:classId" element={<RequireAuth><ExerciseBulkCorrection /></RequireAuth>} />

        {/* Main app with sidebar/tabs layout */}
        <Route element={<AuthenticatedLayout />}>
          {/* Main tabs */}
          <Route path="/tabs/calendar" element={<Calendar />} />
          <Route path="/tabs/classes" element={<Classes />} />
          <Route path="/tabs/guide" element={<Guide />} />

          {/* Global exam routes */}
          <Route path="/tabs/exams" element={<ExamsGlobal />} />
          <Route path="/tabs/exams/new" element={<ExamEditor />} />
          <Route path="/tabs/exams/:examId" element={<ExamDetail />} />
          <Route path="/tabs/exams/:examId/edit" element={<ExamEditor />} />

          {/* Class-specific routes */}
          <Route path="/tabs/classes/:classId" element={<Navigate to="/tabs/classes" replace />} />
          <Route path="/tabs/classes/:classId/settings" element={<ClassSettings />} />
          <Route path="/tabs/classes/:classId/students/:id" element={<StudentFile />} />
          <Route path="/tabs/classes/:classId/topics" element={<TopicsList />} />
          <Route path="/tabs/classes/:classId/topics/:topicId" element={<TopicDetail />} />
          <Route path="/tabs/classes/:classId/exams" element={<ExamsList />} />
          <Route path="/tabs/classes/:classId/exams/:examId" element={<ExamRoute />} />
          <Route path="/tabs/classes/:classId/exercises" element={<ExercisesList />} />
          <Route path="/tabs/classes/:classId/exercises/:exerciseId" element={<ExerciseDetail />} />
          <Route path="/tabs/classes/:classId/attendance" element={<AttendanceList />} />

          {/* Subject-scoped routes */}
          <Route path="/tabs/classes/:classId/subjects/:subjectId" element={<SubjectGradeBook />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/topics" element={<TopicsList />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/topics/:topicId" element={<TopicDetail />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exams" element={<ExamsList />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exams/:examId" element={<ExamRoute />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exercises" element={<ExercisesList />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exercises/:exerciseId" element={<ExerciseDetail />} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/attendance" element={<AttendanceList />} />

          {/* Trimester / reports (lazy, subject-scoped) */}
          <Route path="/tabs/classes/:classId/subjects/:subjectId/trimester-summary" element={<Suspense fallback={LazyFallback}><TrimesterSummary /></Suspense>} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/reports" element={<Suspense fallback={LazyFallback}><ClassReport /></Suspense>} />
          <Route path="/tabs/classes/:classId/subjects/:subjectId/report-comments" element={<Suspense fallback={LazyFallback}><ReportComments /></Suspense>} />

          {/* Exam editor routes */}
          <Route path="/tabs/classes/:classId/subjects/:subjectId/exams/:examId/edit" element={<ExamEditor />} />
          <Route path="/tabs/classes/:classId/exams/:examId/edit" element={<ExamEditor />} />

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
