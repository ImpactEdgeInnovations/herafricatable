"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./event-mobile-action.module.css";

export function EventMobileAction({ href, label, detail }: { href: string; label: string; detail: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const hero = document.getElementById("event-primary-action");
    const registration = document.getElementById("registration");
    if (!hero) return;
    const visibility = new Map<Element, boolean>([[hero, true]]);
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) visibility.set(entry.target, entry.isIntersecting);
      setVisible(![...visibility.values()].some(Boolean));
    });
    observer.observe(hero);
    if (registration) observer.observe(registration);
    return () => observer.disconnect();
  }, [href]);
  return <div className={styles.bar} hidden={!visible} aria-label="Event booking"><span>{detail}</span><Link href={href}>{label}</Link></div>;
}
