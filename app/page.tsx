import { LandingPage } from "@/components/landing/landing-page";
import { getLandingEvents } from "@/lib/landing-events";
import { getSupabasePublicEnv } from "@/lib/env";
import { upcomingCountdown, type CountdownEvent } from "@/lib/upcoming-countdown";
import { absoluteUrl, publicPageMetadata, serializeJsonLd, siteDescription } from "@/lib/seo";

export const revalidate = 60;
export const metadata = {
  ...publicPageMetadata("African Women’s Network", siteDescription, "/"),
  title: { absolute: "Her Africa Table | African Women’s Network" },
};

async function getPublishedCountdown(): Promise<CountdownEvent | null> {
  try {
    const { url, publishableKey } = getSupabasePublicEnv();
    const endpoint = new URL(`${url}/rest/v1/site_event_countdown`);
    endpoint.searchParams.set("id", "eq.true");
    endpoint.searchParams.set("is_published", "eq.true");
    endpoint.searchParams.set("starts_at", `gt.${new Date().toISOString()}`);
    endpoint.searchParams.set("select", "event_name,city,starts_at");
    endpoint.searchParams.set("limit", "1");
    const response = await fetch(endpoint, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
      },
      next: { revalidate },
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as CountdownEvent[];
    const configured = upcomingCountdown(rows[0]);
    if (!configured) return null;

    // A standalone countdown must not announce a draft or an event that has
    // never been approved for the public Events page.
    const publicEventUrl = new URL(`${url}/rest/v1/events`);
    publicEventUrl.searchParams.set("select", "slug,title,starts_at");
    publicEventUrl.searchParams.set("status", "eq.published");
    publicEventUrl.searchParams.set("audience", "eq.public");
    publicEventUrl.searchParams.set("title", `eq.${configured.event_name}`);
    publicEventUrl.searchParams.set("starts_at", `eq.${configured.starts_at}`);
    publicEventUrl.searchParams.set("limit", "1");
    const publicEventResponse = await fetch(publicEventUrl, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
      },
      next: { revalidate },
      signal: AbortSignal.timeout(4500),
    });
    if (!publicEventResponse.ok) return null;
    const publicEvents = (await publicEventResponse.json()) as {
      slug: string; title: string; starts_at: string;
    }[];
    const published = publicEvents[0];
    return published
      ? upcomingCountdown({ ...configured, event_name: published.title,
          slug: published.slug, starts_at: published.starts_at })
      : null;
  } catch {
    return null;
  }
}

async function getOpenPilot(): Promise<boolean> {
  try {
    const { url, publishableKey } = getSupabasePublicEnv();
    const response = await fetch(`${url}/rest/v1/rpc/get_membership_intake_mode`, {
      method: "POST",
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, "Content-Type": "application/json" },
      body: "{}",
      next: { revalidate },
      signal: AbortSignal.timeout(4500),
    });
    return response.ok && (await response.json()) === "trusted_auto";
  } catch { return false; }
}

export default async function HomePage() {
  const [countdown, openPilot, listing] = await Promise.all([getPublishedCountdown(), getOpenPilot(), getLandingEvents()]);
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", "@id": absoluteUrl("/#organization"), name: "Her Africa Table", url: absoluteUrl(), description: siteDescription, logo: absoluteUrl("/icons/her-africa-table-512.png"), email: "support@herafricatable.com" },
        { "@type": "WebSite", "@id": absoluteUrl("/#website"), name: "Her Africa Table", url: absoluteUrl(), publisher: { "@id": absoluteUrl("/#organization") }, inLanguage: "en" },
      ],
    }) }} />
    <LandingPage countdown={countdown} openPilot={openPilot} listing={listing} />
  </>;
}
