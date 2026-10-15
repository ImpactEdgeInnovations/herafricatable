import { FeaturedSpotLinks } from "./featured-spot-links";
import { createClient } from "@/lib/supabase/server";

export async function FeaturedSpots({ kind }: { kind: "event" | "community" }) {
  const client = await createClient();
  const { data, error } = await client.from("featured_spot_placements").select("event_id,community_id,ends_at").not(`${kind}_id`, "is", null).lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()).eq("removed", false).order("starts_at").limit(3);
  if (error || !data?.length) return null;
  const { data: targets } = await client.from(kind === "event" ? "events" : "communities").select(kind === "event" ? "id,slug,title" : "id,slug,name").in("id", data.map(row => row.event_id ?? row.community_id));
  if (!targets?.length) return null;
  return <FeaturedSpotLinks kind={kind} items={data.flatMap(placement=>{const item=(targets as unknown as {id:string;slug:string;title?:string;name?:string}[]).find(item=>item.id===(placement.event_id??placement.community_id));return item?[{id:item.id,slug:item.slug,label:item.title??item.name??"View details",endsAt:placement.ends_at}]:[];})}/>;
}
