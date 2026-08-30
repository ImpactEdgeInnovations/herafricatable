import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import "./globals.css";
import "./community-compact.css";
import "./membership-waiting.css";
import "./admin-community.css";
import "./admin-oversight.css";
import "./core-product-polish.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.herafricatable.com",
  ),
  title: {
    default: "Her Africa Table",
    template: "%s | Her Africa Table",
  },
  description:
    "A trusted professional network for African women, built around real-world events.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  applicationName: "Her Africa Table",
  openGraph: {
    type: "website",
    locale: "en_KE",
    siteName: "Her Africa Table",
    title: "Her Africa Table — Meet. Connect. Rise.",
    description:
      "A trusted professional network for African women, built around real-world events and relationships that continue beyond the room.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Her Africa Table — Meet. Connect. Rise.",
    description:
      "A trusted professional network for African women, built around real-world events.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Her Africa Table",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#5f1722",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <PwaProvider>
          <a className="skip-link" href="#hat-page-content">
            Skip to main content
          </a>
          <div id="hat-page-content" tabIndex={-1}>
            {children}
          </div>
        </PwaProvider>
      </body>
    </html>
  );
}
