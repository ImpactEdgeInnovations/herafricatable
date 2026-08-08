import Link from "next/link";

export type HomeCommunity = {
  community_id: string;
  membership_status: string | null;
  name: string;
  slug: string;
  tagline?: string | null;
  description: string;
  new_activity_count?: number;
  new_conversation_count?: number;
  new_reply_count?: number;
  latest_activity_at?: string | null;
};

function communityPriority(community: HomeCommunity) {
  if (
    community.membership_status === "active" &&
    Number(community.new_activity_count ?? 0) > 0
  )
    return 0;
  if (community.membership_status === "invited") return 1;
  if (community.membership_status === "approved_pending_payment") return 2;
  if (community.membership_status === "active") return 3;
  if (community.membership_status === "requested") return 4;
  return 5;
}

export function CommunityReturnCard({
  communities,
  openingSoon = false,
}: {
  communities: HomeCommunity[];
  openingSoon?: boolean;
}) {
  if (openingSoon) {
    return (
      <section
        className="community-return-card is-preview"
        aria-labelledby="community-return-title"
      >
        <div>
          <p className="eyebrow">Community · Opening soon</p>
          <h2 id="community-return-title">A focused place to keep relationships moving.</h2>
          <p>
            We are preparing the first trusted groups before opening them.
            Meanwhile, you can see how joining, conversations and safety will
            work.
          </p>
        </div>
        <Link className="button button-outline" href="/communities">
          Preview Community
        </Link>
      </section>
    );
  }

  const memberStates = new Set([
    "active",
    "approved_pending_payment",
    "invited",
    "requested",
  ]);
  const community = [...communities]
    .filter((item) => memberStates.has(item.membership_status ?? ""))
    .sort((left, right) => {
      const priority = communityPriority(left) - communityPriority(right);
      if (priority) return priority;
      return (
        Number(right.new_activity_count ?? 0) -
        Number(left.new_activity_count ?? 0)
      );
    })[0];

  if (!community) {
    return (
      <section
        className="community-return-card is-discovery"
        aria-labelledby="community-return-title"
      >
        <div>
          <p className="eyebrow">Your Community</p>
          <h2 id="community-return-title">Find one room that feels relevant.</h2>
          <p>
            Start with a shared goal, interest or location. You can look around
            before deciding where to take part.
          </p>
        </div>
        <Link className="button button-primary" href="/communities">
          Find a Community
        </Link>
      </section>
    );
  }

  const newActivity = Number(community.new_activity_count ?? 0);
  const newConversations = Number(community.new_conversation_count ?? 0);
  const newReplies = Number(community.new_reply_count ?? 0);
  const isActive = community.membership_status === "active";
  const state =
    community.membership_status === "invited"
      ? {
          action: "Review invitation",
          label: "Invitation waiting",
          description:
            "You decide whether to join. Nothing is shared with the Community until you accept.",
        }
      : community.membership_status === "approved_pending_payment"
        ? {
            action: "Finish joining",
            label: "Ready for payment",
            description:
              "Your place has been approved. Review the payment option to finish joining.",
          }
        : community.membership_status === "requested"
          ? {
              action: "View request",
              label: "Request under review",
              description:
                "The Community leader has your request. You can check its status or cancel it at any time.",
            }
          : newActivity
            ? {
                action: "See new activity",
                label: `${newActivity} new update${newActivity === 1 ? "" : "s"}`,
                description: [
                  newConversations
                    ? `${newConversations} new conversation${newConversations === 1 ? "" : "s"}`
                    : "",
                  newReplies
                    ? `${newReplies} new repl${newReplies === 1 ? "y" : "ies"}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
              }
            : {
                action: "Open Community",
                label: "You are all caught up",
                description:
                  "Return when you want to contribute, ask for help or see what members are building.",
              };

  return (
    <section
      className={`community-return-card${newActivity ? " has-new-activity" : ""}`}
      aria-labelledby="community-return-title"
    >
      <div className="community-return-copy">
        <p className="eyebrow">Your Community</p>
        <h2 id="community-return-title">{community.name}</h2>
        <p>{community.tagline || community.description}</p>
      </div>
      <div className="community-return-state">
        <span>{state.label}</span>
        <p>{state.description}</p>
        <Link
          className={isActive ? "button button-primary" : "button button-outline"}
          href={isActive ? `/communities/${community.slug}` : "/communities"}
        >
          {state.action}
        </Link>
      </div>
    </section>
  );
}
