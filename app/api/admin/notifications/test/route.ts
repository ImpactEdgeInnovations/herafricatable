import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireNotificationAdmin } from "@/lib/notifications/admin-access";
import { sendNotificationEmail } from "@/lib/notifications/email";

const TEST_COOLDOWN_SECONDS = 60;

export async function POST(request: Request) {
  const access=await requireNotificationAdmin(request);
  if(access.response)return access.response;
  const user=access.user;
  if(!user.email)return NextResponse.json({error:"Your account needs an email address for this test."},{status:400});

  const admin = createAdminClient();
  const since = new Date(Date.now() - TEST_COOLDOWN_SECONDS * 1000).toISOString();
  const { count, error: cooldownError } = await admin
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", user.id)
    .in("action", [
      "notification.delivery_test",
      "notification.delivery_test_failed",
    ])
    .gte("created_at", since);

  if(cooldownError)return NextResponse.json({error:"The delivery test could not be checked. Please try again."},{status:503});

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Please wait one minute before sending another test." },
      { status: 429 },
    );
  }

  const testId = randomUUID();
  try {
    const providerId = await sendNotificationEmail({
      dedupe_key: `delivery-test:${testId}`,
      job_id: testId,
      payload: {
        body: "This private test confirms that the Her Africa Table application can reach its email provider and use the configured sender.",
        href: "/admin/notifications",
        title: "Her Africa Table email delivery test",
      },
      template_key: "delivery_test",
      to_email: user.email,
    });

    await admin.from("audit_events").insert({
      action: "notification.delivery_test",
      actor_id: user.id,
      metadata: {
        provider_message_id: providerId,
        sender: process.env.EMAIL_FROM ?? null,
      },
      target_type: "email_delivery",
    });

    return NextResponse.json({ deliveredTo: user.email, providerId });
  } catch (error) {
    await admin.from("audit_events").insert({
      action: "notification.delivery_test_failed",
      actor_id: user.id,
      metadata: {
        error: error instanceof Error ? error.message.slice(0, 240) : "Unknown error",
      },
      target_type: "email_delivery",
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The provider did not accept the test email.",
      },
      { status: 503 },
    );
  }
}
