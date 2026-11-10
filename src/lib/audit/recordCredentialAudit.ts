import { createSupabaseAdminClient } from "@/lib/supabase/createSupabaseAdminClient";
import { logError } from "@/lib/logger";

export type CredentialAuditInput = {
  /** @deprecated There is one school; audit rows carry no school id. Ignored. */
  schoolId?: string | null;
  actorId: string;
  /**
   * Optional display label. When omitted the label is derived from the actor's
   * profile, so callers cannot leave a credential audit row unlabelled.
   */
  actorLabel?: string | null;
  action: "credentials.password_change" | "credentials.password_reset" | "credentials.email_change";
  entityId: string;
  metadata?: Record<string, unknown>;
};

export async function recordCredentialAudit(input: CredentialAuditInput): Promise<void> {
  const admin = createSupabaseAdminClient({ actorId: input.actorId });

  let actorLabel = input.actorLabel?.trim() || null;
  if (!actorLabel) {
    const { data: actor } = await admin
      .from("profiles")
      .select("email")
      .eq("id", input.actorId)
      .maybeSingle();
    actorLabel = actor?.email ?? null;
  }

  const { error } = await admin.from("audit_logs").insert({
    actor_id: input.actorId,
    actor_label: actorLabel,
    action: input.action,
    entity_type: "user",
    entity_id: input.entityId,
    metadata: input.metadata ?? {},
  });

  if (error) {
    logError(error, {
      scope: "recordCredentialAudit",
      action: input.action,
      actorId: input.actorId,
      entityId: input.entityId,
    });
  }
}
