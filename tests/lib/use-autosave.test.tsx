import * as React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchProjectSectionMock = vi.fn();
const saveProjectSectionMock = vi.fn();

vi.mock("@/services/api/project-sections", () => ({
  fetchProjectSection: (...args: unknown[]) => fetchProjectSectionMock(...args),
  saveProjectSection: (...args: unknown[]) => saveProjectSectionMock(...args),
}));

import { useAutosave } from "@/lib/use-autosave";

function AutosaveHarness({
  value,
  onReady,
}: {
  value: string;
  onReady?: () => void;
}) {
  const { initialData } = useAutosave(1, "definition", { value });

  React.useEffect(() => {
    if (initialData === null || !onReady) return;

    const frame = window.requestAnimationFrame(() => onReady());
    return () => window.cancelAnimationFrame(frame);
  }, [initialData, onReady]);

  return null;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 60_000,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderWithQueryClient(ui: React.ReactElement, client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("useAutosave", () => {
  beforeEach(() => {
    fetchProjectSectionMock.mockReset();
    saveProjectSectionMock.mockReset();

    fetchProjectSectionMock.mockResolvedValue({
      section: "definition",
      data: {},
      updated_at: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("retries the same draft after a failed beforeunload save", async () => {
    const client = createQueryClient();
    const onReady = vi.fn();

    saveProjectSectionMock.mockRejectedValue(new Error("save failed"));

    const { rerender } = renderWithQueryClient(
      <AutosaveHarness value="" onReady={onReady} />,
      client,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());

    rerender(
      <QueryClientProvider client={client}>
        <AutosaveHarness value="draft" onReady={onReady} />
      </QueryClientProvider>,
    );

    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    await waitFor(() => {
      expect(saveProjectSectionMock).toHaveBeenCalledTimes(1);
    });

    expect(saveProjectSectionMock.mock.calls[0]).toEqual([
      1,
      "definition",
      { value: "draft" },
      { keepalive: true },
    ]);

    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    await waitFor(() => {
      expect(saveProjectSectionMock).toHaveBeenCalledTimes(2);
    });
  });
});
