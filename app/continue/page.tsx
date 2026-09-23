import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/admin")) return null;
  return value;
}

export default async function ContinueAfterSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const memberDestination = safeNext(next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabase
      .from("user_roles")
      .select("role,expires_at")
      .eq("user_id", user.id)
      .in("role", ["super_admin", "event_staff", "moderator"]),
    supabase
      .from("profiles")
      .select("access_status")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const hasActiveAdminRole = (roles ?? []).some((assignment) =>
    !assignment.expires_at || new Date(assignment.expires_at).getTime() > Date.now(),
  );

  // An explicit member link remains a member journey. A normal sign-in sends an
  // approved team account directly to the workspace without exposing its role
  // before authentication.
  if (!memberDestination && hasActiveAdminRole) redirect("/admin");

  // A verified visitor may return to a published public event when the
  // event-only guest pilot is enabled. An existing event registration remains
  // accessible after new guest requests are paused.
  if (memberDestination && profile?.access_status === "pending") {
    const eventPath = memberDestination.split(/[?#]/, 1)[0];
    const eventMatch = /^\/events\/([a-z0-9-]+)(?:\/(?:register|pass))?\/?$/.exec(eventPath);
    if (eventMatch) {
      const [{ data: guestFlag }, { data: publicEvent }] = await Promise.all([
        supabase.from("feature_flags").select("enabled").eq("key", "event_guest_access").maybeSingle(),
        supabase.from("events").select("id").eq("slug", eventMatch[1]).eq("audience", "public").in("status", ["published", "completed"]).maybeSingle(),
      ]);
      if (publicEvent) {
        const { data: ownRegistration } = await supabase.from("registration_requests")
          .select("id").eq("event_id", publicEvent.id).eq("user_id", user.id).maybeSingle();
        if (guestFlag?.enabled || ownRegistration) redirect(memberDestination);
      }
    }

    const orderMatch = /^\/orders\/([A-Za-z0-9-]+)\/?$/.exec(eventPath);
    if (orderMatch) {
      const { data: ownEventOrder } = await supabase.from("orders")
        .select("id").eq("reference", orderMatch[1]).eq("user_id", user.id)
        .eq("order_type", "event").maybeSingle();
      if (ownEventOrder) redirect(memberDestination);
    }
  }

  if (profile?.access_status === "onboarding") {
    redirect(
      memberDestination
        ? `/onboarding?next=${encodeURIComponent(memberDestination)}`
        : "/onboarding",
    );
  }
  if (
    profile &&
    ["active", "dormant", "suspended"].includes(profile.access_status)
  ) {
    redirect(memberDestination ?? "/home");
  }

  redirect(
    memberDestination
      ? `/apply?next=${encodeURIComponent(memberDestination)}`
      : "/apply",
  );
}
