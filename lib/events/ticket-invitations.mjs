/** Optional invitations, never an entitlement or a token-bearing URL. */
export function ticketInvitationLinks(ticket){
  const origin='https://www.herafricatable.com';
  const links=[];
  if(ticket.community&&/^[a-z0-9-]+$/.test(ticket.community.slug))links.push({label:`Explore ${ticket.community.name}`,href:`${origin}/communities/${encodeURIComponent(ticket.community.slug)}`});
  if(ticket.guest_only)links.push({label:'Explore HAT membership',href:`${origin}/sign-in?mode=apply&next=${encodeURIComponent(`/events/${ticket.event_slug}#event-community`)}`});
  return links;
}
