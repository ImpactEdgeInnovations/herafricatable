import type {SupabaseClient} from "@supabase/supabase-js";

/** A failed file must not hide other authorised conversations in the page. */
export async function signCommunityAttachments<T extends {storage_path:string|null;signed_url?:string|null}>(client:SupabaseClient,attachments:T[]) {
  return Promise.all(attachments.map(async attachment=>{
    if(!attachment.storage_path)return attachment;
    try {
      const result=await client.storage.from("community-media").createSignedUrl(attachment.storage_path,3600);
      return {...attachment,signed_url:result.error?null:result.data?.signedUrl??null};
    }catch{return {...attachment,signed_url:null};}
  }));
}

/** Re-authorise the post before retrying. Never sign a cached path after access changes. */
export async function retryCommunityAttachment<T extends {post_id:string;storage_path:string|null;signed_url?:string|null}>(client:SupabaseClient,communityId:string,postId:string) {
  const result=await client.rpc("list_community_post_media_for_posts",{p_community_id:communityId,p_post_ids:[postId]});
  if(result.error)throw result.error;
  const attachment=((result.data??[]) as T[]).find(item=>item.post_id===postId);
  if(!attachment)return null;
  return (await signCommunityAttachments(client,[attachment]))[0];
}
