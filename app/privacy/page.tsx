import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy Notice" };

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Trust and privacy" title="Privacy Notice" intro="Her Africa Table is designed to give members useful professional visibility without treating private information as public by default.">
      <section><h2>Information we use</h2><p>We use account identity, professional profile information, event registration, membership status, connections, messages, community participation, course progress, support requests, reports, and payment records needed to operate the platform.</p></section>
      <section><h2>What members can see</h2><p>Directory-safe profile information may be visible to eligible members. Phone, email, and social links are gated until you accept a connection. Visibility can be paused without deleting existing relationships.</p></section>
      <section><h2>Safety access</h2><p>Her Africa Table does not provide administrators with standing access to private messages. Reported conversations or private-community content may be reviewed for a specific safety case, and moderator access is logged.</p></section>
      <section><h2>Your choices</h2><p>You can update your profile, manage communication preferences, pause discovery, block or report members, request a copy of your information, and request account deletion subject to lawful retention requirements.</p></section>
      <section><h2>Contact</h2><p>Privacy questions can be sent to <a href="mailto:support@herafricatable.com">support@herafricatable.com</a>. The final controller identity, retention schedule, and jurisdiction-specific rights will be added after legal review.</p></section>
    </LegalPage>
  );
}
