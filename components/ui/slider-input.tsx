"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "../../lib/utils";

export interface SliderInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

export function SliderInput({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  className,
}: SliderInputProps) {
  const [inputValue, setInputValue] = React.useState(String(value));

  // Sync input text when value changes externally (e.g. from slider drag)
  React.useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (Number.isNaN(n)) {
      setInputValue(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    onChange(clamped);
    setInputValue(String(clamped));
  };

  return (
    <div className={cn("flex items-center gap-[var(--space-3)]", className)}>
      <SliderPrimitive.Root
        className="relative flex flex-1 touch-none select-none items-center"
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
          <SliderPrimitive.Range className="absolute h-full bg-[var(--color-accent)]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-[var(--color-accent)] bg-[var(--color-bg-surface)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-canvas)] disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Root>
      <input
        type="text"
        inputMode="decimal"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(inputValue);
        }}
        disabled={disabled}
        className="h-[var(--control-height-md)] w-16 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-2)] text-center text-sm text-[var(--color-text-primary)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-canvas)] disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
