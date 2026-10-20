export const communityConversationTopics = [
  { label: "Questions & ideas", value: "discussion" },
  { label: "Introduction", value: "introduction" },
  { label: "Ask for help", value: "ask" },
  { label: "Offer help", value: "offer" },
  { label: "Opportunity", value: "opportunity" },
  { label: "Useful links", value: "resource" },
  { label: "After a meetup", value: "event_follow_up" },
  { label: "Good news", value: "win" },
] as const;

/** A new post follows its browsed topic; unfinished text keeps its chosen topic. */
export function conversationTopicForStart({ filter, current, available, hasDraft, chosen }: {
  filter: string; current: string; available: readonly string[]; hasDraft: boolean; chosen: boolean;
}) {
  if (hasDraft || chosen) return current;
  if (available.includes(filter)) return filter;
  return available.includes(current) ? current : available[0] ?? "";
}
