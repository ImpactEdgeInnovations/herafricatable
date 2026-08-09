import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { memberErrorMessage } from "@/lib/member-error";
import {
  MembershipCenter,
  type MembershipPlan,
} from "@/components/member/membership-center";
import { MemberHeader } from "@/components/member/member-header";
export const dynamic = "force-dynamic";
export default async function MembershipPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["active", "dormant"].includes(profile.access_status))
    redirect("/home");
  const { data, error } = await supabase.rpc("list_membership_catalog");
  return (
    <main className="membership-page">
      <MemberHeader label="Membership" />
      <section className="membership-hero">
        <p className="eyebrow">Belong with intention</p>
        <h1>
          Your place
          <br />
          at the table.
        </h1>
        <p>
          See your membership, renewal date and available options in one calm,
          private place.
        </p>
      </section>
      {error ? (
        <section className="network-error" role="alert">
          <strong>Membership is not open yet.</strong>
          <p>{memberErrorMessage(error, "load membership options")}</p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/membership">
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <MembershipCenter
          accessStatus={profile.access_status}
          plans={(data as MembershipPlan[] | null) ?? []}
        />
      )}
    </main>
  );
}
