import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function HomeOverview() {
  return (
    <div className="grid grid-cols-1 gap-[var(--space-4)] md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <Badge variant="accent">Starter</Badge>
        </CardHeader>
        <CardContent>
          <CardDescription>
            Create new workspace modules with `npm run new-module &lt;name&gt;`.
            The scaffold seeds a Stage 1 feature surface plus the route,
            navigation entry, release module key, page identity, API service,
            and query hook.
          </CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auth Starter</CardTitle>
          <Badge variant="info">Session</Badge>
        </CardHeader>
        <CardContent>
          <CardDescription>
            The template ships a cookie-backed login/session stub for local
            development. Replace it before exposing the app beyond local or
            shared testing use.
          </CardDescription>
        </CardContent>
      </Card>

      {/* [reference-surface:home-card] */}
      <Card>
        <CardHeader>
          <CardTitle>Reference Module</CardTitle>
          <Badge variant="success">Sample</Badge>
        </CardHeader>
        <CardContent>
          <CardDescription>
            The bundled reference pages demonstrate Stage 2, Stage 3, and
            full-stack patterns. Remove them with `npm run setup --
            --trim-reference` when you are ready to build your own modules.
          </CardDescription>
        </CardContent>
      </Card>
      {/* [/reference-surface:home-card] */}
    </div>
  );
}
