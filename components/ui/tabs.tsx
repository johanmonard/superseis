"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "../../lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("flex gap-0 border-b border-[var(--color-border-subtle)]", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "px-[var(--space-4)] py-[var(--space-2)] text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-accent)] data-[state=active]:text-[var(--color-text-primary)]",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("pt-[var(--space-4)] focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
