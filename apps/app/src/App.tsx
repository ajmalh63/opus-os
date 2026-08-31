import { Route, Switch, Redirect } from 'wouter';
import { useEffect, lazy, Suspense } from 'react';
import { ensureUmami } from './lib/umami';

function TrackInjector() {
  useEffect(() => { ensureUmami(); }, []);
  return null;
}
import type { ReactNode } from 'react';
import { SessionProvider } from './lib/session';
import AuthGuard from './components/AuthGuard';
import RoleGate from './components/RoleGate';
// Eager — LCP & public shell (keep fast first paint)
import PublicHome from './pages/PublicHome';
import PublicLeadForm from './pages/PublicLeadForm';
import Login from './pages/Login';
import Signup from './pages/Signup';
// Gold standard: route-level lazy + Suspense for heavy authenticated/dashboard/division routes
// Vite + manualChunks will code-split these into per-route chunks → entry <700kB, cache-hit 89% (code-splitting.com, Mykola 2025)
const KanbanBoard = lazy(() => import('./pages/KanbanBoard'));
const Client360 = lazy(() => import('./pages/Client360'));
const ClientPortal = lazy(() => import('./pages/ClientPortal'));
const PartnerDashboard = lazy(() => import('./pages/PartnerDashboard'));
const PaymentConfirmed = lazy(() => import('./pages/PaymentConfirmed'));
const AdminConsole = lazy(() => import('./pages/AdminConsole'));
const DashboardHome = lazy(() => import('./pages/DashboardHome'));
const ClientsList = lazy(() => import('./pages/ClientsList'));
const DivisionsHub = lazy(() => import('./pages/divisions/DivisionsHub'));
const StudyAbroadPortal = lazy(() => import('./pages/divisions/StudyAbroadPortal'));
const VisaPrepPortal = lazy(() => import('./pages/divisions/VisaPrepPortal'));
const AttestationPortal = lazy(() => import('./pages/divisions/AttestationPortal'));
const UmrahPortal = lazy(() => import('./pages/divisions/UmrahPortal'));
const ManpowerPortal = lazy(() => import('./pages/divisions/ManpowerPortal'));
const Inbox = lazy(() => import('./pages/Inbox'));
const Settings = lazy(() => import('./pages/Settings'));
const GoRedirectPage = lazy(() => import('./pages/GoRedirectPage'));
const ChatwootDashboardWidget = lazy(() => import('./pages/ChatwootDashboardWidget'));
const BlogIndex = lazy(() => import('./pages/BlogIndex'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const FleetConsole = lazy(() => import('./components/fleet/FleetConsole'));
const TestPaymentPage = lazy(() => import('./pages/TestPaymentPage'));
const SignAgreementPage = lazy(() => import('./pages/SignAgreementPage'));
import { HelpdeskCommandCenter } from './pages/HelpdeskCommandCenter';
import WorkspaceShell from './components/WorkspaceShell';
import ErrorBoundary from './components/ErrorBoundary';
import { WorkspaceRouter, WorkspaceModule } from './components/WorkspaceRouter';
import VisibilityHub from './components/VisibilityHub';
import BookingsTab from './components/BookingsTab';
import AgreementsTab from './components/AgreementsTab';
import StudyAbroadPage from './pages/public/StudyAbroadPage';
import VisaServicesPage from './pages/public/VisaServicesPage';
import ToursTravelPage from './pages/public/ToursTravelPage';
import UmrahTravelPage from './pages/public/UmrahTravelPage';
import AttestationPage from './pages/public/AttestationPage';
import RecruitmentPage from './pages/public/RecruitmentPage';
import EmployerHirePage from './pages/public/EmployerHirePage';
import ContactPage from './pages/public/ContactPage';
import AboutUsPage from './pages/public/AboutUsPage';
import PrivacyPolicyPage from './pages/public/PrivacyPolicyPage';
import TermsOfServicePage from './pages/public/TermsOfServicePage';
import RefundPolicyPage from './pages/public/RefundPolicyPage';
import ShippingPolicyPage from './pages/public/ShippingPolicyPage';

const RouteFallback = () => <div className="p-8 text-center text-xs font-semibold text-brand-navy/40 animate-pulse">Loading…</div>;

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
        <Suspense fallback={<RouteFallback />}>
        <Switch>
        {/* Public surface */}
        <Route path="/" component={PublicHome} />
        <Route path="/lead-form" component={PublicLeadForm} />

        <Route path="/study-abroad" component={StudyAbroadPage} />
        <Route path="/visa-services" component={VisaServicesPage} />
        <Route path="/tours-travels" component={ToursTravelPage} />
        <Route path="/umrah-travel" component={UmrahTravelPage} />
        <Route path="/attestation" component={AttestationPage} />
        <Route path="/manpower/hire" component={EmployerHirePage} />
        <Route path="/recruitment" component={RecruitmentPage} />
        <Route path="/manpower" component={RecruitmentPage} />
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
        <Route path="/sign/:id" component={SignAgreementPage} />
        <Route path="/portal/agreements/:id" component={SignAgreementPage} />
        <Route path="/partner" component={PartnerDashboard} />
        <Route path="/payment-confirmed" component={PaymentConfirmed} />
        {/* Payment test surface — STAFF/ADMIN ONLY (P0-1 fix: was publicly reachable) */}
        <Route path="/test-payment">{() => <AuthGuard><TestPaymentPage /></AuthGuard>}</Route>
        <Route path="/pay">{() => <AuthGuard><TestPaymentPage /></AuthGuard>}</Route>
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
        <Route path="/helpdesk">
          {() => <AuthGuard><HelpdeskCommandCenter /></AuthGuard>}
        </Route>
        <Route path="/inbox">
          {() => <AuthGuard><WorkspaceRoute><Inbox /></WorkspaceRoute></AuthGuard>}
        </Route>
        {/* Fleet — 13-app console (super_admin, realtime) */}
        <Route path="/workspaces/fleet">
          {() => <AuthGuard><RoleGate roles={['super_admin']}><WorkspaceShell><FleetConsole /></WorkspaceShell></RoleGate></AuthGuard>}
        </Route>
        <Route path="/workspaces/fleet/:app">
          {() => <AuthGuard><RoleGate roles={['super_admin']}><WorkspaceShell><FleetConsole /></WorkspaceShell></RoleGate></AuthGuard>}
        </Route>
        <Route path="/workspaces/infra/:app">
          {() => <AuthGuard><RoleGate roles={['super_admin']}><WorkspaceShell><FleetConsole /></WorkspaceShell></RoleGate></AuthGuard>}
        </Route>

        <Route path="/workspaces/:slug">
          {() => <AuthGuard><WorkspaceRoute /></AuthGuard>}
        </Route>

        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
        </Suspense>
      </SessionProvider>
    </ErrorBoundary>
  );
}
