import { lazy, Suspense } from 'react';
import { Redirect, Route } from 'react-router-dom';
import {
  IonApp, IonRouterOutlet, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel,
  IonBadge, IonSpinner, IonSplitPane, setupIonicReact,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { calendarOutline, schoolOutline } from 'ionicons/icons';
import { useDashboardStore } from './store/dashboardStore';

import Login from './pages/Login/Login';
import Calendar from './pages/Calendar/Calendar';
import Classes from './pages/Classes/Classes';
import ClassSettings from './pages/ClassSettings/ClassSettings';
import GradeBook from './pages/GradeBook/GradeBook';
import SubjectGradeBook from './pages/GradeBook/SubjectGradeBook';
import StudentFile from './pages/StudentFile/StudentFile';
import TopicsList from './pages/Topics/TopicsList';
import TopicDetail from './pages/Topics/TopicDetail';
import ExamEditor from './pages/Exams/ExamEditor';
import ExamDetail from './pages/Exams/ExamDetail';
import ExamsList from './pages/Exams/ExamsList';
import ExercisesList from './pages/Exercises/ExercisesList';
import ExerciseDetail from './pages/Exercises/ExerciseDetail';
import AttendanceList from './pages/Attendance/AttendanceList';
import Correction from './pages/Correction/Correction';
import ExerciseCorrection from './pages/ExerciseCorrection/ExerciseCorrection';
import ExerciseBulkCorrection from './pages/ExerciseCorrection/ExerciseBulkCorrection';
import PostClassCommentPrompt from './components/PostClassCommentPrompt';
import FeedbackFab from './components/FeedbackFab';
import BackgroundTasksFab from './components/BackgroundTasksFab';
import SideMenu from './components/SideMenu';
import { auth } from './services/api';

const TrimesterSummary = lazy(() => import('./pages/GradeBook/TrimesterSummary'));
const ReportComments = lazy(() => import('./pages/GradeBook/ReportComments'));
const ClassReport = lazy(() => import('./pages/GradeBook/ClassReport'));

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import '@ionic/react/css/palettes/dark.system.css';
import './theme/variables.css';
import './theme/animations.css';

setupIonicReact();

const PrivateRoute: React.FC<{ component: React.FC<any>; path: string; exact?: boolean }> = ({
  component: Component,
  ...rest
}) => (
  <Route
    {...rest}
    render={(props) =>
      auth.isLoggedIn() ? <Component {...props} /> : <Redirect to="/login" />
    }
  />
);

const MainTabs: React.FC = () => {
  const pendingCount = useDashboardStore((s) => s.data?.stats?.pendingCorrectionsCount ?? 0);

  return (
    <>
      <IonTabs>
        <IonRouterOutlet>
                  {/* Main tabs */}
                  <Route exact path="/tabs/calendar" component={Calendar} />
                  <Route exact path="/tabs/classes" component={Classes} />
                  
                  {/* Class-specific routes */}
                  <Route exact path="/tabs/classes/:classId" component={GradeBook} />
                  <Route exact path="/tabs/classes/:classId/settings" component={ClassSettings} />
                  <Route exact path="/tabs/classes/:classId/students/:id" component={StudentFile} />
                  <Route exact path="/tabs/classes/:classId/topics" component={TopicsList} />
                  <Route exact path="/tabs/classes/:classId/topics/:topicId" component={TopicDetail} />
                  <Route exact path="/tabs/classes/:classId/exams" component={ExamsList} />
                  <Route
                    exact
                    path="/tabs/classes/:classId/exams/:examId"
                    render={(props) =>
                      props.match.params.examId === 'new'
                        ? <ExamEditor {...props} />
                        : <ExamDetail {...props} />
                    }
                  />
                  <Route exact path="/tabs/classes/:classId/exercises" component={ExercisesList} />
                  <Route exact path="/tabs/classes/:classId/exercises/:exerciseId" component={ExerciseDetail} />
                  <Route exact path="/tabs/classes/:classId/attendance" component={AttendanceList} />

                  {/* Subject-scoped routes within a class */}
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId" component={SubjectGradeBook} />
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId/topics" component={TopicsList} />
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId/topics/:topicId" component={TopicDetail} />
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId/exams" component={ExamsList} />
                  <Route
                    exact
                    path="/tabs/classes/:classId/subjects/:subjectId/exams/:examId"
                    render={(props) =>
                      props.match.params.examId === 'new'
                        ? <ExamEditor {...props} />
                        : <ExamDetail {...props} />
                    }
                  />
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId/exercises" component={ExercisesList} />
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId/exercises/:exerciseId" component={ExerciseDetail} />
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId/attendance" component={AttendanceList} />

                  {/* Trimester summary & report comments */}
                  <Route exact path="/tabs/classes/:classId/trimester-summary" render={(props) => <Suspense fallback={<IonSpinner />}><TrimesterSummary {...props} /></Suspense>} />
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId/trimester-summary" render={(props) => <Suspense fallback={<IonSpinner />}><TrimesterSummary {...props} /></Suspense>} />
                  <Route exact path="/tabs/classes/:classId/reports" render={(props) => <Suspense fallback={<IonSpinner />}><ClassReport {...props} /></Suspense>} />
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId/reports" render={(props) => <Suspense fallback={<IonSpinner />}><ClassReport {...props} /></Suspense>} />
                  <Route exact path="/tabs/classes/:classId/report-comments" render={(props) => <Suspense fallback={<IonSpinner />}><ReportComments {...props} /></Suspense>} />
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId/report-comments" render={(props) => <Suspense fallback={<IonSpinner />}><ReportComments {...props} /></Suspense>} />

                  {/* Subject-scoped exam editor (edit existing exam with color context) */}
                  <Route exact path="/tabs/classes/:classId/subjects/:subjectId/exams/:examId/edit" component={ExamEditor} />
                  <Route exact path="/tabs/classes/:classId/exams/:examId/edit" component={ExamEditor} />

                  {/* Global exam editor (for backwards compatibility and calendar access) */}
                  <Route exact path="/tabs/exams/new" component={ExamEditor} />
                  <Route exact path="/tabs/exams/:examId" component={ExamEditor} />
                  
                  {/* Redirects for old routes */}
                  <Route exact path="/tabs/home">
                    <Redirect to="/tabs/calendar" />
                  </Route>
                  <Route exact path="/tabs/dashboard">
                    <Redirect to="/tabs/calendar" />
                  </Route>
                  <Route exact path="/tabs/exams">
                    <Redirect to="/tabs/classes" />
                  </Route>
                  <Route exact path="/tabs/exercises">
                    <Redirect to="/tabs/classes" />
                  </Route>
                  <Route exact path="/tabs/materials">
                    <Redirect to="/tabs/classes" />
                  </Route>
                  <Route exact path="/tabs">
                    <Redirect to="/tabs/calendar" />
                  </Route>
                </IonRouterOutlet>

                <IonTabBar slot="bottom">
                  <IonTabButton tab="calendar" href="/tabs/calendar">
                    <IonIcon icon={calendarOutline} />
                    <IonLabel>Calendario</IonLabel>
                    {pendingCount > 0 && (
                      <IonBadge color="danger">{pendingCount > 9 ? '9+' : pendingCount}</IonBadge>
                    )}
                  </IonTabButton>
                  <IonTabButton tab="classes" href="/tabs/classes">
                    <IonIcon icon={schoolOutline} />
                    <IonLabel>Clases</IonLabel>
                  </IonTabButton>
                </IonTabBar>
              </IonTabs>
              <PostClassCommentPrompt />
              <BackgroundTasksFab />
              <FeedbackFab />
            </>
          );
        };

const App: React.FC = () => (
  <IonApp>
    <a href="#main" className="skip-nav">Saltar al contenido</a>
    <IonReactRouter>
      <IonSplitPane contentId="main" when="lg">
        <SideMenu />
        <IonRouterOutlet id="main">
          <Route exact path="/login" component={Login} />
          <PrivateRoute exact path="/correction/:examId" component={Correction} />
          <PrivateRoute exact path="/exercise-correction/:exerciseId" component={ExerciseCorrection} />
          <PrivateRoute exact path="/exercise-bulk-correction/:classId" component={ExerciseBulkCorrection} />

          <Route
            path="/tabs"
            render={() =>
              auth.isLoggedIn() ? (
                <MainTabs />
              ) : (
                <Redirect to="/login" />
              )
            }
          />

          <Route exact path="/">
            <Redirect to={auth.isLoggedIn() ? '/tabs/calendar' : '/login'} />
          </Route>
        </IonRouterOutlet>
      </IonSplitPane>
    </IonReactRouter>
  </IonApp>
);

export default App;
