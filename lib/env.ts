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

export function getServerPaymentEnv() {
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!paystackSecretKey) throw new Error("Missing PAYSTACK_SECRET_KEY.");
  if (!siteUrl) throw new Error("Missing NEXT_PUBLIC_SITE_URL.");
  return { paystackSecretKey, siteUrl: siteUrl.replace(/\/$/, "") };
}

export function getSupabaseSecretEnv() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Missing SUPABASE_SECRET_KEY.");
  return secretKey;
}
