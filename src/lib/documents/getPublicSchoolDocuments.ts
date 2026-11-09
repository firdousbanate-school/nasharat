import { createSupabaseServerClient } from "@/lib/supabase";
import type { SchoolDocumentRow } from "./types";

const DOC_SELECT_FIELDS =
  "id, slug, title, description, file_path, file_name, file_size, mime_type, status, visibility, created_by, created_at, updated_at";

/**
 * Returns the documents that may be shown on the public homepage.
 *
 * The query is intentionally narrow: only published, public rows. There is no
 * service-role fallback — a failure (or a missing schema cache entry) must not
 * expose drafts or internal documents to anonymous visitors. The homepage
 * tolerates an empty list.
 */
export async function getPublicSchoolDocuments(
  schoolId?: string | null,
): Promise<SchoolDocumentRow[]> {
  if (!schoolId) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("school_documents")
    .select(DOC_SELECT_FIELDS)
    .eq("status", "published")
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((doc) => ({
    ...doc,
    is_published: doc.status === "published" && doc.visibility === "public",
    file_url: `/api/documents/${doc.id as string}/preview`,
  })) as unknown as SchoolDocumentRow[];
}
