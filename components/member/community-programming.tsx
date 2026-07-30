import Link from "next/link";

export type CommunityGathering = {
  event_id: string;
  slug: string;
  title: string;
  summary: string | null;
  format: string;
  starts_at: string;
  ends_at: string;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  is_featured: boolean;
};

export type CommunityResource = {
  course_id: string;
  slug: string;
  title: string;
  summary: string;
  instructor_name: string;
  access_type: string;
  lesson_count: number;
  enrollment_status: string | null;
  is_featured: boolean;
};

const dateFormat = new Intl.DateTimeFormat("en-KE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function accessLabel(value: string) {
  if (value === "event_bundle") return "Included with an event";
  if (value === "manual") return "Host-approved access";
  if (value === "purchase") return "Paid learning";
  return "Open to members";
}

export function CommunityProgramming({
  canManage,
  gatherings,
  resources,
  slug,
}: {
  canManage: boolean;
  gatherings: CommunityGathering[];
  resources: CommunityResource[];
  slug: string;
}) {
  return (
    <section className="community-programming" aria-label="Community programming">
      <section id="gatherings" className="community-programming-section">
        <header>
          <div>
            <p className="eyebrow">Gatherings</p>
            <h2>Meet with shared context.</h2>
          </div>
          <p>
            Events selected for this community—so the conversation can begin
            before the room and continue after it.
          </p>
        </header>
        {gatherings.length ? (
          <div className="community-gathering-list">
            {gatherings.map((gathering) => {
              const past = new Date(gathering.ends_at).getTime() < Date.now();
              return (
                <article key={gathering.event_id}>
                  <div className="community-program-date">
                    <strong>
                      {new Intl.DateTimeFormat("en-KE", {
                        day: "2-digit",
                      }).format(new Date(gathering.starts_at))}
                    </strong>
                    <span>
                      {new Intl.DateTimeFormat("en-KE", {
                        month: "short",
                      }).format(new Date(gathering.starts_at))}
                    </span>
                  </div>
                  <div>
                    <span>
                      {past ? "Past gathering" : dateFormat.format(new Date(gathering.starts_at))}
                      {" · "}
                      {gathering.city
                        ? `${gathering.city}, ${gathering.country}`
                        : gathering.format.replace("_", " ")}
                    </span>
                    <h3>{gathering.title}</h3>
                    <p>
                      {gathering.summary ||
                        "The host will share the gathering details shortly."}
                    </p>
                  </div>
                  <Link href={`/events/${gathering.slug}`}>
                    View gathering <span aria-hidden="true">→</span>
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="community-program-empty">
            <strong>The next gathering is being considered.</strong>
            <p>
              Your host will add an event when it is relevant to this community.
              The main event calendar is still available.
            </p>
            <Link href="/events">View all events</Link>
          </div>
        )}
      </section>

      <section id="resources" className="community-programming-section">
        <header>
          <div>
            <p className="eyebrow">Resources</p>
            <h2>Learn from what the room needs.</h2>
          </div>
          <p>
            A small, host-curated shelf of practical learning—not an endless
            library.
          </p>
        </header>
        {resources.length ? (
          <div className="community-resource-grid">
            {resources.map((resource) => (
              <article key={resource.course_id}>
                <span>
                  {accessLabel(resource.access_type)}
                  {resource.is_featured ? " · Host pick" : ""}
                </span>
                <h3>{resource.title}</h3>
                <p>{resource.summary}</p>
                <footer>
                  <small>
                    {resource.instructor_name} · {resource.lesson_count}{" "}
                    {resource.lesson_count === 1 ? "lesson" : "lessons"}
                  </small>
                  <Link href={`/learning/${resource.slug}`}>
                    {resource.enrollment_status ? "Continue" : "Open resource"}{" "}
                    <span aria-hidden="true">→</span>
                  </Link>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="community-program-empty">
            <strong>Your resource shelf is intentionally quiet.</strong>
            <p>
              Relevant learning will appear here after the host reviews it and
              the learning studio is available.
            </p>
            <Link href="/learning">Visit the learning studio</Link>
          </div>
        )}
      </section>

      {canManage ? (
        <footer className="community-host-callout">
          <div>
            <p className="eyebrow">For hosts</p>
            <strong>Shape what this room needs next.</strong>
            <p>
              Review admissions, unanswered Asks, safety signals and community
              programming from one private workspace.
            </p>
          </div>
          <Link className="button button-outline" href={`/communities/${slug}/host`}>
            Open host workspace
          </Link>
        </footer>
      ) : null}
    </section>
  );
}
