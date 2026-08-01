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
      ? "Your completed Circle"
      : "Your Circle is ready";
  }
  if (program.cycle_status === "open") {
    return program.opt_in_status === "opted_in"
      ? "In the matching pool"
      : "Open for matching";
  }
  if (program.cycle_status === "matched") return "Matching under review";
  return program.cycle_status === "completed"
    ? "Cycle completed"
    : "Cycle published";
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
          <p className="eyebrow">Smaller circles</p>
          <h2>Go deeper with a few.</h2>
        </div>
        <p>
          Time-bound, human-reviewed cohorts connected to this community. Your
          Circle room remains visible only to assigned members.
        </p>
      </header>
      <div className="community-circle-grid">
        {programs.map((program) => (
          <article key={program.cycle_id}>
            <div className="community-circle-state">
              <span>{programState(program)}</span>
              <small>{program.group_size} women per Circle</small>
            </div>
            <h3>{program.my_circle_name ?? program.cycle_name}</h3>
            <p>{program.cycle_description}</p>
            <dl>
              <div>
                <dt>Begins</dt>
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
                  <dt>Your room</dt>
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
                  ? "Review your opt-in"
                  : "Review and opt in"}
              </Link>
            ) : (
              <span className="community-circle-private-note">
                Assignment details stay private until your Circle is published.
              </span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
