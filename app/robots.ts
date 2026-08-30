import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://www.herafricatable.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/events", "/faq", "/privacy", "/terms", "/community-guidelines"],
      disallow: [
        "/admin/",
        "/api/",
        "/apply",
        "/circles",
        "/communities",
        "/communities/",
        "/continue",
        "/guide",
        "/home",
        "/join/",
        "/learning/",
        "/members/",
        "/membership",
        "/messages",
        "/network",
        "/notifications",
        "/onboarding",
        "/opportunities",
        "/perks",
        "/profile",
        "/referrals",
        "/search",
        "/settings",
        "/sign-in",
        "/support",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
