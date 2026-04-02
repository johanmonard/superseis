"use client";

import { type ReactNode, useRef } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/services/query/queryClient";
import {
  resolveRuntimeConfig,
  initializeRuntimeConfig,
} from "@/services/config/runtimeConfig";
import { ToastProvider } from "@/components/ui/toast";

function initConfig() {
  const result = resolveRuntimeConfig({
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_API_KEY:
      process.env.NEXT_PUBLIC_API_KEY,
    NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS:
      process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS,
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  initializeRuntimeConfig(result.config);
}

export function AppProviders({ children }: { children: ReactNode }) {
  const initialized = useRef<boolean | null>(null);

  if (initialized.current === null) {
    initConfig();
    initialized.current = true;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
