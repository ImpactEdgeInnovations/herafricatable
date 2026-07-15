import Link from "next/link";
import { faqs } from "@/lib/content/faqs";

export const metadata = {
  title: "Questions",
  description: "Answers about Her Africa Table membership, privacy, events, and access.",
};

export default function FrequentlyAskedQuestionsPage() {
  return (
    <main className="legal-page faq-page">
      <header className="legal-header">
        <Link className="brand" href="/" aria-label="Her Africa Table home">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Her Africa Table<small>Meet. Connect. Rise.</small></span>
        </Link>
        <Link className="text-link" href="/">Return home</Link>
      </header>

      <section className="faq-section faq-standalone" aria-labelledby="faq-title">
        <div className="faq-heading">
          <p className="eyebrow">Membership notes</p>
          <h1 id="faq-title">Before you take your seat.</h1>
          <p>Still need help? <a href="mailto:support@herafricatable.com">Speak with the team.</a></p>
        </div>
        <div className="faq-list">
          {faqs.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary><span>{String(index + 1).padStart(2, "0")}</span>{question}<i>+</i></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
