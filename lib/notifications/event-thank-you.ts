import {renderBrandedEmail} from "./template";

export type EventThankYou = {
  event_title:string; event_slug:string; guest_name:string; ends_at:string; timezone:string;
  host_name:string; organisation_name:string; host_message:string; has_recap:boolean; has_networking:boolean;
  community:{name:string;slug:string}|null;
};

/** Shared by the real email and Host's example preview; no guest list or photos. */
export function eventThankYouEmail(context:EventThankYou,siteUrl:string) {
  const base=new URL(siteUrl);
  if(base.protocol!=="https:")throw Error("A secure platform address is required");
  const origin=base.origin, event=`${origin}/events/${encodeURIComponent(context.event_slug)}`;
  const title=`Thank you for joining ${context.event_title}`.slice(0,160);
  const date=new Intl.DateTimeFormat("en-KE",{day:"numeric",month:"long",year:"numeric",timeZone:context.timezone}).format(new Date(context.ends_at));
  const host=[context.host_name,context.organisation_name].filter(Boolean).join(" · ");
  const body=`Hello ${context.guest_name},\n\nThank you for joining us at ${context.event_title}. It was good to have you at the table.`;
  const message=context.host_message.trim();
  const afterDetails=[message,`With thanks,\n${host}`].filter(Boolean).join("\n\n");
  const links=[...(context.has_networking?[{label:"People you met",href:`${event}#event-networking`}]:[]),
    {label:"Share your feedback",href:`${event}/follow-up`},
    ...(context.community?[{label:`Visit ${context.community.name}`,href:`${origin}/communities/${encodeURIComponent(context.community.slug)}`}]:[])];
  const href=context.has_recap?`${event}#event-recap`:event,buttonLabel=context.has_recap?"View the event recap":"Revisit the event";
  const html=renderBrandedEmail({title:"Thank you for being there.",body,details:[{label:"Your event",value:context.event_title},{label:"Date",value:date}],
    afterDetails,href,buttonLabel,secondaryLinks:links,preferenceNote:"You received this because your attendance was recorded and event emails are enabled. You can change optional emails in your notification settings."});
  const text=`${body}\n\n${date}\n\n${afterDetails}\n\n${buttonLabel}: ${href}\n${links.map(l=>`${l.label}: ${l.href}`).join("\n")}\n\nYou can change optional emails in your notification settings.`;
  return {title,html,text};
}
