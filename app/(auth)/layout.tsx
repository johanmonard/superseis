import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg-canvas)] p-4 pb-[18vh]">
      {children}
    </main>
  );
}
