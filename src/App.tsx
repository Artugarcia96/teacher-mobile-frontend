import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './app/Shell';
import { ApiError } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { FeedbackProvider, Spinner } from './ui';

import LoginPage from './pages/auth/LoginPage';
import TodayPage from './pages/today/TodayPage';
import CoursesPage from './pages/courses/CoursesPage';
import CoursePage from './pages/course/CoursePage';

const StudentPage = lazy(() => import('./pages/students/StudentPage'));
const ActivityPage = lazy(() => import('./pages/activity/ActivityPage'));
const ReviewPage = lazy(() => import('./pages/activity/ReviewPage'));
const UnitPage = lazy(() => import('./pages/units/UnitPage'));
const MaterialPage = lazy(() => import('./pages/units/MaterialPage'));
const EvaluationPage = lazy(() => import('./pages/evaluation/EvaluationPage'));
const InboxPage = lazy(() => import('./pages/inbox/InboxPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
    // Offline, a save fails at once with «Sin conexión» instead of waiting silently for the network.
    mutations: { networkMode: 'always' },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { loggedIn } = useAuth();
  return loggedIn ? <>{children}</> : <Navigate to="/entrar" replace />;
}

function Loading() {
  return <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh', color: 'var(--ink-2)' }}><Spinner /></div>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FeedbackProvider>
          <AuthProvider>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/entrar" element={<LoginPage />} />
                <Route element={<RequireAuth><Shell /></RequireAuth>}>
                  <Route index element={<Navigate to="/hoy" replace />} />
                  <Route path="/hoy" element={<TodayPage />} />
                  <Route path="/clases" element={<CoursesPage />} />
                  <Route path="/clases/:courseId" element={<CoursePage />} />
                  <Route path="/clases/:courseId/:tab" element={<CoursePage />} />
                  <Route path="/clases/:courseId/actividades/:activityId" element={<ActivityPage />} />
                  <Route path="/clases/:courseId/actividades/:activityId/revisar" element={<ReviewPage />} />
                  <Route path="/clases/:courseId/unidades/:unitId" element={<UnitPage />} />
                  <Route path="/clases/:courseId/unidades/:unitId/materiales/:materialId" element={<MaterialPage />} />
                  <Route path="/clases/:courseId/evaluacion/:term" element={<EvaluationPage />} />
                  <Route path="/alumnos/:studentId" element={<StudentPage />} />
                  <Route path="/evaluar" element={<InboxPage />} />
                  <Route path="/ajustes" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/hoy" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </AuthProvider>
        </FeedbackProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
