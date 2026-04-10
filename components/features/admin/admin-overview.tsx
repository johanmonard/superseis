"use client";

import { useAuthSession } from "@/lib/use-auth-session";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AdminOverview() {
  const { data: session } = useAuthSession();

  if (!session?.is_admin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin access required</CardTitle>
          <CardDescription>
            This starter page is only available when the signed-in username is
            included in `APP_ADMIN_USERS`.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-[var(--space-4)] lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Current Session</CardTitle>
          <CardDescription>
            Starter placeholder showing the active authenticated principal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-[var(--space-3)]">
          <div className="flex items-center gap-[var(--space-2)]">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              {session.email}
            </p>
            <Badge variant="accent">Admin</Badge>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Auth type: {session.auth_type}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What To Replace</CardTitle>
          <CardDescription>
            This page exists to show the boundary between starter auth and real
            app administration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-[var(--space-2)] text-sm text-[var(--color-text-secondary)]">
          <p>Replace the starter login validation with your real identity provider.</p>
          <p>Keep backend admin checks on protected routes, not just in the UI.</p>
          <p>Swap this placeholder page for your real system controls.</p>
        </CardContent>
      </Card>
    </div>
  );
}
