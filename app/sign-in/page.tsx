import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { title: "Member sign in or request membership" };

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/continue";
  }
  return `/continue?next=${encodeURIComponent(value)}`;
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
