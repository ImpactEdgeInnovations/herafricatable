import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";
import { safeInternalDestination } from "@/lib/auth/safe-internal-destination";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Member sign in or request membership" };

function safeNext(value: string | undefined) {
  const destination = safeInternalDestination(value);
  return destination ? `/continue?next=${encodeURIComponent(destination)}` : "/continue";
}

export default async function MemberSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string }>;
}) {
  const { mode, next } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(safeNext(next));
  return (
    <AuthPage
      destination={safeNext(next)}
      initialJourney={mode === "apply" ? "apply" : "sign-in"}
      intent="member"
    />
  );
}
