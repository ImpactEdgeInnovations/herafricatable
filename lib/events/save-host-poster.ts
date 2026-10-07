import type {SupabaseClient} from "@supabase/supabase-js";

export async function saveHostPoster(client:SupabaseClient,input:{eventId:string;path:string;file:File;alt:string;previousDraft:string|null;previousPublished:string|null}) {
  const bucket=client.storage.from("event-host-covers");
  const uploaded=await bucket.upload(input.path,input.file,{cacheControl:"3600",contentType:input.file.type,upsert:false});
  if(uploaded.error)throw uploaded.error;
  let saveError:unknown=null;
  try {
    const saved=await client.rpc("save_event_host_cover",{p_event_id:input.eventId,p_storage_path:input.path,p_alt_text:input.alt});
    saveError=saved.error;
  } catch(error){saveError=error;}
  let record:{draft_storage_path:string;published_storage_path:string|null}|null=null;
  try {
    const result=await client.from("event_host_covers").select("draft_storage_path,published_storage_path").eq("event_id",input.eventId).maybeSingle();
    if(!result.error)record=result.data;
  } catch { /* A confirmed save is not undone by a failed status read. */ }
  const matched=record?.draft_storage_path===input.path||record?.published_storage_path===input.path;
  if(saveError&&!matched) {
    // The request may have committed before a connection failure. Never delete
    // this upload or the old published image on an ambiguous response.
    throw new Error("Your image uploaded, but we could not confirm it was saved. Reopen the Poster tab and check before trying again. Your existing live image has not been removed.");
  }
  let cleanupPending=false;
  if(input.previousDraft && input.previousDraft!==input.previousPublished && input.previousDraft!==input.path) {
    try {cleanupPending=Boolean((await bucket.remove([input.previousDraft])).error);}
    catch {cleanupPending=true;}
  }
  return {status:record?.published_storage_path===input.path?"live":matched?"private":"saved",cleanupPending} as const;
}
