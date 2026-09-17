import type { Metadata } from "next";

export const siteDescription =
  "A private network for African women to build meaningful relationships through Communities, introductions and events, beginning in Nairobi, Kenya.";

export function getSiteUrl() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.herafricatable.com");
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid site URL");
    return url.origin;
  } catch {
    return "https://www.herafricatable.com";
  }
}

export function absoluteUrl(path = "/") {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

export function publicPageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(path) },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    openGraph: {
      type: "website",
      locale: "en_KE",
      siteName: "Her Africa Table",
      title: `${title} | Her Africa Table`,
      description,
      url: absoluteUrl(path),
      images: [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: "Her Africa Table — Meet. Connect. Rise." }],
    },
    twitter: { card: "summary_large_image", title: `${title} | Her Africa Table`, description, images: [absoluteUrl("/opengraph-image")] },
  };
}

// Escape HTML delimiters so user-authored titles cannot end a JSON-LD script.
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
