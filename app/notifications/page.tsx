import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberHeader } from "@/components/member/member-header";
import {
  NotificationCenter,
  type ActivityConversation,
  type ActivityRequest,
  type MemberNotification,
  type NotificationPreference,
} from "@/components/member/notification-center";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const defaults: NotificationPreference = {
  email_events: true,
  email_network: true,
  email_support: true,
  in_app_enabled: true,
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [notificationResult, preferenceResult, conversationResult, networkResult] =
    await Promise.all([
      supabase
        .from("notifications")
        .select("id,kind,title,body,href,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("notification_preferences")
        .select(
          "in_app_enabled,email_network,email_events,email_support",
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.rpc("list_my_conversations"),
      supabase.rpc("list_my_network"),
    ]);
  const requests = (
    (networkResult.data as ActivityRequest[] | null) ?? []
  ).filter(
    (item) => item.status === "pending" && item.direction === "incoming",
  );

  return (
    <main className="notifications-page">
      <MemberHeader active="alerts" label="Updates" />
      {notificationResult.error ||
      conversationResult.error ||
      networkResult.error ? (
        <section className="admin-empty network-error">
          <strong>We could not open your updates</strong>
          <p>Please try again or contact support if the problem continues.</p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/notifications">
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <NotificationCenter
          userId={user.id}
          notifications={
            (notificationResult.data as MemberNotification[] | null) ?? []
          }
          initialPreferences={
            (preferenceResult.data as NotificationPreference | null) ?? defaults
          }
          conversations={
            (conversationResult.data as ActivityConversation[] | null) ?? []
          }
          requests={requests}
        />
      )}
    </main>
  );
}
