import Link from "next/link";
import { CommunityAvatar } from "./community-avatar";
import { CommunityConnectionActions, type CommunityConnection } from "./community-connection-actions";

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
  currentUserId,
  connections = [],
  connectionsReady = false,
}: {
  members: CommunityRosterMember[];
  currentUserId?: string;
  connections?: CommunityConnection[];
  connectionsReady?: boolean;
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
          <article key={member.user_id}><Link href={member.user_id===currentUserId?"/profile":`/members/${member.user_id}`}>
            <CommunityAvatar name={member.display_name} src={member.avatar_url} />
            <strong>{member.display_name}</strong>
            {member.membership_role !== "member" ? <span className="community-role-badge">{member.membership_role === "owner" ? "Host" : "Moderator"}</span> : null}
            <small>
              {[member.job_title, member.company].filter(Boolean).join(" · ") ||
                "Community member"}
            </small>
            <small>
              {[member.city, member.country].filter(Boolean).join(", ")}
            </small>
          </Link><CommunityConnectionActions memberId={member.user_id} self={member.user_id===currentUserId} connection={connections.find(item=>item.other_user_id===member.user_id)??null} ready={connectionsReady} /></article>
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
