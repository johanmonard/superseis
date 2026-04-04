import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-bg-canvas)] p-4">
      <div className="workspace-container w-full max-w-md">{children}</div>
    </main>
  );
}
