import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReceiptItem = {
  line_total_minor: number;
  quantity: number;
  unit_price_minor: number;
  ticket_types: { description: string | null; name: string } | null;
  courses: { summary: string; title: string; slug: string } | null;
  membership_plans: { name: string; slug: string } | null;
  community_offers: {
    name: string;
    communities: { name: string; slug: string } | null;
  } | null;
  community_host_plans: { name: string } | null;
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data } = await supabase
    .from("orders")
    .select(
      "id,reference,status,processing_mode,currency,subtotal_minor,total_minor,fulfilled_at,created_at,order_type,events(title,starts_at,timezone,venues(name,city,country)),order_items(quantity,unit_price_minor,line_total_minor,ticket_types(name,description),courses(title,summary,slug),membership_plans(name,slug),community_offers(name,communities(name,slug)),community_host_plans(name)),community_host_plan_orders(communities(name,slug)),payment_attempts(provider,provider_reference,status,created_at)",
    )
    .eq("reference", reference)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) notFound();

  const event = data.events as unknown as {
    starts_at: string;
    timezone: string;
    title: string;
    venues: { city: string; country: string; name: string } | null;
  } | null;
  const items = data.order_items as unknown as ReceiptItem[];
  const item = items[0];
  const course = item?.courses;
  const hostContext = data.community_host_plan_orders as unknown as {
    communities: { name: string; slug: string } | null;
  } | null;
  const community =
    item?.community_offers?.communities ??
    hostContext?.communities ??
    null;
  const recordLabel = course
    ? "Learning order"
    : data.order_type === "community_host_plan"
      ? "Host plan order"
      : data.order_type === "community"
        ? "Community order"
        : data.order_type === "membership"
          ? "Membership order"
          : "Registration record";
  const title =
    course?.title ??
    item?.membership_plans?.name ??
    item?.community_host_plans?.name ??
    community?.name ??
    event?.title ??
    "Her Africa Table";

  return (
    <main className="receipt-page">
      <header className="legal-header">
        <Link className="brand" href="/">
          <span className="brand-mark">H</span>
          <span>
            Her Africa Table<small>{recordLabel}</small>
          </span>
        </Link>
        <Link href="/home">Member home</Link>
      </header>
      <article className="receipt-card">
        <header>
          <div>
            <p className="eyebrow">Order record</p>
            <h1>{title}</h1>
          </div>
          <span className="member-status">
            {data.status.replace("_", " ")}
          </span>
        </header>
        <dl>
          <div>
            <dt>Reference</dt>
            <dd>{data.reference}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              {new Intl.DateTimeFormat("en-KE", {
                dateStyle: "long",
              }).format(new Date(data.created_at))}
            </dd>
          </div>
          {event ? (
            <div>
              <dt>Event date</dt>
              <dd>
                {new Intl.DateTimeFormat("en-KE", {
                  dateStyle: "full",
                  timeZone: event.timezone,
                }).format(new Date(event.starts_at))}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Processing</dt>
            <dd>{data.processing_mode.replace("_", " ")}</dd>
          </div>
        </dl>
        <div className="receipt-lines">
          {items.map((line, index) => (
            <div key={index}>
              <span>
                {line.courses?.title ??
                  line.membership_plans?.name ??
                  line.community_offers?.name ??
                  line.community_host_plans?.name ??
                  line.ticket_types?.name ??
                  "Platform access"}{" "}
                × {line.quantity}
              </span>
              <strong>
                {data.currency}{" "}
                {(line.line_total_minor / 100).toLocaleString("en-KE", {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </div>
          ))}
          <div className="receipt-total">
            <span>Total</span>
            <strong>
              {data.currency}{" "}
              {(data.total_minor / 100).toLocaleString("en-KE", {
                minimumFractionDigits: 2,
              })}
            </strong>
          </div>
        </div>
        {course && data.status === "fulfilled" ? (
          <Link className="button button-primary" href={`/learning/${course.slug}`}>
            Open course
          </Link>
        ) : null}
        {community && data.order_type === "community" && data.status === "fulfilled" ? (
          <Link
            className="button button-primary"
            href={`/communities/${community.slug}`}
          >
            Open community
          </Link>
        ) : null}
        {community && data.order_type === "community_host_plan" ? (
          <Link
            className="button button-primary"
            href={`/communities/${community.slug}/host#commerce`}
          >
            Open Host workspace
          </Link>
        ) : null}
        <p className="receipt-note">
          This record confirms platform order status. Payment is considered
          complete only when the status is fulfilled. For support, quote
          reference <strong>{data.reference}</strong>.
        </p>
      </article>
    </main>
  );
}
