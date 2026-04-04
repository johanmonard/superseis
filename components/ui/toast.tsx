"use client";

import * as React from "react";
import { createContext, useCallback, useContext, useState } from "react";

import { cn } from "../../lib/utils";

type ToastVariant = "default" | "success" | "error" | "warning";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;

let toastCounter = 0;

const variantStyles: Record<ToastVariant, string> = {
  default: "border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]",
  success: "border-[var(--color-status-success)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]",
  error: "border-[var(--color-status-danger)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]",
  warning: "border-[var(--color-status-warning)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  React.useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto rounded-[var(--radius-md)] border px-[var(--space-4)] py-[var(--space-3)] text-[length:var(--font-size-xs)] shadow-md",
        "animate-[toast-in_200ms_ease-out]",
        variantStyles[toast.variant],
      )}
    >
      {toast.message}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "default") => {
    const id = `toast-${++toastCounter}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-[var(--space-4)] right-[var(--space-4)] z-50 flex flex-col gap-[var(--space-2)]">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
