import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the runtime config before importing the client
vi.mock("@/services/config/runtimeConfig", () => ({
  getRuntimeConfig: () => ({
    apiBaseUrl: "http://localhost:8000",
    apiKey: "test-api-key",
    requestTimeoutMs: 5000,
  }),
}));

import { requestJson, ApiError } from "@/services/api/client";

describe("requestJson", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: "test" }),
        headers: new Headers({ "content-type": "application/json" }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("makes a GET request by default", async () => {
    await requestJson("/health");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/health");
    expect(init.method).toBe("GET");
  });

  it("includes API key header in apiKey auth mode", async () => {
    await requestJson("/data", { authMode: "apiKey" });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.get("X-API-Key")).toBe("test-api-key");
  });

  it("throws ApiError on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ detail: "Not found" }),
        headers: new Headers({ "content-type": "application/json" }),
      })
    );

    await expect(requestJson("/missing")).rejects.toThrow(ApiError);
    await expect(requestJson("/missing")).rejects.toMatchObject({ status: 404 });
  });
});
