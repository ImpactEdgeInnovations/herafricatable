import "server-only";
import { cache } from "react";
import { getSupabasePublicEnv } from "@/lib/env";

export type PublicEventSeo = {
  slug: string;
  title: string;
  summary: string | null;
  updated_at: string;
};

// Never use cookies or the service key here. RLS plus explicit public filters
// ensure metadata/sitemaps cannot expand with an authenticated staff session.
export const getPublicEventSeo = cache(async (slug?: string): Promise<PublicEventSeo[]> => {
  try {
    const { url, publishableKey } = getSupabasePublicEnv();
    const query = new URLSearchParams({
      select: "slug,title,summary,updated_at",
      audience: "eq.public",
      status: "in.(published,completed)",
      order: "starts_at.desc",
      limit: "5000",
    });
    if (slug) query.set("slug", `eq.${slug}`);
    const response = await fetch(`${url}/rest/v1/events?${query}`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
      next: { revalidate: 300 },
    });
    if (!response.ok) return [];
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is PublicEventSeo =>
      Boolean(row && typeof row === "object" && typeof row.slug === "string" && typeof row.title === "string"),
    );
  } catch {
    return [];
  }
});
