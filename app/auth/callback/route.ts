import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalDestination } from "@/lib/auth/safe-internal-destination";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalDestination(url.searchParams.get("next"), { allowAdmin: true }) ?? "/home";
  let configuredOrigin: string | null = null;
  try {
    const configured = process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
      : null;
    configuredOrigin = configured?.protocol === "https:" ? configured.origin : null;
  } catch {
    configuredOrigin = null;
  }
  const redirectOrigin = process.env.NODE_ENV === "development"
    ? url.origin
    : configuredOrigin ?? url.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${redirectOrigin}${next}`);
    }
  }

  return NextResponse.redirect(`${redirectOrigin}/sign-in?error=auth_callback`);
}
