const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const hasSupabasePublicEnv = Boolean(
  supabaseUrl && supabasePublishableKey,
);

export function getSupabasePublicEnv() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  // Supabase clients require the project origin. Normalize values copied from
  // REST API examples so a trailing /rest/v1 does not break browser queries.
  const normalizedUrl = supabaseUrl
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");

  return {
    url: normalizedUrl,
    publishableKey: supabasePublishableKey,
  };
}
