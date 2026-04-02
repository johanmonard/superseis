"use client";

/**
 * Persistent development warning banner.
 * Renders when the auth stub is active — disappears once real auth replaces it.
 */
export function DevBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center bg-[var(--color-status-warning-bg,#fef3c7)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium text-[var(--color-status-warning-text,#92400e)]"
    >
      {message}
    </div>
  );
}
