import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { title: "Admin sign in" };

export default function AdminSignInPage() {
  return <AuthPage intent="admin" />;
}
