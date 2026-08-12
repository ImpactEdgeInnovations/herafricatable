import Link from "next/link";
import { notFound } from "next/navigation";
import { TableInvitationClaim } from "@/components/member/table-invitation-claim";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type InvitationPreview = {
  destination_href: string;
  destination_name: string;
  destination_type: "community" | "event";
  expires_at: string;
  invitation_status: string;
  inviter_name: string;
  personal_note: string | null;
};

export default async function TableInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const supabase = await createClient();
  const [{ data }, { data: auth }] = await Promise.all([
    supabase.rpc("preview_table_invitation", { p_token: token }),
    supabase.auth.getUser(),
  ]);
  const invitation = (data as InvitationPreview[] | null)?.[0];
  if (!invitation) notFound();

  return (
    <main className="table-invitation-page">
      <header className="legal-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Her Africa Table<small>Meet. Connect. Rise.</small></span>
        </Link>
        <span>Personal invitation</span>
      </header>
      <section className="table-invitation-card">
        <span className="table-invitation-mark" aria-hidden="true">H</span>
        <p className="eyebrow">An invitation from {invitation.inviter_name}</p>
        <h1>{invitation.destination_name}</h1>
        <p>
          You have been invited to this {invitation.destination_type} through
          Her Africa Table’s trusted member network.
        </p>
        {invitation.personal_note ? <blockquote>“{invitation.personal_note}”</blockquote> : null}
        <div className="table-invitation-boundary">
          <strong>Your choice stays yours.</strong>
          <p>
            This invitation does not bypass membership review, private Community
            approval, event capacity or payment. It simply remembers where you
            wanted to go.
          </p>
        </div>
        <TableInvitationClaim
          destinationHref={invitation.destination_href}
          signedIn={Boolean(auth.user)}
          token={token}
        />
        <small>
          Valid until {new Intl.DateTimeFormat("en-KE", {
            dateStyle: "medium",
          }).format(new Date(invitation.expires_at))}
        </small>
      </section>
    </main>
  );
}
