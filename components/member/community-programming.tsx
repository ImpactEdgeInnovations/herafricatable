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
            <p className="eyebrow">Community events</p>
            <h2>Meet in person or online.</h2>
          </div>
          <p>
            Events chosen for this community. Meet members, learn together and
            continue the conversation afterwards.
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
                      {past ? "Past event" : dateFormat.format(new Date(gathering.starts_at))}
                      {" · "}
                      {gathering.city
                        ? `${gathering.city}, ${gathering.country}`
                        : gathering.format.replace("_", " ")}
                    </span>
                    <h3>{gathering.title}</h3>
                    <p>
                      {gathering.summary ||
                        "The community leader will share more details soon."}
                    </p>
                  </div>
                  <Link href={`/events/${gathering.slug}`}>
                    View event <span aria-hidden="true">→</span>
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="community-program-empty">
            <strong>No community event has been added yet.</strong>
            <p>
              The community leader can add a relevant event here. You can
              still browse the full event calendar.
            </p>
            <Link href="/events">View all events</Link>
          </div>
        )}
      </section>

      <section id="resources" className="community-programming-section">
        <header>
          <div>
            <p className="eyebrow">Recommended learning</p>
            <h2>Learn what helps you move forward.</h2>
          </div>
          <p>
            A short list of practical learning chosen by the community leader.
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
            <strong>No learning has been recommended yet.</strong>
            <p>
              Useful courses will appear here when the community leader adds
              them. You can still browse all available learning.
            </p>
            <Link href="/learning">Visit the learning studio</Link>
          </div>
        )}
      </section>

      {canManage ? (
        <footer className="community-host-callout">
          <div>
            <p className="eyebrow">Manage this community</p>
            <strong>Help members find what they need.</strong>
            <p>
              Review join requests, member needs, safety concerns, events and
              learning in one private place.
            </p>
          </div>
          <Link className="button button-outline" href={`/communities/${slug}/host`}>
            Open community controls
          </Link>
        </footer>
      ) : null}
    </section>
  );
}
