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
  const isMemberWelcome =
    job.template_key === "member_welcome" ||
    job.dedupe_key.startsWith("member-approved:");
  const buttonLabel = isInvitation
    ? "Open your invitation"
    : isMemberWelcome
      ? job.payload.href === "/onboarding"
        ? "Complete my profile"
        : "Enter my Member Home"
      : "Open Her Africa Table";
  const preferenceNote = isInvitation
    ? "This personal invitation was sent by a Her Africa Table member and reviewed before delivery."
    : isMemberWelcome
      ? "This membership message is private and was sent to the email address you verified."
      : "You can change non-essential email preferences in your notification centre.";
  const text = isMemberWelcome
    ? `${body}\n\nYour first steps:\n1. Complete your profile so introductions feel relevant.\n2. Discover a Community where you feel at home.\n3. Find an event or conversation worth joining.\n\n${buttonLabel}: ${href}\n\nWelcome to the Table.\nThe Her Africa Table team`
    : `${body}\n\n${buttonLabel}: ${href}`;
  const html = isMemberWelcome
    ? `<div style="margin:0;background:#f5f0e8;padding:44px 18px;font-family:Arial,sans-serif;color:#251d1a"><div style="max-width:620px;margin:0 auto;background:#fffdf9;border:1px solid #e6ddd2"><div style="padding:28px 34px;border-bottom:1px solid #eee5da"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="width:38px"><div style="width:32px;height:32px;border-radius:50%;background:#68172b;color:#fff;text-align:center;line-height:32px;font-family:Georgia,serif;font-size:16px">H</div></td><td style="font-family:Georgia,serif;font-size:17px;color:#2a211e">Her Africa Table</td><td align="right" style="color:#9a743b;font-size:10px;letter-spacing:1.7px;text-transform:uppercase">Membership</td></tr></table></div><div style="padding:42px 34px 24px"><p style="margin:0 0 14px;color:#9a743b;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase">Your place at the Table</p><h1 style="margin:0;max-width:500px;font-family:Georgia,serif;font-size:38px;font-weight:400;letter-spacing:-1.1px;line-height:1.08;color:#251d1a">${escapeHtml(title)}</h1><p style="margin:20px 0 0;max-width:520px;font-size:15px;line-height:1.75;color:#625853">${escapeHtml(body)}</p><a href="${escapeHtml(href)}" style="display:inline-block;margin-top:28px;padding:14px 22px;border-radius:3px;background:#68172b;color:#fff;text-decoration:none;font-size:13px;font-weight:700">${escapeHtml(buttonLabel)}</a></div><div style="padding:24px 34px 34px"><p style="margin:0 0 16px;color:#2f2723;font-size:12px;font-weight:700">A simple place to begin</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #eee5da"><tr><td valign="top" style="width:28px;padding:15px 0;color:#9a743b;font-family:Georgia,serif;font-size:12px">01</td><td style="padding:15px 0;border-bottom:1px solid #eee5da"><strong style="display:block;font-size:13px;color:#2f2723">Complete your profile</strong><span style="display:block;margin-top:4px;font-size:12px;line-height:1.55;color:#766c67">Help thoughtful introductions feel relevant from the beginning.</span></td></tr><tr><td valign="top" style="width:28px;padding:15px 0;color:#9a743b;font-family:Georgia,serif;font-size:12px">02</td><td style="padding:15px 0;border-bottom:1px solid #eee5da"><strong style="display:block;font-size:13px;color:#2f2723">Find your circle</strong><span style="display:block;margin-top:4px;font-size:12px;line-height:1.55;color:#766c67">Discover a Community, event or conversation that feels useful to you.</span></td></tr><tr><td valign="top" style="width:28px;padding:15px 0;color:#9a743b;font-family:Georgia,serif;font-size:12px">03</td><td style="padding:15px 0"><strong style="display:block;font-size:13px;color:#2f2723">Follow through</strong><span style="display:block;margin-top:4px;font-size:12px;line-height:1.55;color:#766c67">Keep worthwhile introductions and next steps moving in one trusted place.</span></td></tr></table><p style="margin:22px 0 0;font-family:Georgia,serif;font-size:17px;color:#68172b">Welcome to the Table.</p><p style="margin:6px 0 0;font-size:11px;color:#857a74">The Her Africa Table team</p></div><div style="padding:18px 34px;background:#faf7f1;border-top:1px solid #eee5da;color:#90857e;font-size:10px;line-height:1.6">${escapeHtml(preferenceNote)}</div></div></div>`
    : `<div style="background:#f6f1e9;padding:40px 20px;font-family:Arial,sans-serif;color:#211a18"><div style="max-width:600px;margin:auto;background:#fff;padding:36px;border-top:3px solid #6d1727"><p style="color:#8a6b32;font-size:11px;letter-spacing:2px;text-transform:uppercase">Her Africa Table</p><h1 style="font-family:Georgia,serif;font-size:34px;font-weight:400">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.7;color:#5f5652">${escapeHtml(body)}</p><a href="${escapeHtml(href)}" style="display:inline-block;margin-top:20px;padding:13px 20px;background:#6d1727;color:#fff;text-decoration:none;font-size:13px">${escapeHtml(buttonLabel)}</a><p style="margin-top:34px;color:#8a817d;font-size:11px">${escapeHtml(preferenceNote)}</p></div></div>`;

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
