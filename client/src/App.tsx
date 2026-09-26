import { Switch, Route, Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import ClientLogin from "@/pages/client-login";
import DashboardPage from "@/pages/dashboard";
import React, { Component, ErrorInfo, ReactNode } from "react";

import ClientsPage from "@/pages/clients";
import ClientWorkspacePage from "@/pages/client-workspace";
import AssetsPage from "@/pages/assets";
import ClientProjectionsPage from "@/pages/projections";
import ClientDashboard from "@/pages/client-dashboard";
import EventTrackerPage from "@/pages/event-tracker";
import TrainingLabPage from "@/pages/training-lab";
import MarketingCalendarPage from "@/pages/marketing-calendar";
import NotificationsPage from "@/pages/notifications";
import SendNotificationsPage from "@/pages/send-notifications";
import ClientNotificationsPage from "@/pages/client-notifications";
import ClientOnboardingPage from "@/pages/client-onboarding";
import AccessDeniedPage from "@/pages/access-denied";
import LiveSalesFeedPage from "@/pages/live-sales-feed";
import TalkToNeoPage from "@/pages/talk-to-neo";
import AdminPage from "@/pages/admin";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    if (error?.message?.includes('ResizeObserver') || 
        error?.message?.includes('unmount')) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (error?.message?.includes('ResizeObserver') || 
        error?.message?.includes('unmount') ||
        !error?.message) {
      return;
    }
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black">
          <div className="text-center p-8">
            <h1 className="text-white text-xl mb-4">Something went wrong</h1>
            <p className="text-gray-400 mb-4">{this.state.error?.message || 'An unexpected error occurred'}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/80"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ClientStart() {
  const { user } = useAuth();
  const clients = useQuery<{ id: number }[]>({
    queryKey: ["/api/clients"],
  });
  const assignedIds = Array.from(new Set(user?.clientAccess ?? []));

  if (clients.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Opening your workspace…</div>;
  }
  if (clients.isError) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      <p>We couldn't load your workspaces.</p>
      <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => void clients.refetch()}>Try again</button>
    </div>;
  }
  if (assignedIds.length === 1 && clients.data?.length === 1 && clients.data[0].id === assignedIds[0]) {
    return <Redirect to={`/client/${clients.data[0].id}/dashboard`} />;
  }
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
      <h1 className="text-xl font-semibold">Workspace access issue</h1>
      <p>
        {assignedIds.length > 1
          ? "Your account has access to more than one workspace. Contact your agency administrator to resolve your workspace assignment."
          : "Your account is not assigned to a workspace yet. Contact your agency administrator for access."}
      </p>
    </div>
  );
}

function ClientPortalFeature({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const assignedIds = Array.from(new Set(user?.clientAccess ?? []));
  const clients = useQuery<{ id: number }[]>({
    queryKey: ["/api/clients"],
    enabled: user?.role === "agency_client",
  });

  if (user?.role !== "agency_client") return <>{children}</>;
  if (clients.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Checking workspace access…</div>;
  }
  if (clients.isError) {
    return <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center text-foreground">We couldn't verify your workspace access. Please try again later.</div>;
  }
  if (assignedIds.length !== 1 || clients.data?.length !== 1 || clients.data[0].id !== assignedIds[0]) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
        <h1 className="text-xl font-semibold">Workspace access issue</h1>
        <p>
          {assignedIds.length > 1
            ? "Your account has access to more than one workspace. Contact your agency administrator to resolve your workspace assignment."
            : "Your account is not assigned to a workspace yet. Contact your agency administrator for access."}
        </p>
      </div>
    );
  }
  const clientPath = location.match(/^\/client\/(\d+)\/(dashboard|calendar|sales|events|projections|training|notifications|neo)$/);
  if (!clientPath || Number(clientPath[1]) !== clients.data?.[0]?.id) return <AccessDeniedPage />;
  return <>{children}</>;
}

function AdminOnlyFeature({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === "owner" || user?.role === "agency_admin"
    ? <>{children}</>
    : <AccessDeniedPage />;
}

function InternalOnlyFeature({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === "agency_client" ? <AccessDeniedPage /> : <>{children}</>;
}

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/access-denied" component={AccessDeniedPage} />
        <Route path="/admin-login" component={() => <ClientLogin mode="admin" />} />
        <Route path="/client-login" component={() => <ClientLogin />} />
        <Route path="/" component={Landing} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return (
    <Switch>
      {/* ACCESS DENIED - available even when authenticated */}
      <Route path="/access-denied" component={AccessDeniedPage} />
      <Route path="/admin-login" component={() => <ClientLogin mode="admin" />} />
      <Route path="/client-login" component={() => <ClientLogin />} />
      
      {/* Client-first overview and workspace selection */}
      <Route path="/" component={user?.role === "agency_client" ? ClientStart : DashboardPage} />
      <Route path="/clients" component={() => <InternalOnlyFeature><ClientsPage /></InternalOnlyFeature>} />
      <Route path="/notifications" component={() => <InternalOnlyFeature><NotificationsPage /></InternalOnlyFeature>} />
      <Route path="/send-notifications" component={() => <AdminOnlyFeature><SendNotificationsPage /></AdminOnlyFeature>} />
      <Route path="/admin" component={() => <AdminOnlyFeature><AdminPage /></AdminOnlyFeature>} />

      {/* Client workspaces */}
      <Route path="/client/:id/dashboard" component={() => <ClientPortalFeature><ClientDashboard /></ClientPortalFeature>} />
      <Route path="/client/:id/onboarding" component={() => <InternalOnlyFeature><ClientOnboardingPage /></InternalOnlyFeature>} />
      <Route path="/client/:id/workspace" component={() => <InternalOnlyFeature><ClientWorkspacePage /></InternalOnlyFeature>} />
      {/* Event Builder (client/src/pages/event-builder.tsx) is hidden for now; re-add its route here to bring it back. */}
      <Route path="/client/:id/assets" component={() => <InternalOnlyFeature><AssetsPage /></InternalOnlyFeature>} />
      <Route path="/client/:id/events" component={() => <ClientPortalFeature><EventTrackerPage /></ClientPortalFeature>} />
      <Route path="/client/:id/projections" component={() => <ClientPortalFeature><ClientProjectionsPage /></ClientPortalFeature>} />
      <Route path="/client/:id/training" component={() => <ClientPortalFeature><TrainingLabPage /></ClientPortalFeature>} />
      <Route path="/client/:id/calendar" component={() => <ClientPortalFeature><MarketingCalendarPage /></ClientPortalFeature>} />
      <Route path="/client/:id/sales" component={() => <ClientPortalFeature><LiveSalesFeedPage /></ClientPortalFeature>} />
      <Route path="/client/:id/notifications" component={() => <ClientPortalFeature><ClientNotificationsPage /></ClientPortalFeature>} />
      <Route path="/client/:id/neo" component={() => <ClientPortalFeature><TalkToNeoPage /></ClientPortalFeature>} />
      {/* Old address from before the Tuck → Neo rename; keeps saved links working. */}
      <Route path="/client/:id/tuck">{(params) => <Redirect to={`/client/${params.id}/neo`} replace />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
