import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv, getSupabaseSecretEnv } from "@/lib/env";

export function createAdminClient() {
  const { url } = getSupabasePublicEnv();
  return createClient(url, getSupabaseSecretEnv(), { auth: { autoRefreshToken: false, persistSession: false } });
}
