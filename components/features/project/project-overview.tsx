import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ProjectOverview() {
  return (
    <div className="grid grid-cols-1 gap-[var(--space-4)] md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader className="flex-col items-start gap-[var(--space-1)]">
          <CardTitle>Project</CardTitle>
          <CardDescription>Stage 1 structural foundation for this module.</CardDescription>
        </CardHeader>
        <CardContent>
          <CardDescription>
            Replace this starter card with your first real summary surface before adding
            Stage 2 interactions or Stage 3 data views.
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
