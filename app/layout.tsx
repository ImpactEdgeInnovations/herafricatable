import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Her Africa Table",
    template: "%s | Her Africa Table",
  },
  description:
    "A trusted professional network for African women, built around real-world events.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#hat-page-content">
          Skip to main content
        </a>
        <div id="hat-page-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
