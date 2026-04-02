// -----------------------------------------------------------------------
// REFERENCE ONLY — do not copy this file as a starting point.
// Use `npm run new-module <name>` to scaffold new features instead.
//
// This page showcases the available UI primitives.
// Use it to learn component names, variants, and composition patterns.
// -----------------------------------------------------------------------

"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function Section({
  title,
  primitive,
  children,
}: {
  title: string;
  primitive: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-[var(--space-1)]">
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono text-[var(--color-text-secondary)]">
            {primitive}
          </code>
        </CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function PrimitivesShowcase() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [switchChecked, setSwitchChecked] = useState(true);
  const [sliderValue, setSliderValue] = useState([50]);

  return (
    <div className="space-y-[var(--space-4)]">
      {/* Button */}
      <Section title="Button" primitive="Button">
        <div className="space-y-[var(--space-3)]">
          <div>
            <p className="mb-[var(--space-2)] text-xs font-medium text-[var(--color-text-muted)]">
              Variants
            </p>
            <div className="flex flex-wrap items-center gap-[var(--space-2)]">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
            </div>
          </div>
          <div>
            <p className="mb-[var(--space-2)] text-xs font-medium text-[var(--color-text-muted)]">
              Sizes
            </p>
            <div className="flex flex-wrap items-center gap-[var(--space-2)]">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </div>
        </div>
      </Section>

      {/* Badge */}
      <Section title="Badge" primitive="Badge">
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="danger">Danger</Badge>
        </div>
      </Section>

      {/* Card */}
      <Section title="Card" primitive="Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter">
        <Card>
          <CardHeader className="flex-col items-start gap-[var(--space-1)]">
            <CardTitle>Card Title</CardTitle>
            <CardDescription>
              Cards compose with CardHeader, CardTitle, CardDescription,
              CardContent, and CardFooter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Card content goes here. Use cards for compact summaries and
              grouped information.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="secondary" size="sm">
              Action
            </Button>
          </CardFooter>
        </Card>
      </Section>

      {/* Form Inputs */}
      <Section title="Form Inputs" primitive="Field, Input, Select, Textarea">
        <div className="grid grid-cols-1 gap-[var(--space-3)] sm:grid-cols-2">
          <Field label="Input">
            <Input placeholder="Text input" />
          </Field>
          <Field label="Select">
            <Select>
              <option>Option A</option>
              <option>Option B</option>
              <option>Option C</option>
            </Select>
          </Field>
          <Field label="Textarea" className="sm:col-span-2">
            <Textarea placeholder="Multi-line text input" />
          </Field>
        </div>
      </Section>

      {/* Toggle Controls */}
      <Section title="Toggle Controls" primitive="Checkbox, Switch">
        <div className="flex flex-wrap items-start gap-[var(--space-4)]">
          <label className="flex items-center gap-[var(--space-2)]">
            <Checkbox
              checked={checkboxChecked}
              onCheckedChange={(v) => setCheckboxChecked(v === true)}
            />
            <span className="text-sm text-[var(--color-text-secondary)]">
              Checkbox
            </span>
          </label>
          <label className="flex items-center gap-[var(--space-2)]">
            <Switch checked={switchChecked} onCheckedChange={setSwitchChecked} />
            <span className="text-sm text-[var(--color-text-secondary)]">
              Switch
            </span>
          </label>
        </div>
      </Section>

      {/* Slider */}
      <Section title="Slider" primitive="Slider">
        <div className="max-w-sm space-y-[var(--space-2)]">
          <Slider
            value={sliderValue}
            onValueChange={setSliderValue}
            min={0}
            max={100}
            step={1}
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            Value: {sliderValue[0]}
          </p>
        </div>
      </Section>

      {/* Tabs */}
      <Section title="Tabs" primitive="Tabs, TabsList, TabsTrigger, TabsContent">
        <Tabs defaultValue="first">
          <TabsList>
            <TabsTrigger value="first">First</TabsTrigger>
            <TabsTrigger value="second">Second</TabsTrigger>
            <TabsTrigger value="third">Third</TabsTrigger>
          </TabsList>
          <TabsContent value="first">
            <p className="text-sm text-[var(--color-text-secondary)]">
              First tab content. Tabs use Radix UI primitives.
            </p>
          </TabsContent>
          <TabsContent value="second">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Second tab content.
            </p>
          </TabsContent>
          <TabsContent value="third">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Third tab content.
            </p>
          </TabsContent>
        </Tabs>
      </Section>

      {/* Dialog */}
      <Section title="Dialog" primitive="Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogCloseButton">
        <Button variant="secondary" size="sm" onClick={() => setIsDialogOpen(true)}>
          Open Dialog
        </Button>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogHeader>
            <div className="space-y-1">
              <DialogTitle>Dialog Title</DialogTitle>
              <DialogDescription>
                Dialogs are for focused interactions. They compose with
                DialogHeader, DialogBody, and DialogFooter.
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody>
            <Field label="Sample field">
              <Input placeholder="Type something" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogCloseButton onClose={() => setIsDialogOpen(false)} />
            <Button onClick={() => setIsDialogOpen(false)}>Confirm</Button>
          </DialogFooter>
        </Dialog>
      </Section>

      {/* Skeleton */}
      <Section title="Skeleton" primitive="Skeleton, SkeletonText">
        <div className="space-y-[var(--space-3)]">
          <div className="flex items-center gap-[var(--space-3)]">
            <Skeleton width="2.5rem" height="2.5rem" className="rounded-full" />
            <div className="space-y-[var(--space-1)]">
              <Skeleton width="8rem" height="0.75rem" />
              <Skeleton width="5rem" height="0.75rem" />
            </div>
          </div>
          <SkeletonText lines={3} />
        </div>
      </Section>

      {/* Primitives not shown interactively */}
      <Card>
        <CardHeader className="flex-col items-start gap-[var(--space-1)]">
          <CardTitle>Other Primitives</CardTitle>
          <CardDescription>
            These primitives are used in the workspace shell and other pages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-[var(--space-2)] text-sm text-[var(--color-text-secondary)]">
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                Icon
              </code>{" "}
              — Wrapper for lucide-react icons. Use{" "}
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                appIcons
              </code>{" "}
              for semantic icon names.
            </p>
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                Popover, PopoverTrigger, PopoverContent
              </code>{" "}
              — Floating content anchored to a trigger. See the session menu in
              the header.
            </p>
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                Tooltip, TooltipTrigger, TooltipContent
              </code>{" "}
              — Hover hints. See collapsed sidebar navigation.
            </p>
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                DataTable
              </code>{" "}
              — Structured table with column definitions. See the Tasks demo.
            </p>
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                ToastProvider, useToast
              </code>{" "}
              — Transient notification system. Wrap your app with ToastProvider,
              call{" "}
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                toast(&quot;message&quot;, &quot;success&quot;)
              </code>.
            </p>
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                ErrorBoundary
              </code>{" "}
              — Catches render errors and displays a fallback.
            </p>
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                DevBanner
              </code>{" "}
              — System banner for development warnings. See the auth stub notice
              above.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
