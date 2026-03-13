import { Redirect, Route } from 'react-router-dom';
import {
  IonApp, IonRouterOutlet, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel,
  setupIonicReact,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { calendarOutline, schoolOutline } from 'ionicons/icons';

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
import Correction from './pages/Correction/Correction';
import ExerciseCorrection from './pages/ExerciseCorrection/ExerciseCorrection';
import ExerciseBulkCorrection from './pages/ExerciseCorrection/ExerciseBulkCorrection';
import PostClassNotePrompt from './components/PostClassNotePrompt';
import { auth } from './services/api';

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

const App: React.FC = () => (
  <IonApp>
    <IonReactRouter>
      <IonRouterOutlet>
        <Route exact path="/login" component={Login} />
        <PrivateRoute exact path="/correction/:examId" component={Correction} />
        <PrivateRoute exact path="/exercise-correction/:exerciseId" component={ExerciseCorrection} />
        <PrivateRoute exact path="/exercise-bulk-correction/:classId" component={ExerciseBulkCorrection} />
      </IonRouterOutlet>

      <Route
        path="/tabs"
        render={() =>
          auth.isLoggedIn() ? (
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
                  
                  {/* Global exam editor (for backwards compatibility and calendar access) */}
                  <Route exact path="/tabs/exams/new" component={ExamEditor} />
                  <Route exact path="/tabs/exams/:examId" component={ExamEditor} />
                  
                  {/* Redirects for old routes */}
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
                  </IonTabButton>
                  <IonTabButton tab="classes" href="/tabs/classes">
                    <IonIcon icon={schoolOutline} />
                    <IonLabel>Clases</IonLabel>
                  </IonTabButton>
                </IonTabBar>
              </IonTabs>
              <PostClassNotePrompt />
            </>
          ) : (
            <Redirect to="/login" />
          )
        }
      />

      <Route exact path="/">
        <Redirect to={auth.isLoggedIn() ? '/tabs/calendar' : '/login'} />
      </Route>
    </IonReactRouter>
  </IonApp>
);

export default App;
