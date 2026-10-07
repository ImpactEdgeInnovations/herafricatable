"use client";

import { useRef } from "react";

/** Native modal keeps room navigation, scroll and unfinished forms in place. */
export function CommunityAboutPanel({ name, description, joiningMode, memberCount }: {
  name: string; description: string; joiningMode: string; memberCount: number;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button className="community-about-trigger" ref={trigger} type="button" onClick={() => panel.current?.showModal()}>About</button>
    <dialog className="community-about-panel" ref={panel} aria-labelledby="community-about-title"
      onClose={() => trigger.current?.focus()}
      onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) panel.current?.close(); } }}>
      <header><h2 id="community-about-title">About {name}</h2><button type="button" autoFocus onClick={() => panel.current?.close()} aria-label="Close About">×</button></header>
      <p>{description}</p>
      <dl><div><dt>People</dt><dd>{memberCount} {memberCount === 1 ? "member" : "members"}</dd></div><div><dt>Joining</dt><dd>{joiningMode === "invite_only" ? "By invitation" : joiningMode === "approval" ? "The Host reviews each request" : "Open to active Her Africa Table members"}</dd></div></dl>
      <p className="community-about-note">Conversations and shared media are for Community members. You can contact someone privately once you both agree to connect.</p>
    </dialog>
  </>;
}
