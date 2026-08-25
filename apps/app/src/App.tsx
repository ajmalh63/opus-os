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
import PublicLeadForm from './pages/PublicLeadForm';
import KanbanBoard from './pages/KanbanBoard';
import Client360 from './pages/Client360';
import ClientPortal from './pages/ClientPortal';
import PartnerDashboard from './pages/PartnerDashboard';
import PaymentConfirmed from './pages/PaymentConfirmed';
import AdminConsole from './pages/AdminConsole';
import WorkspaceShell from './components/WorkspaceShell';
import ErrorBoundary from './components/ErrorBoundary';
import { WorkspaceRouter, WorkspaceModule } from './components/WorkspaceRouter';
import VisibilityHub from './components/VisibilityHub';
import BookingsTab from './components/BookingsTab';
import AgreementsTab from './components/AgreementsTab';
import PublicHome from './pages/PublicHome';
import StudyAbroadPage from './pages/public/StudyAbroadPage';
import VisaServicesPage from './pages/public/VisaServicesPage';
import UmrahTravelPage from './pages/public/UmrahTravelPage';
import AttestationPage from './pages/public/AttestationPage';
import RecruitmentPage from './pages/public/RecruitmentPage';
import ContactPage from './pages/public/ContactPage';
import AboutUsPage from './pages/public/AboutUsPage';
import PrivacyPolicyPage from './pages/public/PrivacyPolicyPage';
import TermsOfServicePage from './pages/public/TermsOfServicePage';
import RefundPolicyPage from './pages/public/RefundPolicyPage';
import ShippingPolicyPage from './pages/public/ShippingPolicyPage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import DashboardHome from './pages/DashboardHome';
import ClientsList from './pages/ClientsList';
import DivisionsHub from './pages/divisions/DivisionsHub';
import StudyAbroadPortal from './pages/divisions/StudyAbroadPortal';
import VisaPrepPortal from './pages/divisions/VisaPrepPortal';
import AttestationPortal from './pages/divisions/AttestationPortal';
import UmrahPortal from './pages/divisions/UmrahPortal';
import ManpowerPortal from './pages/divisions/ManpowerPortal';
import Inbox from './pages/Inbox';
import Settings from './pages/Settings';
import GoRedirectPage from './pages/GoRedirectPage';
import ChatwootDashboardWidget from './pages/ChatwootDashboardWidget';
import BlogIndex from './pages/BlogIndex';
import BlogPost from './pages/BlogPost';

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
        <Route path="/blog" component={BlogIndex} />
        <Route path="/blog/:slug" component={BlogPost} />

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
