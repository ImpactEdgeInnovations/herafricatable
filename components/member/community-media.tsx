"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CommunityPhotoAlbums } from "@/components/community/community-photo-albums";
import { CommunityVideoLibrary } from "./community-video-library";
import { CommunityGatheringInline } from "./community-gathering-inline";
import type { CommunityGatheringCard } from "./community-gatherings";
import { useActionDialog } from "@/components/ui/action-dialog";

export function CommunityMedia({ communityId, currentUserId, slug, cards, cardsReady, initialArea, initialGathering }: {
  communityId: string; currentUserId: string; slug: string; cards: CommunityGatheringCard[]; cardsReady: boolean; initialArea?: string; initialGathering?: string;
}) {
  const router = useRouter();
  const [area, setArea] = useState(initialArea === "photos" ? "photos" : "videos");
  const [selected, setSelected] = useState(initialGathering ?? "");
  const [unsaved, setUnsaved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const { ask, dialog } = useActionDialog();
  useEffect(() => {
    function restore() {
      const search = new URL(window.location.href).searchParams;
      setArea(search.get("mediaArea") === "photos" ? "photos" : "videos");
      setSelected(search.get("gathering") ?? "");
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  async function navigate(nextArea: string, gathering = "") {
    if (area === "photos" && nextArea !== "photos" && unsaved && !(await ask({
      title: "Leave without saving these photos?", description: "You will need to choose the unsaved photo files again.", confirmLabel: "Show videos", tone: "danger",
    }))) return;
    if (nextArea !== area) { setUnsaved(false); setPhotoBusy(false); }
    setArea(nextArea); setSelected(gathering);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "media"); url.searchParams.set("mediaArea", nextArea);
    if (gathering) url.searchParams.set("gathering", gathering); else url.searchParams.delete("gathering");
    window.history.pushState(null, "", url.toString());
  }
  const card = cards.find(item => item.event_slug === selected);
  return <section className="community-media" aria-label="Community media">
    {dialog}
    {area === "videos" && card ? <CommunityGatheringInline card={card} communityId={communityId} currentUserId={currentUserId} backLabel="Back to videos" onClose={() => void navigate("videos")} /> : <>
      <header className="community-section-heading"><div><h2>Media</h2><p>Videos and photo albums from your Community.</p></div></header>
      <div className="community-media-tabs" role="group" aria-label="Choose media type">
        <button type="button" disabled={photoBusy} aria-pressed={area === "videos"} onClick={() => void navigate("videos")}>Videos</button>
        <button type="button" disabled={photoBusy} aria-pressed={area === "photos"} onClick={() => void navigate("photos")}>Photos</button>
      </div>
      {area === "photos" ? <CommunityPhotoAlbums communityId={communityId} currentUserId={currentUserId} presentation="member" onUnsavedChange={setUnsaved} onBusyChange={setPhotoBusy} /> : !cardsReady ?
        <div role="alert" className="community-program-empty"><strong>Videos could not be opened.</strong><p>Please try again.</p><button type="button" onClick={() => router.refresh()}>Try again</button></div> :
        <CommunityVideoLibrary cards={cards} slug={slug} onOpen={gathering => void navigate("videos", gathering)} />}
    </>}
  </section>;
}
