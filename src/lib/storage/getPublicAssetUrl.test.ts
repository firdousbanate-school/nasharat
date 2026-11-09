import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  getClientEnv: vi.fn(() => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://school.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  })),
}));

import { getPublicAssetUrl } from "./getPublicAssetUrl";

describe("getPublicAssetUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the path is missing", () => {
    expect(getPublicAssetUrl(null)).toBeNull();
    expect(getPublicAssetUrl(undefined)).toBeNull();
    expect(getPublicAssetUrl("")).toBeNull();
  });

  it("builds a public URL for a calendar image", () => {
    expect(getPublicAssetUrl("calendar/123_banner.jpg")).toBe(
      "https://school.supabase.co/storage/v1/object/public/public-assets/calendar/123_banner.jpg",
    );
  });

  it("builds a public URL for an achievement image", () => {
    expect(getPublicAssetUrl("achievements/123_award.png")).toBe(
      "https://school.supabase.co/storage/v1/object/public/public-assets/achievements/123_award.png",
    );
  });

  it("leaves an absolute URL unchanged", () => {
    const url = "https://cdn.example.com/image.jpg";
    expect(getPublicAssetUrl(url)).toBe(url);
  });
});
