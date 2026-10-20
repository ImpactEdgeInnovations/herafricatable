"use client";
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from "react";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";

export type HostArea="overview"|"people"|"invitations"|"meetups"|"appearance"|"settings";
const areas:{id:HostArea;label:string;help:string}[]=[
  {id:"overview",label:"Overview",help:"See what needs your attention."},
  {id:"people",label:"People",help:"Review join requests and manage your members."},
  {id:"invitations",label:"Invitations",help:"Invite people by email and check what happened to each invitation."},
  {id:"meetups",label:"Meetups",help:"Plan a meetup or link an event you host."},
  {id:"appearance",label:"Images & style",help:"Choose your Community images, colour and location."},
  {id:"settings",label:"Settings",help:"Choose who can join and manage your other tools."},
];
const HostContext=createContext<{area:HostArea;openTarget:(id:string)=>void}|null>(null);
export function useHostTools(){return useContext(HostContext);}
export function HostToolArea({area,children}:{area:HostArea;children:ReactNode}){
  const tools=useHostTools();const hidden=Boolean(tools&&tools.area!==area);
  return <div className="host-tool-area" data-host-area={area} hidden={hidden} inert={hidden}>{children}</div>;
}
export function HostToolsShell({children}:{children:ReactNode}){
  const [area,setArea]=useState<HostArea>("overview");const [target,setTarget]=useState("");
  const openTarget=useCallback((id:string)=>{
    const element=document.getElementById(id);const parent=element?.closest<HTMLElement>("[data-host-area]");
    if(parent&&areas.some(item=>item.id===parent.dataset.hostArea))setArea(parent.dataset.hostArea as HostArea);
    setTarget(id);
  },[]);
  useEffect(()=>{const reveal=()=>{let id=window.location.hash.slice(1);try{id=decodeURIComponent(id);}catch{/* Keep malformed links harmless. */}if(id)openTarget(id);};reveal();window.addEventListener("hashchange",reveal);return()=>window.removeEventListener("hashchange",reveal);},[openTarget]);
  useEffect(()=>{if(!target)return;const element=document.getElementById(target);if(element){let parent:HTMLElement|null=element;while(parent){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}element.scrollIntoView({block:"start"});const heading=element.querySelector<HTMLElement>("h2,h3,summary")??element;heading.setAttribute("tabindex","-1");heading.focus({preventScroll:true});}setTarget("");},[area,target]);
  return <HostContext.Provider value={{area,openTarget}}><section className="host-tools-shell" aria-label="Community Host tools">
    <ScrollableTabs className="host-tools-tab-scroll" label="Host sections" activeKey={area}><div className="host-tools-tabs" role="tablist" aria-label="Manage your Community">{areas.map((item,index)=><button key={item.id} id={`host-tab-${item.id}`} type="button" role="tab" aria-selected={area===item.id} aria-controls="host-tools-panel" tabIndex={area===item.id?0:-1} onClick={()=>setArea(item.id)} onKeyDown={event=>{const next=event.key==="ArrowRight"?(index+1)%areas.length:event.key==="ArrowLeft"?(index+areas.length-1)%areas.length:event.key==="Home"?0:event.key==="End"?areas.length-1:null;if(next!==null){event.preventDefault();setArea(areas[next].id);document.getElementById(`host-tab-${areas[next].id}`)?.focus();}}}>{item.label}</button>)}</div></ScrollableTabs>
    <p className="host-tools-help" aria-live="polite">{areas.find(item=>item.id===area)?.help}</p>
    {area==="overview"?<div className="host-tools-shortcuts"><button type="button" onClick={()=>openTarget("invite-people")}>Invite people <span aria-hidden="true">↗</span></button><button type="button" onClick={()=>openTarget("admissions")}>Review join requests</button><button type="button" onClick={()=>openTarget("gathering-proposals")}>Plan a meetup</button></div>:null}
    <div id="host-tools-panel" role="tabpanel" aria-labelledby={`host-tab-${area}`}>{children}</div>
  </section></HostContext.Provider>;
}
