import { renderBrandedEmail } from "./template";
import "server-only";

type EmailJob = {
  dedupe_key: string;
  job_id: string;
  payload: { body?: string; href?: string | null; title?: string };
  template_key: string;
  to_email: string;
};

export async function sendNotificationEmail(job: EmailJob) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!apiKey || !from || !siteUrl)
    throw new Error("Email delivery is not configured");

  const title = (job.payload.title ?? "Her Africa Table update").slice(0, 160);
  const body = (
    job.payload.body ?? "A new update is available in your account."
  ).slice(0, 1000);
  const href = job.payload.href?.startsWith("/") && !job.payload.href.startsWith("//") && !job.payload.href.includes("\\")
    ? `${siteUrl}${job.payload.href}`
    : siteUrl;
  const isInvitation = ["referral_invitation", "table_invitation", "pilot_invitation"].includes(
    job.template_key,
  );
  const isMemberWelcome =
    job.template_key === "member_welcome" ||
    job.dedupe_key.startsWith("member-approved:");
  const isPhotoReport = job.dedupe_key.startsWith("community-photo-report:");
  const isConnectionRequest = job.dedupe_key.startsWith("connection-request:");
  const isEventReview = job.dedupe_key.startsWith("event-registration-review:");
  const isWaitlistOpening = job.dedupe_key.startsWith("event-waitlist-open:");
  const isStandaloneReminder = job.dedupe_key.startsWith("standalone-event-reminder:");
  const isCommunityHostNotice = job.template_key === "community" && (job.payload.href?.includes("/host#") ?? false);
  const isEventNotice = isEventReview ||
    isWaitlistOpening ||
    isStandaloneReminder ||
    job.dedupe_key.startsWith("event-registration-declined:") ||
    [
      "We have your event request",
      "Complete your event payment",
      "Your event place is confirmed",
      "Your event reservation expired",
      "Your event refund needs review",
      "Your event refund was recorded",
    ].includes(title);
  const buttonLabel = isConnectionRequest ? "View her profile & request" : isPhotoReport
    ? "Review photo report"
    : isInvitation
    ? "Open your invitation"
    : isMemberWelcome
      ? job.payload.href === "/onboarding"
        ? "Complete my profile"
        : "Enter my Member Home"
      : isEventReview
        ? "Review event requests"
        : isWaitlistOpening
          ? "See available places"
        : isStandaloneReminder
          ? "Open my event pass"
        : isEventNotice
          ? "View event details"
          : isCommunityHostNotice
            ? job.dedupe_key.startsWith("community-join-requested:") ? "Review join request" : "Open Community Host tools"
            : job.template_key === "community" ? "Open Community update" : "Open Her Africa Table";
  const preferenceNote = isInvitation
    ? "A member invited you personally. You decide whether to accept it."
    : isMemberWelcome
      ? "This membership message is private and was sent to the email address you verified."
      : isEventNotice
        ? "This event message was sent to the email address on your account."
      : "This update is private. You can change optional emails in your notification settings.";
  const text = isMemberWelcome
    ? `${body}\n\nYour first steps:\n1. Complete your profile so introductions feel relevant.\n2. Discover a Community where you feel at home.\n3. Find an event or conversation worth joining.\n\n${buttonLabel}: ${href}\n\nWelcome to the Table.\nThe Her Africa Table team`
    : `${body}\n\n${buttonLabel}: ${href}`;
  const html = renderBrandedEmail({ title, body, href, buttonLabel, preferenceNote, welcome: isMemberWelcome });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": job.job_id,
    },
    body: JSON.stringify({
      from,
      to: [job.to_email],
      subject: title,
      text,
      html,
      tags: [
        {
          name: "category",
          value: job.template_key
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 256),
        },
      ],
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };
  if (!response.ok || !data.id)
    throw new Error(data.message ?? `Email provider returned ${response.status}`);
  return data.id;
}
