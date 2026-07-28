import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { memberErrorMessage } from "@/lib/member-error";
import {
  PerksGallery,
  type PartnerPerk,
} from "@/components/member/perks-gallery";
import { MemberHeader } from "@/components/member/member-header";
export const dynamic = "force-dynamic";
export default async function PerksPage() {
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
  if (profile?.access_status !== "active") redirect("/home");
  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", "partner_perks")
    .maybeSingle();
  if (!flag?.enabled)
    return (
      <main className="perks-page">
        <MemberHeader label="Partner benefits" />
        <section className="community-hold">
          <p className="eyebrow">Useful, carefully negotiated</p>
          <h1>Partner benefits are being curated.</h1>
          <p>
            Offers will open only after their terms, inventory and redemption
            process pass review.
          </p>
          <Link className="button button-outline" href="/home">
            Return home
          </Link>
        </section>
      </main>
    );
  const { data, error } = await supabase.rpc("list_partner_perks");
  return (
    <main className="perks-page">
      <MemberHeader label="Partner benefits" />
      <section className="perks-hero">
        <p className="eyebrow">Value beyond the gathering</p>
        <h1>
          Benefits selected
          <br />
          for women building.
        </h1>
        <p>
          Thoughtfully negotiated access from partners aligned with the work,
          wellbeing and mobility of our members.
        </p>
      </section>
      {error ? (
        <section className="network-error" role="alert">
          <strong>Partner benefits are not ready.</strong>
          <p>{memberErrorMessage(error, "load partner benefits")}</p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/perks">
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <PerksGallery perks={(data as PartnerPerk[] | null) ?? []} />
      )}
    </main>
  );
}
