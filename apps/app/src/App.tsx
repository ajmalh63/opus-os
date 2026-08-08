import { Route, Switch, Redirect } from 'wouter';
import { SessionProvider } from './lib/session';
import AuthGuard from './components/AuthGuard';
import PublicLeadForm from './pages/PublicLeadForm.js';
import KanbanBoard from './pages/KanbanBoard.js';
import Client360 from './pages/Client360.js';
import ClientPortal from './pages/ClientPortal.js';
import PartnerDashboard from './pages/PartnerDashboard.js';
import AdminConsole from './pages/AdminConsole.js';
import LandingPortal from './pages/LandingPortal.js';
import PublicHome from './pages/PublicHome.js';
import PublicService from './pages/PublicService.js';
import Login from './pages/Login.js';
import Signup from './pages/Signup.js';
import Inbox from './pages/Inbox.js';

export default function App() {
  return (
    <SessionProvider>
      <Switch>
        {/* Public surface */}
        <Route path="/" component={PublicHome} />
        <Route path="/lead-form" component={PublicLeadForm} />

        <Route path="/study-abroad">
          {() => <PublicService params={{ division: 'study-abroad' }} />}
        </Route>
        <Route path="/visa-services">
          {() => <PublicService params={{ division: 'visa-services' }} />}
        </Route>
        <Route path="/umrah-travel">
          {() => <PublicService params={{ division: 'umrah-travel' }} />}
        </Route>
        <Route path="/attestation">
          {() => <PublicService params={{ division: 'attestation' }} />}
        </Route>
        <Route path="/recruitment">
          {() => <PublicService params={{ division: 'recruitment' }} />}
        </Route>

        {/* Central auth gateway */}
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />

        {/* Public self-service surfaces (token-based by design) */}
        <Route path="/portal" component={ClientPortal} />
        <Route path="/partner" component={PartnerDashboard} />

        {/* Authenticated surface */}
        <Route path="/workspaces">
          <AuthGuard><LandingPortal /></AuthGuard>
        </Route>
        <Route path="/kanban">
          <AuthGuard><KanbanBoard /></AuthGuard>
        </Route>
        <Route path="/clients/:id">
          <AuthGuard><Client360 /></AuthGuard>
        </Route>
        <Route path="/admin">
          <AuthGuard><AdminConsole /></AuthGuard>
        </Route>
        <Route path="/inbox">
          <AuthGuard><Inbox /></AuthGuard>
        </Route>

        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    </SessionProvider>
  );
}