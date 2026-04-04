import * as React from "react";

import { cn } from "../../lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "h-[var(--control-height-md)] w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-3)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-canvas)] disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
