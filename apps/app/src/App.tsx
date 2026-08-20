import { Route, Switch, Redirect } from 'wouter';
import { useEffect } from 'react';
import { ensureUmami } from './lib/umami';

function TrackInjector() {
  useEffect(() => { ensureUmami(); }, []);
  return null;
}
import type { ReactNode } from 'react';
import { SessionProvider } from './lib/session';
import AuthGuard from './components/AuthGuard';
import RoleGate from './components/RoleGate';
import PublicLeadForm from './pages/PublicLeadForm.js';
import KanbanBoard from './pages/KanbanBoard.js';
import Client360 from './pages/Client360.js';
import ClientPortal from './pages/ClientPortal.js';
import PartnerDashboard from './pages/PartnerDashboard.js';
import PaymentConfirmed from './pages/PaymentConfirmed.js';
import AdminConsole from './pages/AdminConsole.js';
import WorkspaceShell from './components/WorkspaceShell.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import { WorkspaceRouter, WorkspaceModule } from './components/WorkspaceRouter.js';
import VisibilityHub from './components/VisibilityHub.js';
import BookingsTab from './components/BookingsTab.js';
import AgreementsTab from './components/AgreementsTab.js';
import PublicHome from './pages/PublicHome.js';
import StudyAbroadPage from './pages/public/StudyAbroadPage.js';
import VisaServicesPage from './pages/public/VisaServicesPage.js';
import UmrahTravelPage from './pages/public/UmrahTravelPage.js';
import AttestationPage from './pages/public/AttestationPage.js';
import RecruitmentPage from './pages/public/RecruitmentPage.js';
import ContactPage from './pages/public/ContactPage.js';
import AboutUsPage from './pages/public/AboutUsPage.js';
import PrivacyPolicyPage from './pages/public/PrivacyPolicyPage.js';
import TermsOfServicePage from './pages/public/TermsOfServicePage.js';
import RefundPolicyPage from './pages/public/RefundPolicyPage.js';
import ShippingPolicyPage from './pages/public/ShippingPolicyPage.js';
import Login from './pages/Login.js';
import Signup from './pages/Signup.js';
import DashboardHome from './pages/DashboardHome.js';
import ClientsList from './pages/ClientsList.js';
import DivisionsHub from './pages/divisions/DivisionsHub.js';
import StudyAbroadPortal from './pages/divisions/StudyAbroadPortal.js';
import VisaPrepPortal from './pages/divisions/VisaPrepPortal.js';
import AttestationPortal from './pages/divisions/AttestationPortal.js';
import UmrahPortal from './pages/divisions/UmrahPortal.js';
import ManpowerPortal from './pages/divisions/ManpowerPortal.js';
import Inbox from './pages/Inbox.js';
import Settings from './pages/Settings.js';
import GoRedirectPage from './pages/GoRedirectPage.js';
import ChatwootDashboardWidget from './pages/ChatwootDashboardWidget.js';

// ONE umbrella: every authenticated page renders inside the WorkspaceShell so
// sidebar/brand/topbar persist across ALL modules. The workspace shell owns
// navigation; pages are pure content beneath it. Dashboard = default module.
function WorkspaceRoute({ children }: { children?: ReactNode }) {
  return (
    <WorkspaceShell>
      {children ?? <WorkspaceRouter />}
    </WorkspaceShell>
  );
}

export default function App() {
  return (
<ErrorBoundary>
      <SessionProvider>
        {/* Wave 1: inject the Umami tracker on boot — must live OUTSIDE the
            Switch: a route-less child inside <Switch> becomes a "*" catch-all
            (wouter matchRoute: route || "*") and swallows every later route. */}
        <TrackInjector />
        <Switch>
        {/* Public surface */}
        <Route path="/" component={PublicHome} />
        <Route path="/lead-form" component={PublicLeadForm} />

        <Route path="/study-abroad" component={StudyAbroadPage} />
        <Route path="/visa-services" component={VisaServicesPage} />
        <Route path="/umrah-travel" component={UmrahTravelPage} />
        <Route path="/attestation" component={AttestationPage} />
        <Route path="/recruitment" component={RecruitmentPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/about" component={AboutUsPage} />
        <Route path="/privacy" component={PrivacyPolicyPage} />
        <Route path="/terms" component={TermsOfServicePage} />
        <Route path="/refund-policy" component={RefundPolicyPage} />
        <Route path="/shipping-policy" component={ShippingPolicyPage} />

        {/* Central auth gateway */}
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />

        {/* Public self-service surfaces (token-based by design) */}
        <Route path="/portal" component={ClientPortal} />
        <Route path="/partner" component={PartnerDashboard} />
        <Route path="/payment-confirmed" component={PaymentConfirmed} />
        <Route path="/go/:ref/:type/:id" component={GoRedirectPage} />
        <Route path="/widget/chatwoot" component={ChatwootDashboardWidget} />
        <Route path="/staff/chatwoot-sidebar" component={ChatwootDashboardWidget} />

        {/* Authenticated surface — EVERY route inside the one workspace shell */}
        <Route path="/workspaces">
          <Redirect to="/dashboard" />
        </Route>
        <Route path="/dashboard">
          {() => <AuthGuard><WorkspaceRoute><DashboardHome /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/settings">
          {() => <AuthGuard><WorkspaceRoute><Settings /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/clients">
          {() => <AuthGuard><WorkspaceRoute><ClientsList /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/kanban">
          {() => <AuthGuard><WorkspaceRoute><KanbanBoard /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/clients/:id">
          {() => <AuthGuard><WorkspaceRoute><Client360 /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/billing">
          {() => <AuthGuard><WorkspaceRoute><WorkspaceModule name="transactions" /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/taxes">
          {() => <AuthGuard><WorkspaceRoute><WorkspaceModule name="compliance" /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/analytics">
          {() => <AuthGuard><WorkspaceRoute><WorkspaceModule name="flow" /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/visibility">
          {() => <AuthGuard><WorkspaceRoute><VisibilityHub /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/bookings">
          {() => <AuthGuard><WorkspaceRoute><BookingsTab /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/agreements">
          {() => <AuthGuard><WorkspaceRoute><AgreementsTab /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/audit">
          {() => <AuthGuard><WorkspaceRoute><WorkspaceModule name="audit" /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/control">
          {() => <AuthGuard><RoleGate roles={['super_admin']}><WorkspaceRoute><AdminConsole /></WorkspaceRoute></RoleGate></AuthGuard>}
        </Route>
        
        {/* Division Portals */}
        <Route path="/divisions">
          {() => <AuthGuard><WorkspaceRoute><DivisionsHub /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/divisions/study-abroad">
          {() => <AuthGuard><WorkspaceRoute><StudyAbroadPortal /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/divisions/visa">
          {() => <AuthGuard><WorkspaceRoute><VisaPrepPortal /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/divisions/attestation">
          {() => <AuthGuard><WorkspaceRoute><AttestationPortal /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/divisions/umrah">
          {() => <AuthGuard><WorkspaceRoute><UmrahPortal /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/divisions/manpower">
          {() => <AuthGuard><WorkspaceRoute><ManpowerPortal /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/inbox">
          {() => <AuthGuard><WorkspaceRoute><Inbox /></WorkspaceRoute></AuthGuard>}
        </Route>
        <Route path="/workspaces/:slug">
          {() => <AuthGuard><WorkspaceRoute /></AuthGuard>}
        </Route>

        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
      </SessionProvider>
    </ErrorBoundary>
  );
}
