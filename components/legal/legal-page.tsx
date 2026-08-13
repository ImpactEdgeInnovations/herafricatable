import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Her Africa Table<small>Meet. Connect. Rise.</small></span>
        </Link>
        <Link className="button button-small button-outline" href="/sign-in">Sign in</Link>
      </header>
      <article className="legal-document">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-intro">{intro}</p>
        <aside><strong>Pilot notice</strong>This document describes how the limited pilot operates. It still requires qualified legal review before a wider public launch.</aside>
        <div className="legal-content">{children}</div>
      </article>
      <footer className="legal-footer"><Link href="/">Return home</Link><a href="mailto:support@herafricatable.com">Contact support</a></footer>
    </main>
  );
}
