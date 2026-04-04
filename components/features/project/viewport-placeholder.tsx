export function ViewportPlaceholder() {
  return (
    <div className="flex flex-col items-center gap-[var(--space-4)]">
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        className="text-[var(--color-border-subtle)]"
      >
        <circle
          cx="24"
          cy="24"
          r="20"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="6 4"
          opacity="0.5"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 24 24"
            to="360 24 24"
            dur="20s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          cx="24"
          cy="24"
          r="12"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.3"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="360 24 24"
            to="0 24 24"
            dur="14s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="24" cy="24" r="2" fill="currentColor" opacity="0.4">
          <animate
            attributeName="r"
            values="2;3;2"
            dur="3s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.4;0.2;0.4"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
      <span className="text-xs text-[var(--color-text-muted)]">
        No viewport data
      </span>
    </div>
  );
}
