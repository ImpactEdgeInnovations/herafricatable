import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of Membership" };

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Membership agreement" title="Terms of Membership" intro="Membership is an invitation into a trusted professional network and comes with responsibilities to the women sharing that space.">
      <section><h2>Eligibility and approval</h2><p>Signing in verifies an identity but does not guarantee membership. Access may require an invitation, approved registration, valid payment, or an administrative review.</p></section>
      <section><h2>Member responsibility</h2><p>Members must provide accurate information, protect account access, respect privacy, avoid harassment or spam, and use professional information only for legitimate relationship-building.</p></section>
      <section><h2>Events and payments</h2><p>Ticket availability, refund terms, event changes, membership duration, renewal, pricing, taxes, and payment methods will be displayed before purchase. Manual registration remains pending until verified by the team.</p></section>
      <section><h2>Moderation</h2><p>Her Africa Table may warn, restrict, suspend, or remove accounts to protect members or comply with law. Reports are reviewed according to the Community Guidelines and documented moderation procedures.</p></section>
      <section><h2>Changes and contact</h2><p>Material changes will be communicated with an effective date and a versioned acceptance record where required. Questions can be sent to <a href="mailto:support@herafricatable.com">support@herafricatable.com</a>.</p></section>
    </LegalPage>
  );
}
