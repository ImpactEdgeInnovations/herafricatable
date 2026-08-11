import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunityAboutAction } from "@/components/community/community-about-action";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublicCommunityAbout = {
  about_benefits: string[];
  about_summary: string;
  accent_key: string;
  audience_summary: string;
  commerce_enabled: boolean;
  community_id: string;
  community_type: string;
  cover_alt_text: string | null;
  cover_asset_id: string | null;
  cover_height: number | null;
  cover_width: number | null;
  host_display_name: string;
  host_intro: string;
  icon_alt_text: string | null;
  icon_asset_id: string | null;
  icon_height: number | null;
  icon_width: number | null;
  member_count: number | null;
  membership_status: string | null;
  name: string;
  next_event_city: string | null;
  next_event_country: string | null;
  next_event_format: string | null;
  next_event_slug: string | null;
  next_event_starts_at: string | null;
  next_event_summary: string | null;
  next_event_title: string | null;
  offer_access_type: string | null;
  offer_billing_interval: string | null;
  offer_currency: string | null;
  offer_payment_mode: string | null;
  offer_price_minor: number | null;
  slug: string;
  tagline: string;
};

async function loadAbout(slug: string) {
  const supabase = await createClient();
  const result = await supabase.rpc("get_public_community_about", {
    p_slug: slug,
  });
  return {
    about:
      ((result.data as PublicCommunityAbout[] | null) ?? [])[0] ?? null,
    supabase,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { about } = await loadAbout(slug);
  if (!about) return { title: "Community" };
  return {
    description: about.tagline || about.about_summary,
    title: `${about.name} | Her Africa Table`,
  };
}

function accessLabel(about: PublicCommunityAbout) {
  if (about.offer_access_type !== "paid") return "Free to join";
  if (about.offer_price_minor === null || !about.offer_currency) {
    return "Paid membership";
  }
  const price = new Intl.NumberFormat("en-KE", {
    currency: about.offer_currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(about.offer_price_minor / 100);
  const interval =
    about.offer_billing_interval === "monthly"
      ? " / month"
      : about.offer_billing_interval === "annual"
        ? " / year"
        : " once";
  return `${price}${interval}`;
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(new Date(value));
}

export default async function CommunityAboutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { about, supabase } = await loadAbout(slug);
  if (!about) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileResult = user
    ? await supabase
        .from("profiles")
        .select("access_status")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  let iconUrl: string | null = null;
  let coverUrl: string | null = null;
  const assetIds = [about.icon_asset_id, about.cover_asset_id].filter(
    (id): id is string => Boolean(id),
  );
  if (assetIds.length) {
    try {
      const admin = createAdminClient();
      const { data: assets } = await admin
        .from("community_media_assets")
        .select("id,storage_path")
        .eq("community_id", about.community_id)
        .eq("status", "active")
        .in("id", assetIds);
      const paths = new Map(
        (assets ?? []).map((asset) => [asset.id, asset.storage_path]),
      );
      const [iconSigned, coverSigned] = await Promise.all([
        about.icon_asset_id && paths.get(about.icon_asset_id)
          ? admin.storage
              .from("community-media")
              .createSignedUrl(paths.get(about.icon_asset_id)!, 3600)
          : Promise.resolve({ data: null }),
        about.cover_asset_id && paths.get(about.cover_asset_id)
          ? admin.storage
              .from("community-media")
              .createSignedUrl(paths.get(about.cover_asset_id)!, 3600)
          : Promise.resolve({ data: null }),
      ]);
      iconUrl = iconSigned.data?.signedUrl ?? null;
      coverUrl = coverSigned.data?.signedUrl ?? null;
    } catch {
      // The approved text profile remains usable if optional media signing fails.
    }
  }

  const activeMember = profileResult.data?.access_status === "active";
  const joiningResult = user
    ? await supabase.rpc("list_community_joining_settings", {
        p_community_id: about.community_id,
      })
    : { data: [], error: null };
  const joiningMode =
    ((joiningResult.data as { effective_mode: "open" | "approval" }[] | null) ??
      [])[0]?.effective_mode ??
    (about.community_type === "private" ? "approval" : "open");
  const location = [about.next_event_city, about.next_event_country]
    .filter(Boolean)
    .join(", ");

  return (
    <main className={`community-about-page accent-${about.accent_key}`}>
      <header className="community-about-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            Her Africa Table<small>Community</small>
          </span>
        </Link>
        <nav aria-label="Community page actions">
          <Link href="/">About Her Africa Table</Link>
          <Link href={user ? "/home" : "/sign-in"}>
            {user ? "Member home" : "Sign in"}
          </Link>
        </nav>
      </header>

      <section className={`community-about-hero${coverUrl ? " has-cover" : ""}`}>
        {coverUrl ? (
          <figure>
            <img
              alt={about.cover_alt_text ?? ""}
              height={about.cover_height ?? undefined}
              src={coverUrl}
              width={about.cover_width ?? undefined}
            />
          </figure>
        ) : null}
        <div className="community-about-hero-copy">
          <div className="community-about-title">
            {iconUrl ? (
              <img
                alt={about.icon_alt_text ?? ""}
                height={about.icon_height ?? undefined}
                src={iconUrl}
                width={about.icon_width ?? undefined}
              />
            ) : (
              <span aria-hidden="true">{about.name.slice(0, 1)}</span>
            )}
            <div>
              <p className="eyebrow">
                {about.community_type === "private"
                  ? "Private, host-approved Community"
                  : "Her Africa Table Community"}
              </p>
              <h1>{about.name}</h1>
            </div>
          </div>
          <strong>{about.tagline}</strong>
          <p>{about.about_summary}</p>
        </div>

        <aside className="community-about-join-card">
          <span>Membership</span>
          <strong>{accessLabel(about)}</strong>
          {about.member_count !== null ? (
            <p>
              {about.member_count} member
              {Number(about.member_count) === 1 ? "" : "s"} at the table
            </p>
          ) : (
            <p>A deliberately reviewed Community.</p>
          )}
          <CommunityAboutAction
            accessType={about.offer_access_type}
            activeMember={activeMember}
            commerceEnabled={about.commerce_enabled}
            communityId={about.community_id}
            joiningMode={joiningMode}
            membershipStatus={about.membership_status}
            paymentMode={about.offer_payment_mode}
            signedIn={Boolean(user)}
            slug={about.slug}
          />
        </aside>
      </section>

      <section className="community-about-details">
        <article className="community-about-audience">
          <p className="eyebrow">Who this is for</p>
          <h2>A room with a clear purpose.</h2>
          <p>{about.audience_summary}</p>
        </article>

        <article className="community-about-benefits">
          <p className="eyebrow">Inside the Community</p>
          <h2>What members receive.</h2>
          <ol>
            {about.about_benefits.map((benefit, index) => (
              <li key={benefit}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{benefit}</strong>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="community-about-host">
        <div>
          <p className="eyebrow">Community host</p>
          <h2>Led with clarity and care.</h2>
        </div>
        <article>
          <span aria-hidden="true">
            {about.host_display_name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{about.host_display_name}</strong>
            <p>{about.host_intro}</p>
          </div>
        </article>
      </section>

      {about.next_event_slug && about.next_event_starts_at ? (
        <section className="community-about-event">
          <div>
            <p className="eyebrow">Next at the table</p>
            <h2>{about.next_event_title}</h2>
            {about.next_event_summary ? <p>{about.next_event_summary}</p> : null}
          </div>
          <aside>
            <span>{formatEventDate(about.next_event_starts_at)}</span>
            <strong>
              {about.next_event_format === "virtual"
                ? "Online"
                : location || "Location shared on the event page"}
            </strong>
            <Link href={`/events/${about.next_event_slug}`}>View event →</Link>
          </aside>
        </section>
      ) : null}

      <section className="community-about-trust">
        <div>
          <p className="eyebrow">A protected table</p>
          <h2>Private conversation stays private.</h2>
        </div>
        <p>
          This page explains the Community without revealing its conversations,
          member list or joining details. Access follows Her Africa Table
          membership, Community approval and payment rules where applicable.
        </p>
        <Link href="/community-guidelines">Read the Community Guidelines</Link>
      </section>

      <footer className="community-about-footer">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>Her Africa Table</span>
        </Link>
        <p>Meet. Connect. Rise.</p>
      </footer>
    </main>
  );
}
