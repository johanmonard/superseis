import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchProjectListMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  data: null as
    | null
    | {
        user_id: number;
        email: string;
        company_id: number;
        company_name: string;
        role: string;
        auth_type: string;
        is_admin: boolean;
      },
  isLoading: false,
}));

vi.mock("@/services/api/project", () => ({
  fetchProjectList: (...args: unknown[]) => fetchProjectListMock(...args),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock("@/lib/use-auth-session", () => ({
  useAuthSession: () => authState,
}));

import { useProjectList } from "@/services/query/project";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useProjectList", () => {
  beforeEach(() => {
    fetchProjectListMock.mockReset();
    fetchProjectListMock.mockResolvedValue([
      { id: 1, name: "Atlas", created_at: "2026-04-22T12:00:00Z" },
    ]);
    authState.data = null;
    authState.isLoading = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("waits for an authenticated session before fetching projects", async () => {
    const client = createQueryClient();
    const wrapper = createWrapper(client);

    const { rerender } = renderHook(() => useProjectList(), { wrapper });

    expect(fetchProjectListMock).not.toHaveBeenCalled();

    authState.data = {
      user_id: 1,
      email: "user@example.com",
      company_id: 1,
      company_name: "Acme",
      role: "user",
      auth_type: "session",
      is_admin: false,
    };

    rerender();

    await waitFor(() => {
      expect(fetchProjectListMock).toHaveBeenCalledTimes(1);
    });
  });
});
