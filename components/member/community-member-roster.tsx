import Link from "next/link";
import { CommunityAvatar } from "./community-avatar";

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
          <h2 id="community-members-title">People</h2>
        </div>
        <p>
          Messages open once you both agree to connect. Contact details stay private.
        </p>
      </header>
      <div>
        {members.map((member) => (
          <Link href={`/members/${member.user_id}`} key={member.user_id}>
            <CommunityAvatar name={member.display_name} src={member.avatar_url} />
            <strong>{member.display_name}</strong>
            <small>
              {[member.job_title, member.company].filter(Boolean).join(" · ") ||
                "Community member"}
            </small>
            <small>
              {[member.city, member.country].filter(Boolean).join(", ")}
              {member.membership_role !== "member"
                ? `${member.city || member.country ? " · " : ""}${member.membership_role === "owner" ? "Host" : "Moderator"}`
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
