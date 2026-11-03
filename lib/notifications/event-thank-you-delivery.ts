import "server-only";
import {createAdminClient} from "@/lib/supabase/admin";
import {eventThankYouEmail,type EventThankYou} from "./event-thank-you";

export async function prepareEventThankYou(job:{job_id:string;dedupe_key:string;template_key:string},siteUrl:string) {
  if(!job.dedupe_key.startsWith("event-thank-you:"))return null;
  if(job.template_key!=="event"||!/^event-thank-you:[0-9a-f-]{36}:[0-9a-f-]{36}$/.test(job.dedupe_key))throw Error("event_thank_you_job_invalid");
  const {data,error}=await createAdminClient().rpc("get_event_thank_you_email",{p_job_id:job.job_id});
  if(error)throw Error("event_thank_you_check_unavailable");
  if(!data)throw Object.assign(new Error("event_thank_you_no_longer_eligible"),{code:"EVENT_THANK_YOU_INELIGIBLE"});
  return eventThankYouEmail(data as EventThankYou,siteUrl);
}
