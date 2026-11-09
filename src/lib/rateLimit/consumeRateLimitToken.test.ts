import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ rpc: mockRpc })),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import { consumeRateLimitToken } from "./consumeRateLimitToken";
import { rateLimitBuckets } from "./rateLimitBuckets";

function stubSharedStore() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
}

describe("consumeRateLimitToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitBuckets.clear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("returns the shared-store verdict when the RPC succeeds", async () => {
    stubSharedStore();
    mockRpc.mockResolvedValueOnce({ data: false, error: null });

    await expect(consumeRateLimitToken("shared", 5, 60_000)).resolves.toBe(false);

    expect(mockRpc).toHaveBeenCalledWith("consume_rate_limit_token", {
      p_key: "shared",
      p_limit: 5,
      p_window_ms: 60_000,
    });
    expect(rateLimitBuckets.size).toBe(0);
  });

  it("falls back to the local counter when the RPC returns an error", async () => {
    stubSharedStore();
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(consumeRateLimitToken("fallback", 1, 60_000)).resolves.toBe(true);
    await expect(consumeRateLimitToken("fallback", 1, 60_000)).resolves.toBe(false);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("falls back to the local counter when the RPC throws", async () => {
    stubSharedStore();
    mockRpc.mockRejectedValue(new Error("network down"));

    await expect(consumeRateLimitToken("throwing", 1, 60_000)).resolves.toBe(true);
    await expect(consumeRateLimitToken("throwing", 1, 60_000)).resolves.toBe(false);
  });

  it("does not call the RPC without server credentials", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    await expect(consumeRateLimitToken("local", 1, 60_000)).resolves.toBe(true);

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("opens a new window after the previous one expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    await expect(consumeRateLimitToken("windowed", 1, 1_000)).resolves.toBe(true);
    await expect(consumeRateLimitToken("windowed", 1, 1_000)).resolves.toBe(false);

    vi.advanceTimersByTime(1_001);

    await expect(consumeRateLimitToken("windowed", 1, 1_000)).resolves.toBe(true);
  });
});
