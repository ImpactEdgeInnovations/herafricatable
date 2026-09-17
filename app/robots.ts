import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

const siteUrl = getSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/events", "/faq", "/privacy", "/terms", "/community-guidelines"],
      disallow: [
        "/admin/",
        "/auth/",
        "/api/",
        "/apply",
        "/circles",
        "/communities",
        "/communities/",
        "/continue",
        "/guide",
        "/explore",
        "/home",
        "/join/",
        "/learning/",
        "/learning",
        "/orders/",
        "/offline",
        "/events/*/register",
        "/events/*/pass",
        "/events/*/feedback",
        "/events/*/follow-up",
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
