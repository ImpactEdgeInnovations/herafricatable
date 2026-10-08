const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

// Inputs are the existing member-authorised server projections, never a wider directory.
export function communityReturnSuggestion({ community, enabled, featureError, communityError, activityError }) {
  if (featureError || communityError) return {
    kicker: 'Your Community', title: 'Your Communities', action: 'Try opening Communities', href: '/communities',
    description: 'We could not load your groups just now. Your membership has not changed.',
  };
  if (!enabled) return {
    kicker: 'Your Community', title: 'Communities are opening soon', action: 'See Communities', href: '/communities',
    description: 'You can explore what is coming. Joining opens when the team is ready.',
  };
  if (!community) return {
    kicker: 'Your Community', title: 'Find a Community', action: 'Find a Community', href: '/communities',
    description: 'Find a group around an interest, a shared goal or a place.',
  };
  const conversations = count(community.new_conversation_count), replies = count(community.new_reply_count);
  const hasActivity = !activityError && count(community.new_activity_count) > 0;
  const description = activityError
    ? 'New updates could not load. You can still open your Community.'
    : conversations && replies
      ? 'New conversations and replies have been added since your last visit.'
      : replies
        ? 'Members have added replies since your last visit.'
        : conversations
          ? 'New conversations are waiting since your last visit.'
          : hasActivity
            ? 'There are new updates since your last visit.'
            : community.tagline || 'Ask a question, share an idea or see what members are discussing.';
  return {
    kicker: 'Your Community', title: community.name, description,
    action: hasActivity ? 'Catch up' : 'Open Community',
    href: `/communities/${community.slug}${hasActivity && (conversations || replies) ? '?view=conversations' : ''}`,
  };
}

export function recentPastEvent(events, now = Date.now()) {
  return events.filter(event => {
    const ended = Date.parse(event.ends_at || '');
    return Number.isFinite(ended) && ended <= now && now - ended <= 14 * 24 * 60 * 60 * 1000;
  }).sort((left,right) => Date.parse(right.ends_at) - Date.parse(left.ends_at))[0] ?? null;
}

export function memberNextSuggestion({ unreadMessages, dueFollowups, pastEvent, unreadNotifications, fallback }) {
  const messages = count(unreadMessages), updates = count(unreadNotifications);
  if (messages) return {
    label: 'Continue a conversation', action: 'Open messages', href: '/messages',
    description: `${messages} unread message${messages === 1 ? '' : 's'} waiting for you.`,
  };
  if (dueFollowups.length) return {
    label: 'Keep in touch', action: 'See your reminders', href: '/network#network-connections',
    description: dueFollowups.length === 1
      ? `${dueFollowups[0].next_step} — ${dueFollowups[0].display_name}`
      : 'Your private follow-up reminders are ready.',
  };
  if (pastEvent) return {
    label: 'After your event', action: 'Revisit the event', href: `/events/${pastEvent.slug}/follow-up`,
    description: `Revisit ${pastEvent.title}, see any published recap and choose how to keep in touch.`,
  };
  if (updates) return {
    label: 'Your updates', action: 'See updates', href: '/notifications',
    description: `${updates} new update${updates === 1 ? '' : 's'} from your Communities and events.`,
  };
  return fallback;
}
