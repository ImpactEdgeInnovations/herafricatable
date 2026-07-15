import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { title: "Member sign in" };

export default function MemberSignInPage() {
  return <AuthPage intent="member" />;
}
