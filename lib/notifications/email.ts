import "server-only";

type EmailJob = {
  dedupe_key: string;
  job_id: string;
  payload: { body?: string; href?: string | null; title?: string };
  template_key: string;
  to_email: string;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );

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
  const href = job.payload.href?.startsWith("/")
    ? `${siteUrl}${job.payload.href}`
    : siteUrl;
  const isInvitation = ["referral_invitation", "table_invitation"].includes(
    job.template_key,
  );
  const buttonLabel = isInvitation ? "Open your invitation" : "Open Her Africa Table";
  const preferenceNote = isInvitation
    ? "This personal invitation was sent by a Her Africa Table member and reviewed before delivery."
    : "You can change non-essential email preferences in your notification centre.";

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
      text: `${body}\n\n${buttonLabel}: ${href}`,
      html: `<div style="background:#f6f1e9;padding:40px 20px;font-family:Arial,sans-serif;color:#211a18"><div style="max-width:600px;margin:auto;background:#fff;padding:36px;border-top:3px solid #6d1727"><p style="color:#8a6b32;font-size:11px;letter-spacing:2px;text-transform:uppercase">Her Africa Table</p><h1 style="font-family:Georgia,serif;font-size:34px;font-weight:400">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.7;color:#5f5652">${escapeHtml(body)}</p><a href="${escapeHtml(href)}" style="display:inline-block;margin-top:20px;padding:13px 20px;background:#6d1727;color:#fff;text-decoration:none;font-size:13px">${escapeHtml(buttonLabel)}</a><p style="margin-top:34px;color:#8a817d;font-size:11px">${escapeHtml(preferenceNote)}</p></div></div>`,
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
