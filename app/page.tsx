import { hasSupabasePublicEnv } from "@/lib/env";

export default function HomePage() {
  return (
    <main>
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">A trusted professional network</p>
        <h1 id="page-title">Her Africa Table</h1>
        <p className="intro">
          Where African women meet, connect, learn, and keep building together long
          after the event ends.
        </p>
        <div className="status" role="status">
          <span className={hasSupabasePublicEnv ? "dot ready" : "dot"} />
          {hasSupabasePublicEnv
            ? "Supabase public configuration detected"
            : "Add your Supabase project URL in .env.local"}
        </div>
      </section>
    </main>
  );
}

