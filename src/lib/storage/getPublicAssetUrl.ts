import { getClientEnv } from "@/lib/env";

/**
 * Builds the public URL for an object in the `public-assets` bucket
 * (calendar images, achievement images, and school logos).
 *
 * The database stores bare storage paths such as `calendar/<file>`; this
 * helper turns them into absolute Supabase Storage URLs. Absolute URLs are
 * returned unchanged so older rows that already hold a full URL still work.
 */
export function getPublicAssetUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const baseUrl = getClientEnv().NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;

  return `${baseUrl}/storage/v1/object/public/public-assets/${path.replace(/^\/+/, "")}`;
}
