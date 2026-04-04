import * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Dialog({ open, onOpenChange, children, className, style }: DialogProps) {
  React.useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[var(--color-overlay)]"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-lg rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-4)] shadow-[0_4px_12px_var(--color-shadow-alpha)]",
          className
        )}
        style={style}
      >
        {children}
      </div>
    </div>
  );
}

export const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "mb-[var(--space-3)] flex items-start justify-between gap-[var(--space-3)]",
      className
    )}
    {...props}
  />
));

DialogHeader.displayName = "DialogHeader";

export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn("text-base font-semibold text-[var(--color-text-primary)]", className)} {...props} />
));

DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-[var(--color-text-secondary)]", className)} {...props} />
));

DialogDescription.displayName = "DialogDescription";

export const DialogBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-[var(--space-3)]", className)} {...props} />
));

DialogBody.displayName = "DialogBody";

export const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "mt-[var(--space-4)] flex items-center justify-end gap-[var(--space-2)]",
      className
    )}
    {...props}
  />
));

DialogFooter.displayName = "DialogFooter";

export interface DialogCloseButtonProps
  extends React.ComponentPropsWithoutRef<typeof Button> {
  onClose: () => void;
}

export function DialogCloseButton({
  onClose,
  variant = "ghost",
  size = "sm",
  children = "Close",
  ...props
}: DialogCloseButtonProps) {
  return (
    <Button variant={variant} size={size} onClick={onClose} {...props}>
      {children}
    </Button>
  );
}
