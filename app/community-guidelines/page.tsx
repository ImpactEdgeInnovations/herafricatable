import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Community Guidelines" };

export default function CommunityGuidelinesPage() {
  return (
    <LegalPage eyebrow="How we share the table" title="Community Guidelines" intro="The table works when every member can contribute with confidence, curiosity, generosity, and clear professional boundaries.">
      <section><h2>Lead with respect</h2><p>Engage the person, not only the opportunity. Harassment, intimidation, discrimination, unwanted sexual attention, threats, or demeaning conduct are not welcome.</p></section>
      <section><h2>Protect confidence</h2><p>Do not publish, sell, scrape, forward, or misuse member information, private messages, community discussions, event details, or personal stories shared in confidence.</p></section>
      <section><h2>Be useful, not extractive</h2><p>Make specific asks, offer context, follow through, disclose commercial interests, and avoid unsolicited bulk pitching, recruitment spam, deceptive opportunities, or repeated unwanted contact.</p></section>
      <section><h2>Use safety tools</h2><p>You can decline a connection quietly, block a member, or report a profile, message, or post. Reports include a reason so the moderation team can respond proportionately.</p></section>
      <section><h2>Moderation approach</h2><p>Actions may include guidance, content removal, warnings, restrictions, suspension, or removal. Private-content review is report-triggered and moderator access is audited.</p></section>
    </LegalPage>
  );
}
