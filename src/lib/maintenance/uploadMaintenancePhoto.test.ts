import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadMaintenancePhoto } from "./uploadMaintenancePhoto";

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];

function makeClient() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const client = {
    storage: { from: vi.fn(() => ({ upload })) },
    from: vi.fn(() => ({ insert })),
  } as unknown as SupabaseClient;
  return { client, upload };
}

describe("uploadMaintenancePhoto", () => {
  it("stores a report photo under the request id without a school prefix", async () => {
    const { client, upload } = makeClient();
    const photo = new File([new Uint8Array(PNG_BYTES)], "photo.png", { type: "image/png" });

    const result = await uploadMaintenancePhoto(client, {
      photo,
      schoolId: "school-1",
      requestId: "req-1",
      uploadedBy: "user-1",
      kind: "report",
    });

    expect(result.error).toBeUndefined();
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^req-1\/\d+_photo\.png$/),
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: "image/png", upsert: false }),
    );
  });

  it("prefixes evidence photos with evidence_", async () => {
    const { client, upload } = makeClient();
    const photo = new File([new Uint8Array(PNG_BYTES)], "photo.png", { type: "image/png" });

    const result = await uploadMaintenancePhoto(client, {
      photo,
      schoolId: "school-1",
      requestId: "req-1",
      uploadedBy: "user-1",
      kind: "evidence",
    });

    expect(result.error).toBeUndefined();
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^req-1\/evidence_\d+_photo\.png$/),
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: "image/png", upsert: false }),
    );
  });
});
