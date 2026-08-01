import Link from "next/link";

export type CommunityCircleProgram = {
  cycle_id: string;
  cycle_name: string;
  cycle_description: string;
  cycle_status: "completed" | "matched" | "open" | "published";
  starts_at: string;
  ends_at: string;
  group_size: number;
  opt_in_status: string | null;
  my_circle_id: string | null;
  my_circle_name: string | null;
  my_circle_member_count: number | null;
  my_circle_prompt_count: number | null;
};

function programState(program: CommunityCircleProgram) {
  if (program.my_circle_id) {
    return program.cycle_status === "completed"
      ? "Completed"
      : "Your Circle is open";
  }
  if (program.cycle_status === "open") {
    return program.opt_in_status === "opted_in"
      ? "You asked to join"
      : "Open to join";
  }
  if (program.cycle_status === "matched") return "Your group is being prepared";
  return program.cycle_status === "completed"
    ? "Completed"
    : "Circle groups are open";
}

export function CommunityCircles({
  programs,
}: {
  programs: CommunityCircleProgram[];
}) {
  if (!programs.length) return null;

  return (
    <section className="community-circles" id="circles">
      <header>
        <div>
          <p className="eyebrow">Small groups</p>
          <h2>Get to know a few members better.</h2>
        </div>
        <p>
          Circles bring a small group together for a set period. Only people
          assigned to your Circle can see its members and conversations.
        </p>
      </header>
      <div className="community-circle-grid">
        {programs.map((program) => (
          <article key={program.cycle_id}>
            <div className="community-circle-state">
              <span>{programState(program)}</span>
              <small>Up to {program.group_size} members</small>
            </div>
            <h3>{program.my_circle_name ?? program.cycle_name}</h3>
            <p>{program.cycle_description}</p>
            <dl>
              <div>
                <dt>Starts</dt>
                <dd>
                  {new Intl.DateTimeFormat("en-KE", {
                    dateStyle: "medium",
                  }).format(new Date(program.starts_at))}
                </dd>
              </div>
              <div>
                <dt>Ends</dt>
                <dd>
                  {new Intl.DateTimeFormat("en-KE", {
                    dateStyle: "medium",
                  }).format(new Date(program.ends_at))}
                </dd>
              </div>
              {program.my_circle_id ? (
                <div>
                  <dt>Your group</dt>
                  <dd>
                    {program.my_circle_member_count} members ·{" "}
                    {program.my_circle_prompt_count} prompts
                  </dd>
                </div>
              ) : null}
            </dl>
            {program.my_circle_id ? (
              <Link
                className="button button-primary"
                href={`/circles?circle=${program.my_circle_id}`}
              >
                Enter your Circle
              </Link>
            ) : program.cycle_status === "open" ? (
              <Link className="button button-outline" href="/circles">
                {program.opt_in_status === "opted_in"
                  ? "View your request"
                  : "Join this Circle"}
              </Link>
            ) : (
              <span className="community-circle-private-note">
                We’ll show your Circle after the group is confirmed.
              </span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
