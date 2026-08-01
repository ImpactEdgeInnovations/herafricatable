import Link from "next/link";

export type CommunityRosterMember = {
  avatar_url: string | null;
  city: string | null;
  company: string | null;
  country: string | null;
  display_name: string;
  job_title: string | null;
  membership_role: "member" | "moderator" | "owner";
  user_id: string;
};

export function CommunityMemberRoster({
  members,
}: {
  members: CommunityRosterMember[];
}) {
  if (!members.length) return null;

  return (
    <section
      aria-labelledby="community-members-title"
      className="community-member-roster"
      id="members"
    >
      <header>
        <div>
          <p className="eyebrow">Members</p>
          <h2 id="community-members-title">Meet the people here.</h2>
        </div>
        <p>
          Read a member’s profile before asking to connect. Contact details
          stay private until you both agree.
        </p>
      </header>
      <div>
        {members.map((member) => (
          <Link href={`/members/${member.user_id}`} key={member.user_id}>
            {member.avatar_url ? (
              <img alt="" src={member.avatar_url} />
            ) : (
              <span aria-hidden="true">
                {member.display_name.charAt(0).toUpperCase()}
              </span>
            )}
            <strong>{member.display_name}</strong>
            <small>
              {[member.job_title, member.company].filter(Boolean).join(" · ") ||
                "Community member"}
            </small>
            <small>
              {[member.city, member.country].filter(Boolean).join(", ")}
              {member.membership_role !== "member"
                ? `${member.city || member.country ? " · " : ""}${member.membership_role}`
                : ""}
            </small>
          </Link>
        ))}
      </div>
      <footer>
        <Link className="button button-outline" href="/network">
          Browse all members
        </Link>
      </footer>
    </section>
  );
}
