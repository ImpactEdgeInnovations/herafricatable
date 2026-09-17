import type { MetadataRoute } from "next";
import { getSiteUrl, absoluteUrl } from "@/lib/seo";
import { getPublicEventSeo } from "@/lib/public-event-seo";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const events = await getPublicEventSeo();
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/events`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/events/past`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/community-guidelines`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/terms`, changeFrequency: "yearly", priority: 0.3 },
    ...events.map((event) => ({
      url: absoluteUrl(`/events/${encodeURIComponent(event.slug)}`),
      ...(event.updated_at && !Number.isNaN(Date.parse(event.updated_at)) ? { lastModified: new Date(event.updated_at) } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
