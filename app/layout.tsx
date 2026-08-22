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
