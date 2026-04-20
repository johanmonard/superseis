"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { appConfig } from "../../config/app.config";
import { navigation } from "../../config/navigation.config";
import { filterNavigationForWorkspaceRelease } from "../../config/release.config";
import { getWorkspacePageIdentity } from "../../config/workspace-page.config";
import { WorkspaceLayout } from "../../components/layout/workspace-layout";
import { WorkspaceSidebarNav } from "../../components/layout/workspace-sidebar-nav";
import { WorkspacePageHeader } from "../../components/layout/workspace-page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { ErrorBoundary } from "../../components/ui/error-boundary";
import { useAuthSession } from "../../lib/use-auth-session";
import { useWorkspaceSidebar } from "../../lib/use-workspace-sidebar";
import { PipelineReportProvider } from "../../lib/use-pipeline-report";
import { PipelineReportDrawer } from "../../components/layout/pipeline-report-drawer";

const isAuthStub = !process.env.NEXT_PUBLIC_AUTH_PROVIDER;

function WorkspaceStatusScreen({
  title,
  description,
  detail,
}: {
  title: string;
  description: string;
  detail?: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-bg-canvas)] p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex-col items-start">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {detail ? (
          <CardContent>
            <p className="text-sm text-[var(--color-text-secondary)]">{detail}</p>
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}

export default function WorkspaceRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isLoading } = useAuthSession();
  const {
    isCollapsed: isSidebarCollapsed,
    setIsCollapsed: setIsSidebarCollapsed,
  } = useWorkspaceSidebar();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  React.useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/login");
    }
  }, [isLoading, router, session]);

  React.useEffect(() => {
    if (!isLoading && session && isAdminRoute && !session.is_admin) {
      router.replace("/");
    }
  }, [isAdminRoute, isLoading, router, session]);

  // On a browser hard reload (F5 / Ctrl+R / address bar Enter), send the
  // user back to the workspace home instead of re-rendering the current
  // page. Fires once per tab load; client-side route changes stay intact.
  const didRedirectRef = React.useRef(false);
  React.useEffect(() => {
    if (didRedirectRef.current) return;
    didRedirectRef.current = true;
    if (typeof window === "undefined") return;
    const entries = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[];
    const isReload = entries[0]?.type === "reload";
    if (isReload && pathname !== "/") {
      router.replace("/");
    }
  }, [pathname, router]);

  const visibleNavigation = React.useMemo(() => {
    const released = filterNavigationForWorkspaceRelease(navigation);
    return released.filter((item) => !(item.adminOnly && !session?.is_admin));
  }, [session]);

  const pageIdentity = getWorkspacePageIdentity(pathname);

  if (isLoading) {
    return (
      <WorkspaceStatusScreen
        title="Loading workspace"
        description="Checking your current session before the workspace shell initializes."
      />
    );
  }

  if (!session || (isAdminRoute && !session.is_admin)) {
    return null;
  }

  return (
    <PipelineReportProvider>
      <WorkspaceLayout
        sidebarWidth={isSidebarCollapsed ? "collapsed" : "default"}
        mainClassName="grid h-screen grid-rows-[minmax(0,1fr)]"
        sidebar={
          <WorkspaceSidebarNav
            navigation={visibleNavigation}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapsed={setIsSidebarCollapsed}
            brandInitials={appConfig.initials}
            brandName={appConfig.name}
            brandTagline={appConfig.tagline}
            showAuthStubBanner={isAuthStub}
          />
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-4 lg:gap-6">
          <WorkspacePageHeader
            session={session}
            pageTitle={pageIdentity?.title}
            pageSubtitle={pageIdentity?.subtitle}
          />
          <ErrorBoundary>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </ErrorBoundary>
        </div>
      </WorkspaceLayout>
      <PipelineReportDrawer />
    </PipelineReportProvider>
  );
}
