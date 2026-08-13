import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import {
  NotificationOperations,
  type AdminCommunityBriefingBatch,
  type AdminNotificationJob,
  type EmailReadinessCheck,
} from "@/components/admin/notification-operations";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");
  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) redirect("/admin");

  const [result, briefingResult] = await Promise.all([
    supabase.rpc("list_admin_notification_jobs"),
    supabase.rpc("list_community_briefing_batches"),
  ]);
  const configured = Boolean(
    process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      (process.env.CRON_SECRET?.length ?? 0) >= 32 &&
      process.env.NEXT_PUBLIC_SITE_URL &&
      process.env.SUPABASE_SECRET_KEY,
  );
  const readinessChecks: EmailReadinessCheck[] = [
    {
      detail: "Connect the approved Resend sending key in Vercel.",
      key: "provider",
      label: "Email provider connected",
      ready: Boolean(process.env.RESEND_API_KEY),
    },
    {
      detail: "Use an address on a domain that Resend has verified.",
      key: "sender",
      label: "Sender address added",
      ready: Boolean(process.env.EMAIL_FROM),
    },
    {
      detail: "Protect scheduled sending with a strong private key.",
      key: "worker",
      label: "Scheduled sending protected",
      ready: (process.env.CRON_SECRET?.length ?? 0) >= 32,
    },
    {
      detail: "Email buttons must return members to the production website.",
      key: "links",
      label: "Website links configured",
      ready: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    },
    {
      detail: "The delivery worker needs its private Supabase connection.",
      key: "server",
      label: "Secure server connection ready",
      ready: Boolean(process.env.SUPABASE_SECRET_KEY),
    },
  ];

  return (
    <main className="admin-command-center">
      <AdminHeader
        active="delivery"
        label="Message delivery"
        role="super_admin"
      />
      {result.error ? (
        <section className="admin-empty network-error" role="alert">
          <strong>Delivery activity is temporarily unavailable</strong>
          <p>
            No messages have been changed. Reload in a moment or check platform
            health from Work areas.
          </p>
          <a className="button button-outline" href="/admin/notifications">
            Try again
          </a>
        </section>
      ) : (
        <NotificationOperations
          briefingBatches={
            (briefingResult.data as AdminCommunityBriefingBatch[] | null) ?? []
          }
          briefingMigrationReady={!briefingResult.error}
          jobs={(result.data as AdminNotificationJob[] | null) ?? []}
          providerConfigured={configured}
          readinessChecks={readinessChecks}
        />
      )}
    </main>
  );
}
