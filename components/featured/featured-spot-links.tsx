"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function FeaturedSpotLinks({ kind, items }: {kind:"event"|"community";items:{id:string;slug:string;label:string;endsAt:string}[]}) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const active=items.filter(item=>new Date(item.endsAt).getTime()>now);
  if(!active.length)return null;
  return <section className="featured-spots" aria-label={`Featured ${kind === "event" ? "events" : "Communities"}`}><h2>Featured</h2><div>{active.map(item=><Link key={item.id} href={`/${kind === "event" ? "events" : "communities"}/${item.slug}`}>{item.label}<span aria-hidden> →</span></Link>)}</div></section>;
}
