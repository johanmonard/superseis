"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface AngleInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  tone?: "default" | "warning";
  className?: string;
}

const KNOB_RADIUS = 36;
const LABEL_OFFSET = 12; // extra space outside circle for letters
const PAD = LABEL_OFFSET + 8;
const DIAL_SIZE = (KNOB_RADIUS + PAD) * 2;

export function AngleInput({
  value,
  onChange,
  min = 0,
  max = 360,
  disabled = false,
  tone = "default",
  className,
}: AngleInputProps) {
  const [inputValue, setInputValue] = React.useState(String(value));
  const dialRef = React.useRef<SVGSVGElement>(null);
  const dragging = React.useRef(false);

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
    const rounded = Math.round(clamped * 100) / 100;
    onChange(rounded);
    setInputValue(String(rounded));
  };

  const angleFromPointer = React.useCallback(
    (e: { clientX: number; clientY: number }) => {
      const svg = dialRef.current;
      if (!svg) return value;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let deg = (Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      const clamped = Math.min(max, Math.max(min, deg));
      return Math.round(clamped * 100) / 100;
    },
    [value, min, max],
  );

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      dragging.current = true;
      (e.target as Element).setPointerCapture(e.pointerId);
      onChange(angleFromPointer(e));
    },
    [disabled, angleFromPointer, onChange],
  );

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      onChange(angleFromPointer(e));
    },
    [angleFromPointer, onChange],
  );

  const handlePointerUp = React.useCallback(() => {
    dragging.current = false;
  }, []);

  const half = DIAL_SIZE / 2;

  // Needle endpoint
  const rad = ((value - 90) * Math.PI) / 180;
  const hx = half + KNOB_RADIUS * Math.cos(rad);
  const hy = half + KNOB_RADIUS * Math.sin(rad);

  // Cardinal labels + ticks
  const cardinals = [
    { deg: 0, label: "N" },
    { deg: 90, label: "E" },
    { deg: 180, label: "S" },
    { deg: 270, label: "W" },
  ];

  const tickData = cardinals.map(({ deg, label }) => {
    const r = ((deg - 90) * Math.PI) / 180;
    const inner = KNOB_RADIUS - 3;
    const outer = KNOB_RADIUS + 3;
    const labelR = KNOB_RADIUS + LABEL_OFFSET;
    return {
      label,
      x1: half + inner * Math.cos(r),
      y1: half + inner * Math.sin(r),
      x2: half + outer * Math.cos(r),
      y2: half + outer * Math.sin(r),
      lx: half + labelR * Math.cos(r),
      ly: half + labelR * Math.sin(r),
    };
  });

  // Unique gradient ID per instance
  const gradId = React.useId();

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        ref={dialRef}
        width={DIAL_SIZE}
        height={DIAL_SIZE}
        viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
        className={cn(
          "shrink-0 cursor-pointer select-none",
          disabled && "pointer-events-none opacity-50",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <defs>
          <linearGradient id={gradId} x1={half} y1={half} x2={hx} y2={hy} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0} />
            <stop offset="50%" stopColor="var(--color-accent)" stopOpacity={0.6} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={1} />
          </linearGradient>
        </defs>

        {/* Outer ring */}
        <circle
          cx={half}
          cy={half}
          r={KNOB_RADIUS}
          fill="none"
          stroke="var(--color-border-subtle)"
          strokeWidth={1}
        />

        {/* Tick marks + cardinal labels */}
        {tickData.map((t) => (
          <React.Fragment key={t.label}>
            <line
              x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              stroke="var(--color-border-strong)"
              strokeWidth={1}
            />
            <text
              x={t.lx} y={t.ly}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--color-text-muted)"
              fontSize={9}
              fontWeight={600}
              fontFamily="system-ui, sans-serif"
            >
              {t.label}
            </text>
          </React.Fragment>
        ))}

        {/* Needle — fades from center outward */}
        <line
          x1={half} y1={half} x2={hx} y2={hy}
          stroke={`url(#${gradId})`}
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Handle dot */}
        <circle
          cx={hx} cy={hy} r={4}
          fill="var(--color-accent)"
          stroke="var(--color-bg-surface)"
          strokeWidth={1.5}
        />
      </svg>

      {/* Input overlay centered inside the dial */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="pointer-events-auto flex items-baseline gap-0.5">
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
            className={cn(
              "h-5 w-14 rounded-[var(--radius-sm)] border-none bg-transparent px-0 text-center text-xs tabular-nums outline-none",
              tone === "warning"
                ? "text-[var(--color-status-danger)]"
                : "text-[var(--color-text-primary)]",
            )}
          />
          <span className="text-[9px] text-[var(--color-text-muted)]">°</span>
        </div>
      </div>
    </div>
  );
}
