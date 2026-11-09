import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAuthRateLimit } from "./checkAuthRateLimit";
import { rateLimitBuckets } from "@/lib/rateLimit/rateLimitBuckets";

// No shared-store credentials in tests: the limiter falls back to memory.
vi.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

describe("checkAuthRateLimit", () => {
  beforeEach(() => {
    rateLimitBuckets.clear();
  });

  it("allows requests under the limit", async () => {
    const result = await checkAuthRateLimit({
      action: "login",
      ip: "192.168.1.1",
      identifier: "user@school.com",
    });
    expect(result).toBe(true);
  });

  it("blocks when IP limit is exceeded on login", async () => {
    for (let i = 0; i < 10; i++) {
      expect(
        await checkAuthRateLimit({
          action: "login",
          ip: "10.0.0.1",
          identifier: `user${i}@school.com`,
        }),
      ).toBe(true);
    }

    const blocked = await checkAuthRateLimit({
      action: "login",
      ip: "10.0.0.1",
      identifier: "user11@school.com",
    });
    expect(blocked).toBe(false);
  });

  it("blocks when account identifier limit is exceeded on password reset", async () => {
    for (let i = 0; i < 3; i++) {
      expect(
        await checkAuthRateLimit({
          action: "password_reset",
          ip: `192.168.1.${i + 1}`,
          identifier: "victim@school.com",
        }),
      ).toBe(true);
    }

    const blocked = await checkAuthRateLimit({
      action: "password_reset",
      ip: "192.168.1.100",
      identifier: "victim@school.com",
    });
    expect(blocked).toBe(false);
  });

  it("blocks when owner claim limit is exceeded", async () => {
    for (let i = 0; i < 5; i++) {
      expect(
        await checkAuthRateLimit({
          action: "owner_claim",
          ip: "127.0.0.1",
          identifier: "user-uuid-1",
        }),
      ).toBe(true);
    }

    const blocked = await checkAuthRateLimit({
      action: "owner_claim",
      ip: "127.0.0.1",
      identifier: "user-uuid-1",
    });
    expect(blocked).toBe(false);
  });
});
