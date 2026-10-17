export function CommunityRequestNote({message,unavailable=false}:{message?:string|null;unavailable?:boolean}) {
  if (unavailable) return <p className="community-request-note" role="status">The member’s message could not be loaded. Refresh before deciding.</p>;
  if (!message) return null;
  return <div className="community-request-note"><strong>Message to the Host</strong><p>{message}</p></div>;
}
