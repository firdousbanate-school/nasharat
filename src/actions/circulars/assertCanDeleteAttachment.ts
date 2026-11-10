import { createSupabaseServerClient } from "@/lib/supabase";
import { isPlatformOwner } from "@/lib/auth/isPlatformOwner";
import { ForbiddenError } from "@/lib/errors/ForbiddenError";

/**
 * Mirrors the `circular_attachments_delete` / storage delete policies: only the
 * circular's creator or a school-wide `circular.publish` holder may remove an
 * attachment. Checking here first turns an RLS no-op into a clear error and,
 * importantly, runs before the storage object is removed.
 */
export async function assertCanDeleteAttachment(circularId: string, userId: string): Promise<void> {
  if (await isPlatformOwner(userId)) return;

  const supabase = await createSupabaseServerClient();
  const { data: circular } = await supabase
    .from("circulars")
    .select("created_by")
    .eq("id", circularId)
    .maybeSingle();

  if (circular?.created_by === userId) return;

  const { data: schoolWide } = await supabase.rpc("has_school_wide_permission", {
    p_permission: "circular.publish",
  });

  if (schoolWide === true) return;

  throw new ForbiddenError("Unauthorized");
}
