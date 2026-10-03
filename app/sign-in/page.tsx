import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";
import { safeInternalDestination } from "@/lib/auth/safe-internal-destination";

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
  return (
    <AuthPage
      destination={safeNext(next)}
      initialJourney={mode === "apply" ? "apply" : "sign-in"}
      intent="member"
    />
  );
}
