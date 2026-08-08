"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type MemberNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
};
export type NotificationPreference = {
  in_app_enabled: boolean;
  email_network: boolean;
  email_events: boolean;
  email_support: boolean;
};
export type ActivityConversation = {
  conversation_id: string;
  display_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};
export type ActivityRequest = {
  connection_id: string;
  direction: "incoming" | "outgoing";
  display_name: string | null;
  job_title: string | null;
  company: string | null;
  status: "accepted" | "pending";
};
type ActivityFilter =
  | "account"
  | "all"
  | "communities"
  | "events"
  | "requests";
const date = (value: string) =>
  new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
export function NotificationCenter({
  userId,
  notifications,
  initialPreferences,
  conversations,
  requests,
}: {
  userId: string;
  notifications: MemberNotification[];
  initialPreferences: NotificationPreference;
  conversations: ActivityConversation[];
  requests: ActivityRequest[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const unreadMessages = conversations.reduce(
    (total, item) => total + Number(item.unread_count),
    0,
  );
  const categories: {
    key: ActivityFilter;
    label: string;
  }[] = [
    { key: "all", label: "Everything" },
    { key: "requests", label: "Requests" },
    { key: "events", label: "Events" },
    { key: "communities", label: "Communities" },
    { key: "account", label: "Account" },
  ];
  const filteredNotifications = notifications.filter((item) => {
    if (filter === "all") return true;
    if (filter === "requests") return item.kind === "network";
    if (filter === "events")
      return ["event", "registration"].includes(item.kind);
    if (filter === "communities") return item.kind === "community";
    return ["privacy", "support", "system"].includes(item.kind);
  });
  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, supabase, userId]);
  async function read(id: string) {
    const { error } = await supabase.rpc("mark_notification_read", {
      p_notification_id: id,
    });
    if (error) {
      setNotice(memberErrorMessage(error, "mark this notification as read"));
      return;
    }
    router.refresh();
  }
  async function readAll() {
    setBusy(true);
    const { error } = await supabase.rpc("mark_all_notifications_read");
    setBusy(false);
    setNotice(
      error
        ? memberErrorMessage(error, "mark your notifications as read")
        : "All notifications marked as read.",
    );
    if (!error) router.refresh();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("update_notification_preferences", {
      p_email_events: preferences.email_events,
      p_email_network: preferences.email_network,
      p_email_support: preferences.email_support,
      p_in_app: preferences.in_app_enabled,
    });
    setBusy(false);
    setNotice(
      error
        ? memberErrorMessage(error, "save your notification preferences")
        : "Notification preferences saved.",
    );
  }
  return (
    <div className="notification-layout">
      <section className="activity-overview" aria-labelledby="activity-title">
        <header>
          <p className="eyebrow">Your updates</p>
          <h1 id="activity-title">What is new for you.</h1>
          <p>
            See new messages, connection requests, event news and account
            notices in one place.
          </p>
        </header>
        <div>
          <Link href="/network">
            <span>People waiting to connect</span>
            <strong>{requests.length}</strong>
            <small>
              {requests.length
                ? `From ${requests
                    .slice(0, 2)
                    .map((item) => item.display_name ?? "a member")
                    .join(" and ")}`
                : "No requests waiting"}
            </small>
          </Link>
          <Link href="/messages">
            <span>Unread messages</span>
            <strong>{unreadMessages}</strong>
            <small>
              {unreadMessages
                ? "Continue where you left off"
                : conversations.length
                  ? "Your conversations are up to date"
                  : "Messaging opens after a connection"}
            </small>
          </Link>
          <button type="button" onClick={() => setFilter("events")}>
            <span>Event updates</span>
            <strong>
              {
                notifications.filter(
                  (item) =>
                    !item.read_at &&
                    ["event", "registration"].includes(item.kind),
                ).length
              }
            </strong>
            <small>Bookings, programmes and guest information</small>
          </button>
          <button type="button" onClick={() => setFilter("account")}>
            <span>Your account</span>
            <strong>
              {
                notifications.filter(
                  (item) =>
                    !item.read_at &&
                    ["privacy", "support", "system"].includes(item.kind),
                ).length
              }
            </strong>
            <small>Privacy, account and help messages</small>
          </button>
        </div>
      </section>
      <section className="notification-feed">
        <header>
          <div>
            <p className="eyebrow">Your recent updates</p>
            <h2>Recent updates</h2>
            <p>
              {unreadCount
                ? `${unreadCount} update${unreadCount === 1 ? "" : "s"} waiting for you.`
                : "Nothing needs your attention right now."}
            </p>
          </div>
          {unreadCount ? (
            <button disabled={busy} onClick={() => void readAll()}>
              Mark all read
            </button>
          ) : null}
        </header>
        <nav className="activity-filters" aria-label="Choose which updates to see">
          {categories.map((category) => (
            <button
              aria-pressed={filter === category.key}
              key={category.key}
              onClick={() => setFilter(category.key)}
              type="button"
            >
              {category.label}
            </button>
          ))}
        </nav>
        {filteredNotifications.length ? (
          <div>
            {filteredNotifications.map((item) => (
              <article className={item.read_at ? "" : "unread"} key={item.id}>
                <span className="notification-kind">{item.kind}</span>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                  <small>{date(item.created_at)}</small>
                </div>
                {item.href ? (
                  <Link href={item.href} onClick={() => void read(item.id)}>
                    Open
                  </Link>
                ) : !item.read_at ? (
                  <button onClick={() => void read(item.id)}>Mark read</button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <strong>
              {filter === "all"
                ? "You are all caught up"
                : `No ${categories
                    .find((category) => category.key === filter)
                    ?.label.toLowerCase()} yet`}
            </strong>
            <p>
              New updates will appear here when something needs your attention.
            </p>
          </div>
        )}
      </section>
      <details className="notification-preferences">
        <summary>
          <span>
            <small>Email choices</small>
            <strong>Choose what reaches your email</strong>
            <em>
              Choose which optional updates also reach your email.
            </em>
          </span>
          <b>Change</b>
        </summary>
        <form onSubmit={save}>
          <p>
            Essential account, payment, and privacy messages remain enabled.
          </p>
          <label>
            <input
              type="checkbox"
              checked={preferences.in_app_enabled}
              onChange={(event) =>
                setPreferences((value) => ({
                  ...value,
                  in_app_enabled: event.target.checked,
                }))
              }
            />
            <span>
              <strong>In-app notifications</strong>
              <small>Show updates in your member account.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.email_network}
              onChange={(event) =>
                setPreferences((value) => ({
                  ...value,
                  email_network: event.target.checked,
                }))
              }
            />
            <span>
              <strong>Network and community email</strong>
              <small>
                Connection requests and the community emails you allow inside
                each room.
              </small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.email_events}
              onChange={(event) =>
                setPreferences((value) => ({
                  ...value,
                  email_events: event.target.checked,
                }))
              }
            />
            <span>
              <strong>Event email</strong>
              <small>Published event announcements.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.email_support}
              onChange={(event) =>
                setPreferences((value) => ({
                  ...value,
                  email_support: event.target.checked,
                }))
              }
            />
            <span>
              <strong>Support email</strong>
              <small>Private support reply alerts.</small>
            </span>
          </label>
          <button className="button button-primary" disabled={busy}>
            Save preferences
          </button>
        </form>
      </details>
      {notice ? (
        <p className="network-message" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
