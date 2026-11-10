import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockMaybeSingle = vi.fn();
const mockProfileEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockProfileSelect = vi.fn(() => ({ eq: mockProfileEq }));
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/createSupabaseAdminClient", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

import { logError } from "@/lib/logger";
import { recordCredentialAudit } from "./recordCredentialAudit";

describe("recordCredentialAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: null });
    mockFrom.mockImplementation((table: string) =>
      table === "profiles" ? { select: mockProfileSelect } : { insert: mockInsert },
    );
  });

  it("inserts an audit row for credential change", async () => {
    mockInsert.mockResolvedValue({ error: null });

    await recordCredentialAudit({
      schoolId: "school-1",
      actorId: "user-1",
      actorLabel: "Admin (admin@school.org)",
      action: "credentials.password_change",
      entityId: "user-1",
    });

    expect(mockFrom).not.toHaveBeenCalledWith("profiles");
    expect(mockFrom).toHaveBeenCalledWith("audit_logs");
    expect(mockInsert).toHaveBeenCalledWith({
      actor_id: "user-1",
      actor_label: "Admin (admin@school.org)",
      action: "credentials.password_change",
      entity_type: "user",
      entity_id: "user-1",
      metadata: {},
    });
  });

  it("derives the actor label from the profile when it is omitted", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { email: "admin@school.org" } });
    mockInsert.mockResolvedValue({ error: null });

    await recordCredentialAudit({
      actorId: "user-1",
      action: "credentials.password_reset",
      entityId: "user-2",
    });

    expect(mockProfileSelect).toHaveBeenCalledWith("email");
    expect(mockProfileEq).toHaveBeenCalledWith("id", "user-1");
    expect(mockInsert).toHaveBeenCalledWith({
      actor_id: "user-1",
      actor_label: "admin@school.org",
      action: "credentials.password_reset",
      entity_type: "user",
      entity_id: "user-2",
      metadata: {},
    });
  });

  it("handles logging errors without throwing", async () => {
    const errorObj = { message: "DB write failed" };
    mockInsert.mockResolvedValue({ error: errorObj });

    await expect(
      recordCredentialAudit({
        actorId: "user-2",
        action: "credentials.password_reset",
        entityId: "user-2",
      }),
    ).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(errorObj, {
      scope: "recordCredentialAudit",
      action: "credentials.password_reset",
      actorId: "user-2",
      entityId: "user-2",
    });
  });
});
