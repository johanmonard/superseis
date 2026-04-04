import * as React from "react";

import { cn } from "../../lib/utils";
import { Icon, appIcons } from "./icon";

type SelectVariant = "default" | "text";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  variant?: SelectVariant;
  containerClassName?: string;
  displayClassName?: string;
};

function getSelectedOptionLabel(
  children: React.ReactNode,
  value: React.SelectHTMLAttributes<HTMLSelectElement>["value"]
) {
  const optionElements = React.Children.toArray(children).filter((child) =>
    React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(child)
  ) as React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>[];

  if (optionElements.length === 0) {
    return "";
  }

  const normalizedValue =
    value === undefined || value === null ? undefined : String(value);

  const selectedOption =
    optionElements.find((child) => {
      if (normalizedValue !== undefined) {
        return String(child.props.value ?? "") === normalizedValue;
      }

      return child.props.selected;
    }) ?? optionElements[0];

  return selectedOption.props.children;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      children,
      variant = "default",
      containerClassName,
      displayClassName,
      value,
      ...props
    },
    ref
  ) => {
    if (variant === "text") {
      const selectedLabel = getSelectedOptionLabel(children, value);

      return (
        <div className={cn("relative inline-flex min-w-0 items-center", containerClassName)}>
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none pr-4 text-xs font-medium text-[var(--color-text-secondary)]",
              displayClassName
            )}
          >
            {selectedLabel}
          </span>
          <span className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-[var(--color-text-muted)]">
            <Icon icon={appIcons.chevronDown} size={14} />
          </span>
          <select
            ref={ref}
            value={value}
            className={cn(
              "absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0",
              className
            )}
            {...props}
          >
            {children}
          </select>
        </div>
      );
    }

    return (
      <div className={cn("relative w-full", containerClassName)}>
        <select
          ref={ref}
          value={value}
          className={cn(
            "h-[var(--control-height-md)] w-full appearance-none rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-3)] pr-8 text-sm text-[var(--color-text-primary)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-canvas)] disabled:cursor-not-allowed disabled:opacity-60",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[var(--color-text-muted)]">
          <Icon icon={appIcons.chevronDown} size={14} />
        </span>
      </div>
    );
  }
);

Select.displayName = "Select";
