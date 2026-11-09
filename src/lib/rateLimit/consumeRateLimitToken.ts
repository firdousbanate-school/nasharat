import { createSupabaseAdminClient } from "@/lib/supabase";
import { logError } from "@/lib/logger";
import { rateLimitBuckets } from "./rateLimitBuckets";
import { pruneExpiredRateLimitBuckets } from "./pruneExpiredRateLimitBuckets";

const MAX_TRACKED_KEYS = 5_000;

/**
 * True when the server credentials needed for the shared counter are present.
 *
 * In the test environment they are normally absent, so the unit tests exercise
 * the in-memory fallback without touching the network.
 */
function hasSharedStoreConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Process-local fixed-window counter.
 *
 * This is only a degraded fallback for when the shared store is unavailable.
 * Each serverless instance keeps its own window, so it cannot bound global
 * traffic, but it still stops one broken client from flooding the logs.
 */
function consumeInMemoryToken(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  if (rateLimitBuckets.size > MAX_TRACKED_KEYS) {
    pruneExpiredRateLimitBuckets();
  }

  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}

/**
 * Counts one hit for `key` and reports whether it is inside the limit.
 *
 * The Postgres-backed store is authoritative and shared by every instance.
 * If the RPC fails (database outage, missing migration, misconfiguration) the
 * call degrades to the process-local counter instead of failing the request.
 */
export async function consumeRateLimitToken(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (hasSharedStoreConfig()) {
    try {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("consume_rate_limit_token", {
        p_key: key,
        p_limit: limit,
        p_window_ms: windowMs,
      });

      if (!error && typeof data === "boolean") {
        return data;
      }

      if (error) {
        logError(error, { scope: "consumeRateLimitToken", key });
      }
    } catch (error) {
      logError(error, { scope: "consumeRateLimitToken", key });
    }
  }

  return consumeInMemoryToken(key, limit, windowMs);
}
