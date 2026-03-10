import { Redirect, Route } from 'react-router-dom';
import {
  IonApp, IonRouterOutlet, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel,
  setupIonicReact,
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { homeOutline, schoolOutline, documentTextOutline, pencilOutline, folderOutline } from 'ionicons/icons';

import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Classes from './pages/Classes/Classes';
import ClassSettings from './pages/ClassSettings/ClassSettings';
import GradeBook from './pages/GradeBook/GradeBook';
import StudentFile from './pages/StudentFile/StudentFile';
import TopicsList from './pages/Topics/TopicsList';
import TopicDetail from './pages/Topics/TopicDetail';
import Exams from './pages/Exams/Exams';
import ExamEditor from './pages/Exams/ExamEditor';
import Exercises from './pages/Exercises/Exercises';
import Materials from './pages/Materials/Materials';
import Correction from './pages/Correction/Correction';
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
      </IonRouterOutlet>

      <Route
        path="/tabs"
        render={() =>
          auth.isLoggedIn() ? (
            <IonTabs>
              <IonRouterOutlet>
                <Route exact path="/tabs/dashboard" component={Dashboard} />
                <Route exact path="/tabs/classes" component={Classes} />
                <Route exact path="/tabs/classes/:classId" component={GradeBook} />
                <Route exact path="/tabs/classes/:classId/settings" component={ClassSettings} />
                <Route exact path="/tabs/classes/:classId/students/:id" component={StudentFile} />
                <Route exact path="/tabs/classes/:classId/topics" component={TopicsList} />
                <Route exact path="/tabs/classes/:classId/topics/:topicId" component={TopicDetail} />
                <Route exact path="/tabs/exams" component={Exams} />
                <Route exact path="/tabs/exams/:examId" component={ExamEditor} />
                <Route exact path="/tabs/exercises" component={Exercises} />
                <Route exact path="/tabs/materials" component={Materials} />
                <Route exact path="/tabs">
                  <Redirect to="/tabs/dashboard" />
                </Route>
              </IonRouterOutlet>

              <IonTabBar slot="bottom">
                <IonTabButton tab="dashboard" href="/tabs/dashboard">
                  <IonIcon icon={homeOutline} />
                  <IonLabel>Inicio</IonLabel>
                </IonTabButton>
                <IonTabButton tab="classes" href="/tabs/classes">
                  <IonIcon icon={schoolOutline} />
                  <IonLabel>Clases</IonLabel>
                </IonTabButton>
                <IonTabButton tab="exams" href="/tabs/exams">
                  <IonIcon icon={documentTextOutline} />
                  <IonLabel>Exámenes</IonLabel>
                </IonTabButton>
                <IonTabButton tab="exercises" href="/tabs/exercises">
                  <IonIcon icon={pencilOutline} />
                  <IonLabel>Ejercicios</IonLabel>
                </IonTabButton>
                <IonTabButton tab="materials" href="/tabs/materials">
                  <IonIcon icon={folderOutline} />
                  <IonLabel>Materiales</IonLabel>
                </IonTabButton>
              </IonTabBar>
            </IonTabs>
          ) : (
            <Redirect to="/login" />
          )
        }
      />

      <Route exact path="/">
        <Redirect to={auth.isLoggedIn() ? '/tabs/dashboard' : '/login'} />
      </Route>
    </IonReactRouter>
  </IonApp>
);

export default App;
