import { Route, Switch, Redirect } from 'wouter';
import PublicLeadForm from './pages/PublicLeadForm.js';
import KanbanBoard from './pages/KanbanBoard.js';
import Client360 from './pages/Client360.js';
import ClientPortal from './pages/ClientPortal.js';
import PartnerDashboard from './pages/PartnerDashboard.js';
import AdminConsole from './pages/AdminConsole.js';
import LandingPortal from './pages/LandingPortal.js';
import PublicHome from './pages/PublicHome.js';
import PublicService from './pages/PublicService.js';
import ProductivityToolbox from './components/ProductivityToolbox.js';

export default function App() {
  return (
    <>
      <Switch>
        <Route path="/" component={PublicHome} />
        <Route path="/workspaces" component={LandingPortal} />
        <Route path="/lead-form" component={PublicLeadForm} />
        <Route path="/kanban" component={KanbanBoard} />
        <Route path="/clients/:id" component={Client360} />
        <Route path="/portal" component={ClientPortal} />
        <Route path="/partner" component={PartnerDashboard} />
        <Route path="/admin" component={AdminConsole} />
        
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

        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
      <ProductivityToolbox />
    </>
  );
}
